# Pea v1.0.0 — iOS Release Checklist

v1 is a **free** release to TestFlight, then the App Store. No Pro, no accounts,
no Android at launch. Steps marked 🧑 need you (they involve your accounts or
keys); everything else is done in the repo.

## 1. Code — done
- [x] Feature branch merged with `main` (EAS project ID restored)
- [x] All Pro / upgrade prompts removed; saving a capture is never blocked
- [x] Drafts are written on tap, not automatically
- [x] Voice recordings stop at 30 seconds
- [x] API: per-device, per-IP and global daily limits; open CORS removed
- [x] API: classification moved to Claude Haiku (`PEA_MODEL` overrides)
- [x] The user's name is no longer sent to the API
- [x] iOS: unused background modes removed, export-compliance flag set
- [x] Dependencies match Expo SDK 54 (`expo-av`, `expo-font`, `eslint-config-expo`)
- [x] Privacy policy page at `/privacy`, linked from the Me tab
- [x] Typecheck, lint, 40 tests, and an iOS JS bundle export all pass

## 2. Backend
Live at `https://pea-app-psi.vercel.app` (Vercel project `pea-app`).

- [x] Release PR merged into `main`
- [x] Vercel project created and deploying from `main`
- [x] `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` set for Production
- [x] Privacy policy loads at `/privacy`
- [x] API URL set in `eas.json` for release builds
- [x] CI runs typecheck, lint and tests on every pull request
- [ ] 🧑 **Add credit to the Anthropic account** (console.anthropic.com → Settings → Billing). The key is accepted, but calls are refused for an empty balance, so AI sorting and drafts fail until this is done.
- [ ] 🧑 Check the OpenAI account has credit too — voice transcription depends on it and is only exercised by a real voice note
- [ ] 🧑 Run **API check** from the repo's Actions tab and confirm every step passes
- [ ] 🧑 Vercel → Storage → add **Upstash Redis** (free tier) to the `pea-app` project, then redeploy — makes the rate limits hold across instances
- [ ] 🧑 Set a monthly spend cap in the Anthropic and OpenAI consoles (suggest $20 each)
- [ ] 🧑 Delete the duplicate Vercel project `pea-app-7cbm` (Settings → Advanced) so merges stop deploying twice

## 3. First iOS build 🧑
- [ ] `npm install -g eas-cli && eas login`
- [ ] `eas build --platform ios --profile production` — sign in with your Apple ID when asked; EAS creates the certificates
- [ ] `eas submit --platform ios --latest` — creates the App Store Connect record if needed and uploads to TestFlight

## 4. Test on a real iPhone 🧑
Voice capture has never run on iOS. Before inviting anyone:
- [ ] Hold-to-speak records, transcribes and saves
- [ ] Holding past 30 seconds stops and saves on its own
- [ ] Denying the microphone shows the gentle message and typing still works
- [ ] An ambiguous typed capture gets re-sorted after a moment
- [ ] Drafts tab: tap a call/follow-up → draft appears → "Edit & Send" opens Messages
- [ ] Morning brief notification arrives at the chosen time
- [ ] Airplane mode: typing a capture still saves
- [ ] Me → Privacy policy opens

## 5. TestFlight, then App Store 🧑
- [ ] Add internal testers in App Store Connect (no review needed)
- [ ] For external testers or the public store: fill in the listing from `STORE_LISTING.md`
- [ ] Privacy policy URL, App Privacy answers and age rating (all in `STORE_LISTING.md`)
- [ ] iPhone 6.9" screenshots (iPad is not needed — the app is iPhone-only)
- [ ] Submit for review

## Later
- Android (needs a Play Console account; new personal accounts must run a 12-tester, 14-day closed test first)
- Pea Pro subscriptions
- Accounts, sync and partner sharing
- Move from `expo-av` (deprecated) to `expo-audio`
