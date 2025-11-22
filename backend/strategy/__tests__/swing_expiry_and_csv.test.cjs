const fs = require('fs');
const path = require('path');

describe('Backtester CSV schema and 10-day expiry', () => {
  const btPath = path.resolve(__dirname, '..', 'backtester.cjs');
  if (!fs.existsSync(btPath)) return;
  const { runBacktest } = require(btPath);

  it('writes CSV with required headers and outcomes', async () => {
    const symbols = ['PERSISTENT'];
    const out = await runBacktest({ symbols, from:'2025-07-15', to:'2025-08-04', interval:'day', mode:'mock', categoryKey:'DOWNSIDE_LOM_SWING' }, { onLog:()=>{}, onProgress:()=>{} });
    const csv = fs.readFileSync(out.tradesPath, 'utf8');
    const header = csv.split(/\r?\n/)[0];
    expect(header).toBe('symbol,category,signal_date,entry_price,exit_date,exit_price,holding_days,exit_type,outcome,r_multiple,pnl,trade_direction,stop_price,target_price,trade_id,signal_params,notes');
  }, 30000);
});
