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
  const profiles = [
    { keys: ['plastic bottle', 'bottle'], weight: 0.03, material: 'plastic', reuseBase: 72, co2PerKg: 2.5, waterPerKg: 50, reach: 500000 },
    { keys: ['glass bottle', 'glass jar'], weight: 0.4, material: 'glass', reuseBase: 70, co2PerKg: 0.9, waterPerKg: 10, reach: 100000 },
    { keys: ['aluminum can', 'can'], weight: 0.015, material: 'aluminum', reuseBase: 75, co2PerKg: 9.0, waterPerKg: 5, reach: 600000 },
    { keys: ['cardboard', 'box'], weight: 0.2, material: 'paper', reuseBase: 80, co2PerKg: 1.0, waterPerKg: 20, reach: 200000 },
    { keys: ['t-shirt', 'shirt', 'clothing', 'fabric'], weight: 0.25, material: 'textile', reuseBase: 80, co2PerKg: 2.0, waterPerKg: 2700, reach: 120000 },
    { keys: ['phone', 'smartphone', 'electronics', 'laptop', 'tablet'], weight: 0.2, material: 'electronic', reuseBase: 45, co2PerKg: 70, waterPerKg: 1000, reach: 50000 },
    { keys: ['plastic bag', 'bag'], weight: 0.01, material: 'plastic', reuseBase: 45, co2PerKg: 2.5, waterPerKg: 20, reach: 400000 },
    { keys: ['cup', 'paper cup', 'coffee cup'], weight: 0.02, material: 'paper', reuseBase: 25, co2PerKg: 1.0, waterPerKg: 20, reach: 300000 }
  ];

  for (let p of profiles) {
    for (let k of p.keys) {
      if (text.indexOf(k) !== -1) return p;
    }
  }

  // Generic fallback profile
  return { keys: [], weight: Math.max(0.03, Math.min(1, (text.length || 5) * 0.02)), material: 'generic', reuseBase: 50, co2PerKg: 2.5, waterPerKg: 50, reach: 100000 };
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
      const prompt = `You are an assistant that returns JSON for reuse suggestions. Input: ${item}`;
      const body = { prompt: prompt, temperature: 0.3 };

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
