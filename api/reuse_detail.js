// api/reuse_detail.js
// Generates a detailed tutorial for a selected reuse idea using the same Generative API key.

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

async function fetchWithRetry(url, options, retries = 2, backoffMs = 600) {
  let attempt = 0;
  while (true) {
    const resp = await fetch(url, options);
    if ((resp.status === 429 || resp.status === 503) && attempt < retries) {
      await new Promise((r) => setTimeout(r, backoffMs * Math.pow(2, attempt)));
      attempt += 1;
      continue;
    }
    return resp;
  }
}

async function callGenerative(prompt, apiKey) {
  if (!apiKey) throw new Error('Missing API key');
  const modelEnv = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const modelPath = modelEnv.startsWith('models/') ? modelEnv : `models/${modelEnv}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1400,
      responseMimeType: 'application/json'
    }
  };

  const resp = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error('Model call failed: ' + resp.status + ' ' + t);
  }

  const json = await resp.json();
  const c = json && json.candidates && json.candidates[0];
  const partsOut = c && c.content && Array.isArray(c.content.parts) ? c.content.parts : [];
  let text = partsOut.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('');
  if (!text) text = JSON.stringify(json);
  text = String(text)
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  return text;
}

function buildPrompt(item, idea) {
  return `You are an expert maker. Provide a concise, actionable tutorial for this reuse idea. Respond with STRICT JSON only. Fields:\n- summary: short sentence\n- steps: array of 5-8 clear, numbered steps (no markdown, plain text)\n- materials: array of strings\n- tools: array of strings\n- cautions: array of 1-3 short safety notes\nItem: "${item}"\nIdea: "${idea}"\nRespond with JSON only.`;
}

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST /api/reuse/detail expected' });
    const item = req.body && req.body.item ? String(req.body.item).trim() : '';
    const idea = req.body && req.body.idea ? String(req.body.idea).trim() : '';
    if (!item || !idea) return res.status(400).json({ error: 'item and idea are required' });

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || null;
    if (!apiKey) return res.status(503).json({ error: 'GOOGLE_GENERATIVE_AI_API_KEY required' });

    const prompt = buildPrompt(item, idea);
    try {
      const text = await callGenerative(prompt, apiKey);
      const firstBrace = typeof text === 'string' ? text.indexOf('{') : -1;
      const lastBrace = typeof text === 'string' ? text.lastIndexOf('}') : -1;
      const maybeObjectText = firstBrace >= 0 && lastBrace > firstBrace ? text.slice(firstBrace, lastBrace + 1) : '';
      const parsed = safeJsonParse(text) || safeJsonParse(maybeObjectText);
      if (!parsed || typeof parsed !== 'object') {
        return res.status(502).json({ error: 'Model returned non-JSON or unparsable output', raw: String(text).slice(0, 2000) });
      }
      if (!Array.isArray(parsed.steps)) parsed.steps = [];
      if (!Array.isArray(parsed.materials)) parsed.materials = [];
      if (!Array.isArray(parsed.tools)) parsed.tools = [];
      if (!Array.isArray(parsed.cautions)) parsed.cautions = [];
      return res.status(200).json(parsed);
    } catch (e) {
      console.error('Model error in reuse_detail:', e && (e.stack || e));
      return res.status(502).json({ error: 'Model call failed', message: e && e.message ? e.message : String(e) });
    }
  } catch (err) {
    console.error('api/reuse_detail error:', err && (err.stack || err));
    return res.status(500).json({ error: 'server error' });
  }
};
