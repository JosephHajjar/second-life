// api/reuse_fixed.js
// Handler that prefers the Generative API for all outputs when an API key is present.
// IMPORTANT: This file will ask the model to provide judgement-only numeric values
// (mass, impact, reuseScore, etc.) — it does NOT compute them with local formulas.

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1], base64: m[2] };
}

async function callGenerative(prompt, apiKey, imageDataUrl) {
  if (!apiKey) throw new Error('Missing API key');
  const modelEnv = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const modelPath = modelEnv.startsWith('models/') ? modelEnv : `models/${modelEnv}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const parts = [{ text: prompt }];
  const parsedImage = parseDataUrl(imageDataUrl);
  if (parsedImage && parsedImage.base64 && parsedImage.base64.length > 0) {
    parts.push({ inlineData: { mimeType: parsedImage.mimeType || 'image/jpeg', data: parsedImage.base64 } });
  }

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 1200,
      responseMimeType: 'application/json'
    }
  };

  // Simple retry for transient 429/503
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
  // Extract model text
  const c = json && json.candidates && json.candidates[0];
  const partsOut = c && c.content && Array.isArray(c.content.parts) ? c.content.parts : [];
  let text = partsOut.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('');
  if (!text) text = JSON.stringify(json);
  // Defensive cleanup: some models still wrap JSON in markdown fences
  text = String(text)
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  return text;
}

async function fetchWithRetry(url, options, retries = 2, backoffMs = 600) {
  let attempt = 0;
  // retry on rate limit / service unavailable
  while (true) {
    const resp = await fetch(url, options);
    if (resp.status === 429 || resp.status === 503) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, backoffMs * Math.pow(2, attempt)));
        attempt += 1;
        continue;
      }
    }
    return resp;
  }
}

function buildPrompt(item, imageProvided) {
  return `You are an expert sustainability and environmental impact analyst. Provide accurate, research-based estimates for the environmental impact of reusing this item instead of disposing it.

IMPORTANT: Base your estimates on real-world data:
- Waste: The actual weight of the item that would go to landfill if not reused
- CO2: Carbon emissions saved by not manufacturing a replacement (consider material extraction, processing, transportation)
- Water: Water saved by not producing a new item (consider manufacturing water usage for that material type)

Common reference values:
- Plastic bottle (500ml): ~0.025kg waste, ~0.08kg CO2, ~3L water
- Cotton t-shirt: ~0.2kg waste, ~8kg CO2, ~2700L water
- Smartphone: ~0.2kg waste, ~70kg CO2, ~13000L water
- Glass jar: ~0.3kg waste, ~0.3kg CO2, ~4L water
- Cardboard box: ~0.1kg waste, ~0.5kg CO2, ~20L water
- Aluminum can: ~0.015kg waste, ~0.2kg CO2, ~5L water
- Wooden furniture: ~5-20kg waste, ~15-50kg CO2, ~500-2000L water
- Electronics: ~0.5-2kg waste, ~50-200kg CO2, ~5000-20000L water

Return STRICT valid JSON only with these fields:
- identifiedItem: string (specific item name)
- materials: array of strings (primary materials detected)
- massKg: number (realistic weight in kg, be specific based on item type)
- reuseScore: integer 0-100 (higher = more beneficial to reuse)
- ideas: array of EXACTLY 3 specific, actionable reuse/upcycle ideas
- impact: object with realistic numeric estimates:
  - waste: number (kg of waste diverted from landfill - should equal or relate to massKg)
  - co2: number (kg of CO2 emissions saved - research-based estimate for that item type)
  - water: number (liters of water saved - based on manufacturing water footprint)
- perItem: { wasteKg: number }
- slider: { maxRecycled: integer 0-100 }

Item: "${item}"
ImageIncluded: ${imageProvided}
Respond with JSON only.`;
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
      const text = await callGenerative(prompt, apiKey, image);
      const firstBrace = typeof text === 'string' ? text.indexOf('{') : -1;
      const lastBrace = typeof text === 'string' ? text.lastIndexOf('}') : -1;
      const maybeObjectText = firstBrace >= 0 && lastBrace > firstBrace ? text.slice(firstBrace, lastBrace + 1) : '';
      const parsed = safeJsonParse(text) || safeJsonParse(maybeObjectText);
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
    return res.status(500).json({ error: 'server error' });
  }
};
