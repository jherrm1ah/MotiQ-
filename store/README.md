# Publishing Motiq on Google Play

Everything here is ready except three things only you can do: a Google Play developer account, your upload key, and a support email.

## 1. Before you start

- **Google Play Console account** ($25 one-time): <https://play.google.com/console>
- **Support email:** put it in `public/privacy.html` (search for `[support email]`) and in the Play listing.
- **Privacy policy URL:** `https://<your Motiq site>/privacy.html` (for example `https://motiq.vercel.app/privacy.html` once merged).

## 2. Make your upload key (once, on your own computer)

You need Java installed (it includes `keytool`). Run:

```
keytool -genkeypair -v -keystore motiq-upload.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

It asks for a password and your name. **Keep `motiq-upload.keystore` and the password safe** (password manager plus a backup). If you lose them, you'll have to ask Google to reset the upload key.

Turn the file into text for GitHub:

- Mac/Linux: `base64 -i motiq-upload.keystore | pbcopy` (Mac) or `base64 -w0 motiq-upload.keystore` (Linux)
- Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("motiq-upload.keystore")) | Set-Clipboard`

In GitHub → the MotiQ repo → Settings → Secrets and variables → Actions → New repository secret, add:

| Name | Value |
| --- | --- |
| `MOTIQ_UPLOAD_KEYSTORE_B64` | the base64 text |
| `MOTIQ_KEYSTORE_PASSWORD` | the keystore password |
| `MOTIQ_KEY_ALIAS` | `upload` |
| `MOTIQ_KEY_PASSWORD` | the key password (same as above unless you set a different one) |

Never paste these into a chat, an issue or the code.

## 3. Build the bundle

1. Raise `VERSION_NAME` in `android/version.properties` (for example `1.2.0`).
2. GitHub → Actions → **Play Store release** → Run workflow.
3. Download `Motiq-play-bundle` from the finished run. Inside is `Motiq-<version>.aab`.

## 4. Create the app in Play Console

- **App name:** Motiq
- **Default language:** English
- **App or game:** App · **Free**
- **Category:** Auto & Vehicles
- **App signing:** use Play App Signing (Google keeps the final key; you upload with yours).
- Upload the `.aab` to **Internal testing** first, install it from the test link, then promote to Production.

### Store listing

**Short description (80 characters max):**

> Your AI car mechanic: health, fault codes, reminders, nearby help, Car Mode.

**Full description:**

> Motiq keeps your car healthy and you safe on the road.
>
> • **Know your car's health.** A score from your scans, service history and what's due.
> • **Read fault codes.** Plug in a Bluetooth (BLE) OBD-II adapter to read check-engine codes and live data: RPM, coolant, battery and more. Each code comes in plain English with how urgent it is.
> • **Ask the AI mechanic.** Describe a sound, a light or a smell, or send a photo. You get "safe to drive / drive with caution / stop driving" first, then what to do and a rough cost.
> • **Never miss a service.** Reminders for oil, tyres, brakes, insurance and licence, on your phone before they're due.
> • **Fuel log.** Track fill-ups, cost per km and fuel economy, and get a warning when it suddenly gets worse.
> • **Find help nearby.** Mechanics, tyre shops, parts, car washes, fuel and EV charging on a real map, with call and directions.
> • **Buy and sell.** A market for parts, services and cars, with chat, reports and blocking.
> • **Car Mode.** A big, dark, simple screen with music and a hands-free voice co-pilot.
> • **Trips.** GPS speed and distance, routes, and spoken alerts.
> • **Share your car's history** as a PDF when you sell it.
>
> Works worldwide, in your currency and km or miles. Motiq's advice is a guide, not a replacement for a qualified mechanic.

### Graphics (in this folder)

- `icon-512.png`: app icon (512×512)
- `feature-graphic.png`: feature graphic (1024×500)
- `screenshots/`: phone screenshots (1080×1920)

### Content and data forms (Play Console asks these)

- **Ads:** No.
- **Target audience:** 18+.
- **Data safety:**
  - Collected: email, name, phone (optional), approximate and precise location (in-app only, not stored on servers except trip start and end names), photos (only the ones sent), app activity (AI chats, listings, messages).
  - Encrypted in transit. Users can request deletion.
  - Not sold or shared for advertising.
- **Permissions to explain:**
  - Location: nearby places and trips.
  - Bluetooth: OBD-II adapter.
  - Microphone: voice questions.
  - Camera: photos and VIN.
  - Notifications: service reminders.
