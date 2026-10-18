# SplitPool: three-minute judging video and recording runbook

Updated after merging `origin/cursor/mobile-split-ui-9e96` into `main` and completing the demo UI. The old unclaimed-salad blocker is gone. The main local demo now runs from receipt review through claims, individual approvals, individual simulated authorizations, funding confirmation, simulated restaurant checkout, and food-title reveal.

**Pitch:** SplitPool turns an itemized receipt into a shared checkout, then a shared memory.

## Scope to represent honestly

- The home screen, `/group`, `/split`, `/overview`, `/confirm`, and `/payment` form one connected **local demonstration**. The participant switcher changes who you are playing on one device; it is not cross-device collaboration.
- Real authenticated groups and collaborative bill claims remain available through **Profile → Sign in for shared bills / Open connected groups**. Finish app profile setup if prompted. The route is `/connected`; receipts and claims there use the existing PostgreSQL API. Use two separate accounts for the two-device clip.
- Keep an explicit transition between the collaborative bill clip and the local payment prototype. No implemented database-bill-to-payment bridge is implied.
- The local payment UI does not call a bank. Its virtual card, wallet, authorizations, funding, and merchant charge are simulated. Existing Stripe adapters remain separate; a card label in the new UI is not a Stripe integration.
- Receipt extraction and post-checkout titles call the server when configured. `GEMINI_API_KEY` belongs in `apps/api/.env`; `EXPO_PUBLIC_API_URL` belongs in `apps/mobile/.env`. Without a working provider, the app visibly uses sample receipt data or keyword titles. Do not narrate those as live AI results.
- Latest titles persist locally between reloads, using browser local storage or native SecureStore. Local groups, active bill progress, and receipt history reset when the app reloads. Titles update after a subsequent settled meal, unless titles were skipped; a profile action can hide your title. Reset local demo clears saved titles too.
- The host can skip the title feature on the approval screen. The title request contains opaque diner labels and claimed food portions, excluding names, group names, merchant metadata, and payment details. Food text is still sent to Gemini; do not claim everything stays on-device.

## Pre-recording setup

1. Install dependencies with `npm install`. Start the API with `npm run api` and Expo web with `npm run web` in separate terminals. On a phone, use `npm start` and the computer's reachable LAN API URL.
2. For a fully offline/local rehearsal, use the sample receipt and accept clearly labeled keyword titles. For the AI clip, configure the server key and rehearse a genuine image extraction; confirm `usedFallback: false` and that the food matches the image.
3. Main demo: open Profile → Reset local demo. Return home, open **Fam**, then use **Scan now**. On web, **Album** selects a real image; the capture button loads the labeled sample. Review and confirm the receipt to enter `/split`.
4. Claim items using the participant switcher. A shared dish becomes an equal split when another person joins it. The expanded claim also supports a custom percentage. Leave one item unclaimed for the blocker shot, then claim it.
5. Tap **Review split**. Add an optional personal tip if useful, then tap **Save my tip**. The optional tip belongs entirely to the current participant and is added to any printed receipt tip. Tax/printed-tip allocation can be proportional or equal.
6. As **You**, tap **Send for approval**. For each participant, select their own demo payment method and approve their share. Switch back to **You**, tap **Confirm & collect**, and confirm the dialog.
7. On payment, use each participant's **Authorize … (simulated)** button. The card remains locked. After the last authorization, switch to **You** and tap **Confirm simulated funding**. Then **Simulate merchant checkout → Finish the simulated checkout**.
8. Show the title reveal. It says **AI-generated food wordplay** when successful and **Keyword fallback** when AI is unavailable or output was filtered. Go back to groups to show the new title; view the profile or completed bill for context. Do not reload before recording the bill's history, which is session-only.
9. For the real collaboration clip, use Profile to open connected groups. Sign in and create/join the same group on two sessions. Upload/review a receipt on the host account. Make claims sequentially and allow the second session's two-second foreground polling to refresh.

The default sample receipt is Pizza $30, Ice Cream $15, Drinks $12, Shared Appetizer $18, Tax $6, Printed Tip $13.50: total **$94.50**. Example claims: You and Alex share Pizza; You take Drinks; Alex takes Ice Cream; Sam takes Shared Appetizer. With a $3.15 optional tip from You, the group total is **$97.65**: You **$37.17**, Alex **$37.80**, Sam **$22.68**. Use the actual recorded receipt's amounts if extracting another image.

## Timed script

Use one narrator and approximately 125–135 words per minute. Record voiceover separately. The slots total exactly three minutes, including transitions and a final two-second end-card hold.

### 0:00–0:15 — The problem

**Show:** Three friends and one receipt. Quick cuts to a calculator and fictional reminder messages. Keep real contact details out of frame.

> Dinner with friends is fun until the bill arrives. Someone becomes the accountant. Everyone uses a different payment app. One friend fronts the whole check—and gets stuck sending reminders. Why does paying together feel so separate?

**Overlay:** One meal. Too much payment friction.

### 0:15–0:28 — Introduce SplitPool

**Show:** Product name beside a large portrait capture of the dinner group. Start signed in for connected footage; do not spend time typing credentials.

> Meet SplitPool: an AI-assisted group checkout experience. Turn a receipt into individual shares, coordinate payment, and give the group something fun to remember afterward. Here's one dinner, from receipt to checkout.

**Overlay:** Scan → Claim → Coordinate payment → Celebrate.

### 0:28–0:50 — Prove receipt AI

**Show:** Real receipt photo beside the extracted result. Inspect an actual field and save the review. Keep one brief real processing moment; label a shortened wait. Use the connected host receipt flow if continuing directly into the two-session clip.

> First, scan the receipt. Our Gemini integration turns the image into structured items, prices, and totals. The host reviews the draft before saving it. AI handles the messy input; people stay in control of what the group actually owes.

**Overlay:** Generative AI extraction · Human review.

**Fallback:** If live AI cannot be recorded, keep the sample label visible and say: “This rehearsal uses a sample receipt. With Gemini configured, the same review flow accepts AI-extracted items and totals.” Do not substitute fixture output for evidence of an actual extraction.

### 0:50–1:15 — Make fairness visible

**Show:** Two independently signed-in sessions, labeled with their names, on the same connected bill. Claim half the shared dish, let the other session refresh, and claim the other half. Show a personal tip and the final unclaimed item becoming complete.

> Claim your own dish, or split a shared pizza. Each person sees their items, tax, and personal tip. Watch the same bill update on another device. Unclaimed items keep the bill from being ready, and exact-cent calculations make sure everyone's shares add up.

**Alternative if recording only the local UI:** Show the participant switcher and replace “Watch the same bill update on another device” with “Switch between diners in our local demo to see each person's share.”

### 1:15–1:45 — Show the checkout payoff

**Show:** Explicit **Payment prototype** transition, then the local `/confirm` and `/payment` sequence. Edit repetitive approvals down to representative actions. Show the card locked before the final authorization and still locked while funding is pending. Confirm simulated funding, then finish simulated merchant checkout.

> Next is our payment prototype. Each diner reviews and authorizes their own share, with their own payment method. The pooled card stays locked until the required shares and simulated funding are ready. We then simulate one restaurant payment. The goal is individual contributions with one checkout, so one friend doesn't have to carry everyone's bill.

**Persistent overlay:** Payment prototype — simulated card and merchant.

### 1:45–2:05 — Reveal the shared memory

**Show:** Post-checkout title cards with the dishes that inspired them. Then briefly show the new title on home or profile. Use the actual generated wording; titles in the narration are examples.

> After payment, generative AI turns each person's claimed dishes into a playful title: “Rice Royalty” or “Noodle Knight.” Their title stays until the next restaurant visit. It turns the receipt into a shared memory—and gives friends another reason to return together.

**Fallback narration:** “After checkout, SplitPool creates playful titles from each person's claimed dishes. This run uses the labeled keyword fallback; with Gemini configured, the same moment becomes generative personalization.” Keep the fallback provenance readable. For precise reset behavior, say “until the next settled restaurant bill” if there is room.

### 2:05–2:25 — Explain the engineering

**Show:** Large diagram: Expo → Fastify → Gemini / PostgreSQL, with Supabase Auth attached to the API. Put the local payment simulation in a separate box.

> Underneath, an Expo app connects to a TypeScript Fastify API, Supabase authentication, and PostgreSQL. Gemini structures receipts and creates titles. Money calculations use deterministic code, and the collaboration backend uses bill versions to protect concurrent edits. Payment states remain clearly separated in our prototype.

**Overlay:** AI understands the meal. Deterministic code calculates the money.

### 2:25–2:46 — Earn trust

**Show:** Receipt review, incomplete-bill blocker, title opt-out, and simulation label. Use product evidence instead of generic shields suggesting certification.

> Trust matters when friends and money mix. The collaboration API verifies sign-in and group permissions. Receipt drafts are reviewable, and incomplete bills are flagged. Titles use food-based wordplay, with a skip option and no payment details in the AI request. Payment simulation stays clearly labeled.

Keep the authentication claim scoped to collaboration. The older payment API's caller headers are not production authorization. Receipt images are stored by the connected upload flow; do not claim automatic deletion. The main demo has no actual biometric unlock or native wallet provisioning.

### 2:46–3:00 — Commerce impact and close

**Show:** Friends enjoying the evening, a brief app close-up, then the final card.

> For diners, less arithmetic and fewer reminders. For merchants, a path toward smoother group checkout and repeat engagement. SplitPool reimagines checkout and post-purchase connection—so friends can share the meal, and the moment after it.

**End card:** SplitPool · Share the meal. Settle together.

## Rubric and editing priorities

| Category | Evidence to prioritize |
| --- | --- |
| Innovation — 25% | The combination of receipt understanding, individual contributions, coordinated checkout, and food-aware social personalization. Do not claim item splitting alone is unique. |
| User experience — 25% | Readable personal totals, one shared-item interaction, a clear review action, and locked-to-ready feedback. Avoid spending time on registration or repetitive approvals. |
| Technical execution — 20% | Actual live extraction/title generation when configured, deterministic cent calculations, a second-session update, and a concise architecture diagram. |
| Commerce impact — 15% | Less payment friction and a plausible repeat-engagement loop. Do not invent measured increases in conversion, spending, or restaurant turnover. |
| Trust — 15% | Reviewable AI, group permissions on collaboration, blockers, optional title sharing, provenance labels, and transparent simulation. |

Use “social connection” and “repeat engagement,” not “addictive” or pressure to spend more. Prefer food wordplay to health rankings such as “healthiest eater.” Titles are not nutrition advice.

Export at 1920×1080 with large portrait captures and captions. For two sessions, use two portrait views side by side. Leave three seconds of source padding around every take; keep uncut source recordings. Hide notifications, invite tokens, credentials, personal contacts, and full card details. Watch the final export at normal speed and verify that it is at most three minutes and the submission link works.

## Verification and remaining configuration

`npm run check` runs typechecking, lint, and unit/backend tests. Database integration is skipped without `TEST_DATABASE_URL`. `npm run test:e2e` runs the isolated browser workflow using headless Edge by default (`PLAYWRIGHT_CHANNEL=chrome` selects Chrome). It launches its own sample-only API on port 3901 and Expo on 8091; no live bank, database, or paid AI service is needed. Browser artifacts go under `.artifacts/`.

A successful fallback/browser test does not verify Gemini credentials, receipt recognition quality, real Supabase sign-in on two phones, native SecureStore behavior, or hosted database connectivity. Rehearse those separately before choosing live narration. Never show keyword titles as evidence of a successful generative model call.
