const fetch = require('node-fetch');
(async()=>{
  const base = 'http://127.0.0.1:3001';
  console.log('GET /api/stocks sample...');
  const g = await fetch(base + '/api/stocks');
  console.log('GET status', g.status);
  const arr = await g.json();
  console.log('first 5:', arr.slice(0,5));

  console.log('\nPOST duplicate INFY (expect 409)');
  const dup = await fetch(base + '/api/stocks', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ symbol:'INFY', date:'2025-10-29', category:'SHORT_TERM_SWING_BO_UP', categoryKey:'SHORT_TERM_SWING_BO_UP' }) });
  console.log('dup status', dup.status); try{ console.log(await dup.json()); }catch(e){console.log('dup json err',e)}

  console.log('\nPOST new symbol TEST_E2E');
  const newr = await fetch(base + '/api/stocks', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ symbol:'TEST_E2E', date:'2025-11-13', category:'INTRADAY_BOOST', categoryKey:'INTRADAY_BOOST' }) });
  console.log('new status', newr.status);
  console.log(await newr.json());

  console.log('\nGET after POSTs'); const g2 = await fetch(base + '/api/stocks'); console.log('status', g2.status); const arr2 = await g2.json(); console.log('has TEST_E2E?', arr2.some(x=>x.stockName==='TEST_E2E'));
})();
