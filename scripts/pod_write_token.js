const { TokenManager } = require('../backend/strategy/tokenManager.cjs');
const tm = new TokenManager();
const key = process.env.TOKENS_ENCRYPTION_KEY || process.argv[2];
if (!key) { console.error('Missing key'); process.exit(2); }
process.env.TOKENS_ENCRYPTION_KEY = key;
const token = process.argv[3] || 'SMOKE_TOKEN';
const refresh = process.argv[4] || 'R';
try { const p = tm.saveTokens(token, refresh); console.log('WROTE', p); process.exit(0); } catch (e) { console.error('ERR', e && e.message); process.exit(3); }
