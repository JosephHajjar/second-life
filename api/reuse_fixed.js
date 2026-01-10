// api/reuse_fixed.js
// Handler that prefers the Generative API for all outputs when an API key is present.
// IMPORTANT: This file will ask the model to provide judgement-only numeric values
// (mass, impact, reuseScore, etc.) — it does NOT compute them with local formulas.

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

async function callGenerative(prompt, apiKey) {
  if (!apiKey) throw new Error('Missing API key');
  const url = 'https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generate?key=' + encodeURIComponent(apiKey);
  const body = { prompt: { text: prompt }, temperature: 0.0, max_output_tokens: 512 };
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error('Model call failed: ' + resp.status + ' ' + t);
  }
  const json = await resp.json();
  // Extract plausible output text
  try {
    if (json.candidates && json.candidates[0]) {
      const c = json.candidates[0];
      if (c.output) return typeof c.output === 'string' ? c.output : JSON.stringify(c.output);
      if (c.content) return typeof c.content === 'string' ? c.content : JSON.stringify(c.content);
      if (c.text) return c.text;
    }
  } catch (e) {}
  return JSON.stringify(json);
}

function makeFallback(item) {
  // Minimal safe fallback used only when no API key or model fails
  return {
    reuseScore: 50,
    ideas: [
      `Repurpose the ${item} as a planter or small storage container.`,
      `Decorate the ${item} for gifting or home use.`,
      `Combine with other materials for a craft project.`
    ],
    impact: { CO2: 0, water: 0, waste: 0 },
    perItem: { wasteKg: 0 },
    slider: { maxRecycled: 1000 },
    identifiedItem: item || ''
  };
}

function buildPrompt(item, imageProvided) {
  return `You are an expert sustainability evaluator. Using judgement only (no formulas, no calculations shown), return STRICT valid JSON and NOTHING else. Produce these fields:\n- identifiedItem: string (short label)\n- materials: array of strings (primary materials)\n- massKg: number (your best judgement of per-item mass in kg)\n- reuseScore: integer 0-100 (holistic judgement)\n- ideas: array of 3-6 concise, actionable reuse/upcycle ideas\n- impact: object with numeric fields waste (kg), co2 (kg), water (L) — use your judgement only\n- perItem: { wasteKg: number }\n- slider: { maxRecycled: integer }\n\nItem: "${item}"\nImageIncluded: ${imageProvided}\nRespond with JSON only.`;
}

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST /api/reuse expected' });
    const item = req.body && req.body.item ? String(req.body.item) : '';
    const image = req.body && req.body.image;
    try { if (image && typeof image === 'string' && image.length > 8_000_000) return res.status(413).json({ error: 'Image too large' }); } catch (e) {}

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_API_KEY || null;
    if (!apiKey) {
      return res.status(503).json({ error: 'GOOGLE_GENERATIVE_AI_API_KEY required. This endpoint uses the Generative API for all outputs and will not return local fallbacks.' });
    }

    const prompt = buildPrompt(item || (image ? 'image provided' : 'unknown'), Boolean(image));
    try {
      const text = await callGenerative(prompt, apiKey);
      const parsed = safeJsonParse(text) || safeJsonParse((text.match(/\{[\s\S]*\}/)||[])[0]);
      if (!parsed || typeof parsed !== 'object') {
        return res.status(502).json({ error: 'Model returned non-JSON or unparsable output', raw: String(text).slice(0, 2000) });
      }
      // Minimal sanitization: coerce numbers, but DO NOT compute values locally
      if (parsed.massKg !== undefined) parsed.massKg = Number(parsed.massKg) || 0;
      if (parsed.reuseScore !== undefined) parsed.reuseScore = Math.max(0, Math.min(100, Math.round(Number(parsed.reuseScore) || 0)));
      if (parsed.perItem && parsed.perItem.wasteKg !== undefined) parsed.perItem.wasteKg = Number(parsed.perItem.wasteKg) || 0;
      if (parsed.impact) {
        parsed.impact.waste = Number(parsed.impact.waste) || 0;
        parsed.impact.co2 = Number(parsed.impact.co2) || 0;
        parsed.impact.water = Number(parsed.impact.water) || 0;
      }
      if (!Array.isArray(parsed.ideas)) parsed.ideas = [];
      if (!parsed.slider) parsed.slider = { maxRecycled: 0 };
      if (!parsed.identifiedItem) parsed.identifiedItem = item || '';
      return res.status(200).json(parsed);
    } catch (e) {
      console.error('Model error in reuse_fixed:', e && (e.stack || e));
      return res.status(502).json({ error: 'Model call failed', message: e && e.message ? e.message : String(e) });
    }
  } catch (err) {
    console.error('api/reuse_fixed error:', err && (err.stack || err));
    try { return res.status(200).json(makeFallback(req && req.body && req.body.item)); } catch (e) { return res.status(500).json({ error: 'server error' }); }
  }
};
