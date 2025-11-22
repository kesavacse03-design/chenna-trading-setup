#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function log(msg){ console.log(msg); }
function assert(cond, msg){ if(!cond){ throw new Error('ASSERT: ' + msg); } }

async function testReplayEngine() {
  const { ReplayEngine } = require('..' + path.sep + 'replayEngine.cjs');
  const base = path.resolve(__dirname, '..');
  const tmp = path.join(base, 'tmp-tests');
  const cacheDir = path.join(tmp, 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const symbol = 'X'; const from = '2025-10-30'; const to = '2025-10-30'; const interval = '5m';
  const file = path.join(cacheDir, `${symbol}_${from}_${to}_${interval}.json`);
  const candles = [
    { date: '2025-10-30T09:15:00.000Z', open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
    { date: '2025-10-30T09:20:00.000Z', open: 100.6, high: 101.2, low: 100.1, close: 101, volume: 1200 },
    { date: '2025-10-30T09:25:00.000Z', open: 101, high: 101.5, low: 100.8, close: 101.2, volume: 1100 },
  ];
  fs.writeFileSync(file, JSON.stringify({ ohlcv: candles }, null, 2));
  const re = new ReplayEngine();
  const seen = [];
  re.loadFromCache(tmp, symbol, from, to, interval);
  re.start({symbol, from, to}, { interval }, c => { seen.push(String(c.date)); });
  assert(seen.length === 1 && seen[0] === candles[0].date, 'ReplayEngine.start should emit first candle');
  re.step();
  assert(seen.length === 2 && seen[1] === candles[1].date, 'ReplayEngine.step #1 should emit second candle');
  re.step();
  assert(seen.length === 3 && seen[2] === candles[2].date, 'ReplayEngine.step #2 should emit third candle');
  re.step();
  assert(re.running === false, 'ReplayEngine should stop after last candle');
}

async function testSimulatorFill(){
  const { Simulator } = require('..' + path.sep + 'simulator.cjs');
  const sim = new Simulator();
  const candle = { date:'2025-10-30T09:15:00.000Z', open:100, high:101, low:99, close:100.5, volume:1000 };
  const fill = sim.submit({ side:'buy', qty:10, type:'market' }, candle);
  // atr = 2, slipBase = max(0.05, 0.2) = 0.2, expect 100.2
  if (Math.abs(fill.price - 100.2) > 1e-6) throw new Error('Simulator market buy fill unexpected: ' + fill.price);
}

async function testEndToEndMock(){
  const { runBacktest } = require('..' + path.sep + 'backtester.cjs');
  const args = { symbols:['TCS'], from:'2025-10-30', to:'2025-10-30', interval:'5m', mode:'mock' };
  const { runId, resultsPath, tradesPath } = await runBacktest(args);
  if (!fs.existsSync(resultsPath)) throw new Error('results.json not created');
  if (!fs.existsSync(tradesPath)) throw new Error('trades.csv not created');
  const outDir = path.dirname(resultsPath);
  const suggPath = path.join(outDir, `${runId}-suggestions.json`);
  if (!fs.existsSync(suggPath)) throw new Error('suggestions.json not created');
  const j = JSON.parse(fs.readFileSync(resultsPath,'utf8'));
  if (!j || !j.metrics) throw new Error('results.json missing metrics');
}

(async () => {
  const results = [];
  async function run(name, fn){
    try { await fn(); log(`PASS ${name}`); results.push({ name, pass:true }); }
    catch(e){ console.error(`FAIL ${name}: ${e.message}`); results.push({ name, pass:false, error:e.message }); }
  }
  await run('ReplayEngine steps through candles', testReplayEngine);
  await run('Simulator market fill price', testSimulatorFill);
  await run('End-to-end mock backtest', testEndToEndMock);
  // DataAdapter normalization tests
  const dataAdapterTests = require('./dataAdapter-normalize.cjs');
  await run('DataAdapter normalize payloads (v2/v3/empty)', async () => { await dataAdapterTests(); });
  // Optional Upstox integration test (only when explicitly enabled)
  if (String(process.env.RUN_UPSTOX_INTEGRATION || '') === '1') {
    const upInt = require('./upstox.integration.cjs');
    await run('Upstox integration (live) - gated', async () => { await upInt(); });
  } else {
    log('SKIP Upstox integration test (set RUN_UPSTOX_INTEGRATION=1 to enable)');
  }
  const pass = results.every(r=>r.pass);
  log(`\nSummary: ${results.filter(r=>r.pass).length}/${results.length} passed`);
  process.exit(pass ? 0 : 1);
})();
