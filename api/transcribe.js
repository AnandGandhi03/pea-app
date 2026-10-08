// Vercel Serverless Function — Whisper audio transcription.
// Env: OPENAI_API_KEY (required).

const { guard } = require('./_lib/guard');

// The app stops recording at 30 seconds (~0.5 MB of AAC, ~0.7 MB as base64).
// 2 MB leaves headroom and keeps a single call's Whisper cost bounded.
const MAX_BASE64_LENGTH = 2_000_000;

module.exports = async function handler(req, res) {
  if (!(await guard(req, res, 'transcribe'))) return;

  const { audioBase64, mimeType } = req.body || {};
  if (typeof audioBase64 !== 'string' || !audioBase64) {
    return res.status(400).json({ error: 'Missing audioBase64' });
  }
  if (audioBase64.length > MAX_BASE64_LENGTH) {
    return res.status(413).json({ error: 'Audio too large' });
  }
  if (mimeType !== undefined && (typeof mimeType !== 'string' || !/^audio\/[\w.+-]+$/.test(mimeType))) {
    return res.status(400).json({ error: 'Invalid mimeType' });
  }

  try {
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: mimeType || 'audio/m4a' });
    formData.append('file', blob, 'capture.m4a');
    formData.append('model', 'whisper-1');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        // No Content-Type — FormData sets it with boundary automatically
      },
      body: formData,
    });

    if (!response.ok) {
      console.error('Whisper error:', response.status, await response.text());
      return res.status(502).json({ error: 'Transcription failed' });
    }

    const data = await response.json();
    return res.status(200).json({ text: data.text || '' });
  } catch (error) {
    console.error('Transcribe error:', error);
    return res.status(500).json({ error: 'Transcription failed' });
  }
};
