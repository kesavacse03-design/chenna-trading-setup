#!/usr/bin/env node
/**
 * Small CLI to query CTS backend /api/health and pretty-print the result.
 *
 * Usage (from repo root, backend running on default 3001):
 *   node backend/scripts/run-health-check.cjs
 *   CTS_API_BASE=http://127.0.0.1:18080 node backend/scripts/run-health-check.cjs
 */

const http = require('http');

const base = process.env.CTS_API_BASE || process.env.BACKEND_BASE || `http://127.0.0.1:${process.env.BACKEND_PORT || 3001}`;
const url = `${base.replace(/\/$/, '')}/api/health`;

function main() {
  const req = http.get(url, (res) => {
    let buf = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => { buf += chunk; });
    res.on('end', () => {
      try {
        const json = JSON.parse(buf);
        console.log(JSON.stringify(json, null, 2));
      } catch (e) {
        console.error('Failed to parse /api/health response:', e && e.message || e);
        console.log(buf);
        process.exitCode = 1;
      }
    });
  });

  req.on('error', (err) => {
    console.error('Health check HTTP error:', err && err.message || err);
    console.error('Tried URL:', url);
    process.exitCode = 1;
  });
}

main();
