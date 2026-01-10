// scripts/test_reuse.js
// Local runner to invoke the serverless function in api/reuse.js

require('dotenv').config();

// Ensure fetch is available in Node (try global fetch, else require node-fetch)
if (typeof globalThis.fetch !== 'function') {
  try {
    // node-fetch v2 is CommonJS
    globalThis.fetch = require('node-fetch');
  } catch (e) {
    console.error('No global fetch available. Install node 18+ or run `npm install node-fetch@2`');
    process.exit(1);
  }
}

const path = require('path');
const reuse = require(path.join('..', 'api', 'reuse_local'));

const req = {
  method: 'POST',
  body: { item: 'plastic bottle' },
};

const res = {
  _status: 200,
  status(code) {
    this._status = code;
    return this;
  },
  json(obj) {
    console.log('== RESPONSE ==');
    console.log('status:', this._status);
    console.log(JSON.stringify(obj, null, 2));
    // exit after logging so the script ends
    process.exit(0);
  },
};

(async () => {
  try {
    await reuse(req, res);
    // If function returns without calling res.json, give a hint
    console.error('Function finished without sending a response.');
    process.exit(1);
  } catch (err) {
    console.error('Runner caught error:', err);
    process.exit(1);
  }
})();
