// server.js — simple Express dev server to serve static files and mount the serverless function
require('dotenv').config();
const path = require('path');
const express = require('express');

const app = express();
app.use(express.json({ limit: '16mb' }));

// Mount the serverless handler at /api/reuse with protective try/catch
// Use the fixed AI-first handler (requires GOOGLE_GENERATIVE_AI_API_KEY)
const reuseHandler = require('./api/reuse_fixed');
app.post('/api/reuse', async (req, res) => {
  try {
    await reuseHandler(req, res);
  } catch (e) {
    console.error('Unhandled error in /api/reuse handler:', e && e.stack ? e.stack : e);
    try {
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    } catch (sendErr) {
      console.error('Failed to send error response:', sendErr);
    }
  }
});

// Respond to OPTIONS (CORS preflight) and GET with informative responses to avoid 404 noise
app.options('/api/reuse', (req, res) => res.sendStatus(204));
app.get('/api/reuse', (req, res) => {
  res.status(405).json({ error: 'Method Not Allowed', message: 'POST /api/reuse expected' });
});

// Serve static site (index.html at project root)
app.use(express.static(path.join(__dirname)));

const port = process.env.PORT || 3004;
app.listen(port, () => {
  console.log(`Dev server running at http://localhost:${port}`);
});

// Global error handlers to aid debugging during development
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err && err.stack ? err.stack : err);
});
