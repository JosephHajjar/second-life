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

        if (!response.ok) throw new Error("API request failed");

        // If streaming, you can either use a stream reader or just parse once
        const text = await response.text();
        const data = JSON.parse(text);
        renderReuseCard(itemInput, data);

    } catch (err) {
        console.error(err);
        resultsContainer.innerHTML = "<p>Error getting suggestions. Check console.</p>";
    }
});
