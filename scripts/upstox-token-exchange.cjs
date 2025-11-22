#!/usr/bin/env node
// Exchange Upstox OAuth auth-code for access token and post to LiveRunner admin endpoint
// Usage: node scripts/upstox-token-exchange.cjs --code <auth_code> --clientId <id> --clientSecret <secret> [--redirect <url>] [--adminBase <http://localhost:8080>] [--adminKey <key>]

const fetch = require('node-fetch');
const { URLSearchParams } = require('url');

function parseArgs() {
  const argv = process.argv.slice(2);
  const args = {};
  for (let i=0;i<argv.length;i++){
    const a = argv[i];
    if (a.startsWith('--')){
      const k = a.slice(2);
      const v = argv[i+1] && !argv[i+1].startsWith('--') ? argv[++i] : '1';
      args[k] = v;
    }
  }
  return args;
}

async function main(){
  const args = parseArgs();
  if (!args.code || !args.clientId || !args.clientSecret) {
    console.error('Usage: --code <auth_code> --clientId <id> --clientSecret <secret> [--redirect <url>] [--adminBase <url>] [--adminKey <key>]');
    process.exit(2);
  }

  const tokenUrl = process.env.UPSTOX_TOKEN_URL || 'https://api.upstox.com/v2/login/access-token';
  const redirect = args.redirect || process.env.UPSTOX_REDIRECT || 'http://localhost/callback';
  const adminBase = args.adminBase || process.env.ADMIN_BASE || 'http://localhost:8080';
  const adminKey = args.adminKey || process.env.ADMIN_SHARED_SECRET;

  if (!adminKey) {
    console.error('Admin shared secret must be provided via --adminKey or ADMIN_SHARED_SECRET env var');
    process.exit(3);
  }

  const body = new URLSearchParams();
  body.append('grant_type','authorization_code');
  body.append('code', args.code);
  body.append('client_id', args.clientId);
  body.append('client_secret', args.clientSecret);
  body.append('redirect_uri', redirect);

  try {
    const res = await fetch(tokenUrl, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const txt = await res.text();
    let j = null;
    try { j = JSON.parse(txt); } catch (_) { console.error('Token endpoint did not return JSON:', txt); process.exit(4); }
    if (!j || !j.access_token) { console.error('Token exchange failed:', JSON.stringify(j)); process.exit(5); }

    // POST to admin store-token endpoint
    const adminUrl = `${adminBase.replace(/\/$/,'')}/admin/store-token`;
    const storeRes = await fetch(adminUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey }, body: JSON.stringify({ accessToken: j.access_token, refreshToken: j.refresh_token || '' }) });
    const storeTxt = await storeRes.text();
    if (!storeRes.ok) {
      console.error('Failed to store token on admin endpoint:', storeRes.status, storeTxt);
      process.exit(6);
    }
    console.log('Token exchanged and stored successfully');
    console.log('Response:', storeTxt);
  } catch (e) {
    console.error('Error during token exchange:', e.message || e);
    process.exit(1);
  }
}

main();
