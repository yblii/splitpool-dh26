# SplitPool

An Expo / React Native mobile starter for iOS and Android, with a TypeScript/Fastify API and shared bill types. See the [core design](docs/design.md).

## Run it on your phone

Prerequisite: Node.js 22.13 or newer (Node 22 LTS recommended).

From the repository root:

```sh
npm install
npm start
```

1. Install **Expo Go** on your iPhone or Android phone.
2. Connect the phone and computer to the same Wi-Fi network.
3. Scan the terminal's QR code: use the Camera app on iPhone, or the scanner in Expo Go on Android.
4. SplitPool runs as a native app inside Expo Go. Edit a file in `apps/mobile/src` and save to see it update.

The computer serves the app's JavaScript through Metro. Keep `npm start` running while developing. No Supabase, Stripe, emulator, Apple account, or API server is needed for the local demo.

If Wi-Fi isolation or a firewall prevents connecting, allow Node on your private network or try:

```sh
npm start -- --tunnel
```

Expo may prompt to install its tunnel helper. A tunnel needs internet and only tunnels Metro; it does **not** expose your separate local API.

This starter targets Expo SDK 57, selected for physical-device Expo Go compatibility during the SDK 58 transition. If Expo Go reports a version mismatch, check the [current Expo setup guidance](https://docs.expo.dev/get-started/create-a-project/) before upgrading; update Expo packages together with `expo install`.

## Browser, emulator, or installed app?

| Option | How | What it means |
| --- | --- | --- |
| Your phone, fastest | `npm start`, scan QR in Expo Go | Native app hosted inside Expo Go; computer stays running |
| Browser preview | `npm run web` | React Native Web preview; useful for layout and demo logic, not native SDK validation |
| Android emulator | Start a device in Android Studio, then `npm run android` | Opens the app in Expo Go in the emulator; Android SDK required |
| iOS Simulator | On a Mac with Xcode, `npm run ios` | Windows cannot run Apple's iOS Simulator; an iPhone with Expo Go still works from Windows |
| Standalone app | Build a preview APK or an iOS internal build with EAS | Installs as SplitPool with bundled JavaScript; does not need Metro or Expo Go |

The default `npm start` shows a QR code; it does not automatically launch a browser or install anything on your phone. Press `w` for a browser or `a` for an already configured Android emulator.

For standalone builds, run the following from `apps/mobile` after setting up an Expo account, app identifiers, and platform signing:

```sh
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --profile preview --platform android
```

The preview profile produces an installable Android APK. For iOS, use `--platform ios` with Apple Developer signing and registered test devices for internal distribution. EAS can build iOS in the cloud from Windows. The included development profile creates a custom development client; production builds support later store distribution. Any future live backend still needs to be reachable from the installed app.

## What works now

- Native navigation between the group, receipt, profile, and payment screens.
- Local group renaming, demo display name, and whole/half item claims across three switchable demo participants.
- Exact-cent totals with equal or proportional tax/tip splitting; incomplete claims block demo payment.
- Native camera/photo selection, Gemini receipt parsing via the local API (sample fallback without a key), and a host review screen that writes verified items into the local demo bill.
- A demo card toggle and simulated contribution/merchant payment states.
- Dedicated Supabase email/password login and sign-up screens (first name, last name, email, password, phone), plus a profile icon on the bill screen for photo and profile edits.
- A read-only Fastify health endpoint and demo bill endpoint, with an in-app connection check.

The bill lives in memory and resets on reload. Participant switching simulates collaboration on one device. Live group creation/invites, persistent profiles, concurrent multi-device edits, receipt upload/OCR, real card linking, issuing, and collection/refunds are next implementation steps. Supabase sign-in alone does not connect the demo bill to a database. No real money moves.

Try the demo: claim the salad, open **Review split**, choose a split mode, add the demo card from Profile, and simulate payment. Use **Reset local demo** in Profile to start again.

## Optional API

In a second terminal at the repository root:

```sh
npm run api
```

The API listens on port 3001:

- `GET /api/v1/health`
- `GET /api/v1/demo/bill`
- `POST /api/v1/demo/receipt-extractions` — multipart field `image`; returns draft receipt JSON (Gemini when `GEMINI_API_KEY` is set on the API, otherwise the labeled sample fixture)

Copy `apps/api/.env.example` to `apps/api/.env` and set `GEMINI_API_KEY` for live parsing. The key stays on the API only — never put it in `EXPO_PUBLIC_*` variables.

To check it from the app, copy `apps/mobile/.env.example` to `apps/mobile/.env`, set `EXPO_PUBLIC_API_URL`, and restart Expo:

| Client | Example API URL |
| --- | --- |
| Browser on this computer | `http://localhost:3001` |
| Android Studio emulator | `http://10.0.2.2:3001` |
| Physical phone on the same Wi-Fi | `http://192.168.1.42:3001` using **your computer's actual LAN IP** |

Use `ipconfig` on Windows to find the active Wi-Fi adapter's IPv4 address. The phone's `localhost` is the phone itself. Allow port 3001 on your private network if needed. For remote devices, deploy the API with HTTPS or expose it through a separate secure tunnel. Standalone native builds should use HTTPS; plain HTTP behavior depends on platform network policy.

The API currently exposes only public demo data. Add server-side token verification, authorization, database transactions, and private data policies before implementing real group/payment endpoints.

## Optional Supabase

Create a Supabase project, enable email/password authentication, then set these in `apps/mobile/.env` and restart Expo:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Open **Sign in** / **Sign up** from the profile icon on the bill screen (or Profile when signed out). Sign-up stores first name, last name, and phone in Supabase user metadata. Confirm signup by email if your project requires it, then sign in. Native session storage uses Expo SecureStore; the browser uses the SDK's browser storage.

For profile photos, create a public Storage bucket named `avatars` and allow authenticated users to upload to a folder matching their user id. Bills remain local demo state until database tables and policies are implemented.

Only public configuration belongs in `EXPO_PUBLIC_*` variables: these values ship in the app. Never put Stripe secret keys or Supabase service-role keys there. Do not commit `.env` files.

## Repository layout

```text
apps/mobile/src/app/          Expo Router screens
apps/mobile/src/components/  Shared native UI
apps/mobile/src/state/       In-memory demo state
apps/mobile/src/lib/         API and optional Supabase clients
apps/api/src/                Fastify server and read-only demo routes
packages/contracts/src/     Shared types, sample bill, exact-cent demo calculations
docs/design.md              Four-component product/technical design
```

## Checks

```sh
npm run check
```

This runs workspace typechecks, Expo ESLint, and Vitest tests for allocation and API behavior. Use Expo's installer for SDK-compatible mobile packages, for example from `apps/mobile`:

```sh
npx expo install expo-image-picker
npx expo install --check
```

Keep the Expo Go-compatible starter for quick device iteration. When adding native code that Expo Go does not bundle, use the development build profile and rebuild after native dependency/config changes. Real payment linking should use the provider's native SDK and verified backend callbacks, as described in the design.

Native animation packages are pinned in the root `overrides` to prevent workspace peers from pulling versions incompatible with Expo SDK 57. Update those pins alongside an SDK upgrade. npm currently reports upstream dependency advisories in this starter; review `npm audit` before production use. Its suggested major-version changes can break Expo compatibility, so do not apply a forced audit fix blindly.
