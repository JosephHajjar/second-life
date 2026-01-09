// api/reuse.js
// Serverless-compatible handler for generating reuse ideas via Google Generative API.

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function detectProfile(item) {
  const text = (item || '').toLowerCase();
    // More specific material profiles with recyclability, durability and mass heuristics
    const profiles = [
      { keys: ['plastic bottle', 'bottle', 'pet bottle'], material: 'plastic:PET', massKg: 0.02, reuseBase: 72, recyclability: 0.8, durability: 5, co2PerKg: 2.5, waterPerKg: 50, reach: 500000 },
      { keys: ['hdpe', 'milk jug', 'detergent bottle'], material: 'plastic:HDPE', massKg: 0.03, reuseBase: 70, recyclability: 0.85, durability: 6, co2PerKg: 2.2, waterPerKg: 40, reach: 300000 },
      { keys: ['plastic bag', 'bag', 'polybag'], material: 'plastic:LDPE', massKg: 0.005, reuseBase: 45, recyclability: 0.4, durability: 2, co2PerKg: 2.5, waterPerKg: 20, reach: 400000 },
      { keys: ['glass bottle', 'glass jar'], material: 'glass', massKg: 0.25, reuseBase: 78, recyclability: 0.95, durability: 8, co2PerKg: 0.9, waterPerKg: 10, reach: 100000 },
      { keys: ['aluminum can', 'can'], material: 'aluminum', massKg: 0.015, reuseBase: 80, recyclability: 0.98, durability: 7, co2PerKg: 9.0, waterPerKg: 5, reach: 600000 },
      { keys: ['steel', 'tin'], material: 'steel', massKg: 0.2, reuseBase: 75, recyclability: 0.95, durability: 9, co2PerKg: 2.0, waterPerKg: 20, reach: 200000 },
      { keys: ['cardboard', 'box'], material: 'paper', massKg: 0.3, reuseBase: 70, recyclability: 0.9, durability: 4, co2PerKg: 1.0, waterPerKg: 20, reach: 200000 },
      { keys: ['t-shirt', 'shirt', 'clothing', 'fabric'], material: 'textile', massKg: 0.2, reuseBase: 82, recyclability: 0.6, durability: 6, co2PerKg: 2.0, waterPerKg: 2700, reach: 120000 },
      { keys: ['phone', 'smartphone', 'electronics', 'laptop', 'tablet'], material: 'electronic', massKg: 0.18, reuseBase: 50, recyclability: 0.2, durability: 5, co2PerKg: 70, waterPerKg: 1000, reach: 50000 },
      { keys: ['wood', 'cutting board', 'furniture'], material: 'wood', massKg: 2.0, reuseBase: 88, recyclability: 0.9, durability: 9, co2PerKg: 0.4, waterPerKg: 500, reach: 40000 },
      { keys: ['ceramic', 'mug', 'plate'], material: 'ceramic', massKg: 0.5, reuseBase: 66, recyclability: 0.1, durability: 8, co2PerKg: 1.5, waterPerKg: 100, reach: 30000 }
    ];
  
    for (let p of profiles) {
      for (let k of p.keys) {
        if (text.indexOf(k) !== -1) return p;
      }
    }
  
    // Generic fallback profile uses simple heuristics
    const fallbackMass = Math.max(0.01, Math.min(5, (text.length || 10) * 0.02));
    return { keys: [], material: 'generic', massKg: fallbackMass, reuseBase: 55, recyclability: 0.6, durability: 5, co2PerKg: 2.5, waterPerKg: 50, reach: 100000 };
  }

  function makeFallback(item) {
  const profile = detectProfile(item);
  const perItemKg = Math.max(0.001, Number(profile.weight) || 0.05);

  // Compute reuse score using profile base, small boosts/penalties from keywords
  let score = profile.reuseBase || 50;
  const t = (item || '').toLowerCase();
  let penalty = 0;
  if (t.includes('single-use') || t.includes('disposable') || t.includes('throwaway')) penalty += 20;
  // Reduce the single-use penalty for plastic items because many plastics are recyclable
  if (profile.material === 'plastic' && penalty > 0) penalty = Math.floor(penalty * 0.5);
  score -= penalty;
  if (t.includes('vintage') || t.includes('antique') || t.includes('handmade')) score += 12;
  // longer descriptive names often imply more durable items
  if ((item || '').length > 20) score += 6;
  score = Math.round(Math.max(0, Math.min(100, score)));

  // Impact estimates
  const waste = +perItemKg.toFixed(3);
  const co2 = +(waste * (profile.co2PerKg || 2.5)).toFixed(2);
  const water = Math.round(waste * (profile.waterPerKg || 50));

  const ideas = [
    `Repurpose ${item} as a planter or small storage`,
    `Upcycle ${item} into a home craft or donation item`,
    `Share ${item} locally through community reuse groups`
  ];

  return {
    reuseScore: score,
    ideas,
    impact: { CO2: co2, water: water, waste: waste },
    perItem: { wasteKg: waste },
    slider: { maxRecycled: Math.max(100, Math.floor(profile.reach || 10000)) }
  };
}

// Helper to call the model with a focused scoring prompt when needed
async function askModelForScore(item, partialJson, apiKey) {
  try {
    const modelUrl = 'https://generativelanguage.googleapis.com/v1beta/models/text-bison-001:generate?key=' + encodeURIComponent(apiKey);
    const prompt = `You are an expert sustainability assistant. Compute a single numeric reuseScore (0-100) for the given item, using the provided Context JSON if present. Be particular about the materials array if present — weight each material's suggestedReuseScore by its confidence to form the overall reuseScore.\nItem: ${item}\nContext JSON: ${JSON.stringify(partialJson)}\nRespond with ONLY valid JSON: {"reuseScore": <number>} (integer between 0 and 100). No extra text.`;
    const body = { prompt: prompt, temperature: 0.0 };
    const rr = await fetch(modelUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let dd = null;
    try { dd = await rr.json(); } catch (e) { dd = null; }
    if (!rr.ok || !dd) return null;

    // extract text similar to other model parsing
    let text = '';
    if (dd.candidates && dd.candidates[0] && dd.candidates[0].content) {
      const parts = dd.candidates[0].content.parts || [];
      text = parts.map(p => p.text || '').join('');
    } else if (typeof dd.output === 'string') {
      text = dd.output;
    } else {
      try { text = JSON.stringify(dd); } catch (e) { text = '' + dd; }
    }

    const parsed = safeJsonParse(text);
    if (parsed && typeof parsed.reuseScore !== 'undefined') {
      const n = Number(parsed.reuseScore);
      if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)));
    }
    return null;
  } catch (e) {
    return null;
  }
}

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    let item;
    try {
      item = req.body && req.body.item;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON', message: String(e) });
    }
    if (!item || typeof item !== 'string') {
      return res.status(400).json({ error: 'No item provided' });
    }

    // If API key missing, return safe fallback so UI keeps working
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      console.warn('Missing GOOGLE_GENERATIVE_AI_API_KEY; returning fallback response');
      return res.status(200).json(makeFallback(item));
    }

    // Attempt a simple, single-call request using a common endpoint shape.
    // If anything fails or the model returns non-JSON, fall back to a safe canned response.
    try {
      const modelUrl = 'https://generativelanguage.googleapis.com/v1beta/models/text-bison-001:generate?key=' + encodeURIComponent(apiKey);
      let prompt = `You are an expert sustainability assistant. Given the single-line item description after 'Item:', analyze the item's likely materials, estimate per-material recyclability and durability, and then compute a single overall reuseScore (0-100) that reflects the realistic potential for reuse (higher = better). Return ONLY valid JSON with this exact shape (no extra text):\n\n{\n  \"reuseScore\": number (0-100),\n  \"materials\": [ { \"material\": string, \"confidence\": number (0-100), \"recyclability\": number (0-1), \"suggestedReuseScore\": number (0-100) } ],\n  \"ideas\": string[] (3 items),\n  \"impact\": { \"CO2\": number (kg), \"water\": number (liters), \"waste\": number (kg) },\n  \"perItem\": { \"wasteKg\": number },\n  \"slider\": { \"maxRecycled\": integer }\n}\n\nBe specific about materials (e.g., \"plastic:PET\", \"aluminum\", \"glass\"). Use numbers that are realistic for everyday consumer items. If you are unsure of a numeric estimate, set it to null. Use only JSON.`;
      if (req.body && req.body.image) {
        prompt = `Image included in request (base64 data URL). If you can identify the object from the image, set a top-level field \"identifiedItem\" with a short label and use that as the primary input for analysis. Then ${prompt}`;
      }
      const body = { prompt: prompt, temperature: 0.2 };

      const rr = await fetch(modelUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      let dd = null;
      try { dd = await rr.json(); } catch (e) { dd = null; }

      if (rr.ok && dd) {
        // Try to extract text from multiple shapes
        let text = '';
        if (dd.candidates && dd.candidates[0] && dd.candidates[0].content) {
          const parts = dd.candidates[0].content.parts || [];
          text = parts.map(p => p.text || '').join('');
        } else if (typeof dd.output === 'string') {
          text = dd.output;
        } else if (dd.result && typeof dd.result === 'string') {
          text = dd.result;
        } else {
          try { text = JSON.stringify(dd); } catch (e) { text = '' + dd; }
        }

        const parsed = safeJsonParse(text);
        if (parsed && typeof parsed === 'object') {
          // sanitize numeric fields
          const out = Object.assign({}, parsed);
          if (out.impact) {
            out.impact.CO2 = Math.max(0, Number(out.impact.CO2) || 0);
            out.impact.water = Math.max(0, Number(out.impact.water) || 0);
            out.impact.waste = Math.max(0, Number(out.impact.waste) || 0);
          }
          if (out.perItem) out.perItem.wasteKg = Math.max(0, Number(out.perItem.wasteKg) || 0);
          if (out.slider && Number.isFinite(Number(out.slider.maxRecycled))) out.slider.maxRecycled = Math.max(1, Math.floor(Number(out.slider.maxRecycled)));

          // Prefer AI-generated score: if missing or invalid, ask the model specifically for a reuseScore
          if (!Number.isFinite(Number(out.reuseScore))) {
            try {
              const aiScore = await askModelForScore(item, out, apiKey);
              if (aiScore !== null) out.reuseScore = aiScore;
              else {
                // fallback to profile base if AI score not available
                const profile = detectProfile(item);
                out.reuseScore = Math.round(Math.max(0, Math.min(100, Number(profile.reuseBase || 50))));
              }
            } catch (e) {
              const profile = detectProfile(item);
              out.reuseScore = Math.round(Math.max(0, Math.min(100, Number(profile.reuseBase || 50))));
            }
          } else {
            out.reuseScore = Math.round(Number(out.reuseScore));
          }

          return res.status(200).json(out);
        }
      }
    } catch (e) {
      console.error('Model call failed:', e && e.stack ? e.stack : e);
    }

    // Final fallback — guaranteed valid structure so UI works
    return res.status(200).json(makeFallback(item));

  } catch (err) {
    console.error('Server function crashed:', err && err.stack ? err.stack : err);
    // Return a safe fallback rather than a 500 to keep the frontend usable
    try {
      const item = (req && req.body && req.body.item) || 'item';
      return res.status(200).json(makeFallback(item));
    } catch (e) {
      return res.status(500).json({ error: 'Server function crashed', message: err && err.message ? err.message : String(err) });
    }
  }
};
