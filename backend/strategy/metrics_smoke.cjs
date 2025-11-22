#!/usr/bin/env node
// Tiny smoke to validate normalizeMetrics + compositeScore don't emit NaN/undefined/string metrics
const path = require('path');
const { normalizeMetrics } = require('./metrics.cjs');
const { compositeScore } = require('./optimizer.cjs');

const cases = [
  { label: 'all missing', input: {} },
  { label: 'string winRate 0.7 (fraction)', input: { winRate: '0.7', netPnl: '100', trades: '4', avgReturn: '0.02' } },
  { label: 'string winRate 70', input: { winRate: '70', netPnl: '100', trades: 10, avgReturn: 0.01 } },
  { label: 'NaN fields', input: { winRate: NaN, netPnl: NaN, trades: NaN, avgReturn: NaN, maxDrawdown: NaN } },
  { label: 'zero trades with wins', input: { trades: 0, wins: 5, netPnl: 50 } },
  { label: 'fractional winRate 0.55', input: { winRate: 0.55, netPnl: 200, trades: 20, avgReturn: 0.02 } },
];

for (const c of cases) {
  const norm = normalizeMetrics(c.input);
  const score = compositeScore(norm);
  console.log('CASE', c.label);
  console.log('  input :', JSON.stringify(c.input));
  console.log('  norm  :', JSON.stringify(norm));
  console.log('  score :', score);
  console.log('---');
}
