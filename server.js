// server.js — simple Express dev server to serve static files and mount the serverless function
require('dotenv').config();
const path = require('path');
const express = require('express');

const app = express();
app.use(express.json());

// Mount the serverless handler at /api/reuse
const reuseHandler = require('./api/reuse');
app.post('/api/reuse', (req, res) => reuseHandler(req, res));

// Serve static site (index.html at project root)
app.use(express.static(path.join(__dirname)));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Dev server running at http://localhost:${port}`);
});
