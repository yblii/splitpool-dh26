# Collaboration backend

Implemented scope: profiles, groups, invitations, manual/host-reviewed receipt items, payer rosters, exact fractional claims, personal tips, and authoritative bill reads. OCR and payment integration belong to other team members. The mobile screens still use local demo state until wired to these endpoints.

## How Fastify fits

```mermaid
sequenceDiagram
    participant App as Mobile app
    participant API as Fastify API
    participant Auth as Supabase Auth
    participant DB as Tiger Data PostgreSQL
    App->>API: PUT claim + bearer token + expectedVersion
    API->>Auth: Verify access token
    Auth-->>API: Verified user ID
    API->>API: Validate request schema
    API->>DB: BEGIN; check membership; lock bill row
    API->>DB: Check version/state; validate and save claim
    API->>DB: Increment version; COMMIT
    API-->>App: Authoritative bill and totals (or 409 conflict)
```

Fastify is the HTTP server/framework running inside Node.js. Routes map URLs to functions; an encapsulated `onRequest` hook authenticates all private routes. JSON schemas reject invalid types, extra fields, negative amounts, and invalid fractions before database access. `CollaborationService` implements permissions and transactions. `calculations.ts` calculates totals with exact integer/rational arithmetic. `pg` connects to Tiger Data using a pool; each transaction uses one checked-out connection.

Auth uses Supabase `getUser(accessToken)` server-side, with a 10-second timeout. No client-supplied user ID establishes identity. This initial implementation makes an Auth request for each API request; locally verified signing keys can reduce polling overhead later. CORS is a browser setting, not authorization.

## Setup

1. Create a Tiger Data PostgreSQL service and a Supabase project with email/password Auth enabled. Account creation/billing stays with the team. Use a small free/trial database if available.
2. Copy `apps/api/.env.example` to `apps/api/.env`; fill `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY`. Use Tiger Data's TLS connection details and a trusted CA if supplied. Do not disable certificate verification. Production credentials belong only on the server.
3. From the repository root run `npm install`, then `npm run migrate --workspace @splitpool/api`, then `npm run api`.
4. Configure the mobile Supabase client for the same project. Point `EXPO_PUBLIC_API_URL` at the API's reachable LAN address or HTTPS deployment. Send `Authorization: Bearer <session.access_token>` on private requests.
5. On first login call `GET /me`; `{ "profile": null }` means the user must create a profile using `PATCH /me` with both `username` and `displayName`.

The API loads `apps/api/.env` through its workspace scripts. With all three connection variables absent, only public demo/health endpoints run. Partial configuration fails startup; production requires all three. Migrations are explicit, versioned, and serialized with an advisory lock. The initial migration creates application tables in the connection's current schema, so use a database/schema dedicated to SplitPool. `GET /api/v1/ready` checks connectivity and migration version; `/health` is only a process health check.

## API contract

For local development on Tiger Data Shared/free compute, a self-signed certificate may prevent the default verified TLS connection. To explicitly accept this limitation, add `NODE_ENV=development` and `DATABASE_ALLOW_SELF_SIGNED=true` to `apps/api/.env`. This keeps database traffic encrypted but disables database server certificate/hostname verification. It affects only the PostgreSQL pool, not Supabase or other HTTPS calls, and refuses to run unless the environment is explicitly development. Remove this exception and configure trusted certificates for deployment. Both migrations and the API use this setting.

All paths below are relative to `/api/v1`. Shared TypeScript types live in `packages/contracts/src/api.ts`. Monetary fields are integer USD cents. Successful bill mutations return the entire `BillResponse`, including the new version and calculated summary.

| Method/path | Body / result |
| --- | --- |
| `GET /me` | `{ profile: Profile \| null }` |
| `PATCH /me` | `{ username?, displayName? }`; returns `{ profile }` |
| `GET /groups` | `{ groups }`, including each group's active bill ID |
| `POST /groups` | `{ name }`; creates host membership, returns group (201) |
| `GET /groups/:id` | Group, member profiles, active bill ID |
| `POST /groups/:id/invites` | `{}` for reusable link token, or `{ username }`; returns `{ token, expiresAt, groupId }` (201) |
| `POST /invites/:token/accept` | No body; returns `{ groupId }` |
| `POST /groups/:id/bills` | `{}`; creates active bill with **every current group member** as a payer (201) |
| `GET /bills/:id` | Authoritative bill, claims, personal tips, totals, and blockers |
| `POST /bills/:id/receipt-extractions` | Host-only multipart field `image`; stores bytes under `data/receipts/`, upserts `receipts`, returns OCR `{ draft, usedFallback, imageKey, … }` |
| `PUT /bills/:id/items` | `SaveItemsRequest`; full replacement of reviewed items/receipt totals; marks matching `receipts.parsing_status` as `verified` when present |
| `PUT /bills/:id/items/:itemId/claim` | `{ expectedVersion, fraction: { numerator, denominator } }` |
| `PATCH /bills/:id/settings` | `{ expectedVersion, taxMode?, serviceChargeMode? }` (payer roster is automatic; `participantIds` is rejected) |
| `PUT /bills/:id/tip` | `{ expectedVersion, tipCents }`; sets only the caller's optional tip |

Usernames are unique, case-insensitive through lowercase normalization, and contain 3–30 letters/digits/underscores. Display names are not unique. Link tokens are random, stored as SHA-256 hashes, reusable for 24 hours, and accepted only after sign-in/profile creation. Username invites bind to the resolved user ID, even if that user later renames their profile. Deliver/share tokens through the mobile app; this backend does not send notifications. Joining twice is safe. Accepting an invite also adds the member as a payer on the group's active bill.

There is one active bill per group, enforced by a partial unique index and a group-row lock during creation. Every group member is a bill payer (synced on create, invite accept, and bill read). Group members can read bills; only the host manages receipt items and invitations. Only members can change their own claims/tips. Group deletion, leaving/removing members, invite revocation, and host transfer are not implemented in this milestone.

Example receipt save:

```json
{
  "expectedVersion": 1,
  "merchant": "The Little Table",
  "items": [{ "name": "Pizza", "quantity": 2, "netLineTotalCents": 2400 }],
  "taxCents": 192,
  "serviceChargeCents": 480,
  "printedTotalCents": 3072
}
```

`netLineTotalCents` is the whole line's price, already accounting for quantity and discounts. Keep returned item IDs in later edits; omit IDs only for new items. Omitted existing items are deleted along with their claims. Price-only edits retain fractions; changing a name or quantity clears claims for that item. Removing a payer requires that payer to clear both claims and personal tip first. Receipt edits preserve personal tips as explicit amounts; the UI should show updated totals for review.

Tax and mandatory gratuity/service charges each have an independent `equal`/`proportional` setting (default: proportional). Both use item subtotals as the proportional basis. Optional tips default to zero and belong entirely to the contributing payer. The UI may offer percentage shortcuts, then submit the chosen cent amount. Printed receipt reconciliation excludes optional tips: items + tax + mandatory charges must equal the printed total. The final bill total adds all personal tips.

Unclaimed item amounts stay unallocated. Tax and mandatory-charge shares are provisional (zero) until the bill has no blockers; personal tip amounts remain visible. `summary.complete` requires items, payers, exact full claims, matching printed totals, and a valid extras allocation. A zero subtotal with nonzero proportional mandatory charges requires switching those charges to equal or correcting the receipt. Largest remainders conserve cents, breaking ties by stable user ID. Remaining fractions use decimal strings for numerator/denominator because combined denominators may exceed JavaScript's safe-integer range.

Inputs are bounded to 256 KiB per request, 500 receipt lines, quantities 1–10,000, amounts 0–100,000,000 cents per submitted money field, and claim denominators 1–1,000,000. Fractions are normalized; a zero numerator removes a claim. Group size is dynamic, with no three-person cap.

## Concurrency and teammate integration

Every bill mutation requires `expectedVersion` and runs inside a transaction locking that bill with `SELECT ... FOR UPDATE`. For simultaneous writes based on version 12, one commits version 13; the other gets `409 VERSION_CONFLICT` with `details.currentVersion`. Refetch and let the user retry; do not blindly replay edits. Even unrelated item changes conflict because this MVP versions the whole bill. Retried requests with an old version cannot apply twice. Group/bill creation should be refetched after uncertain network outcomes; there are no general-purpose idempotency keys for group creation yet.

Bill reads use repeatable-read transactions so items, claims, roster, and version come from one committed snapshot. Poll approximately every two seconds while the bill screen is active; refetch after writes, conflicts, reconnect, and foreground. Stop in background, back off on errors, and disable offline mutations. API responses are private and `no-store`.

For the **OCR teammate**, hosts upload via `POST /bills/:id/receipt-extractions` (authenticated multipart). Draft JSON is stored on `receipts` with a local `image_key`; the host reviews in the app and submits through `PUT /bills/:id/items` using the latest version. Without `GEMINI_API_KEY` the parser returns the labeled sample fallback (same as the public demo extract route).

For the **payments teammate**, add review/freeze, reopen, acceptances, and payment routes on top of these tables. Transitions must lock the same bill row, validate `expectedVersion`, recompute the authoritative summary, and reject blockers before creating immutable snapshots. Snapshot personal tips along with all other amounts. This backend only mutates bills in `EDITING`; changing tips after freezing requires reopening and clearing acceptances. Once collection starts, follow the cancellation/refund rules in `design.md`. Do not bypass this lock/version protocol with direct client database writes.

Error shape is `{ error: { code, message, details? } }`: 400 invalid JSON/schema, 401 invalid/missing authentication, 403 insufficient role, 404 inaccessible/missing resource, 409 state/version/uniqueness conflict, 422 invalid business operation, 503 unavailable authentication/readiness. Private data is accessed only through the server's database connection; Supabase's database RLS does not protect this separate Tiger Data database.

## Verification

Run `npm run typecheck --workspace @splitpool/api` and `npm test` from the root. `npm test` runs existing Vitest checks plus the backend's Node test runner. Backend-only tests: `npm run test:backend --workspace @splitpool/api`.

The PostgreSQL integration test is skipped unless `TEST_DATABASE_URL` is set in `apps/api/.env` or the environment. Point it at a dedicated test database with schema-creation permission. It creates a uniquely named temporary schema, applies migrations, exercises permissions and simultaneous claims using separate database connections, then drops only that schema. No external Auth service is used in tests: a verifier is injected by test code; there is no runtime authentication bypass.

Before demoing on phones, run that database test, apply migrations to the application database, then smoke-test two real Supabase accounts through the API. Tests without a configured database cannot establish that hosted TLS, credentials, migration permissions, or row-lock behavior work in your environment.
