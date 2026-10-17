# SplitPool — Core Design

Proposed hackathon design · October 17, 2026

SplitPool is an iOS and Android app for scanning a receipt, splitting its items together, collecting everyone's share, and paying the merchant. The MVP has four components: authentication/profiles and payment linking, receipt parsing, groups with concurrent bill editing, and final payment.

Scope: USD, one receipt and one active bill per group, and one merchant payment per bill. Use simulated merchant payment for the demo, with test-mode payment collection where available.

| Layer | Proposed stack |
| --- | --- |
| Mobile app | React Native, Expo, TypeScript, Expo Router |
| Backend | Node.js, Fastify, TypeScript; one API service with a small background worker |
| Identity and data | Supabase Auth, PostgreSQL, private Storage |
| Shared bill updates | Supabase Realtime; server remains authoritative |
| Receipt parsing | Server-side OCR/vision provider behind a replaceable adapter |
| Payments | Stripe React Native SDK for linking/collection; issuer adapter or simulator for merchant payment |

All APIs below use `/api/v1` and authenticated access except signed provider webhooks. The API validates identity, group membership, and host permissions. Monetary values are integer cents, calculated on the server. Provider secrets stay on the backend.

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

The creator is the host. Invitees sign in and explicitly join; app links resume the invitation after sign-in. Each group has one active bill whose payer roster is explicit. Members modify their own claims; the host manages receipt corrections, payer roster, tax, and tip settings.

Represent a claim as an exact fraction, such as `1/3`, rather than a floating-point percentage. Claims for each item must total exactly `1` before finalization. Reject overclaims and show remaining fractions for underclaimed items.

Tax and tip can each be divided equally across bill payers or proportionally to item subtotals. An added tip percentage uses the pretax net item subtotal. Convert to cents once; allocate fractional cents deterministically using largest remainders, with stable user IDs breaking ties. Every item's shares and all participant totals must reconcile exactly. A zero item subtotal requires equal extras or a correction.

**Concurrent edits**

Every bill has a version. A write includes `expectedVersion`; the backend locks the bill row, checks the version and permissions, validates the edit, saves it, and increments the version in one transaction. A stale write returns `409`; the client refetches and asks the user to retry. Simultaneous edits cannot overwrite one another or overclaim an item.

Publish committed updates to membership-protected Realtime channels. Clients refetch authoritative data after an update, reconnect, or foreground event. Show cached data as stale while offline and disable mutations. Receipt edits invalidate affected claims; any changes after final review invalidate participant acceptances.

**Data:** `groups`, `group_members`, `invites`, `bills(state, version, totals, split_settings)`, `bill_participants`, and `claims(item_id, user_id, numerator, denominator)`.

| API | Purpose |
| --- | --- |
| `POST /groups` | Create a group and host membership |
| `POST /groups/:id/invites` | Create a username invitation or expiring link |
| `POST /invites/:token/accept` | Join the group |
| `POST /groups/:id/bills` | Create the active bill with its payer roster |
| `GET /bills/:id` | Read items, claims, totals, version, and blockers |
| `PUT /bills/:id/items/:itemId/claim` | Set own fraction; zero removes it |
| `PATCH /bills/:id/settings` | Host updates tax/tip settings or payer roster |

Example claim body: `{ "fraction": { "numerator": 1, "denominator": 3 }, "expectedVersion": 12 }`.

**Done when:** three users can edit one bill from separate app sessions, see committed changes, and resolve a stale edit. Missing/overclaimed items and receipt discrepancies prevent finalization.

## 4. Final payment

**User stories**

- As a participant, I can approve my exact amount before being charged.
- As a host, I can confirm a complete bill and pay only after everyone's contribution succeeds.
- As a participant, I can see collection, merchant payment, or refund status.

**Flow**

1. Host freezes a verified, fully allocated bill for review. Each payer accepts their exact total and selects a linked payment method.
2. Host taps **Confirm and collect**. The backend rechecks the frozen version, acceptances, allocations, and totals before creating one logical contribution per payer.
3. Collect each share through a separate provider payment. The native SDK handles any required authentication. Only a verified provider result establishes success.
4. Keep the merchant card locked while any contribution is failed or pending. Retry only failed contributions; successful ones are not charged again.
5. After all contributions succeed and spendable issuing funds are reserved, enable one short-lived virtual card for this bill's approved amount.
6. Merchant authorization places the bill in payment pending. Merchant capture records the bill as paid and prevents further card spending.

State path: `EDITING → REVIEW → COLLECTING → READY_TO_PAY → PAYMENT_PENDING → PAID`.

The host may reopen review before collection, clearing acceptances. Once collection starts, edits require cancellation/refund and a new bill session. Canceling stops new charges and refunds successful contributions, including late successes. Keep refunds pending until confirmed, and resolve any merchant authorization before releasing funds. Unexpected merchant capture amounts require reconciliation, never an automatic extra participant charge.

**Payment constraints**

Collecting participant payments and funding a spendable card are separate steps. A successful charge does not imply immediately available issuing funds; the live service needs a supported funding path and liquidity. See [Stripe Issuing balance](https://docs.stripe.com/issuing/funding/balance).

For the hackathon, simulate the merchant card and checkout with a visible demo label. Real issuance and Apple/Google Wallet provisioning depend on the selected provider's program and access. Displaying a virtual card alone does not enable restaurant tap-to-pay.

**Data:** immutable `bill_snapshots`, `acceptances(bill_version, user_id, accepted_cents)`, `contributions(user_id, amount_cents, provider_id, status)`, and `merchant_payments(bill_id, card_reference, reserved_cents, status)`. Keep unique webhook event IDs and durable payment/refund jobs for recovery.

| API | Purpose |
| --- | --- |
| `POST /bills/:id/review` | Host freezes a complete bill |
| `POST /bills/:id/reopen` | Host reopens review before collection |
| `POST /bills/:id/acceptances` | Payer accepts the frozen version and exact total |
| `POST /bills/:id/confirm` | Host starts collection |
| `POST /bills/:id/contributions/me/retry` | Resume own failed/authentication-required payment |
| `GET /bills/:id/card` | Host reads card availability and masked details |
| `POST /bills/:id/cancel` | Start cancellation/refunds |
| `POST /webhooks/payments` | Receive signed contribution/refund events |
| `POST /webhooks/issuing` | Receive signed merchant authorization/capture events |

Require idempotency keys for payment mutations, deduplicate signed webhooks, and persist jobs before calling providers. Reserve issuing capacity transactionally across bills. The server continues work when the app closes; returning to the app refetches payment state rather than creating another charge.

**Done when:** an incomplete bill cannot be confirmed; one failed contribution keeps the card locked; retry never charges successful participants twice; duplicate webhooks are harmless; and a completed simulated merchant payment reconciles with collected shares. Also demonstrate cancellation/refund and recovery after closing the app during collection.
