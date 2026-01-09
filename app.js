// ======= app.js =======

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
        // Call the serverless API instead of Gemini directly
        const response = await fetch("/api/reuse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ item: itemInput })
        });

        if (!response.ok) throw new Error("API request failed");

        const data = await response.json();
        renderReuseCard(itemInput, data);

    } catch (err) {
        console.error(err);
        resultsContainer.innerHTML = "<p>Error getting suggestions. Check console.</p>";
    }
});

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
