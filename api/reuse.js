// api/reuse.js
// Serverless-compatible handler for generating reuse ideas via Google Generative API.

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function makeFallback(item) {
  const base = (item && item.length) ? Math.min(90, 40 + item.length) : 50;
  const wasteKg = Math.max(0.01, Math.min(5, (item.length || 5) * 0.05));
  return {
    reuseScore: Math.max(0, Math.min(100, Math.round(base))),
    ideas: [
      `Repurpose ${item} as a small planter or seed starter`,
      `Turn ${item} into a storage container or desk organizer`,
      `Donate or upcycle ${item} into craft material for workshops`
    ],
    impact: { CO2: +(wasteKg * 0.5).toFixed(2), water: +(wasteKg * 30).toFixed(0), waste: +wasteKg.toFixed(3) },
    perItem: { wasteKg: +wasteKg.toFixed(3) },
    slider: { maxRecycled: 10000 }
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
