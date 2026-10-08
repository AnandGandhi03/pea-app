# Pea — Deploy Guide

See `RELEASE_CHECKLIST.md` for the ordered release steps. This file explains the pieces.

## How it fits together

```
iPhone app ──HTTPS──▶ Vercel (api/classify, api/transcribe) ──▶ Anthropic / OpenAI
                      └─ public/privacy.html  (the privacy policy)
```

- The app holds no API keys. It talks only to the Vercel deployment, whose URL
  is baked in at build time from `EXPO_PUBLIC_PEA_API_URL`.
- With no URL set the app runs local-only: typed captures and on-device sorting
  work; voice, AI re-sorting and drafts are off.

## Vercel

Import the repo as a project. `vercel.json` already sets everything: no build
step, static files from `public/`, functions from `api/`.

| Env var | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Sorting captures and writing drafts |
| `OPENAI_API_KEY` | yes | Whisper voice transcription |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` (or `KV_REST_API_URL` / `_TOKEN`) | recommended | Shared rate-limit counters; added automatically by the Upstash integration |
| `PEA_MODEL` | no | Override the Claude model (default `claude-haiku-4-5-20251001`) |
| `PEA_GLOBAL_DAILY_LIMIT` | no | Ceiling on total API calls per day (default 2000) |

### Usage limits (`api/_lib/guard.js`)

Per UTC day: 60 classifications, 20 drafts and 40 transcriptions per device
(3× that per IP), 20 requests a minute per IP, and a global daily ceiling.
Over-limit requests get HTTP 429 and never reach Anthropic or OpenAI.

Without Upstash the counters are in-memory per function instance — good enough
for a few testers, but not a hard ceiling. Add Upstash before a public launch,
and keep spend caps set in both provider consoles either way.

### Check a deployment

```bash
URL=https://your-project.vercel.app
curl -s -X POST $URL/api/classify -H 'Content-Type: application/json' \
  -H 'x-pea-device: manual-test-0001' -d '{"text":"ring the daycare about friday"}'
curl -s -X POST $URL/api/classify -H 'Content-Type: application/json' \
  -H 'x-pea-device: manual-test-0001' -d '{"text":"follow up with daycare","mode":"draft"}'
```

## iOS build

```bash
npm install
npm install -g eas-cli
eas login
eas build --platform ios --profile production
eas submit --platform ios --latest
```

EAS handles signing. Build numbers auto-increment (`appVersionSource: remote`).

## Local development

```bash
cp .env.example .env    # set EXPO_PUBLIC_PEA_API_URL
npm start
npm run typecheck && npm run lint && npm test
```

Test voice capture on a real device — simulators have no usable microphone input for this.
