// ======= app.js =======

const API_KEY = "YAIzaSyB_iAhNoH2lyDbIIgNxjjMScOQjY_0xRhU"; // Replace with your Gemini key

// Button click listener
document.getElementById('submit-item').addEventListener('click', async () => {
    const itemInput = document.getElementById('item-input').value.trim();
    if (!itemInput) {
        alert("Please enter an item.");
        return;
    }

    const resultsContainer = document.getElementById('results-container');
    resultsContainer.innerHTML = "<p>Thinking... 🤖</p>";

    try {
        const reuseData = await getReuseData(itemInput);
        renderReuseCard(itemInput, reuseData);
    } catch (err) {
        console.error(err);
        resultsContainer.innerHTML = "<p>Error getting suggestions. Check console.</p>";
    }
});

// ================= Gemini AI Call =================
async function getReuseData(itemName) {
    const prompt = `
You are an AI assistant that gives creative reuse ideas for items.
Input: ${itemName}
Output a JSON object with:
- reuseScore (0-100)
- ideas: array of 3 unique reuse ideas
- impact: estimated environmental impact saved (CO2 in kg, water in liters, waste in kg)
`;

    const response = await fetch("https://api.gemini.ai/v1/complete", { // replace with real Gemini endpoint
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
            prompt: prompt,
            max_tokens: 200
        })
    });

    const data = await response.json();

    // Gemini returns text; parse as JSON
    let parsed;
    try {
        parsed = JSON.parse(data.text);
    } catch {
        // fallback if parsing fails
        parsed = {
            reuseScore: 50,
            ideas: ["Use creatively", "Repurpose somehow", "Donate it"],
            impact: { CO2: 0.1, water: 1, waste: 0.2 }
        };
    }

    return parsed;
}

// ================= Render Results =================
function renderReuseCard(itemName, data) {
    const container = document.getElementById('results-container');
    const card = document.createElement('div');
    card.className = "reuse-card";

    card.innerHTML = `
        <h3>${itemName}</h3>
        <p>Reuse Score: ${data.reuseScore}/100</p>
        <ul>
            ${data.ideas.map(i => `<li>${i}</li>`).join('')}
        </ul>
        <p>Impact Saved: CO2 ${data.impact.CO2} kg, Water ${data.impact.water} L, Waste ${data.impact.waste} kg</p>
    `;

    container.prepend(card); // newest on top
}
