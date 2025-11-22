#!/usr/bin/env node
// Save encrypted Upstox tokens to .data/secrets/upstox.token
const { TokenManager } = require('../backend/strategy/tokenManager.cjs');

const accessToken = process.argv[2] || process.env.UPSTOX_ACCESS_TOKEN_PLAINTEXT;
const refreshToken = process.argv[3] || process.env.UPSTOX_REFRESH_TOKEN_PLAINTEXT;
if (!accessToken) {
  console.error('Usage: node scripts/save-upstox-token.cjs <ACCESS_TOKEN> [REFRESH_TOKEN]');
  console.error('Or set env UPSTOX_ACCESS_TOKEN_PLAINTEXT and optionally UPSTOX_REFRESH_TOKEN_PLAINTEXT.');
  process.exit(1);
}
if (!process.env.TOKENS_ENCRYPTION_KEY) {
  console.error('Set TOKENS_ENCRYPTION_KEY (base64 32-byte key) in env');
  process.exit(1);
}

try {
  const tm = new TokenManager();
  const file = tm.saveTokens(accessToken, refreshToken || '');
  console.log('Saved encrypted tokens to', file);
  process.exit(0);
} catch (e) {
  console.error('Failed saving tokens:', e.message);
  process.exit(2);
}
