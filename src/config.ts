// Runtime configuration.
//
// The API base URL comes from the EXPO_PUBLIC_PEA_API_URL environment variable
// (set in .env locally, or as an EAS build secret/env var for release builds).
// Example: EXPO_PUBLIC_PEA_API_URL=https://pea-api.vercel.app
//
// When unset, the app runs in local-only mode: the on-device classifier still
// works, but Claude reclassification, drafts, and voice transcription are
// disabled gracefully.

const rawUrl = (process.env.EXPO_PUBLIC_PEA_API_URL ?? '').trim().replace(/\/$/, '');

export const CONFIG = {
  API_BASE_URL:          rawUrl,
  FREE_CAPTURES_PER_DAY: 5,
  PRO_PRICE:             '$7.99/mo',
} as const;

export function hasApi(): boolean {
  return CONFIG.API_BASE_URL.startsWith('https://');
}

export function apiUrl(path: '/api/classify' | '/api/transcribe'): string {
  return `${CONFIG.API_BASE_URL}${path}`;
}
