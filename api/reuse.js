import { streamText } from 'ai';
import { google } from '@ai-sdk/google';

// Vercel Edge Runtime is recommended for streaming
export const runtime = 'edge';

export async function POST(req) {
  const { item } = await req.json();

  if (!item) {
    return new Response(
      JSON.stringify({ error: "No item provided" }),
      { status: 400 }
    );
  }

  const prompt = `
You are an AI assistant that gives creative reuse ideas for items.
Input: ${item}
Output a JSON object with:
- reuseScore (0-100)
- ideas: array of 3 unique reuse ideas
- impact: estimated environmental impact saved (CO2 in kg, water in liters, waste in kg)
`;

  try {
    const result = await streamText({
      model: google('gemini-2.5-flash'), // or any Gemini model
      prompt,
      apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY // <- use this env variable
    });

    return result.toAIStreamResponse();

  } catch (err) {
    console.error("Gemini streaming failed:", err);
    return new Response(
      JSON.stringify({ error: "Gemini request failed", details: err.message }),
      { status: 500 }
    );
  }
}
