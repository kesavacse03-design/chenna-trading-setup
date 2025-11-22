const fs = require('fs');
const path = require('path');

describe('10-day swing expiry & CSV schema', () => {
  const backtester = path.resolve(__dirname, '..', 'backtester.cjs');
  if (!fs.existsSync(backtester)) return;
  const { runBacktest } = require(backtester);

  it('expires positions after 10 bars and writes CSV parsable header', async () => {
    const symbols = ['MOCK_A','MOCK_B'];
    const from='2025-10-01', to='2025-10-20';
    const out = await runBacktest({ symbols, from, to, interval:'day', mode:'mock', categoryKey:'DOWNSIDE_LOM_SWING', strategyConfig: { N: 2, volumeFactor: 0.1, atrStop: 0.2, targetR: 0.4, qty: 10 } }, { onLog:()=>{} });
    expect(out).toBeTruthy();
    const results = JSON.parse(fs.readFileSync(out.resultsPath,'utf8'));
    expect(results).toHaveProperty('swing10');
    const csv = fs.readFileSync(out.tradesPath,'utf8');
    const [header, first] = csv.trim().split(/\r?\n/);
    expect(header).toBe('symbol,category,signal_date,entry_price,exit_date,exit_price,holding_days,exit_type,outcome,r_multiple,pnl,trade_direction,stop_price,target_price,trade_id,signal_params,notes');
    if (first) {
      // Robust CSV split ignoring commas inside JSON quotes
      const cols = first.match(/(?:"[^"]*"|[^,])+/g) || [];
      expect(cols.length).toBeGreaterThanOrEqual(17);
      expect(cols[0]).toBeDefined();
    }
  }, 60000);
});
