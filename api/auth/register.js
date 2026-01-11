// Vercel serverless function for /api/auth/register
const crypto = require('crypto');

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
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

  // For demo purposes on Vercel (stateless), registration always succeeds
  // In production, you'd store this in a real database
  return res.status(201).json({
    ok: true,
    username: username,
    reusePoints: 0,
    repairPoints: 0
  });
};
