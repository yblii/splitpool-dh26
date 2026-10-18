# SplitPool

An Expo / React Native mobile starter for iOS and Android, with a TypeScript/Fastify API and shared bill types. See the [core design](docs/design.md) and [backend setup/API guide](docs/backend.md).

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

The app opens into a local, labeled hackathon demo. Open **Fam** to scan/review a receipt, claim or split items with the participant switcher, review exact-cent totals and personal tips, choose individual demo cards, approve and authorize shares, confirm simulated funding, and finish simulated restaurant checkout. The card stays locked until all required contributions and funding are ready. No real money moves.

After checkout, the API can generate food-inspired titles with Gemini. Missing keys, provider errors, or filtered output use labeled keyword titles. The host can skip titles before collection. Requests use opaque diner labels and claimed food portions, excluding account and payment details. Latest titles persist locally until the next settled meal or a reset; groups, bill progress, and history are session-only.

Real collaboration remains available through **Profile ? Sign in for shared bills / Open connected groups**. After app profile setup, `/connected` lists database-backed groups. Hosts can create groups, invite members, scan/review receipts, and save items. Two separately authenticated sessions can claim items and set personal tips, with foreground polling and conflict handling. The connected bill and the local payment prototype are separate flows.
