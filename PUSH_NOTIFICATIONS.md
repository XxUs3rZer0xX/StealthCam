# Background push notifications (FCM)

The phone gets a notification when the camera sees motion **even if the app is
closed or the phone is asleep**. This uses Firebase Cloud Messaging (FCM).

All the code is done. You only need to create a **free Firebase project** once
and drop in two files. Nothing here costs money.

---

## What's already wired

- **Phone** registers its FCM token on login → `POST /api/push/register`
  (`src/lib/push.ts`, called from `MobileClient`).
- **Server** stores tokens per user in `push-tokens.json` (gitignored).
- On motion, the socket server sends an FCM push to the phone
  (`src/lib/motionPush.ts` → `src/lib/fcm.ts`), rate-limited to 1 per 20s.
- Dead tokens are pruned automatically.

If Firebase isn't configured yet, everything still works — the push step just
no-ops, and the in-app banner / socket alert still fire when the app is open.

---

## One-time Firebase setup (~5 min)

### 1. Create the project
1. Go to https://console.firebase.google.com → **Add project** → name it
   anything (e.g. `stealthcam`). You can disable Google Analytics.

### 2. Register the Android app
1. In the project, click the **Android** icon ("Add app").
2. **Android package name:** `tech.us3rzer0.stealthcam` (must match exactly).
3. Download **`google-services.json`** and put it here:

   ```
   android/app/google-services.json
   ```

   (The Gradle build auto-detects it; it's gitignored.)

### 3. Get the server key (service account)
1. Firebase console → ⚙️ **Project settings** → **Service accounts** tab.
2. Click **Generate new private key** → it downloads a JSON file.
3. Save that file at the project root as:

   ```
   firebase-service-account.json
   ```

   (Also gitignored — this is a secret, never commit it.)

   *Alternative for hosting:* instead of the file, set the whole JSON as the
   env var `FIREBASE_SERVICE_ACCOUNT` in `.env.local` (one line).

### 4. Rebuild the APK
```bash
cd /c/Users/Admin/StealthCam
npx cap sync android
cd android && JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" \
  ANDROID_HOME="/c/Users/Admin/AppData/Local/Android/Sdk" ./gradlew assembleDebug
```
Install the new `android/app/build/outputs/apk/debug/app-debug.apk` on the phone.

### 5. Restart the server
So it picks up `firebase-service-account.json`:
```bash
npm run dev     # or however you run it
```

---

## Testing it
1. Open the app on the phone, log in, tap **🔔 Enable alerts** → allow.
2. Close the app completely (swipe it away).
3. On the PC, start the stream with **Motion alerts & recording** on and wave at
   the camera.
4. The phone should buzz with **"StealthCam: motion detected"** within a second
   or two.

If nothing arrives: confirm `google-services.json` is in `android/app/`, the
service-account file is on the **server** machine, and the phone can reach the
server URL in `capacitor.config.ts`.
