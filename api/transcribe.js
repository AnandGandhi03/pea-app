// Vercel Serverless Function — Whisper audio transcription
// Set env var: OPENAI_API_KEY in Vercel dashboard

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { audioBase64, mimeType } = req.body;
  if (!audioBase64) return res.status(400).json({ error: 'Missing audioBase64' });

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
      const errText = await response.text();
      console.error('Whisper error:', response.status, errText);
      return res.status(500).json({ error: 'Transcription failed' });
    }

    const data = await response.json();
    return res.status(200).json({ text: data.text || '' });
  } catch (error) {
    console.error('Transcribe error:', error);
    return res.status(500).json({ error: 'Transcription failed' });
  }
};
