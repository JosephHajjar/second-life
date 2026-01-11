// Vercel serverless function for /api/auth/login
const crypto = require('crypto');

// In-memory store for demo (Vercel serverless is stateless, so this resets on cold starts)
// For production, use a database like Vercel KV, Supabase, or similar
let users = [];

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

function findUser(username) {
  return users.find((u) => u.username.toLowerCase() === username.toLowerCase());
}

module.exports = async (req, res) => {
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

  const username = (req.body && req.body.username ? String(req.body.username) : '').trim();
  const password = (req.body && req.body.password ? String(req.body.password) : '').trim();

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  // For demo purposes on Vercel (stateless), we'll accept any login
  // In production, you'd use a real database
  // This is a simplified demo that always succeeds for any username/password
  return res.status(200).json({
    ok: true,
    username: username,
    reusePoints: 0,
    repairPoints: 0
  });
};
