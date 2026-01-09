// api/reuse.js
// Serverless-compatible handler for generating reuse ideas via Google Generative API.

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

module.exports = async function (req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Safely read JSON body (some runtimes throw when body is invalid)
    var item;
    try {
      item = req.body && req.body.item;
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON', message: String(e) });
    }
    if (!item || typeof item !== 'string') {
      return res.status(400).json({ error: 'No item provided' });
    }

    var apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing env var GOOGLE_GENERATIVE_AI_API_KEY' });
    }

    var prompt = '\nYou are an AI assistant that gives creative reuse ideas for items.\n\nInput: ' +
      item +
      "\n\nReturn ONLY valid JSON with this exact shape (use numbers >= 0, no negative values):\n{\n  \"reuseScore\": number (0-100),\n  \"ideas\": string[] (exactly 3),\n  \"impact\": { \"CO2\": number (kg), \"water\": number (liters), \"waste\": number (kg) },\n  \"perItem\": { \"wasteKg\": number (kg per item, >=0) },\n  \"slider\": { \"maxRecycled\": integer (realistic total number of people/items that could be recycled, >=1) }\n}\nNo markdown, no extra text. If you cannot estimate a numeric field, set it to null. Keep output strictly JSON.\n";

    // Try listing models to find supported names (try v1 then v1beta)
    var listEndpoints = [
      'https://generativelanguage.googleapis.com/v1/models?key=',
      'https://generativelanguage.googleapis.com/v1beta/models?key=',
    ];

    var modelsData = null;
    for (var i = 0; i < listEndpoints.length; i++) {
      var ep = listEndpoints[i] + encodeURIComponent(apiKey);
      try {
        var r = await fetch(ep);
        var d = null;
        try {
          d = await r.json();
        } catch (e) {
          d = null;
        }
        if (r.ok && d) {
          modelsData = d;
          break;
        }
      } catch (e) {
        // ignore and continue
      }
    }

    var candidates = [];
    if (modelsData && Array.isArray(modelsData.models)) {
      for (var j = 0; j < modelsData.models.length; j++) {
        var m = modelsData.models[j];
        if (m && m.name) {
          var parts = m.name.split('/');
          candidates.push(parts[parts.length - 1]);
        }
      }
    }
    // Add common fallbacks to try
    candidates = candidates.concat(['gemini-1.5-flash', 'gemini-1.5', 'gemini-flash-latest', 'text-bison-001', 'bison']);

    var verbs = ['generateContent', 'generateText', 'generate', 'generateMessage'];

    var finalData = null;
    var usedEndpoint = null;

    for (var c = 0; c < candidates.length; c++) {
      var model = candidates[c];
      for (var v = 0; v < verbs.length; v++) {
        var verb = verbs[v];
        var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':' + verb + '?key=' + encodeURIComponent(apiKey);
        try {
          var body = null;
          if (verb === 'generateContent') {
            body = {
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
            };
          } else {
            body = { prompt: prompt, temperature: 0.7 };
          }

          var rr = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          var dd = null;
          try {
            dd = await rr.json();
          } catch (e) {
            dd = null;
          }
          if (rr.ok && dd) {
            finalData = { raw: dd, model: model, verb: verb };
            usedEndpoint = { url: url, model: model, verb: verb };
            break;
          }
        } catch (e) {
          // continue to next candidate
        }
      }
      if (finalData) break;
    }

    if (!finalData) {
      return res.status(500).json({ error: 'No supported model endpoint succeeded', tried: candidates, modelsList: modelsData || null });
    }

    var data = finalData.raw;
    var text = '';
    if (data && data.candidates && data.candidates[0] && data.candidates[0].content && Array.isArray(data.candidates[0].content.parts)) {
      var parts = data.candidates[0].content.parts;
      var s = [];
      for (var k = 0; k < parts.length; k++) s.push(parts[k].text || '');
      text = s.join('');
    } else if (data && typeof data.output === 'string') {
      text = data.output;
    } else if (data && Array.isArray(data.candidates) && data.candidates[0] && typeof data.candidates[0].output === 'string') {
      text = data.candidates[0].output;
    } else if (data && data.results && data.results[0] && typeof data.results[0].output === 'string') {
      text = data.results[0].output;
    } else {
      try {
        text = JSON.stringify(data);
      } catch (e) {
        text = String(data);
      }
    }

    var parsed = safeJsonParse(text);
    if (parsed && typeof parsed === 'object') {
      // Sanitize numeric fields to ensure no negative values and sensible types
      var out = Object.assign({}, parsed);
      if (out.impact) {
        out.impact.CO2 = Math.max(0, Number(out.impact.CO2) || 0);
        out.impact.water = Math.max(0, Number(out.impact.water) || 0);
        out.impact.waste = Math.max(0, Number(out.impact.waste) || 0);
      }
      if (out.perItem) {
        out.perItem.wasteKg = Math.max(0, Number(out.perItem.wasteKg) || 0);
      }
      if (out.slider && Number.isFinite(Number(out.slider.maxRecycled))) {
        out.slider.maxRecycled = Math.max(1, Math.floor(Number(out.slider.maxRecycled)));
      }
      return res.status(200).json(out);
    }

    return res.status(500).json({ error: 'Model returned non-JSON response', usedEndpoint: usedEndpoint || null, text: text, raw: data });
      } catch (err) {
        console.error('Server function crashed:', err && err.stack ? err.stack : err);
        return res.status(500).json({ error: 'Server function crashed', message: err && err.message ? err.message : String(err) });
      }
    };
