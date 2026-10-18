# SplitPool: three-minute virtual judging video

Prepared from the repository on October 18, 2026. This is a production plan and script, not evidence that the configured app has been smoke-tested. Keep SplitPool as the name for the recording.

## Positioning

**SplitPool turns an itemized receipt into a shared checkout, then a shared memory.**

Lead with a familiar problem, prove the receipt-to-share experience, show the payment prototype, and finish with the personality layer. Generative receipt extraction is already the substantive AI use case; titles add a memorable post-purchase interaction. The Visa fit is checkout, payments, and post-purchase engagement.

Avoid “addictive,” “encourages spending more,” “healthiest eater,” and claims that other apps cannot split items. Position titles as playful social connection and a hypothesis for repeat engagement. Item-level splitting alone is not a defensible uniqueness claim. Your proposed differentiation is the combination of receipt understanding, individual shares, coordinated payment, and item-aware social personalization.

## What the repository supports

| Area | Evidence in current source | Recording treatment |
| --- | --- | --- |
| Accounts and groups | Supabase sign-in, app profiles, database-backed groups and invitations | Pre-sign-in; briefly show a real group. Do not spend video time entering credentials. |
| Receipt AI | Gemini image-to-structured-JSON parser; authenticated upload; editable host review; reconciliation warnings | Record an actual extraction and confirm it is not the sample fallback. Show review before claims. |
| Collaborative item claims | Current bill screen calls authenticated API, supports whole/half/equal claims, personal tips, and foreground polling every two seconds | Show two separately signed-in sessions sharing one bill. Call it a shared bill that updates across devices; do not imply instantaneous push synchronization. |
| Bill correctness | Server calculations use exact integer/rational arithmetic, preserve cents, and return blockers | Show an unclaimed item preventing a Ready summary, then resolve it. This is not yet proof that connected payment routes enforce that same database bill. |
| Payment experience | Separate local `PaymentLedger` demo, acceptance and authorization states, simulated pooled card and merchant event; API also has Stripe collection/card adapters | Label the segment **Payment prototype — simulated card and merchant**. The current authenticated bill screen has no payment navigation or bridge into this local state. |
| Stripe wallet | Web-only conditional wallet path in the payment screen with configured API and publishable key | Optional test-mode insert after rehearsal. Never equate a successful participant hold with a funded merchant payment. |
| Face ID | Timed animation in `VirtualCard.tsx` | Skip in the edit or label **Prototype unlock animation**. Do not claim device biometric authentication. |
| AI titles | No title-generation/storage/display flow found in reviewed source | Use an explicitly labeled concept preview until it is implemented and recorded. |

The README and backend guide include stale statements about mobile claims and receipt wiring. Use current source and a real rehearsal to determine what can be shown.

## Three-minute edit and verbatim narration

Target roughly 125–135 spoken words per minute, allowing pauses for visible results. The slots below total exactly 180 seconds. Record voiceover separately; keep the transitions and pauses inside each slot.

### Clip 1 — 0:00–0:15 — The problem

**Frame:** Three friends at a table, one receipt in the center. Cut to one person staring at a calculator and a group chat. Use fictional chat text and no personal notifications. End with a close shot of the receipt.

**Record:** One wide shot, one receipt close-up, one phone reaction. Keep the joke short; do not imitate or recreate another app's entire interface.

**Say:**

> Dinner with friends is fun until the bill arrives. Someone becomes the accountant. Everyone uses a different payment app. One friend fronts the whole check—and gets stuck sending reminders. Why does paying together feel so separate?

**On-screen text:** “One meal. Too much payment friction.”

### Clip 2 — 0:15–0:28 — Introduce the product

**Frame:** App name beside one large portrait screen showing the dinner group. Maintain the same group name throughout the connected demo.

**Record:** Start signed in. Open the prepared group and its active bill. Capture a second participant already in the member list; invitation entry is unnecessary.

**Say:**

> Meet SplitPool: an AI-assisted group checkout experience. Turn a receipt into individual shares, coordinate payment, and give the group something fun to remember afterward. Here’s one dinner, from receipt to checkout.

**On-screen text:** “Scan → Claim → Coordinate payment → Celebrate”

### Clip 3 — 0:28–0:50 — Prove generative AI

**Frame:** Receipt photo on the left, live app capture on the right. Enlarge the extraction result rather than leaving tiny text inside a phone frame.

**Record:** On the database-backed bill, tap Scan receipt; upload a clean photo; retain a brief real loading moment; show extracted items and totals; inspect or edit one actual field; save the reviewed receipt. If shortening a long wait, add “Processing time shortened.” Do not fabricate a recognition error for the correction shot.

**Say:**

> First, scan the receipt. Our Gemini integration turns the image into structured items, prices, and totals. The host reviews the draft before saving it. AI handles the messy input; people stay in control of what the group actually owes.

**On-screen text:** “Generative AI extraction · Human review”

### Clip 4 — 0:50–1:15 — Make fairness visible

**Frame:** Two labeled portrait captures: “Jamie” and “Alex.” Zoom into the same shared item and then the resulting personal total.

**Record:** Jamie claims half the pizza. After that write completes and the second session refreshes, Alex claims the other half. Show a whole-item claim and a personal tip. Finish with an unclaimed-item blocker disappearing and a Ready summary. Use normal sequential edits; an accidental concurrency conflict will consume the slot.

**Say:**

> Claim your own dish, or split a shared pizza. Each person sees their items, tax, and personal tip. Watch the same bill update on another device. Unclaimed items keep the bill from being ready, and exact-cent calculations make sure everyone’s shares add up.

**On-screen text:** “Shared dishes. Individual totals. Every cent accounted for.”

### Clip 5 — 1:15–1:45 — The checkout payoff

**Frame:** Explicit transition card: “Payment prototype.” Then a large payment capture, with the simulation label readable throughout. End on the completed simulated merchant state.

**Record:** Capture `/payment` separately in the signed-in web preview. Select demo methods for all three demo participants; complete local claims before freezing. Freeze as the host, have each participant accept their share, return to the host to collect, then authorize each share. Show the locked card before the last authorization and the ready state after funding simulation completes. Open checkout and trigger the simulated restaurant charge. Capture the entire sequence, then edit acceptance/setup repetition down to a few representative taps.

**Say:**

> Next is our payment prototype. Each diner reviews and authorizes their own share, with their own payment method. The pooled card stays locked until the required shares and simulated funding are ready. We then simulate one restaurant payment. The goal is individual contributions with one checkout, so one friend doesn’t have to carry everyone’s bill.

**Persistent label:** “Payment prototype — simulated card and merchant”

**Important:** This segment is a separate prototype today. Do not splice the database-backed bill into it as though an implemented checkout button transferred its state. Match the example food where practical, but preserve the explicit transition. A Stripe test-mode hold, if recorded, needs its own label and is not a real restaurant payment.

### Clip 6 — 1:45–2:05 — The memorable post-purchase layer

**Frame:** A group title reveal: “Rice Royalty,” “Noodle Knight,” and “Pizza Diplomat.” Associate each title with a visible claimed dish. Do not show a health or body ranking.

**Record:** If implemented, show the paid-state trigger and generated output in the running app. Otherwise use a concept board or storyboard with **Planned AI feature — concept preview** on screen throughout. Do not disguise a static concept as working UI.

**Default narration for the current repo:**

> Our next step adds a shared memory: playful AI titles inspired by each person’s claimed dishes. Think “Rice Royalty” or “Noodle Knight,” refreshed after the next restaurant visit. It’s a post-purchase moment designed to give friends another reason to return together.

**Replacement only after implementation and successful recording:**

> After payment, generative AI turns each person’s claimed dishes into a playful title: “Rice Royalty” or “Noodle Knight.” Their title stays until the next restaurant visit. It turns the receipt into a shared memory—and gives friends another reason to return together.

If persistence across restaurants is not implemented, retain the planned-feature wording even if one title can be generated.

### Clip 7 — 2:05–2:25 — Explain the engineering

**Frame:** Four simple boxes: “Expo app → Fastify API → Gemini / PostgreSQL,” with “Supabase Auth” connected to the API. A separate smaller box says “Payment prototype: shared TypeScript ledger.” Keep text large enough to read.

**Record:** Animate or highlight each box in the order spoken. Use real app screenshots as small anchors. A terminal dump is unnecessary. Do not draw an implemented end-to-end payment pipeline from the collaboration database.

**Say:**

> Underneath, an Expo app connects to a TypeScript Fastify API, Supabase authentication, and PostgreSQL. Gemini structures receipt data. The server calculates shares deterministically, and bill versions protect concurrent edits. A separate payment ledger models acceptance, authorization, funding, and merchant-payment states.

**On-screen text:** “AI understands the receipt. Deterministic code calculates the money.”

### Clip 8 — 2:25–2:46 — Earn trust

**Frame:** Three evidence cards over actual captures: receipt review; personal claims/totals; simulation disclosure. Avoid generic shield icons implying a certification.

**Record:** Reuse close-ups of the review screen and share breakdown. Briefly show a blocked incomplete bill. If there is time, use a recorded conflict response as a silent insert; it is not essential.

**Say:**

> Trust matters when friends and money mix. The collaboration API verifies sign-in and group permissions. Receipt drafts are reviewable, incomplete bills are flagged, and payment simulation is clearly labeled. For the title feature, our design principle is playful food-based language, without health judgments or pressure to spend.

**On-screen text:** “Reviewable AI · Permission-checked collaboration · Transparent prototype”

Do not extend the collaboration API security claim to payments. Payment routes currently identify callers using `x-user-id`; the local payment ledger and those routes are not evidence of production payment authorization. Receipt images are saved to server storage; do not claim automatic deletion, no storage, or a retention policy that is not implemented. Receipt images are sent to Gemini for extraction, so do not claim all data stays on-device.

### Clip 9 — 2:46–3:00 — Commerce impact and close

**Frame:** Return to the friends at the table, then an app close-up and clean end card. Let the final card hold for two seconds inside this slot.

**Record:** One relaxed group shot; no extra feature montage. Use the product name and track name on the end card.

**Say:**

> For diners, less arithmetic and fewer reminders. For merchants, a path toward smoother group checkout and repeat engagement. SplitPool reimagines checkout and post-purchase connection—so friends can share the meal, and the moment after it.

**End card:** “SplitPool · Share the meal. Settle together.”

## Recording setup and rehearsal

- Export a 1920×1080 landscape video. Keep portrait app footage large; use the empty side for one short explanation. For collaboration, two portrait captures can sit side by side. Leave room for captions without covering totals or buttons.
- Use one narrator and record voiceover separately in a quiet room. Caption the final narration. Keep music quiet enough that every word is intelligible, or omit it. Test audio on a laptop speaker.
- Hide notifications, emails, phone numbers, invite tokens, dashboard identifiers, credentials, and browser chrome that exposes private data. Use test accounts and a receipt photo without payment details. Show only masked card data.
- Prepare two separately authenticated sessions with completed app profiles, the same group, and an active bill. A phone plus a browser works if both can reach the configured API. Two isolated browser profiles are also suitable for a web capture.
- Rehearse the connected sequence: upload → actual extraction → review → save → claim on device A → observe on device B → second claim → finish allocation → inspect personal totals and Ready status.
- Confirm the extraction response reports `usedFallback: false` and that parsed food matches the photographed receipt. The parser deliberately falls back to a labeled fixture when the provider is missing or fails. A configured key alone is not proof of live AI success. The configured model name is a runtime dependency to verify in rehearsal.
- Capture the payment prototype separately. Verify how to enter `/payment` before filming: it is registered behind the signed-in/profile-ready guard, but the current bill screen has no payment button. The local payment demo starts with three demo personas, its own receipt, and no selected methods.
- On `/payment`, use the participant selector to prepare each demo persona. If its current UI cannot complete the desired sequence, fix or simplify the demo before recording. Do not plan to invent missing states in the editor.
- Native camera footage demonstrates the mobile experience. Web footage is suitable for the conditional Stripe wallet integration; native wallet functionality is not established by the current web-only path.
- Use simulation or confirmed test-mode credentials. The wallet code can create provider holds and later capture/release them; a “demo” name does not itself guarantee test mode. Avoid introducing live money movement for the recording.
- Record each clip with three seconds of padding at both ends. Preserve an uncut source take of the connected receipt/claims workflow, plus an uncut take of the payment prototype. Edit navigation and long waits, keeping labels and outcomes truthful.
- Record the prototype both before and after the final contribution so the locked-to-ready change is clear. Skip the Face ID animation unless it is explicitly labeled as an animation.
- Watch the final export at normal speed. Confirm exactly three minutes or less, legible totals, audible narration, truthful labels, no temporary desktop notifications, and a usable submitted video link. No new app tests are required just to edit this document; run the repo checks for any last-minute code changes.

## A consistent demo receipt

Use three diners and three simple line items. For example: pizza $24, mushroom pasta $22, house salad $12, tax $4.64, printed total $62.64, no mandatory service charge. Jamie and Alex each claim half the pizza, Sam claims the pasta, and Jamie claims the salad. With optional personal tips left at zero, final shares should be Jamie $25.92, Alex $12.96, and Sam $23.76.

Those are prepared demonstration amounts, not evidence of an actual restaurant transaction. Use a receipt image that genuinely contains the chosen example. If using the existing local payment demo, its default percentage tips differ from this example; set the tips deliberately or present its own totals under the prototype label. Do not splice together mismatched amounts as one completed transaction.

For title footage, use titles grounded in the actual recorded food: “Pizza Diplomat,” “Mushroom Maven,” or “Salad Sidekick.” “Rice Royalty” and “Noodle Knight” are narration examples, not outputs you should assign to unrelated items.

## Rubric strategy

| Category | What judges should remember | Evidence to prioritize |
| --- | --- | --- |
| Innovation — 25% | One receipt powers financial coordination and item-aware post-purchase personality | Scan → claims → payment prototype → title concept, all in one clearly explained story. Treat the integration as the differentiator, without unsupported competitor claims. |
| User experience — 25% | Friends can understand what they owe without becoming accountants | Large readable screen captures, shared-dish claim, personal total, minimal taps, and one clear before/after state. Avoid spending time on registration. |
| Technical execution — 20% | Real multimodal AI plus robust deterministic calculations and collaboration | Successful actual extraction, structured review, second-device update, exact-cent math, and a concise architecture diagram. Label the separate payment ledger accurately. |
| Commerce impact — 15% | Less group-payment friction, with a plausible repeat-engagement loop | Explain the diner and merchant hypotheses. Do not state unmeasured increases in conversion, spending, or restaurant table turnover. |
| Trust and responsibility — 15% | AI is reviewable, financial calculations are deterministic, and prototype limits are visible | Host review, blockers, permission-checked collaboration, simulated-payment label, and nonjudgmental title design. Avoid blanket security or privacy claims. |

If you have time for one small usability rehearsal, time receipt selection through a Ready bill and count corrections and taps. Report the actual result as “one team demo run” with its scope, not a measured customer benefit. Future pilot metrics: time to settle, completion rate, failed/retried contributions, and repeat group use. These are evaluation plans, not current outcomes.

## Final-hours priorities

1. **Prove live receipt extraction and the two-session claim flow.** This is the strongest current evidence for both AI and usefulness.
2. **Make the payment prototype filmable and unmistakably labeled.** Either implement a genuine bridge from the reviewed database bill or preserve the explicit prototype transition. Do not attempt a rushed production payment launch.
3. **If adding titles, finish one small vertical slice.** Trigger after the appropriate paid-state confirmation, use each person's claimed item names and fractions, generate a short title on the server, validate the output, store it per user, and display it. Keep the previous title until the next successfully paid restaurant bill replaces it; if choosing another reset rule, explain and implement it consistently. Keep title errors from affecting payment status or retrying a charge.
4. **Give the title slice a responsible boundary.** Send only the item information needed to generate the title, using opaque member identifiers; keep names, account details, card data, and the receipt image out of this second AI request. Make titles dismissible or optional if you can complete that behavior. Treat receipt text as untrusted data, and constrain output to harmless food wordplay rather than health, religion, body, or wealth judgments. These are proposed implementation requirements, not existing features.
5. **Record and finish the edit.** A rehearsed end-to-end core and an honest title concept are stronger evidence than a late feature that cannot be demonstrated. Reserve time to verify the final export and submission.

## Source anchors for teammates

- `apps/api/src/receipt/parser.ts`: Gemini extraction, normalization, warnings, and fallback behavior.
- `apps/mobile/src/app/bill/[billId]/receipt-review.tsx`: reviewed receipt editing and save.
- `apps/mobile/src/app/bill/[billId]/index.tsx`: current API-backed claims, personal tips, blockers, Ready status; no checkout button.
- `apps/mobile/src/hooks/useBillPoll.ts`: two-second foreground polling.
- `apps/api/src/service.ts` and `apps/api/src/calculations.ts`: collaboration transactions and authoritative calculations.
- `apps/mobile/src/app/payment.tsx` and `apps/mobile/src/state/demo.tsx`: separate local payment experience.
- `apps/mobile/src/components/VirtualCard.tsx`: prototype card and timed Face ID animation.
- `apps/mobile/src/lib/cardWallet.ts`: wallet hold requests and caller identity header.
- `apps/api/src/payments/routes.ts`: payment routes, prototype actor header, simulation events, Stripe integration.
- `docs/virtual-card.md`: explicit simulated-card/merchant scope and funding constraints.

This plan was based on source inspection. No app runtime, live provider call, money movement, or test suite was executed for this writing task.
