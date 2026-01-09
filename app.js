function renderReuseCard(item, data) {
    const resultsContainer = document.getElementById('results-container');
    const reuseScore = typeof data?.reuseScore === 'number' ? data.reuseScore : 'N/A';
    const ideas = Array.isArray(data?.ideas) ? data.ideas : [];
    const impact = data?.impact || {};

    resultsContainer.innerHTML = `
        <div class="card">
            <h2>Reuse ideas for "${item}"</h2>
            <p><strong>Reuse score:</strong> ${reuseScore}</p>
            <ol>
                ${ideas.map(i => `<li>${i}</li>`).join('')}
            </ol>
            <p><strong>Impact:</strong> CO2 ${impact.CO2 ?? 'N/A'}, water ${impact.water ?? 'N/A'}, waste ${impact.waste ?? 'N/A'}</p>
        </div>
    `;
}

document.getElementById('submit-item').addEventListener('click', async () => {
    const itemInput = document.getElementById('item-input').value.trim();
    if (!itemInput) return alert("Please enter an item.");

    const resultsContainer = document.getElementById('results-container');
    resultsContainer.innerHTML = "<p>Thinking... 🤖</p>";

    try {
        const response = await fetch("/api/reuse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ item: itemInput })
        });

        const text = await response.text();
        if (!response.ok) {
            console.error('API request failed', response.status, text);
            resultsContainer.innerHTML = `<p>Error from API: ${response.status}. See console for details.</p>`;
            return;
        }

        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error('Failed to parse API response as JSON', text);
            resultsContainer.innerHTML = `<p>Invalid API response. See console for details.</p>`;
            return;
        }

        renderReuseCard(itemInput, data);

    } catch (err) {
        console.error(err);
        resultsContainer.innerHTML = "<p>Error getting suggestions. Check console.</p>";
    }
});
