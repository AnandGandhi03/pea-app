# 🌿 Pea — Production Deploy Guide

Local-first launch. The app runs fully on-device; the Vercel API adds AI
reclassification, drafts, and voice transcription. If the API URL is unset the
app degrades gracefully (on-device classification still works).

Current working branch: `claude/pea-app-bug-fixes-3q3wbj`

---

## Prerequisites

| Item | Cost | Notes |
| --- | --- | --- |
| Expo account | Free | expo.dev — EAS build (30 free builds/mo) |
| Apple Developer | $99/yr | For App Store |
| Google Play Console | $25 once | For Play Store |
| Vercel | Free | Hosts the AI proxy (`api/`) |
| Anthropic API key | ~$0.001/capture | console.anthropic.com |
| OpenAI API key | Whisper usage | platform.openai.com (voice transcription) |

---

## Step 1 — Deploy the AI proxy to Vercel

Keeps API keys off the device (App Store requirement). The `api/` folder and
`vercel.json` are already in the repo.

1. vercel.com → **Add New Project** → import `AnandGandhi03/pea-app`.
2. Deploy (Vercel auto-detects the serverless functions).
3. Project Settings → **Environment Variables** → add:
   - `ANTHROPIC_API_KEY` — from console.anthropic.com (classification + drafts)
   - `OPENAI_API_KEY` — from platform.openai.com (Whisper transcription)
4. **Redeploy** so the keys take effect.
5. Copy the deployment URL, e.g. `https://pea-app-xxxx.vercel.app`.

Endpoints exposed: `/api/classify` (also handles `mode: "draft"`) and
`/api/transcribe`.

---

## Step 2 — Point the app at your API

The app reads the base URL from the `EXPO_PUBLIC_PEA_API_URL` environment
variable (no trailing slash). There is no hardcoded URL in the source.

**For local development** — create `.env` (copy from `.env.example`):

```
EXPO_PUBLIC_PEA_API_URL=https://pea-app-xxxx.vercel.app
```

**For release builds** — set it as an EAS environment variable so it is baked
into the build:

```bash
eas env:create --name EXPO_PUBLIC_PEA_API_URL \
  --value https://pea-app-xxxx.vercel.app \
  --environment production --visibility plaintext
```

(Leave it unset to ship a local-only build — voice and AI enrichment are
disabled, on-device capture still works.)

---

## Step 3 — Build with EAS (run from your Codespace or local machine)

> The cloud review environment cannot reach expo.dev; run these where you are
> logged into EAS.

```bash
git pull origin claude/pea-app-bug-fixes-3q3wbj
npm install
npm install -g eas-cli
eas login
eas init          # first time only; commit the generated projectId in app.json

# Android APK (sideload / internal testing)
eas build --platform android --profile production

# Android AAB (Play Store)
eas build --platform android --profile production-aab

# iOS (App Store) — needs your Apple Developer account
eas build --platform ios --profile production
```

Answer **Y** if prompted to generate a keystore (EAS manages it).

---

## Step 4 — Submit

**App Store:** appstoreconnect.apple.com → new app (Bundle ID
`com.aifysolutions.pea`), attach the build, fill the listing (see
`STORE_LISTING.md`), submit. Or `eas submit --platform ios` after filling the
`submit.production.ios` block in `eas.json`.

**Play Store:** play.google.com/console → new app (package
`com.aifysolutions.pea`) → upload the `.aab` to Internal testing → promote to
Production. Or `eas submit --platform android` with a service-account key.

---

## Pre-submit checklist

Run locally before every release build:

```bash
npm run typecheck   # zero TypeScript errors
npm run lint        # zero ESLint errors
npm test            # all unit tests pass
```

- [ ] `EXPO_PUBLIC_PEA_API_URL` set as an EAS production env var
- [ ] Vercel has `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`
- [ ] Privacy policy URL ready (app records audio + sends notifications)
- [ ] `version` / `buildNumber` / `versionCode` bumped in `app.json`
- [ ] Screenshots captured on a real device or simulator
