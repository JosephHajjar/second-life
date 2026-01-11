// api/repair.js
// Handler for repair guidance using the Google Generative API.

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

async function callGenerative(prompt, apiKey) {
  if (!apiKey) throw new Error('Missing API key');
  const modelEnv = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const modelPath = modelEnv.startsWith('models/') ? modelEnv : `models/${modelEnv}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 1200,
      responseMimeType: 'application/json'
    }
  };

  const resp = await fetch(url, {
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

function buildPrompt(description) {
  return `You are a seasoned repair technician. Using judgement only (no formulas, no calculations shown), return STRICT valid JSON and NOTHING else. Produce these fields:\n- identifiedItem: concise string\n- likelyIssue: concise string\n- repairScore: integer 0-100 (overall confidence the item can be fixed safely and effectively)\n- steps: array of 3-6 short, imperative repair steps (safe to try first)\n- requiredTools: array of strings\n- replacementParts: array of strings (empty if none)\n- safetyNotes: array of 1-3 short warnings\n- estimatedTimeMinutes: integer 1-240\n- difficulty: integer 1-5 (1 easiest)\n\nProblemOrItem: "${description}"\nRespond with JSON only.`;
}

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST /api/repair expected' });
    const description = req.body && req.body.description ? String(req.body.description).trim() : '';
    if (!description) return res.status(400).json({ error: 'description is required' });

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || null;
    if (!apiKey) return res.status(503).json({ error: 'GOOGLE_GENERATIVE_AI_API_KEY required' });

    const prompt = buildPrompt(description);
    try {
      const text = await callGenerative(prompt, apiKey);
      const firstBrace = typeof text === 'string' ? text.indexOf('{') : -1;
      const lastBrace = typeof text === 'string' ? text.lastIndexOf('}') : -1;
      const maybeObjectText = firstBrace >= 0 && lastBrace > firstBrace ? text.slice(firstBrace, lastBrace + 1) : '';
      const parsed = safeJsonParse(text) || safeJsonParse(maybeObjectText);
      if (!parsed || typeof parsed !== 'object') return res.status(502).json({ error: 'Model returned non-JSON or unparsable output', raw: String(text).slice(0, 2000) });

      if (!Array.isArray(parsed.steps)) parsed.steps = [];
      if (!Array.isArray(parsed.requiredTools)) parsed.requiredTools = [];
      if (!Array.isArray(parsed.replacementParts)) parsed.replacementParts = [];
      if (!Array.isArray(parsed.safetyNotes)) parsed.safetyNotes = [];
      if (parsed.estimatedTimeMinutes !== undefined) parsed.estimatedTimeMinutes = Math.max(1, Math.min(240, Math.round(Number(parsed.estimatedTimeMinutes) || 0)));
      if (parsed.difficulty !== undefined) parsed.difficulty = Math.max(1, Math.min(5, Math.round(Number(parsed.difficulty) || 0)));
      if (parsed.repairScore !== undefined) parsed.repairScore = Math.max(0, Math.min(100, Math.round(Number(parsed.repairScore) || 0)));
      return res.status(200).json(parsed);
    } catch (e) {
      console.error('Model error in repair:', e && (e.stack || e));
      return res.status(502).json({ error: 'Model call failed', message: e && e.message ? e.message : String(e) });
    }
  } catch (err) {
    console.error('api/repair error:', err && (err.stack || err));
    return res.status(500).json({ error: 'server error' });
  }
};
