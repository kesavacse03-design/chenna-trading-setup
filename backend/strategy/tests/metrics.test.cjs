// Minimal metrics test harness
const { computeMetrics } = require('../metrics.cjs');

function testComputeMetrics(){
  const trades = [
    { pnl: 10 }, { pnl: -5 }, { pnl: 15 }, { pnl: -3 }
  ];
  const m = computeMetrics(trades);
  console.log(JSON.stringify({ input: trades.length, metrics: m }, null, 2));
}

if (require.main === module) testComputeMetrics();
