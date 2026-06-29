// ─── Pea API Configuration ────────────────────────────────────
// Option A (Development only): paste your Anthropic key here
// Option B (Production — recommended): deploy api/proxy.js to Vercel
//   and set ANTHROPIC_API_URL to your Vercel function URL

export const CONFIG = {
  // For development: set your key here
  // For production: leave empty and set ANTHROPIC_API_URL
  ANTHROPIC_API_KEY: '',

  // Your deployed Vercel proxy URL — fill in after deploying api/proxy.js
  // e.g. 'https://pea-api.vercel.app/api/classify'
  ANTHROPIC_API_URL: 'https://YOUR_VERCEL_URL.vercel.app/api/classify',

  // App settings
  FREE_CAPTURES_PER_DAY: 5,
  PRO_PRICE: '$7.99/mo',
  MODEL: 'claude-sonnet-4-20250514',
};
