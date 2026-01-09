function renderReuseCard(item, data) {
    const resultsContainer = document.getElementById('results-container');
    const reuseScore = typeof data?.reuseScore === 'number' ? data.reuseScore : 'N/A';
    const ideas = Array.isArray(data?.ideas) ? data.ideas : [];
        // Compute a simple per-item baseline if model did not provide impact.
        // We'll estimate per-item waste (kg) if not provided.
        const perItemWasteKg = (data?.impact?.waste && typeof data.impact.waste === 'number') ? data.impact.waste : 0.3;

        // Render card with slider to simulate number of people who recycled this item (1..1,000,000)
        resultsContainer.innerHTML = `
                <div class="card">
                        <h2>Reuse ideas for "${item}"</h2>
                        <p class="muted-small"><strong>Reuse score:</strong> ${reuseScore}</p>
                        <ol>
                                ${ideas.map(i => `<li>${i}</li>`).join('')}
                        </ol>

                        <div class="slider-row">
                            <label class="muted-small">People who recycled this item: <span id="people-count">1</span></label>
                            <input id="people-slider" type="range" min="1" max="1000000" value="1" step="1">
                        </div>

                        <div class="impact-row">
                            <div>
                                <div class="muted-small">Estimated waste prevented</div>
                                <div class="impact-value"><span id="waste-kg">${(perItemWasteKg).toFixed(2)}</span> kg</div>
                            </div>
                            <div>
                                <div class="muted-small">Estimated items reused</div>
                                <div class="impact-value"><span id="items-count">1</span></div>
                            </div>
                        </div>
                </div>
        `;

        // Setup slider behavior
        const slider = document.getElementById('people-slider');
        const peopleCountEl = document.getElementById('people-count');
        const wasteKgEl = document.getElementById('waste-kg');
        const itemsCountEl = document.getElementById('items-count');

        function updateImpact() {
            const people = Number(slider.value || 1);
            peopleCountEl.textContent = Intl.NumberFormat().format(people);
            const items = people; // assume one item per person for simulation
            itemsCountEl.textContent = Intl.NumberFormat().format(items);

            // Compute waste prevented = per-item waste * items
            const wasteKg = perItemWasteKg * items;
            // Show in kg, but scale to tons if large
            if (wasteKg >= 1000) {
                wasteKgEl.textContent = (wasteKg / 1000).toFixed(2) + ' t';
            } else {
                wasteKgEl.textContent = wasteKg.toFixed(2);
            }
        }

        slider.addEventListener('input', updateImpact);
        // initialize
        updateImpact();
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
