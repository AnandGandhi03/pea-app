// Vercel Serverless Function — classify and draft modes.
// Env: ANTHROPIC_API_KEY (required), PEA_MODEL (optional override).

const { guard } = require('./_lib/guard');

// Sorting a short note into one of four buckets does not need a large model.
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const CATEGORIES = ['buy', 'do', 'call', 'follow'];

const CLASSIFY_SYSTEM = `You are Pea, a calm AI assistant for busy parents.
Classify this parent note into exactly one category: "buy", "do", "call", or "follow".
Also clean up the text naturally (fix grammar, make action-oriented).

Rules:
- "buy": anything to purchase or pick up
- "do": tasks, errands, appointments to book
- "call": phone calls, texts, messages to send
- "follow": follow-ups, waiting on someone, check-ins

Reply ONLY with valid JSON, no markdown, no explanation:
{"category":"do","cleaned":"Clean action text here"}`;

const DRAFT_SYSTEM = `Draft a short, friendly text message for a busy parent to send.
Reply with ONLY the message text — no quotes, no explanation, no sign-off name.
Keep it 2-3 sentences max.`;

async function askClaude(system, userContent) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.PEA_MODEL || DEFAULT_MODEL,
      max_tokens: 200,
      system,
      messages: [{ role: 'user', content: userContent }],
    }),
  });
  if (!response.ok) {
    console.error('Anthropic error:', response.status, await response.text());
    return null;
  }
  const data = await response.json();
  const text = data?.content?.[0]?.text;
  return typeof text === 'string' ? text.trim() : null;
}

module.exports = async function handler(req, res) {
  const { text, mode } = req.body || {};
  const kind = mode === 'draft' ? 'draft' : 'classify';

  if (!(await guard(req, res, kind))) return;

  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Missing text' });
  }
  if (text.length > 1000) {
    return res.status(400).json({ error: 'Text too long' });
  }

  try {
    if (kind === 'draft') {
      const draft = await askClaude(DRAFT_SYSTEM, `Draft a message for: "${text}"`);
      if (!draft) return res.status(502).json({ error: 'Draft generation failed' });
      return res.status(200).json({ draft });
    }

    const raw = await askClaude(CLASSIFY_SYSTEM, `Parent note: "${text}"`);
    if (!raw) return res.status(502).json({ error: 'Classification failed' });

    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    if (!CATEGORIES.includes(parsed?.category) || typeof parsed?.cleaned !== 'string' || !parsed.cleaned.trim()) {
      return res.status(502).json({ error: 'Classification failed' });
    }
    return res.status(200).json({ category: parsed.category, cleaned: parsed.cleaned.trim().slice(0, 300) });
  } catch (error) {
    console.error('Classify error:', error);
    return res.status(500).json({ error: 'Request failed' });
  }
};
