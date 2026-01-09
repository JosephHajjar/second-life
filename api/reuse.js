import fetch from "node-fetch";

const API_KEY = process.env.GEMINI_API_KEY; // store your key securely in Vercel

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const { item } = req.body;

  if (!item) return res.status(400).json({ error: "No item provided" });

  const prompt = `
You are an AI assistant that gives creative reuse ideas for items.
Input: ${item}
Output a JSON object with:
- reuseScore (0-100)
- ideas: array of 3 unique reuse ideas
- impact: estimated environmental impact saved (CO2 in kg, water in liters, waste in kg)
`;

  try {
    const response = await fetch("https://api.gemini.ai/v1/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({ prompt, max_tokens: 200 })
    });

    const data = await response.json();

    let parsed;
    try {
      parsed = JSON.parse(data.text);
    } catch {
      parsed = {
        reuseScore: 50,
        ideas: ["Use creatively", "Repurpose somehow", "Donate it"],
        impact: { CO2: 0.1, water: 1, waste: 0.2 }
      };
    }

    res.status(200).json(parsed);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gemini request failed" });
  }
}
