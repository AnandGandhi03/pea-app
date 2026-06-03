# 🌿 Pea — Final Production Deploy Guide
# All 10 bugs fixed. Follow these steps exactly.

═══════════════════════════════════════════════════════
STEP 1 — UPLOAD TO GITHUB (5 min)
═══════════════════════════════════════════════════════

1. Open github.com/AnandGandhi03/pea-app
2. Delete all existing files in the repo
3. Drag all files from this ZIP into the repo root
4. Commit: "v1.0 — final production build"

═══════════════════════════════════════════════════════
STEP 2 — DEPLOY API PROXY TO VERCEL (5 min)
═══════════════════════════════════════════════════════

This is required — keeps your API key off the device (App Store rule).

1. Go to vercel.com → "Add New Project"
2. Import from GitHub → select pea-app
3. Click "Deploy" (Vercel auto-detects the config)
4. Go to Project Settings → Environment Variables → Add:
   Name:  ANTHROPIC_API_KEY
   Value: your key from console.anthropic.com
5. Click "Redeploy" after adding the key
6. Copy your URL: https://pea-app-XXXX.vercel.app

7. Open src/constants.ts and update:
   ANTHROPIC_API_URL: 'https://pea-app-XXXX.vercel.app/api/classify'

8. Commit the constants.ts change to GitHub

═══════════════════════════════════════════════════════
STEP 3 — OPEN CODESPACES (2 min)
═══════════════════════════════════════════════════════

1. Open github.com/AnandGandhi03/pea-app
2. Click green "Code" button → Codespaces → "Create codespace on main"
3. Wait for it to load (~90 seconds)

═══════════════════════════════════════════════════════
STEP 4 — INSTALL & CONFIGURE EAS (10 min)
═══════════════════════════════════════════════════════

Run these commands one by one in the Codespaces terminal:

  npm install

  npm install -g eas-cli

  eas login
  # Enter your Expo account (create free at expo.dev if needed)

  eas init
  # This creates your EAS project and updates app.json
  # Commit after: git add . && git commit -m "eas init" && git push

═══════════════════════════════════════════════════════
STEP 5 — BUILD FOR IOS (20 min, runs in cloud)
═══════════════════════════════════════════════════════

Requirements: Apple Developer account ($99/yr) — you have this ✅

  eas build --platform ios --profile production

EAS will ask for:
  - Apple ID email
  - Password (or App-Specific Password from appleid.apple.com)
  - It handles signing certificates automatically

Build runs in Expo's cloud — no Xcode needed.
You'll get an email when done. Download the .ipa file.

═══════════════════════════════════════════════════════
STEP 6 — BUILD FOR ANDROID (15 min)
═══════════════════════════════════════════════════════

For Google Play Store (AAB format):
  eas build --platform android --profile production-aab

For direct APK install (beta testing):
  eas build --platform android --profile production

No Android Studio needed. EAS handles everything.

═══════════════════════════════════════════════════════
STEP 7 — SUBMIT TO APP STORE
═══════════════════════════════════════════════════════

Option A — Auto submit via EAS:
  1. Fill in eas.json submit section with your Apple credentials
  2. Run: eas submit --platform ios

Option B — Manual (easier first time):
  1. Download Transporter app from Mac App Store (free)
  2. Drag the .ipa file into Transporter → Upload
  3. Go to appstoreconnect.apple.com
  4. My Apps → + New App:
     Bundle ID:  com.aifysolutions.pea
     Name:       Pea
     SKU:        pea-app-001
     Language:   English
  5. Fill in:
     - Description: "Pea is a voice-first family assistant for busy parents.
       Speak anything in seconds — Pea categorizes, drafts your next step,
       and sends a morning brief of everything waiting for you."
     - Category: Productivity
     - Privacy Policy URL: create free at app-privacy-policy-generator.firebaseapp.com
     - Screenshots: use a real device or Simulator (iOS 17 required)
  6. Select your build → Submit for Review
  7. Review takes 1–3 business days

═══════════════════════════════════════════════════════
STEP 8 — SUBMIT TO GOOGLE PLAY
═══════════════════════════════════════════════════════

1. Go to play.google.com/console ($25 one-time fee)
2. Create account → Create app
3. Package: com.aifysolutions.pea
4. Upload the .aab file (from Step 6) → Internal testing track first
5. Fill in store listing:
   - Short description: "Voice-first family assistant for busy parents"
   - Full description: same as App Store description above
   - Category: Productivity
   - Content rating: Everyone
6. Promote to Production when ready
7. Review takes 1–7 business days

═══════════════════════════════════════════════════════
COST SUMMARY
═══════════════════════════════════════════════════════

Item                    Cost
─────────────────────── ─────────────
GitHub + Codespaces     Free
Expo / EAS Build        Free (30/mo)
Vercel (API proxy)      Free
Apple Developer         $99/yr ✅ (you have this)
Google Play             $25 one-time
Anthropic API           ~$0.001/capture

═══════════════════════════════════════════════════════
IF ANYTHING GOES WRONG
═══════════════════════════════════════════════════════

Paste this into a new Claude chat:
"You are my developer for Pea app. I'm stuck on [STEP X].
Here is the error: [paste error]"
Then attach this DEPLOY_STEPS.md file.
