#!/usr/bin/env node
// Post an Upstox access token to the backend proxy admin endpoint (/admin/store-token)
// Usage: node scripts/authenticate_proxy_store_token.cjs <ADMIN_SHARED_SECRET> <ACCESS_TOKEN> [REFRESH_TOKEN]
// Also supports named flags: --admin-key, --access-token, --refresh-token, --base
const fs = require('fs');
const path = require('path');
async function main(){
  const axios = require('axios');
  // Simple CLI flag parsing to support named flags in addition to positional args
  const argv = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.replace(/^--+/, '');
      // allow --flag=value or --flag value
      if (key.includes('=')) {
        const [k, v] = key.split(/=/, 2);
        args[k] = v;
      } else {
        const next = argv[i+1];
        if (next && !next.startsWith('--')) { args[key] = next; i++; } else { args[key] = 'true'; }
      }
    }
  }

  const apiBase = (args.base || process.env.CTS_API_BASE || process.env.BACKEND_BASE || 'http://127.0.0.1:3001').replace(/\/+$/,'');
  const adminKey = args['admin-key'] || process.argv[2] || process.env.ADMIN_SHARED_SECRET;
  const accessToken = args['access-token'] || process.argv[3] || process.env.UPSTOX_ACCESS_TOKEN;
  const refreshToken = args['refresh-token'] || process.argv[4] || process.env.UPSTOX_REFRESH_TOKEN || 'R';
  if (!adminKey || !accessToken) {
    console.error('Missing ADMIN_SHARED_SECRET or ACCESS_TOKEN.');
    console.error('Usage: node scripts/authenticate_proxy_store_token.cjs <ADMIN_SHARED_SECRET> <ACCESS_TOKEN> [REFRESH_TOKEN]');
    process.exit(2);
  }

  const url = `${apiBase}/admin/store-token`;
  const body = { accessToken, refreshToken };
  console.log('Posting token to:', url);
  try {
    const r = await axios.post(url, body, { headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey }, timeout: 10000 });
    console.log('Response status:', r.status);
    console.log('Response data:', r.data);
    const jobsDir = path.join(process.cwd(), 'jobs'); try{ fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){ }
    const out = { ts: Date.now(), ok: true, status: r.status, data: r.data };
    const outPath = path.join(jobsDir, `paper_preflight_auth_result_${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
    console.log('Wrote result to', outPath);
    process.exit(0);
  } catch (err) {
    const jobsDir = path.join(process.cwd(), 'jobs'); try{ fs.mkdirSync(jobsDir, { recursive: true }); } catch(_){ }
    const out = { ts: Date.now(), ok: false, error: String(err && err.message), stack: err && err.stack };
    const outPath = path.join(jobsDir, `paper_preflight_auth_result_${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
    console.error('Failed to post token. Wrote result to', outPath);
    process.exit(3);
  }
}
main();
