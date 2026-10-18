import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Bill, BillResponse, ExtractedReceipt, Group, Profile, SaveItemsRequest, SetClaimRequest, SetTipRequest, UpdateSettingsRequest } from '@splitpool/contracts';
import type { Database, Sql } from './db.ts';
import { ApiError, requireThat } from './errors.ts';
import { addFractions, normalizeFraction, summarize } from './calculations.ts';

const profileColumns = 'user_id AS "userId", username, display_name AS "displayName"';
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export type ReceiptParsingStatus = 'extracted' | 'fallback' | 'verified';

export class CollaborationService {
  constructor(private db: Database) {}

  async me(userId: string) {
    const result = await this.db.query<Profile>(`SELECT ${profileColumns} FROM profiles WHERE user_id = $1`, [userId]);
    return result.rows[0] ?? null;
  }

  async saveProfile(userId: string, input: { username?: string; displayName?: string }) {
    // First PATCH creates the profile. Updates preserve fields omitted by the client.
    return this.db.transaction(async tx => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [userId]);
      const current = (await tx.query<Profile>(`SELECT ${profileColumns} FROM profiles WHERE user_id = $1`, [userId])).rows[0];
      const username = input.username?.toLowerCase() ?? current?.username;
      const displayName = input.displayName?.trim() ?? current?.displayName;
      requireThat(username && displayName, 422, 'PROFILE_FIELDS_REQUIRED', 'First profile update requires username and displayName.');
      const result = await tx.query<Profile>(`INSERT INTO profiles(user_id, username, display_name) VALUES ($1,$2,$3)
        ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username, display_name = EXCLUDED.display_name
        RETURNING ${profileColumns}`, [userId, username, displayName]);
      return result.rows[0];
    });
  }

  async listGroups(userId: string) {
    return (await this.db.query<Group>(`SELECT g.id, g.name, g.host_id AS "hostId", b.id AS "activeBillId"
      FROM groups g JOIN group_members m ON m.group_id = g.id AND m.user_id = $1
      LEFT JOIN bills b ON b.group_id = g.id AND b.state NOT IN ('PAID','CANCELLED')
      ORDER BY g.created_at, g.id`, [userId])).rows;
  }

  async createGroup(userId: string, name: string) {
    return this.db.transaction(async tx => {
      await this.profileRequired(tx, userId);
      const id = randomUUID();
      await tx.query('INSERT INTO groups(id, name, host_id) VALUES ($1,$2,$3)', [id, name.trim(), userId]);
      await tx.query('INSERT INTO group_members(group_id,user_id) VALUES ($1,$2)', [id, userId]);
      return { id, name: name.trim(), hostId: userId, activeBillId: null } satisfies Group;
    });
  }

  async getGroup(userId: string, groupId: string) {
    return this.db.transaction(async tx => {
      const group = await this.groupAccess(tx, userId, groupId);
      const members = (await tx.query<Profile>(`SELECT ${profileColumns} FROM profiles
        WHERE user_id IN (SELECT user_id FROM group_members WHERE group_id = $1) ORDER BY user_id`, [groupId])).rows;
      const active = (await tx.query('SELECT id FROM bills WHERE group_id = $1 AND state NOT IN (\'PAID\',\'CANCELLED\')', [groupId])).rows[0];
      return { ...group, activeBillId: active?.id ?? null, members };
    }, true);
  }

  async invite(userId: string, groupId: string, username?: string) {
    return this.db.transaction(async tx => {
      await this.groupAccess(tx, userId, groupId, true);
      let target: string | null = null;
      if (username) {
        const profile = (await tx.query('SELECT user_id FROM profiles WHERE username = $1', [username.toLowerCase()])).rows[0];
        requireThat(profile, 404, 'PROFILE_NOT_FOUND', 'That username does not exist.');
        target = profile.user_id;
      }
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await tx.query('INSERT INTO invites(token_hash,group_id,target_user_id,expires_at) VALUES ($1,$2,$3,$4)',
        [hashToken(token), groupId, target, expiresAt]);
      return { token, expiresAt, groupId };
    });
  }

  async acceptInvite(userId: string, token: string) {
    return this.db.transaction(async tx => {
      await this.profileRequired(tx, userId);
      const invite = (await tx.query('SELECT * FROM invites WHERE token_hash = $1 AND expires_at > now()', [hashToken(token)])).rows[0];
      requireThat(invite && (!invite.target_user_id || invite.target_user_id === userId), 404, 'INVITE_NOT_FOUND', 'Invitation is invalid or expired.');
      // Link invitations are reusable until expiry. Joining is idempotent and never adds a payer implicitly.
      await tx.query('INSERT INTO group_members(group_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [invite.group_id, userId]);
      return { groupId: invite.group_id as string };
    });
  }

  async createBill(userId: string, groupId: string, participantIds: string[]) {
    return this.db.transaction(async tx => {
      await this.groupAccess(tx, userId, groupId, true);
      // Serialize creation per group; the partial unique index is a second guard.
      await tx.query('SELECT id FROM groups WHERE id = $1 FOR UPDATE', [groupId]);
      const active = await tx.query('SELECT id FROM bills WHERE group_id = $1 AND state NOT IN (\'PAID\',\'CANCELLED\')', [groupId]);
      requireThat(!active.rows.length, 409, 'ACTIVE_BILL_EXISTS', 'This group already has an active bill.');
      await this.validateRoster(tx, groupId, participantIds);
      const id = randomUUID();
      await tx.query('INSERT INTO bills(id,group_id) VALUES ($1,$2)', [id, groupId]);
      for (const participantId of participantIds)
        await tx.query('INSERT INTO bill_participants(bill_id,user_id) VALUES ($1,$2)', [id, participantId]);
      return this.readBill(tx, id);
    });
  }

  async getBill(userId: string, billId: string) {
    return this.db.transaction(async tx => {
      await this.billAccess(tx, userId, billId);
      return this.readBill(tx, billId);
    }, true);
  }

  async saveItems(userId: string, billId: string, input: SaveItemsRequest) {
    return this.edit(userId, billId, input.expectedVersion, true, async (tx, current) => {
      const retainedIds = input.items.flatMap(item => item.id ? [item.id] : []);
      requireThat(new Set(retainedIds).size === retainedIds.length, 422, 'DUPLICATE_ITEM', 'Item IDs must be unique.');
      const existing = new Map(current.items.map(item => [item.id, item]));
      for (const id of retainedIds) requireThat(existing.has(id), 422, 'UNKNOWN_ITEM', 'Existing item IDs must belong to this bill. Omit id for new items.');
      for (const old of current.items) if (!retainedIds.includes(old.id))
        await tx.query('DELETE FROM items WHERE id = $1 AND bill_id = $2', [old.id, billId]);
      for (const item of input.items) {
        const name = item.name.trim();
        if (item.id) {
          const old = existing.get(item.id)!;
          if (old.name !== name || old.quantity !== item.quantity)
            await tx.query('DELETE FROM claims WHERE bill_id = $1 AND item_id = $2', [billId, item.id]);
          await tx.query('UPDATE items SET name=$1, quantity=$2, net_line_total_cents=$3 WHERE id=$4 AND bill_id=$5',
            [name, item.quantity, item.netLineTotalCents, item.id, billId]);
        } else {
          await tx.query('INSERT INTO items(id,bill_id,name,quantity,net_line_total_cents) VALUES ($1,$2,$3,$4,$5)',
            [randomUUID(), billId, name, item.quantity, item.netLineTotalCents]);
        }
      }
      await tx.query('UPDATE bills SET merchant=$1,tax_cents=$2,service_charge_cents=$3,printed_total_cents=$4 WHERE id=$5',
        [input.merchant.trim(), input.taxCents, input.serviceChargeCents, input.printedTotalCents, billId]);
      await tx.query(
        `UPDATE receipts SET parsing_status='verified', updated_at=now() WHERE bill_id=$1`,
        [billId],
      );
    });
  }

  /** Host-only: bill must be EDITING before OCR bytes are accepted. */
  async assertHostCanExtractReceipt(userId: string, billId: string) {
    return this.db.transaction(async tx => {
      await this.billAccess(tx, userId, billId, true);
      const locked = (await tx.query('SELECT state FROM bills WHERE id=$1 FOR UPDATE', [billId])).rows[0];
      requireThat(locked.state === 'EDITING', 409, 'BILL_NOT_EDITABLE', 'Reopen review before scanning a new receipt.');
    });
  }

  async saveReceiptExtraction(
    userId: string,
    billId: string,
    input: { imageKey: string; parsingStatus: Exclude<ReceiptParsingStatus, 'verified'>; extractedResult: ExtractedReceipt },
  ) {
    return this.db.transaction(async tx => {
      await this.billAccess(tx, userId, billId, true);
      const locked = (await tx.query('SELECT state FROM bills WHERE id=$1 FOR UPDATE', [billId])).rows[0];
      requireThat(locked.state === 'EDITING', 409, 'BILL_NOT_EDITABLE', 'Reopen review before scanning a new receipt.');
      await tx.query(
        `INSERT INTO receipts(bill_id, image_key, parsing_status, extracted_result)
         VALUES ($1,$2,$3,$4::jsonb)
         ON CONFLICT (bill_id) DO UPDATE SET
           image_key = EXCLUDED.image_key,
           parsing_status = EXCLUDED.parsing_status,
           extracted_result = EXCLUDED.extracted_result,
           updated_at = now()`,
        [billId, input.imageKey, input.parsingStatus, JSON.stringify(input.extractedResult)],
      );
    });
  }

  async setClaim(userId: string, billId: string, itemId: string, input: SetClaimRequest) {
    return this.edit(userId, billId, input.expectedVersion, false, async (tx, current) => {
      requireThat(current.participants.some(p => p.userId === userId), 403, 'NOT_A_PAYER', 'Only a bill payer can claim items.');
      requireThat(current.items.some(item => item.id === itemId), 404, 'ITEM_NOT_FOUND', 'Item not found.');
      const fraction = normalizeFraction(input.fraction);
      requireThat(fraction.numerator <= fraction.denominator, 422, 'OVERCLAIM', 'A claim cannot exceed one whole item.');
      const sum = addFractions([...current.claims.filter(c => c.itemId === itemId && c.userId !== userId).map(c => c.fraction), fraction]);
      requireThat(sum.n <= sum.d, 422, 'OVERCLAIM', 'Claims for an item cannot exceed one whole item.');
      if (fraction.numerator === 0) await tx.query('DELETE FROM claims WHERE item_id=$1 AND user_id=$2', [itemId, userId]);
      else await tx.query(`INSERT INTO claims(bill_id,item_id,user_id,numerator,denominator) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (item_id,user_id) DO UPDATE SET numerator=EXCLUDED.numerator, denominator=EXCLUDED.denominator`,
      [billId, itemId, userId, fraction.numerator, fraction.denominator]);
    });
  }

  async settings(userId: string, billId: string, input: UpdateSettingsRequest) {
    return this.edit(userId, billId, input.expectedVersion, true, async (tx, current) => {
      if (input.participantIds) {
        await this.validateRoster(tx, current.groupId, input.participantIds);
        const removed = current.participants.filter(p => !input.participantIds!.includes(p.userId));
        requireThat(!current.claims.some(c => removed.some(p => p.userId === c.userId)), 409, 'PAYER_HAS_CLAIMS',
          'A payer must remove their claims before the host can remove them from the roster.');
        requireThat(!removed.some(p => p.tipCents > 0), 409, 'PAYER_HAS_TIP', 'A payer must clear their tip before removal.');
        for (const p of removed) await tx.query('DELETE FROM bill_participants WHERE bill_id=$1 AND user_id=$2', [billId, p.userId]);
        for (const id of input.participantIds) await tx.query('INSERT INTO bill_participants(bill_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [billId, id]);
      }
      const settings = { ...current.settings, ...input };
      await tx.query('UPDATE bills SET tax_mode=$1,service_charge_mode=$2 WHERE id=$3',
        [settings.taxMode, settings.serviceChargeMode, billId]);
    });
  }

  async setTip(userId: string, billId: string, input: SetTipRequest) {
    return this.edit(userId, billId, input.expectedVersion, false, async (tx, current) => {
      requireThat(current.participants.some(p => p.userId === userId), 403, 'NOT_A_PAYER', 'Only a bill payer can contribute a tip.');
      await tx.query('UPDATE bill_participants SET tip_cents=$1 WHERE bill_id=$2 AND user_id=$3', [input.tipCents, billId, userId]);
    });
  }

  private async edit(userId: string, billId: string, expectedVersion: number, host: boolean,
    work: (tx: Sql, current: BillResponse) => Promise<void>) {
    return this.db.transaction(async tx => {
      await this.billAccess(tx, userId, billId, host);
      const locked = (await tx.query('SELECT version,state FROM bills WHERE id=$1 FOR UPDATE', [billId])).rows[0];
      if (locked.version !== expectedVersion) throw new ApiError(409, 'VERSION_CONFLICT', 'Refetch the bill and retry your edit.', { currentVersion: locked.version });
      requireThat(locked.state === 'EDITING', 409, 'BILL_NOT_EDITABLE', 'Reopen review before editing. Bills in collection cannot be edited.');
      const current = await this.readBill(tx, billId);
      await work(tx, current);
      await tx.query('UPDATE bills SET version=version+1 WHERE id=$1', [billId]);
      return this.readBill(tx, billId);
    });
  }

  private async profileRequired(tx: Sql, userId: string) {
    const result = await tx.query('SELECT user_id FROM profiles WHERE user_id=$1', [userId]);
    requireThat(result.rows.length, 409, 'PROFILE_REQUIRED', 'Create your profile first using PATCH /me.');
  }

  private async groupAccess(tx: Sql, userId: string, groupId: string, host = false) {
    const group = (await tx.query<Omit<Group, 'activeBillId'>>(`SELECT g.id,g.name,g.host_id AS "hostId"
      FROM groups g JOIN group_members m ON m.group_id=g.id WHERE g.id=$1 AND m.user_id=$2`, [groupId, userId])).rows[0];
    requireThat(group, 404, 'GROUP_NOT_FOUND', 'Group not found.');
    requireThat(!host || group.hostId === userId, 403, 'HOST_REQUIRED', 'Only the group host can perform this action.');
    return group;
  }

  private async billAccess(tx: Sql, userId: string, billId: string, host = false) {
    const result = (await tx.query('SELECT group_id FROM bills WHERE id=$1', [billId])).rows[0];
    requireThat(result, 404, 'BILL_NOT_FOUND', 'Bill not found.');
    await this.groupAccess(tx, userId, result.group_id, host);
  }

  private async validateRoster(tx: Sql, groupId: string, ids: string[]) {
    requireThat(ids.length && new Set(ids).size === ids.length, 422, 'INVALID_ROSTER', 'Select at least one payer, without duplicates.');
    const result = await tx.query('SELECT user_id FROM group_members WHERE group_id=$1 AND user_id = ANY($2::uuid[])', [groupId, ids]);
    requireThat(result.rows.length === ids.length, 422, 'INVALID_ROSTER', 'Every payer must be a group member.');
  }

  private async readBill(tx: Sql, billId: string): Promise<BillResponse> {
    const row = (await tx.query(`SELECT id,group_id AS "groupId",state,version,merchant,currency,tax_cents AS "taxCents",
      service_charge_cents AS "serviceChargeCents",printed_total_cents AS "printedTotalCents",
      json_build_object('taxMode',tax_mode,'serviceChargeMode',service_charge_mode) AS settings
      FROM bills WHERE id=$1`, [billId])).rows[0];
    const participants = (await tx.query<Profile & { tipCents: number }>(`SELECT p.user_id AS "userId",p.username,p.display_name AS "displayName",bp.tip_cents AS "tipCents"
      FROM profiles p JOIN bill_participants bp ON bp.user_id=p.user_id WHERE bp.bill_id=$1 ORDER BY p.user_id`, [billId])).rows;
    const items = (await tx.query('SELECT id,name,quantity,net_line_total_cents AS "netLineTotalCents" FROM items WHERE bill_id=$1 ORDER BY id', [billId])).rows;
    const claims = (await tx.query(`SELECT item_id AS "itemId",user_id AS "userId",
      json_build_object('numerator',numerator,'denominator',denominator) AS fraction FROM claims WHERE bill_id=$1 ORDER BY item_id,user_id`, [billId])).rows;
    const bill = { ...row, participants, items, claims } as Bill;
    return { ...bill, summary: summarize(bill) };
  }
}
