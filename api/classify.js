// Vercel Serverless Function — handles both classify and draft modes
// Deploy: vercel deploy
// Set env var: ANTHROPIC_API_KEY in Vercel dashboard

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, userName, mode } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Missing text' });
  }
  if (text.length > 1000) {
    return res.status(400).json({ error: 'Text too long' });
  }
  if (userName !== undefined && (typeof userName !== 'string' || userName.length > 100)) {
    return res.status(400).json({ error: 'Invalid userName' });
  }

  // DRAFT mode — generates a ready-to-send message
  if (mode === 'draft') {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          system: `Draft a short, friendly text message for a busy parent.
Reply with ONLY the message text — no quotes, no explanation.
Keep it 2-3 sentences max. Sign off with their first name if provided.`,
          messages: [{
            role: 'user',
            content: `Draft a message for: "${text}"\nParent name: ${userName || 'unknown'}`,
          }],
        }),
      });
      const data = await response.json();
      const draft = data?.content?.[0]?.text?.trim() || null;
      return res.status(200).json({ draft });
    } catch {
      return res.status(500).json({ error: 'Draft generation failed' });
    }
  }

  // CLASSIFY mode (default) — categorises the parent's note
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: `You are Pea, a calm AI assistant for busy parents.
Classify this parent note into exactly one category: "buy", "do", "call", or "follow".
Also clean up the text naturally (fix grammar, make action-oriented).

Rules:
- "buy": anything to purchase or pick up
- "do": tasks, errands, appointments to book
- "call": phone calls, texts, messages to send
- "follow": follow-ups, waiting on someone, check-ins

Reply ONLY with valid JSON, no markdown, no explanation:
{"category":"do","cleaned":"Clean action text here"}`,
        messages: [{
          role: 'user',
          content: `Parent note: "${text}"${userName ? `\nParent name: ${userName}` : ''}`,
        }],
      }),
    });

    const data = await response.json();
    const raw = data.content?.[0]?.text || '{}';
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return res.status(200).json(parsed);
  } catch (error) {
    console.error('Classify error:', error);
    return res.status(500).json({ error: 'Classification failed' });
  }
};
