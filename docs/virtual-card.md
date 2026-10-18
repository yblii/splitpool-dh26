# SplitPool — Virtual card lifecycle

Normative payment spec · October 17, 2026

This document is the payment lifecycle. [design.md](design.md) summarizes the product. Shared rules are implemented in `packages/contracts/src/payment.ts` and covered by `payment.test.ts`.

USD only. One active payment session per frozen snapshot. One designated spender. The hackathon shows a simulated card and a simulated merchant, labeled `SIMULATED`. Displaying a card number does not pay a restaurant terminal, and wallet provisioning is out of scope.

## 1. Products and adapters

A successful charge on a participant's debit or credit card is not cash the issuer can spend. The hackathon does not hide that by drawing many bills from one platform balance.

| Product | Ledger | Card | Customer funds |
| --- | --- | --- | --- |
| `hackathon_ledger` | Simulated, one bill | Simulated | None. `advanceCapCents` is null |
| `spender_reimbursement` | Reimbursements owed to the spender | None. The spender uses their own card at the restaurant | None |
| `sponsored_advance` | One bill, advanced by the platform | Issued under a sponsor-bank program | The advance for that bill is capped at its consented maximum and repaid when participant authorizations capture |

`productPolicy()` is the guard. The hackathon build runs `hackathon_ledger` only. `spender_reimbursement` is the live design to investigate first. `sponsored_advance` waits on a sponsor bank and a written loss policy that names who eats a reversal after the merchant is paid.

Use two adapters:

- `Collections` authorizes, voids, captures, and refunds participant seats.
- `SpendInstrument` reports whether this bill is spendable, creates the card, and applies merchant authorizations and captures.

`ensureSpendable()` returns `ready`, `pending`, or `unavailable`. The hackathon simulator must be able to return all three. The scripted demo returns `pending` at least once before `ready`. An instant unlock on the last authorization hides the funding state the UI has to show.

There is no cross-bill capacity allocator. A bill can spend the principal reserved on its own ledger, and a sponsored advance can front that same bill up to its own cap.

## 2. Snapshot, seats, and fees

Freeze the bill before any authorization. The snapshot is immutable and includes:

- `hostUserId` and `spenderUserId`
- `merchantId` and `merchantTotalCents`
- `feeScheduleVersion` and `feeRefundPolicy: 'principal_only'`
- `consentedMaxCents`, equal to the merchant total, tip included
- one seat per payer, with `merchantShareCents`, `disclosedFeeCents`, `approvedTotalCents`, and `subsidyCents`
- item shares (`itemId`, `userId`, `cents`) that sum to the item subtotal

`validateFrozenBill()` checks those identities against the fee schedule.

The card budget is the merchant principal, not the amount charged to participants:

- The sum of `merchantShareCents` equals `merchantTotalCents`.
- A non-spender's `approvedTotalCents` is the ceiling gross-up from `grossUpCharge()`. At 2.9% plus $0.30, a $40.00 share becomes a $41.51 charge and a $1.51 disclosed fee. Only $40.00 is spendable.
- The spender is not charged that fee. `priceSeat(..., payerIsSpender: true)` sets `disclosedFeeCents` to 0 and `approvedTotalCents` to the principal. `subsidyCents` is the fee the platform would otherwise have lost on that circular charge. A zero-fee demo schedule records a zero subsidy and still uses the same function.
- A later fee-schedule change does not reprice a frozen snapshot.

Changing the spender, the tip, or a seat's payer invalidates the snapshot the same way. Before capture, another member can cover an unpaid seat by accepting a new obligation for that seat. The previous obligation is superseded. The active uniqueness key is `(session, seat)`, so one person can pay their own seat and a seat they agreed to cover. Obligations are not unique on `(session, user)`.

Zero-principal seats are not required authorizations and do not block checkout.

## 3. Collection

Card payments are authorized and captured separately. Apple Pay, Google Pay, and Link can place that hold when the charge is a card. Link funded by a bank cannot. ACH and external person-to-person apps cannot void like a card authorization, so they cannot gate an at-table card.

1. The host's confirm call rechecks the snapshot and acceptances, then writes `collection_started_at`.
2. `collection_deadline = collection_started_at + 15 minutes`. The client cannot supply or move it. `COLLECTION_WINDOW_MS` is the server default.
3. Each required seat gets one logical authorization. The provider idempotency key is stored before the call. A lost response retries that key.
4. Checkout stays closed while any required seat is pending, needs action, or failed. Retry only the failed seat.
5. `unwindAction()` returns `void_auths` when the collection deadline has passed, checkout is still closed, and merchant exposure is zero. The outbound job voids every approved authorization.
6. Participant captures wait until the merchant authorization is approved. The hackathon ledger and a sponsored advance both use that trigger. Reimbursement mode has no group card; those authorizations capture when the spender's own restaurant payment is recorded.

A late authorization success after cancel intent is voided or refunded. It does not reopen the session.

## 4. Checkout and the spend budget

The spender and the host may be the same person. Card reads and card-detail access require the spender. Host status does not grant them.

One `cardholders` row exists per user. The card for this session is created when the spender opens checkout, with the budget attached. Checkout is refused while `checkoutBlockers()` is non-empty: cancel intent, incomplete authorization, funding not ready, or an over-budget case.

Opening checkout writes `spend_opened_at` and `spend_deadline = spend_opened_at + 2 hours` (`SPEND_WINDOW_MS`). Viewing the card, restarting a worker, or retrying a request does not move the deadline.

`decideAuthorization()` is the only approve/decline function. The simulator calls it directly. A future issuer webhook calls the same function and does nothing slower than the row lock that records the decision. Until an issuer sandbox is connected, do not add a separate two-second webhook path. If that path exists later, a timeout fallback declines.

The function approves a purchase only when all of these hold:

- The session is not canceled, checkout is open, the instrument is `active`, the currency is USD, and `now` is before `spend_deadline`.
- The merchant id matches the snapshot. A category or a receipt name is not a merchant id.
- The resulting exposure stays at or under `consentedMaxCents`. Exposure is captured amount plus open holds, with a same-merchant increase replacing that chain's hold.
- A same-merchant increase is not a second purchase. A decrease belongs to a reversal, not a new approval.
- `activeIndependentAuths + 1` stays within `maxIndependentAuths` when the request starts a new chain. The happy-path simulator uses a limit of 1. An increase on the open chain does not consume that limit. A reversed chain stops counting, so a later retry can be approved while the spend window is open.

`applyMerchantCapture()` is the capture rule:

- A capture that would exceed the consented maximum is `over_budget`. The stored capture total is left unchanged, an exception case opens, and the phase does not become paid.
- A non-final capture below the open hold stays `pending`.
- A final capture, or a capture that consumes the hold, is `paid` when the total is within the budget. Tip-adjusted clearing may exceed the original hold and remain paid when it is still within the consented maximum.
- `residualCents` is the unspent principal. Refund it with `allocateTrackedRefund()` over the seat `merchantShareCents` weights, which uses the same largest-remainder allocator as the bill split. Refund principal only. The disclosed fee stays with the written `principal_only` policy because the processor may keep it.
- An opaque merchant refund uses those same merchant-share weights. A refund tied to one comped item uses that item's shares, and the amount cannot exceed the recorded item basis.

An open case (`over_budget`, `unmatched_credit`, `dispute`, `short_capture`) is a row. It does not replace the payment phase. A dispute never creates a charge to another participant.

## 5. Clocks

| Clock | Starts | Zero merchant exposure | Open hold or capture |
| --- | --- | --- | --- |
| Collection, 15 minutes | Host confirms | `void_auths` if checkout is still closed | Leave the hold in place |
| Spend window, 2 hours | Spender opens checkout | `void_and_refund` | `block_new_purchases` |
| Presentment | The network's capture lifetime for an approved authorization | Not an app refund timer | Accept capture, reversal, and refund after the spend window |

Merchant exposure means a positive open hold or a positive captured merchant amount. The collection deadline does not void a session once checkout is open. The spend window does not release an open hold.

## 6. Derived phase

Persist obligations, funding, instrument status, merchant holds and captures, `cancel_requested_at`, and cases. `derivePhase()` is the UI phase. Do not store `RECONCILIATION_REQUIRED` or `CANCELING` as a source of truth.

| Derived phase | When |
| --- | --- |
| `paid` | Captured merchant total is positive, within the budget, and no hold remains. A dispute row leaves the phase paid. |
| `payment_pending` | An over-budget case or over-budget capture, an open hold, or a seat in `capture_pending` or `refund_pending` |
| `canceling` | Cancel was requested and money or a merchant hold is still open |
| `canceled` | Cancel was requested, merchant exposure is zero, and every required seat is voided, failed, or refunded |
| `funding_pending` | Every required seat is authorized and funding is not ready, including `unavailable` |
| `ready_to_pay` | Every required seat is authorized and funding is ready |
| `collecting` | A required seat is still pending, needs action, or failed |

`GET /payment-sessions/:id/card` returns masked metadata to the spender. Full card details come only from the short-lived card-access exchange. Shared progress shows a coarse seat status, totals, and blockers. It omits decline codes, provider ids, and card data. Those columns stay off the Supabase Realtime publication used for item claims.

## 7. Persistence and access

Suggested records:

| Record | Constraint |
| --- | --- |
| `bill_snapshots` | Immutable seats, item shares, spender, fee schedule, consented maximum |
| `payment_sessions` | One non-canceled session per snapshot |
| `obligations` | One active row per `(session, seat)`; attempts are separate |
| `cardholders` | One long-lived row per user |
| `virtual_cards` | Created at checkout; one active card per session |
| `merchant_authorizations` / `merchant_transactions` | Provider id unique per mode; holds distinct from captures |
| `cases` | Over-budget capture, unmatched credit, dispute, short capture |
| `inbox_events` | Verified inbound provider events, unique on provider, account, mode, and event id |
| `outbox_jobs` | Outbound voids, captures, refunds, and card operations, with the idempotency key stored first |

Webhooks verify the signature over the raw body, including the provider's timestamp check. Test and live keys, events, and data stay separated. The ledger and the client never store a PAN or CVC. Idempotency records outlive the provider's replay window. A duplicate financial event posts once. An older failure does not undo a confirmed success.

Inbound events and outbound jobs do not share a table. The synchronous decision, when it exists, returns the saved decision on redelivery.

| Endpoint | Who |
| --- | --- |
| `GET /bills/:id/payment` | Member reads payment projection (`null` before freeze) |
| `POST /bills/:id/review` | Host freezes the snapshot |
| `POST /bills/:id/reopen` | Host, before collection |
| `POST /bills/:id/acceptances` | Payer accepts their own seat |
| `POST /bills/:id/confirm` | Host starts collection |
| `POST /payment-sessions/:id/contributions/me` | Payer authorizes their own seat |
| `POST /payment-sessions/:id/contributions/me/retry` | Payer retries their own seat |
| `POST /payment-sessions/:id/seats/:seatId/cover` | Member accepts a superseded seat before capture |
| `POST /payment-sessions/:id/checkout` | Spender opens checkout |
| `GET /payment-sessions/:id` | Member reads the sanitized projection |
| `GET /payment-sessions/:id/card` | Spender reads masked card state |
| `POST /payment-sessions/:id/card-access` | Spender requests short-lived card display |
| `POST /payment-sessions/:id/cancel` | Host records cancel intent |
| `POST /webhooks/collections` | Signed collection, void, and refund events |
| `POST /simulation/payment-sessions/:id/merchant-events` | Simulation mode only. Scenario buttons: exact, under, incremental, wrong merchant, reverse, late capture |

No client route can set the session funded. Simulation routes check server-side simulation mode and reject live credentials.

## 8. Acceptance checks

- An incomplete snapshot or a seat priced off the fee schedule cannot start collection.
- One declined seat leaves `checkoutBlockers()` non-empty, and only that seat is retried.
- Authorized seats plus `ensureSpendable() = pending` or `unavailable` stay `funding_pending`.
- Two concurrent bills cannot reserve one shared balance, because no such balance exists.
- A repeated authorization or card creation returns the original operation.
- The merchant simulator's under-budget final capture is `paid` and its residual splits across merchant shares without losing a cent.
- A same-merchant increase inside the budget is approved. A second independent purchase, a different merchant, and an over-budget capture are not paid results.
- At the collection deadline, unused authorizations void. At the spend deadline, zero exposure voids and refunds, and an open hold only blocks new purchases.
- Cancel intent plus a late authorization success still unwinds that success.
- A member who is not the spender cannot read the card.
- A contribution dispute after merchant capture opens a case and does not charge another seat.
