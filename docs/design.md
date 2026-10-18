# SplitPool — Core Design

Proposed hackathon design · October 17, 2026

SplitPool is an iOS and Android app for scanning a receipt, splitting its items together, collecting everyone's share, and paying the merchant. The MVP has four components: authentication/profiles and payment linking, receipt parsing, groups with concurrent bill editing, and final payment.

Scope: USD, one receipt and one active bill per group, and one merchant payment per bill. Use simulated merchant payment for the demo, with test-mode payment collection where available.

| Layer | Proposed stack |
| --- | --- |
| Mobile app | React Native, Expo, TypeScript, Expo Router |
| Backend | Node.js, Fastify, TypeScript; one API service with a small background worker |
| Identity | Supabase Auth |
| Application data | Tiger Data managed PostgreSQL; accessed through the Fastify API |
| Receipt images | Supabase private Storage |
| Shared bill updates | Authenticated API polling for the MVP; server remains authoritative |
| Receipt parsing | Server-side OCR/vision provider behind a replaceable adapter |
| Payments | Card authorization through the Stripe React Native SDK; per-bill spend-instrument simulator or issuer adapter |

All APIs below use `/api/v1` and authenticated access except signed provider webhooks. The API validates identity, group membership, host permissions, and spender permissions. Monetary values are integer cents, calculated on the server. Provider secrets stay on the backend.

Tiger Data stores application profiles, groups, memberships, bills, claims, receipt metadata, and payment state. Fastify verifies Supabase access tokens and maps their user IDs to application profiles. Supabase Auth identities live separately from Tiger Data, so identity linkage is validated by the API rather than a cross-database foreign key. All application reads and writes go through authorized API routes; clients never receive database credentials. Receipt image access uses short-lived URLs issued after the API checks group membership and host permissions for uploads.

For the hackathon, use one small Tiger Data database with no optional paid replicas or other paid extras. Check the free-service or trial terms shown at signup, monitor usage, and export data before trial expiry if needed. Keep image bytes in private Storage and use standard PostgreSQL migrations so the application data remains portable. See [Tiger Data pricing](https://www.tigerdata.com/pricing) for current costs. The API can run locally for the demo; cloud compute hosting is optional and billed separately.

## 1. User authentication, profiles, and payment linking

**User stories**

- As a user, I can sign up, sign in, and create a recognizable profile.
- As a user, I can link a payment method and review it before paying my share.

**Behavior**

Use Supabase Auth for email/password sign-in. Each profile has a unique username and display name. Store mobile session tokens using a protected storage adapter backed by Expo SecureStore.

The native payment SDK collects payment details; the backend associates the resulting provider payment-method reference with the authenticated user. Store only that reference and display metadata such as brand/last four digits. Never store card numbers or CVC. Linking a method does not charge it; users accept their exact bill amount before collection.

**Data:** `profiles(user_id, username, display_name)` and `payment_methods(user_id, provider_reference, brand, last4)`.

| API | Purpose |
| --- | --- |
| Supabase Auth SDK | Sign up, sign in, sign out, and refresh sessions |
| `GET/PATCH /me` | Read or edit the current user's profile |
| `POST /payment-method-setups` | Start a provider setup session for the native SDK |
| `GET /payment-methods` | List the current user's linked methods |

**Done when:** two people can sign in on separate phones, recognize each other by username, and link test payment methods. One user cannot access another user's payment credentials or use their payment method.

## 2. Receipt parsing

**User story:** As a host, I can photograph a receipt and correct its extracted items instead of entering the whole bill manually.

**Flow**

1. Take a photo or choose an existing image with Expo ImagePicker. Offer manual entry if camera access is denied.
2. Upload to private storage through a restricted upload URL.
3. Parse the image on the backend into item names, quantities, line totals, tax, existing gratuity/service charges, and receipt total.
4. Show the result for host review. Highlight missing values and discrepancies; parsing errors offer retry or manual correction.
5. Save the verified items before participants begin claiming.

Each item price is its full line total, including quantity. Show existing gratuity explicitly to avoid adding it twice. Apply discounts as host-reviewed reductions to affected item prices. Require the net item subtotal plus receipt extras to match the printed total before finalization. OCR output is always a draft.

**Data:** `receipts(bill_id, image_key, parsing_status, extracted_result)` and `items(bill_id, name, quantity, net_line_total_cents)`.

| API | Purpose |
| --- | --- |
| `POST /bills/:id/receipt-upload` | Create a restricted upload URL |
| `POST /bills/:id/receipt-extractions` | Start parsing; return a job ID |
| `GET /bills/:id` | Read parsing status and extracted items |
| `PUT /bills/:id/items` | Host saves reviewed items and receipt totals |

**Done when:** a receipt becomes editable item rows, an incorrect extracted price can be fixed, and a mismatched receipt total blocks finalization. A fixture receipt keeps the demo usable if the parsing provider fails.

## 3. Group creation and concurrent modifications to one bill

**User stories**

- As a host, I can create a group and invite people by username or shareable link/QR.
- As a member, I can claim full items or fractions while other members edit the same bill.
- As a member, I can see my total, other claims, and any items still needing allocation.

**Behavior**

The creator is the host. Invitees sign in and explicitly join; app links resume the invitation after sign-in. Link invitations are reusable for 24 hours; username invitations can only be accepted by their intended user. Joining a group does not automatically add the user to an existing bill. Each group has one active bill whose payer roster is explicit. Members modify their own claims and optional tip contributions; the host manages receipt corrections, payer roster, and mandatory-charge allocation settings.

Group membership and bill payer rosters are dynamic and use real user IDs. The starter's three fixed participants are demo fixtures, not a product limit. Support multiple groups and variable roster sizes; calculations and claim validation must use each bill's stored roster. Any future group-size limit should be an explicit configurable policy rather than hardcoded participant identities.

Represent a claim as an exact fraction, such as `1/3`, rather than a floating-point percentage. Claims for each item must total exactly `1` before finalization. Reject overclaims and show remaining fractions for underclaimed items.

Printed tax and mandatory gratuity/service charges can each be divided equally across bill payers or proportionally to item subtotals, with independent settings. Each payer contributes their own optional tip as an integer cent amount; only that payer can change it, and it is added entirely to their total. The UI can offer percentage shortcuts before submitting the chosen amount. Optional tips are excluded from printed receipt reconciliation and added to the final bill total separately. Allocate fractional cents deterministically using largest remainders, with stable user IDs breaking ties. Every item's shares and all participant totals must reconcile exactly. A zero item subtotal with nonzero proportional mandatory charges requires equal allocation or a correction.

**Concurrent edits**

Every bill has a version. A write includes `expectedVersion`; Fastify opens a transaction in Tiger Data PostgreSQL, locks the bill row, checks the version and permissions, validates the edit, saves it, and increments the version in that same transaction. A stale write returns `409`; the client refetches and asks the user to retry. Simultaneous edits cannot overwrite one another or overclaim an item.

For the MVP, clients poll `GET /bills/:id` approximately every two seconds while the bill screen is active. Each request verifies identity and current group membership and returns committed authoritative state. Refetch immediately after a successful mutation, a stale-write conflict, reconnect, or foreground event. Stop polling in the background and back off on errors. Show cached data as stale while offline and disable mutations. Polling controls update visibility; database transactions and version checks enforce correctness.

Supabase Realtime database subscriptions are not part of this Tiger Data integration. Authenticated Fastify WebSockets can be added later to notify authorized group members after commits, with clients still refetching authoritative state. Price-only receipt corrections retain fractions; changing an item's identity/name or quantity clears its claims, and deleting an item removes its claims. A payer must clear their own claims and optional tip before the host removes them from the roster. Receipt corrections preserve explicit personal tip amounts. All bill edits, including tips, require `EDITING`; after final review the host must reopen the bill and clear participant acceptances before editing.

**Data:** `groups`, `group_members`, `invites`, `bills(state, version, totals, split_settings)`, `bill_participants(bill_id, user_id, tip_cents)`, and `claims(item_id, user_id, numerator, denominator)`. See [backend setup and contracts](backend.md) for the implemented collaboration API and integration boundaries.

| API | Purpose |
| --- | --- |
| `POST /groups` | Create a group and host membership |
| `GET /groups` | List the caller's groups and active bills |
| `GET /groups/:id` | Read group membership and active bill |
| `POST /groups/:id/invites` | Create a username invitation or expiring link |
| `POST /invites/:token/accept` | Join the group |
| `POST /groups/:id/bills` | Create the active bill with its payer roster |
| `GET /bills/:id` | Read items, claims, totals, version, and blockers |
| `PUT /bills/:id/items/:itemId/claim` | Set own fraction; zero removes it |
| `PATCH /bills/:id/settings` | Host updates tax/mandatory-charge allocation or payer roster |
| `PUT /bills/:id/tip` | Payer sets their own optional tip in cents |

Example claim body: `{ "fraction": { "numerator": 1, "denominator": 3 }, "expectedVersion": 12 }`.

**Done when:** at least three users can edit one bill from separate app sessions, see committed changes through polling, and resolve a stale edit. Also verify a roster larger than three to catch demo-only assumptions. Missing/overclaimed items and receipt discrepancies prevent finalization.

## 4. Final payment

The lifecycle, budget, clocks, and API are specified in [virtual-card.md](virtual-card.md). This section is the product summary. Shared payment rules live in `@splitpool/contracts`.

**User stories**

- As a participant, I can approve my exact amount before my card is authorized.
- As a host, I can confirm a complete bill. The merchant card stays locked until every required authorization is approved.
- As the designated spender, I can open checkout and pay the merchant from this bill's budget.
- As a participant, I can see collection, merchant payment, and refund status.

**Products**

| Product | What it does |
| --- | --- |
| Hackathon ledger | Simulates one ledger and one card for this bill. `ensureSpendable()` returns ready, pending, or unavailable. The demo must show pending at least once. |
| Spender reimbursement | Live path to investigate first. The spender pays the restaurant with their own card. Everyone else authorizes a reimbursement to that person. SplitPool does not hold a pool and does not issue a card. |
| Sponsored advance | Live card path, only with a sponsor bank and a written loss policy. The platform may advance this bill up to its authorized total. The advance is repaid when those authorizations capture. |

A successful charge on a friend's card is not spendable issuing cash. The hackathon does not paper over that by reserving one platform balance across bills. Adapters are `Collections` and `SpendInstrument`. Moving funds into an issuing balance stays inside `SpendInstrument`.

**Flow**

1. The host freezes a verified bill. The snapshot names the spender, the fee schedule version, each seat's principal and disclosed fee, and the item shares that produced those seats.
2. Each payer accepts the frozen seat and amount. The spender's processing fee is waived and recorded as a platform subsidy. Other payers are charged a grossed-up total so the card budget remains the merchant principal.
3. The host confirms. The server rechecks the snapshot, then starts a 15-minute collection deadline and authorizes each required seat. It does not capture those authorizations yet.
4. One declined or incomplete seat keeps checkout closed. Retry only that seat. At the deadline, if checkout is still closed and the merchant has no exposure, void every authorization.
5. When every required authorization is approved, `ensureSpendable()` asks this bill's ledger whether it can spend. Pending or unavailable leaves the phase at funding pending and does not open a card.
6. The spender taps **Pay the check**. The server creates one card for that user's long-lived cardholder, sets the spend deadline to two hours from that tap, and allows purchases inside the consented budget.
7. A merchant authorization or same-merchant increase is approved only inside that budget. Participant authorizations are captured when the merchant authorization is approved. A capture at or under the budget marks the bill paid and refunds leftover principal in proportion to merchant shares. A capture above the budget opens a case and does not mark the bill paid.
8. If the spend deadline passes with no merchant hold and no capture, void the participant authorizations and refund anything already captured. An open merchant hold blocks new purchases and stays reserved.

The host may reopen review before collection, which clears acceptances. After collection starts, edits require cancellation and a new session. Cancel intent is a timestamp. The UI phase is derived from obligations, funding, the card, merchant holds, and open cases. A later refund or dispute does not replace a paid result.

**Data:** immutable `bill_snapshots` (spender, fee schedule, seats, item shares), `acceptances`, seat `obligations` unique per active seat, `cardholders` unique per user, `virtual_cards` created at checkout, merchant holds and captures, and exception cases. Inbound provider events and outbound provider jobs are separate tables.

| API | Purpose |
| --- | --- |
| `POST /bills/:id/review` | Host freezes a complete bill |
| `POST /bills/:id/reopen` | Host reopens review before collection |
| `POST /bills/:id/acceptances` | Payer accepts the frozen version and exact total |
| `POST /bills/:id/confirm` | Host starts authorization of the required seats |
| `POST /payment-sessions/:id/contributions/me/retry` | Resume the caller's own failed or action-required seat |
| `POST /payment-sessions/:id/checkout` | Spender opens checkout and starts the spend window |
| `GET /payment-sessions/:id/card` | Spender reads masked card details and readiness |
| `POST /payment-sessions/:id/cancel` | Host records cancel intent and starts the unwind |
| `POST /webhooks/collections` | Verify collection, void, and refund events |

Require idempotency keys for payment mutations, deduplicate signed webhooks, and persist outbound jobs before calling providers. The server continues work when the app closes. Returning to the app refetches payment state.

**Done when:** an incomplete bill cannot be confirmed; one failed authorization keeps checkout closed; a pending funding result does not unlock the card; retry never captures a successful seat twice; an under-budget capture refunds the residual; an unused collection deadline voids the holds; and closing the app during collection recovers the same session.
