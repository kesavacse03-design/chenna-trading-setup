const fs = require('fs');
const path = require('path');
const { buildCandidates } = require('../backend/strategy/candidateGenerator.cjs');

const OUTPUT_FILE = path.join(__dirname, '../tmp/strategy_candidates.json');

// Ensure tmp dir exists
const tmpDir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
}

// Define pool for "Downside LOM Swing"
// Focusing on:
// - Trend: EMA crossovers or alignment (Short < Long for downside? Or just general trend filters)
//   Actually "Downside LOM Swing" usually implies catching a swing low in a downtrend or a reversal?
//   Let's stick to the plan: EMA, RSI, ATR.
//   For "Downside", we might be looking for shorts? Or buying dips?
//   "LOM" usually stands for "Low of Month" or similar structure.
//   Assuming we want standard swing parameters that can be adapted.
//   The candidate generator produces 'composite' strategies which are generally long-biased in the current system unless 'side' is specified.
//   However, the current backtester strategyBase might be long-only.
//   Let's generate a robust set of parameters.

const pool = {
    ema_short: [5, 8, 13],
    ema_long: [21, 34, 50],
    rsi_period: [14],
    rsi_min: [20, 30], // Oversold levels
    rsi_max: [60, 70], // Overbought levels (for exits or trend filters)
    atr_mult: [1.0, 1.5, 2.0], // For stops/targets
    volumeFactor: [1.0, 1.5], // Breakout volume
    targetR: [1.5, 2.0, 3.0], // Risk:Reward
    patterns: ['none'] // Keep it simple for now
};

const limits = {
    maxCombos: 100
};

console.log('Generating candidates with pool:', JSON.stringify(pool, null, 2));

const candidates = buildCandidates(pool, limits);

console.log(`Generated ${candidates.length} candidates.`);

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(candidates, null, 2), 'utf8');
console.log(`Saved to ${OUTPUT_FILE}`);
