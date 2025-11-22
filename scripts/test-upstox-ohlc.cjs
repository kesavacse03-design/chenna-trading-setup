const { TokenManager } = require('../backend/strategy/tokenManager.cjs');
const fetch = require('node-fetch');

(async ()=>{
  try{
    const tm = new TokenManager();
    let token = null;
    try { token = tm.loadToken(); } catch(_){}
    token = token || process.env.UPSTOX_ACCESS_TOKEN;
    if (!token) { console.error('NO_TOKEN'); process.exit(2); }
    const keys = process.argv[2] || 'NSE_EQ|INE669E01016';
    const apiBase = process.env.UPSTOX_API_BASE || 'https://api.upstox.com';
    const url = `${apiBase}/v3/market-quote/ohlc?instrument_key=${encodeURIComponent(keys)}&interval=1m`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }});
    const text = await r.text();
    console.log('STATUS', r.status);
    console.log('BODY', text);
  }catch(e){
    console.error('ERR', e.message);
  }
})();
