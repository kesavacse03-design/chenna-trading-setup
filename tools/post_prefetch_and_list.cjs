const http = require('http');
const fs = require('fs');
const path = require('path');
function postJson(pathname, body){
  return new Promise((resolve,reject)=>{
    const d = JSON.stringify(body);
    const options = { hostname: 'localhost', port: 3001, path: pathname, method: 'POST', headers: { 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(d) } };
    const req = http.request(options, (res)=>{
      let data = '';
      res.on('data', c=> data += c.toString());
      res.on('end', ()=> {
        try { resolve(JSON.parse(data)); } catch(e){ resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(d); req.end();
  });
}
(async ()=>{
  try {
    const body = {
      mode: 'upstox',
      items: [
        { symbol: 'MOCK1', from: '2025-10-01', to: '2025-10-01', interval: '5m' },
        { symbol: 'RELIANCE', from: '2025-10-31', to: '2025-10-31', interval: '5m' },
        { symbol: 'MOCKERR', from: '2025-10-01', to: '2025-10-01', interval: '1m' }
      ]
    };
    console.log('POST /strategy/prefetch with 3 items...');
    const resp = await postJson('/strategy/prefetch', body);
    console.log('\n=== PREFETCH RESPONSE ===');
    console.log(JSON.stringify(resp, null, 2));

    const cacheDir = path.resolve(__dirname, '..', 'backend', 'strategy', 'cache');
    console.log('\n=== CACHE DIR LISTING ===');
    try {
      const files = fs.readdirSync(cacheDir);
      for (const f of files) console.log(f);
    } catch (e) { console.log('cache dir not found or empty'); }
  } catch (e) {
    console.error('ERROR posting prefetch:', e && e.stack ? e.stack : String(e));
  }
})();
