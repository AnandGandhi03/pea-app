# 🌿 Pea — Deploy to App Store & Google Play

## What you have
This folder is a complete, ready-to-build Expo app.
No Xcode. No Android Studio. Everything builds in the cloud via EAS Build.

---

## STEP 1 — Upload to GitHub (5 min)

1. Go to github.com/AnandGandhi03/pea-app
2. Delete all existing files (or start fresh)
3. Drag-and-drop this entire `pea-app` folder's contents to GitHub
4. Commit with message: "v1.0 production build"

---

## STEP 2 — Deploy API proxy to Vercel (5 min)

This keeps your Anthropic key off the device — required for App Store.

1. Go to vercel.com → New Project → Import from GitHub → select pea-app
2. Vercel will auto-detect it. Deploy.
3. Go to Settings → Environment Variables:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key from console.anthropic.com
4. Redeploy. Copy your Vercel URL (e.g. `https://pea-app-xxxx.vercel.app`)
5. Open `src/constants.ts` and paste it:
   ```
   ANTHROPIC_API_URL: 'https://pea-app-xxxx.vercel.app/api/classify',
   ```
6. Commit the change to GitHub.

---

## STEP 3 — Set up EAS Build (10 min)

Open GitHub Codespaces on your pea-app repo, then in the terminal:

```bash
# Install dependencies
npm install

# Install EAS CLI
npm install -g eas-cli

# Log in to Expo
eas login
# (create free account at expo.dev if needed)

# Link the project
eas init
# This updates app.json with your real EAS project ID — commit this change

# Configure builds
eas build:configure
```

---

## STEP 4 — Build for iOS (15–20 min, cloud build)

Requirements: Apple Developer account ($99/yr) — you confirmed this is active.

```bash
eas build --platform ios --profile production
```

EAS will ask for your Apple credentials. It handles signing automatically.
Build runs in Expo's cloud — no Xcode needed.
Download the .ipa when done.

---

## STEP 5 — Build for Android (10–15 min)

```bash
# For Play Store (AAB format):
eas build --platform android --profile production-aab

# For direct install/testing (APK):
eas build --platform android --profile production
```

---

## STEP 6 — Submit to App Store

```bash
# Auto-submit via EAS (fill in eas.json submit section first)
eas submit --platform ios

# Or manually: download the .ipa and upload via Transporter app
```

**App Store Connect checklist:**
- [ ] Create new app at appstoreconnect.apple.com
- [ ] Bundle ID: `com.aifysolutions.pea`
- [ ] App name: Pea
- [ ] Category: Utilities > Productivity
- [ ] Screenshots: use the Simulator or a real device
- [ ] Privacy policy URL (required) — create a simple one at app-privacy-policy-generator.firebaseapp.com
- [ ] Review notes: "Pea is a voice-first family assistant for busy parents."

---

## STEP 7 — Submit to Google Play

```bash
eas submit --platform android
```

**Play Console checklist:**
- [ ] Create account at play.google.com/console ($25 one-time)
- [ ] Create new app → Production track
- [ ] Package: `com.aifysolutions.pea`
- [ ] Upload the .aab file
- [ ] Complete store listing (description, screenshots, category: Productivity)

---

## STEP 8 — Fill in your API key (constants.ts)

After Step 2, open `src/constants.ts`:

```ts
ANTHROPIC_API_KEY: '',           // leave empty (proxy handles it)
ANTHROPIC_API_URL: 'https://YOUR_VERCEL_URL.vercel.app/api/classify',
```

---

## Cost summary

| Item                  | Cost           |
|-----------------------|----------------|
| GitHub + Codespaces   | Free           |
| Expo / EAS Build      | Free (30/mo)   |
| Vercel (API proxy)    | Free           |
| Apple Developer       | $99/year ✅ (you have this) |
| Google Play           | $25 one-time   |
| Anthropic API         | ~$0.001/item   |

---

## Need help?

Paste this into a new Claude chat:
"You are my software developer for Pea. I need help with [STEP X]."
Attach this DEPLOY.md file and the project brief.
