import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postgresDatabase, migrate } from '../src/db.ts';
import { buildApp } from '../src/app.ts';
import { ApiError } from '../src/errors.ts';
import { createSampleFallbackParser } from '../src/receipt/parser.ts';
import type { BillResponse } from '@splitpool/contracts';

test('PostgreSQL: groups, permissions, independent tips, receipt edits, and concurrent claims', {
  skip: !process.env.TEST_DATABASE_URL ? 'Set TEST_DATABASE_URL to run against a dedicated PostgreSQL test database.' : false,
}, async () => {
  const connectionString = process.env.TEST_DATABASE_URL!;
  const admin = postgresDatabase(connectionString);
  const schema = `splitpool_test_${randomUUID().replaceAll('-', '')}`;
  const receiptRoot = await mkdtemp(join(tmpdir(), 'splitpool-receipts-'));
  // Only this newly generated test schema is removed during cleanup.
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const scoped = new URL(connectionString);
  scoped.searchParams.set('options', `-c search_path=${schema}`);
  const db = postgresDatabase(scoped.toString());
  const users: string[] = Array.from({ length: 5 }, () => randomUUID());
  const [host, member, third, fourth, outsider] = users;
  const app = await buildApp({
    db,
    logger: false,
    parser: createSampleFallbackParser(),
    receiptRoot,
    verifyToken: async token => {
      if (!users.includes(token)) throw new ApiError(401, 'INVALID_TOKEN', 'Unknown test identity.');
      return token;
    },
  });
  const request = (actor: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: { authorization: `Bearer ${actor}` }, payload });
  const extract = (actor: string, billId: string) => {
    const boundary = '----splitpoolboundary';
    const payload = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="image"; filename="receipt.jpg"',
      'Content-Type: image/jpeg',
      '',
      'fakereceiptbytes',
      `--${boundary}--`,
      '',
    ].join('\r\n');
    return app.inject({
      method: 'POST',
      url: `/api/v1/bills/${billId}/receipt-extractions`,
      headers: {
        authorization: `Bearer ${actor}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
  };
  try {
    await migrate(db);
    await migrate(db); // Migration reruns must not erase data or reapply DDL.
    for (const [i, user] of users.entries()) {
      const response = await request(user, 'PATCH', '/me', { username: `person_${i}`, displayName: `Person ${i}` });
      assert.equal(response.statusCode, 200, response.body);
    }
    assert.equal((await request(member, 'PATCH', '/me', { username: 'PERSON_0' })).statusCode, 409);
    const group = (await request(host, 'POST', '/groups', { name: 'Dinner' })).json();
    assert.ok(group.activeBillId, 'creating a group creates its first open bill');
    assert.equal((await request(outsider, 'GET', `/groups/${group.id}`)).statusCode, 404);
    assert.equal((await request(host, 'POST', `/groups/${group.id}/bills`, {})).statusCode, 409);
    const detail = (await request(host, 'GET', `/groups/${group.id}`)).json();
    assert.equal(detail.bills.length, 1);
    assert.equal(detail.activeBillId, group.activeBillId);
    let bill: BillResponse = (await request(host, 'GET', `/bills/${group.activeBillId}`)).json();
    assert.equal(bill.participants.length, 1);
    assert.equal(bill.participants[0].userId, host);
    const invite = (await request(host, 'POST', `/groups/${group.id}/invites`, {})).json();
    for (const user of [member, third, fourth, member])
      assert.equal((await request(user, 'POST', `/invites/${invite.token}/accept`)).statusCode, 200);
    assert.equal((await request(member, 'POST', `/groups/${group.id}/invites`, {})).statusCode, 403);
    const targeted = (await request(host, 'POST', `/groups/${group.id}/invites`, { username: 'person_4' })).json();
    assert.equal((await request(member, 'POST', `/invites/${targeted.token}/accept`)).statusCode, 404);
    await db.query('UPDATE invites SET expires_at=now() - interval \'1 second\' WHERE target_user_id=$1', [outsider]);
    assert.equal((await request(outsider, 'POST', `/invites/${targeted.token}/accept`)).statusCode, 404);
    // Invite accept adds joiners as payers on the active bill.
    bill = (await request(host, 'GET', `/bills/${bill.id}`)).json();
    assert.equal(bill.participants.length, 4);
    assert.equal((await request(host, 'POST', `/groups/${group.id}/bills`, {})).statusCode, 409);
    assert.equal((await request(outsider, 'GET', `/bills/${bill.id}`)).statusCode, 404);
    assert.equal((await request(member, 'PATCH', `/bills/${bill.id}/settings`, { expectedVersion: bill.version, taxMode: 'equal' })).statusCode, 403);
    assert.equal((await extract(member, bill.id)).statusCode, 403);
    const extracted = await extract(host, bill.id);
    assert.equal(extracted.statusCode, 200, extracted.body);
    assert.equal(extracted.json().usedFallback, true);
    assert.ok(extracted.json().imageKey?.startsWith(`${bill.id}/`));
    const draftRow = (await db.query('SELECT parsing_status, image_key FROM receipts WHERE bill_id=$1', [bill.id])).rows[0];
    assert.equal(draftRow.parsing_status, 'fallback');
    assert.equal(draftRow.image_key, extracted.json().imageKey);
    const receipt = { merchant: 'Restaurant', items: [{ name: 'Pizza', quantity: 1, netLineTotalCents: 1001 }],
      taxCents: 101, serviceChargeCents: 200, printedTotalCents: 1302 };
    const saved = await request(host, 'PUT', `/bills/${bill.id}/items`, { expectedVersion: bill.version, ...receipt });
    assert.equal(saved.statusCode, 200, saved.body);
    bill = saved.json();
    assert.equal((await db.query('SELECT parsing_status FROM receipts WHERE bill_id=$1', [bill.id])).rows[0].parsing_status, 'verified');
    const itemId = bill.items[0].id;
    const claimPath = `/bills/${bill.id}/items/${itemId}/claim`;
    const parallel = await Promise.all([host, member].map(actor => request(actor, 'PUT', claimPath,
      { expectedVersion: bill.version, fraction: { numerator: 1, denominator: 2 } })));
    assert.deepEqual(parallel.map(r => r.statusCode).sort(), [200, 409]);
    const conflict = parallel.find(r => r.statusCode === 409)!.json();
    assert.equal(conflict.error.code, 'VERSION_CONFLICT');
    assert.equal(conflict.error.details.currentVersion, bill.version + 1);
    bill = (await request(host, 'GET', `/bills/${bill.id}`)).json();
    assert.equal(bill.claims.length, 1);
    const loser = parallel[0].statusCode === 409 ? host : member;
    const retry = await request(loser, 'PUT', claimPath, { expectedVersion: bill.version, fraction: { numerator: 1, denominator: 2 } });
    assert.equal(retry.statusCode, 200, retry.body);
    bill = retry.json();
    assert.equal(bill.summary.complete, true);
    const overclaim = await request(third, 'PUT', claimPath, { expectedVersion: bill.version, fraction: { numerator: 1, denominator: 3 } });
    assert.equal(overclaim.statusCode, 422);
    assert.equal((await request(host, 'GET', `/bills/${bill.id}`)).json().version, bill.version);
    const tip = await request(member, 'PUT', `/bills/${bill.id}/tip`, { expectedVersion: bill.version, tipCents: 300 });
    assert.equal(tip.statusCode, 200, tip.body);
    bill = tip.json();
    // Personal tip rows may still be stored, but totals split receipt tax/tip by claims only.
    assert.equal(bill.summary.addedTipCents, 0);
    assert.equal(bill.summary.shares.find(p => p.userId === member)!.tipCents, 0);
    assert.equal(bill.summary.totalCents, bill.summary.receiptTotalCents);
    assert.equal((await request(host, 'PUT', `/bills/${bill.id}/tip`, { expectedVersion: bill.version, tipCents: 0, userId: member })).statusCode, 400);
    assert.equal(
      (await request(host, 'PATCH', `/bills/${bill.id}/settings`, { expectedVersion: bill.version, participantIds: [host, third, fourth] })).json().error.code,
      'ROSTER_AUTOMATIC',
    );
    // Price corrections retain claims; identity/quantity corrections clear the affected item's claims.
    bill = (await request(host, 'PUT', `/bills/${bill.id}/items`, { expectedVersion: bill.version, ...receipt,
      items: [{ ...bill.items[0], netLineTotalCents: 1002 }], printedTotalCents: 1303 })).json();
    assert.equal(bill.claims.length, 2);
    bill = (await request(host, 'PUT', `/bills/${bill.id}/items`, { expectedVersion: bill.version, ...receipt,
      items: [{ ...bill.items[0], quantity: 2 }], printedTotalCents: 1303 })).json();
    assert.equal(bill.claims.length, 0);
    assert.equal(bill.summary.complete, false);
    // Failed writes must roll back earlier deletes/updates in the transaction.
    const failed = await request(host, 'PUT', `/bills/${bill.id}/items`, { expectedVersion: bill.version, ...receipt,
      items: [{ ...bill.items[0], id: randomUUID() }] });
    assert.equal(failed.statusCode, 422);
    assert.deepEqual((await request(host, 'GET', `/bills/${bill.id}`)).json(), bill);
    // A payment teammate's transition must lock/freeze the same bill; edits reject any non-EDITING state.
    await db.query('UPDATE bills SET state=\'REVIEW\',version=version+1 WHERE id=$1', [bill.id]);
    assert.equal((await request(member, 'PUT', `/bills/${bill.id}/tip`, { expectedVersion: bill.version + 1, tipCents: 0 })).json().error.code, 'BILL_NOT_EDITABLE');
    assert.equal((await request(host, 'GET', '/groups')).json().groups[0].activeBillId, bill.id);
  } finally {
    await app.close();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.close();
    await rm(receiptRoot, { recursive: true, force: true });
  }
});
