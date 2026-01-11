// Vercel serverless function for /api/reuse/detail
const handler = require('../reuse_detail');

module.exports = async (req, res) => {
  return handler(req, res);
};
