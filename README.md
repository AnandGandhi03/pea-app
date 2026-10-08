# Pea

A calm, voice-first assistant for new parents. Hold the mic, say what's on your
mind, and Pea sorts it into To Buy, To Do, To Call or Follow Up, drafts the
message when you ask, and briefs you every morning.

- **App:** React Native / Expo SDK 54 (`App.tsx`, `src/`)
- **API:** Vercel serverless functions (`api/`) that relay to Anthropic and OpenAI
- **Privacy policy:** `public/privacy.html`, served at `/privacy`

## Working on it

```bash
npm install
cp .env.example .env     # set EXPO_PUBLIC_PEA_API_URL
npm start
npm run typecheck && npm run lint && npm test
```

## Releasing

- `RELEASE_CHECKLIST.md` — the ordered steps to TestFlight and the App Store
- `DEPLOY_STEPS.md` — how the backend, environment variables and builds fit together
- `STORE_LISTING.md` — listing copy and App Privacy answers

After changing a key or deploying the backend, run **API check** from the
repo's Actions tab to confirm the live API works.
