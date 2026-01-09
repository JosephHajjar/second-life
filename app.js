function renderReuseCard(item, data) {
    const resultsContainer = document.getElementById('results-container');
    const reuseScore = typeof data?.reuseScore === 'number' ? data.reuseScore : 'N/A';
    const ideas = Array.isArray(data?.ideas) ? data.ideas : [];
        // Compute per-item baseline using model fields if present; ensure non-negative
        let perItemWasteKg = 0.3;
        if (typeof data?.perItem?.wasteKg === 'number') perItemWasteKg = data.perItem.wasteKg;
        else if (typeof data?.impact?.waste === 'number') perItemWasteKg = data.impact.waste;
        perItemWasteKg = Math.max(0, Number(perItemWasteKg) || 0);

        // Determine a realistic slider maximum specific to this item when provided by the model
        let sliderMax = 1000000;
        if (data?.slider && Number.isFinite(Number(data.slider.maxRecycled)) && Number(data.slider.maxRecycled) > 0) {
            sliderMax = Math.max(1, Math.floor(Number(data.slider.maxRecycled)));
        }

        // Render card with slider to simulate number of people who recycled this item
        resultsContainer.innerHTML = `
                <div class="card">
                        <h2>Reuse ideas for "${item}"</h2>
                        <p class="muted-small"><strong>Reuse score:</strong> ${reuseScore}</p>
                        <ol>
                                ${ideas.map(i => `<li>${i}</li>`).join('')}
                        </ol>

                        <div class="slider-row">
                            <label class="muted-small">People who recycled this item: <span id="people-count">0</span></label>
                            <input id="people-slider" type="range" min="0" max="${sliderMax}" value="0" step="1">
                        </div>

                        <div class="impact-row">
                            <div>
                                <div class="muted-small">Estimated waste prevented</div>
                                <div class="impact-value"><span id="waste-kg">${(perItemWasteKg).toFixed(2)}</span> kg</div>
                            </div>
                            <div>
                                <div class="muted-small">Estimated items reused</div>
                                <div class="impact-value"><span id="items-count">0</span></div>
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
            let people = Number(slider.value || 0);
            // Clamp to valid range
            people = Math.max(0, Math.min(people, Number(slider.max) || sliderMax));
            peopleCountEl.textContent = Intl.NumberFormat().format(people);
            const items = people; // assume one item per person for simulation
            itemsCountEl.textContent = Intl.NumberFormat().format(items);

            // Compute waste prevented = per-item waste * items
            let wasteKg = perItemWasteKg * items;
            wasteKg = Math.max(0, wasteKg);
            // Show in kg, but scale to tonnes if large
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
