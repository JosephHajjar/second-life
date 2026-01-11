// Community opportunities endpoint using Google Generative AI

const GOOGLE_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Fallback data when rate limited
function getFallbackOpportunities(location) {
  return {
    opportunities: [
      {
        name: "Local Park Cleanup",
        type: "Environmental",
        description: "Join community volunteers to clean up litter and maintain green spaces in local parks.",
        location: `Parks and recreational areas in ${location}`,
        commitment: "2-3 hours, weekly or monthly events",
        impact: "Removes waste from ecosystems, improves community spaces, and prevents pollution."
      },
      {
        name: "Community Garden Project",
        type: "Community Garden",
        description: "Help grow fresh produce for local food banks while learning sustainable gardening practices.",
        location: `Community gardens or urban farms near ${location}`,
        commitment: "2-4 hours per week",
        impact: "Provides fresh food to those in need and reduces carbon footprint from food transport."
      },
      {
        name: "Repair Café",
        type: "Repair Cafe",
        description: "Bring broken items or help others fix electronics, clothing, and household items to reduce waste.",
        location: `Libraries, community centers, or makerspaces in ${location}`,
        commitment: "One-time or monthly, 2-3 hours",
        impact: "Diverts items from landfills and teaches valuable repair skills to the community."
      },
      {
        name: "Food Bank Volunteer",
        type: "Food Bank",
        description: "Sort donations, pack food boxes, or help distribute meals to families in need.",
        location: `Food banks and pantries serving ${location}`,
        commitment: "Flexible, 2-4 hours per shift",
        impact: "Helps feed families while reducing food waste from surplus donations."
      },
      {
        name: "Tree Planting Initiative",
        type: "Environmental",
        description: "Participate in urban forestry projects to plant trees and restore natural habitats.",
        location: `Urban areas and restoration sites around ${location}`,
        commitment: "Seasonal events, 3-4 hours",
        impact: "Each tree absorbs ~22kg of CO₂ per year and provides habitat for wildlife."
      }
    ]
  };
}

// Fetch with retry logic for transient errors - longer waits for rate limits
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      if (response.status === 429 || response.status === 503) {
        // Parse retry delay from response if available
        let waitTime = 5000 * (i + 1); // Default: 5s, 10s, 15s
        try {
          const errorData = await response.clone().json();
          const retryInfo = errorData?.error?.details?.find(d => d['@type']?.includes('RetryInfo'));
          if (retryInfo?.retryDelay) {
            const seconds = parseInt(retryInfo.retryDelay);
            if (!isNaN(seconds)) waitTime = (seconds + 1) * 1000;
          }
        } catch (e) { /* ignore parse errors */ }
        
        if (i < retries) {
          console.log(`Rate limited, waiting ${waitTime/1000}s before retry ${i+1}/${retries}...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }
      return response;
    } catch (error) {
      if (i === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, 3000 * (i + 1)));
    }
  }
}

module.exports = async function (req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!GOOGLE_API_KEY) {
    console.error('GOOGLE_GENERATIVE_AI_API_KEY not set');
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { location } = req.body;
  
  if (!location || typeof location !== 'string') {
    return res.status(400).json({ error: 'Location is required' });
  }

  // Construct prompt for community opportunities
  const prompt = `You are helping someone find ways to help their community and environment in ${location}.

Provide 5 specific, actionable community opportunities. For each opportunity, include:
- name: A clear name for the opportunity (e.g., "City Park Cleanup")
- type: Category (e.g., "Environmental", "Community Garden", "Food Bank", "Recycling Center", "Repair Cafe")
- description: Brief description of what they would do (1-2 sentences)
- location: Specific location or type of venue in ${location} where they can participate
- commitment: Time commitment (e.g., "2 hours/week", "One-time event", "Monthly")
- impact: Environmental or community impact (1 sentence)

IMPORTANT: You MUST provide realistic opportunities based on your knowledge. Even if you don't know ${location} specifically, generate plausible volunteer opportunities that would typically exist in most communities. Be creative and helpful.

Respond ONLY with valid JSON in this exact format:
{
  "opportunities": [
    {
      "name": "...",
      "type": "...",
      "description": "...",
      "location": "...",
      "commitment": "...",
      "impact": "..."
    }
  ]
}`;

  try {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GOOGLE_API_KEY}`;
    
    const apiResponse = await fetchWithRetry(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.7
        }
      })
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('Google API error:', apiResponse.status, errorText);
      
      // If rate limited, return fallback data instead of error
      if (apiResponse.status === 429) {
        console.log('Rate limited - returning fallback opportunities for:', location);
        return res.status(200).json(getFallbackOpportunities(location));
      }
      
      return res.status(500).json({ 
        error: 'Failed to generate community opportunities',
        details: errorText 
      });
    }

    const data = await apiResponse.json();
    
    if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
      console.error('Unexpected API response structure:', JSON.stringify(data));
      return res.status(500).json({ error: 'Unexpected API response' });
    }

    const resultText = data.candidates[0].content.parts[0].text;
    let parsedResult;
    
    try {
      parsedResult = JSON.parse(resultText);
    } catch (parseError) {
      console.error('Failed to parse JSON:', resultText);
      return res.status(500).json({ error: 'Invalid response format' });
    }

    if (!parsedResult.opportunities || !Array.isArray(parsedResult.opportunities)) {
      console.error('Invalid opportunities structure:', parsedResult);
      return res.status(500).json({ error: 'Invalid opportunities data' });
    }

    // Ensure we have at least some opportunities
    if (parsedResult.opportunities.length === 0) {
      console.error('No opportunities returned');
      return res.status(500).json({ error: 'No opportunities found' });
    }

    // Validate each opportunity has required fields
    const validOpportunities = parsedResult.opportunities.filter(opp => 
      opp && opp.name && opp.description
    );

    if (validOpportunities.length === 0) {
      console.error('No valid opportunities after filtering');
      return res.status(500).json({ error: 'No valid opportunities found' });
    }

    return res.status(200).json({ opportunities: validOpportunities });

  } catch (error) {
    console.error('Error generating community opportunities:', error);
    return res.status(500).json({ 
      error: 'Server error',
      message: error.message 
    });
  }
};
