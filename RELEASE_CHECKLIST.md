# Pea v1.0.0 — Release Checklist

## PHASE 1: Repo & Code ✅
- [x] `src/constants.ts` present with CONFIG object
- [x] `assets/icon.png` (1024×1024)
- [x] `assets/adaptive-icon.png` (1024×1024)
- [x] `assets/splash.png` (1080×1920)
- [x] `assets/favicon.png` (48×48)
- [x] `app.json` — bundleIdentifier: `com.aifysolutions.pea`
- [x] `app.json` — package: `com.aifysolutions.pea`
- [x] `app.json` — version: `1.0.0`, versionCode: `1`
- [x] `app.json` — NSMicrophoneUsageDescription present
- [x] `app.json` — placeholder projectId removed
- [x] `eas.json` — `production` profile (APK) present
- [x] `eas.json` — `production-aab` profile (AAB/Play Store) present
- [x] `api/classify.js` — uses `module.exports` (Vercel compatible)
- [x] `App.tsx` — storage key `pea:data:v3`
- [x] `App.tsx` — `EMPTY_ITEMS` (no demo data on fresh install)
- [x] `App.tsx` — `setNotificationChannelAsync` (Android notifications)
- [x] `App.tsx` — `BackHandler` (Android back button)
- [x] TypeScript — zero type errors (`npx tsc --noEmit`)
- [x] `pea-app.zip` removed from repo
- [x] `package.json` — `main` field corrected to `node_modules/expo/AppEntry.js`

## PHASE 2: EAS Setup
- [ ] `eas whoami` — logged in as correct account
- [ ] `eas init` — real UUID written to `app.json`
- [ ] `app.json` with projectId committed & pushed

## PHASE 3: Pre-Build
- [ ] `npx expo-doctor` passes all checks (network-dependent checks require internet)
- [ ] `eas.json` submit section filled in:
  - [ ] `appleId` — your Apple ID email
  - [ ] `ascAppId` — App Store Connect app ID
  - [ ] `appleTeamId` — your Apple team ID
  - [ ] `google-service-account.json` created for Play Store

## PHASE 4: Builds
- [ ] Android AAB build complete (`eas build --platform android --profile production-aab`)
  - Build URL: _______________
  - .aab downloaded: _______________
- [ ] iOS build complete (`eas build --platform ios --profile production`)
  - Build URL: _______________
  - .ipa downloaded: _______________

## PHASE 5: Backend / API
- [ ] Vercel project created
- [ ] `api/classify.js` deployed to Vercel
- [ ] `ANTHROPIC_API_KEY` set in Vercel environment variables
- [ ] `ANTHROPIC_API_URL` updated in `src/constants.ts` with real Vercel URL
- [ ] Classify endpoint tested: `curl -X POST https://YOUR_URL/api/classify -H 'Content-Type: application/json' -d '{"text":"buy milk","userName":"Test"}'`
- [ ] Draft endpoint tested

## PHASE 6: App Store Submission (iOS)
- [ ] App Store Connect — new app created (`com.aifysolutions.pea`)
- [ ] App name, subtitle, description, keywords filled in (see STORE_LISTING.md)
- [ ] Screenshots uploaded (5× iPhone 6.9", 5× iPad 12.9")
- [ ] Privacy policy URL entered
- [ ] Age rating set to 4+
- [ ] Pricing set (Free with in-app purchase)
- [ ] In-app purchase created: Pea Pro — $7.99/month
- [ ] `eas submit --platform ios` run
- [ ] Review submitted

## PHASE 7: Play Store Submission (Android)
- [ ] Google Play Console — new app created
- [ ] App name, short/full description filled in (see STORE_LISTING.md)
- [ ] Screenshots uploaded (2× phone minimum)
- [ ] Privacy policy URL entered
- [ ] Content rating questionnaire completed (Everyone)
- [ ] Pricing set (Free with in-app purchase)
- [ ] In-app purchase created: Pea Pro — $7.99/month
- [ ] `eas submit --platform android` run OR upload AAB manually
- [ ] Internal test track published → promoted to production

## PHASE 8: Post-Launch
- [ ] Monitor crash reports in Expo dashboard
- [ ] Reply to first App Store reviews within 24h
- [ ] Set up analytics (optional)
- [ ] Plan v1.1.0 (voice input, widget, iCloud sync)
