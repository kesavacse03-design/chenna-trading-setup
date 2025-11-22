const fs = require('fs');
const path = require('path');
const http = require('http');

function safeStat(p) {
  try { return fs.statSync(p); } catch { return null; }
}

function fileExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function readJsonSafe(p) {
  try {
    if (!fileExists(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw || 'null');
  } catch {
    return null;
  }
}

function httpGetJson(url, timeoutMs = 4000) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const opts = {
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname + (u.search || ''),
        method: 'GET',
        timeout: timeoutMs,
      };
      const req = http.request(opts, (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(body || 'null');
            resolve({ ok: true, statusCode: res.statusCode, json, body });
          } catch {
            resolve({ ok: false, statusCode: res.statusCode, json: null, body });
          }
        });
      });
      req.on('error', (err) => {
        resolve({ ok: false, error: String(err && err.message || err) });
      });
      req.on('timeout', () => {
        try { req.destroy(); } catch {}
        resolve({ ok: false, error: 'timeout' });
      });
      req.end();
    } catch (e) {
      resolve({ ok: false, error: String(e && e.message || e) });
    }
  });
}

module.exports = {
  safeStat,
  fileExists,
  readJsonSafe,
  httpGetJson,
};
