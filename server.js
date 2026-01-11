// server.js — simple Express dev server to serve static files and mount the serverless function
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

const app = express();
app.use(express.json({ limit: '16mb' }));

// --- Simple file-based user store (demo-only) ---
const dataDir = path.join(__dirname, 'data');
const usersPath = path.join(dataDir, 'users.json');
fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(usersPath)) fs.writeFileSync(usersPath, '[]', 'utf8');

function loadUsers() {
  try {
    const raw = fs.readFileSync(usersPath, 'utf8');
    return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function saveUsers(users) {
  try { fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf8'); } catch (_) {}
}

function findUser(users, username) {
  return users.find((u) => u.username.toLowerCase() === username.toLowerCase());
}

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

// Mount the serverless handlers with protective try/catch
// /api/reuse uses the fixed AI-first handler (requires GOOGLE_GENERATIVE_AI_API_KEY)
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

// /api/repair provides repair guidance
const repairHandler = require('./api/repair');
app.post('/api/repair', async (req, res) => {
  try {
    await repairHandler(req, res);
  } catch (e) {
    console.error('Unhandled error in /api/repair handler:', e && e.stack ? e.stack : e);
    try {
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    } catch (sendErr) {
      console.error('Failed to send error response:', sendErr);
    }
  }
});

// /api/community provides local volunteering opportunities
const communityHandler = require('./api/community');
app.post('/api/community', async (req, res) => {
  try {
    await communityHandler(req, res);
  } catch (e) {
    console.error('Unhandled error in /api/community handler:', e && e.stack ? e.stack : e);
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
  res.status(200).json({ status: 'ok', hint: 'POST /api/reuse with JSON { item, image? }' });
});
app.options('/api/repair', (req, res) => res.sendStatus(204));
app.get('/api/repair', (req, res) => {
  res.status(200).json({ status: 'ok', hint: 'POST /api/repair with JSON { description }' });
});
app.options('/api/community', (req, res) => res.sendStatus(204));
app.get('/api/community', (req, res) => {
  res.status(200).json({ status: 'ok', hint: 'POST /api/community with JSON { location }' });
});
// Detail endpoint for a selected reuse idea
const reuseDetailHandler = require('./api/reuse_detail');
app.options('/api/reuse/detail', (req, res) => res.sendStatus(204));
app.get('/api/reuse/detail', (req, res) => {
  res.status(200).json({ status: 'ok', hint: 'POST /api/reuse/detail with JSON { item, idea }' });
});
app.post('/api/reuse/detail', async (req, res) => {
  try {
    await reuseDetailHandler(req, res);
  } catch (e) {
    console.error('Unhandled error in /api/reuse/detail handler:', e && e.stack ? e.stack : e);
    try {
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    } catch (sendErr) {
      console.error('Failed to send error response:', sendErr);
    }
  }
});

// --- Auth endpoints (demo, file-based) ---
app.options('/api/auth/register', (req, res) => res.sendStatus(204));
app.post('/api/auth/register', (req, res) => {
  const username = (req.body && req.body.username ? String(req.body.username) : '').trim();
  const password = (req.body && req.body.password ? String(req.body.password) : '').trim();
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const users = loadUsers();
  if (findUser(users, username)) {
    return res.status(409).json({ error: 'Username already exists' });
  }
  users.push({ username, hash: hashPassword(password), reusePoints: 0, repairPoints: 0 });
  saveUsers(users);
  return res.status(201).json({ ok: true, username, reusePoints: 0, repairPoints: 0 });
});

app.options('/api/auth/login', (req, res) => res.sendStatus(204));
app.post('/api/auth/login', (req, res) => {
  const username = (req.body && req.body.username ? String(req.body.username) : '').trim();
  const password = (req.body && req.body.password ? String(req.body.password) : '').trim();
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const users = loadUsers();
  const user = findUser(users, username);
  if (!user || user.hash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  return res.status(200).json({ ok: true, username: user.username, reusePoints: user.reusePoints || 0, repairPoints: user.repairPoints || 0 });
});

// Points increment endpoint
app.options('/api/points', (req, res) => res.sendStatus(204));
app.post('/api/points', (req, res) => {
  const username = (req.body && req.body.username ? String(req.body.username) : '').trim();
  const kind = (req.body && req.body.kind ? String(req.body.kind) : '').trim().toLowerCase();
  const amountRaw = req.body && req.body.amount;
  const amount = Math.max(0, Number(amountRaw) || 0);
  if (!username || !kind) return res.status(400).json({ error: 'username and kind required' });
  if (kind !== 'reuse' && kind !== 'repair') return res.status(400).json({ error: 'kind must be reuse or repair' });
  const users = loadUsers();
  const user = findUser(users, username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (kind === 'reuse') user.reusePoints = (user.reusePoints || 0) + amount;
  if (kind === 'repair') user.repairPoints = (user.repairPoints || 0) + amount;
  saveUsers(users);
  return res.status(200).json({ ok: true, username: user.username, reusePoints: user.reusePoints || 0, repairPoints: user.repairPoints || 0 });
});

// Quietly handle favicon to avoid 404s in the console
app.get('/favicon.ico', (req, res) => res.sendStatus(204));

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
