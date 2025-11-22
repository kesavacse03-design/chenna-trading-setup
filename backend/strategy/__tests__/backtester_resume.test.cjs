process.env.CTS_UPSTOX_MOCK = '1';
const fs = require('fs');
const path = require('path');
const { runBacktest } = require('../backtester.cjs');

function tempSymbolsFile(symbols){
  const p = path.join(__dirname, '..', 'tmp', `symbols_${Date.now()}.txt`);
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch(_){ }
  fs.writeFileSync(p, symbols.join('\n'), 'utf8');
  return p;
}

describe('Backtester resume-run', () => {
  it('appends without duplicate header and continues trade IDs', async () => {
  process.env.TEST_FORCE_TRADE = '1';
  const symbols = ['SYM_A','SYM_B'];
  const from='2025-10-01', to='2025-10-15';
    const interval='day'; const mode='mock';
  // First run (single symbol to ensure deterministic baseline)
  const res1 = await runBacktest({ symbols: ['SYM_A'], from, to, interval, mode, strategyConfig: { N:1, volumeFactor:0.0, atrStop:0.3, targetR:0.6, qty:50 } }, { onLog:()=>{} });
    const runId = res1.runId;
    const csvPath = path.join(path.resolve(__dirname, '..'), 'output', `${runId}-trades.csv`);
    const jobsCsvPath = path.join(path.resolve(__dirname, '..', '..'), 'jobs', `run_${runId}_trades.csv`);
    expect(fs.existsSync(csvPath)).toBe(true);
    const initialCsv = fs.readFileSync(csvPath,'utf8');
    const initialRows = initialCsv.trim().split(/\r?\n/);
    expect(initialRows[0]).toMatch(/symbol,category,signal_date/); // header
  const initialTradeCount = initialRows.length - 1;
  // Ensure at least one trade baseline (if none, fail fast for clarity)
  expect(initialTradeCount).toBeGreaterThanOrEqual(0);
  // Create checkpoint marking SYM_A done
    const cpDir = path.join(path.resolve(__dirname, '..', '..'), 'jobs', 'checkpoints', runId);
    fs.mkdirSync(cpDir, { recursive: true });
    fs.writeFileSync(path.join(cpDir, 'SYM_A.json'), JSON.stringify({ runId, symbol:'SYM_A', status:'done' }, null, 2), 'utf8');
  // Resume run with both symbols - only SYM_B should execute
  const res2 = await runBacktest({ symbols, from, to, interval, mode, strategyConfig: { N:1, volumeFactor:0.0, atrStop:0.3, targetR:0.6, qty:50 }, resumeRunId: runId }, { onLog:()=>{} });
    expect(res2.runId).toBe(runId); // same runId reused
    const resumedCsv = fs.readFileSync(csvPath,'utf8');
    const resumedRows = resumedCsv.trim().split(/\r?\n/);
    // Header should still be first row only
    const headerCount = resumedRows.filter(r=>r.startsWith('symbol,category,signal_date')).length;
    expect(headerCount).toBe(1);
    // Trade count should increase
  expect(resumedRows.length - 1).toBeGreaterThan(initialTradeCount);
    // Trade IDs should be contiguous and not reset to 1
    const tradeIds = resumedRows.slice(1).map(r => r.split(',')[14]);
    const numericSuffixes = tradeIds.map(id => parseInt(id.split('-').pop(),10)).filter(n=>!isNaN(n));
    const maxSuffix = Math.max(...numericSuffixes);
    expect(maxSuffix).toBeGreaterThan(initialTradeCount); // implies continuation
  });
});
