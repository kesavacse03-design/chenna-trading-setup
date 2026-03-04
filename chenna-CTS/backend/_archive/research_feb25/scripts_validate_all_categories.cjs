/**
 * Validate All Categories Script
 * Checks that each category has proper config and strategy file
 */

const path = require('path');

// Load strategyManager
const strategyManager = require('../services/labs/strategyManager.cjs');

const categories = [
    'PRE_MARKET',
    'INTRADAY_BOOST',
    'HIGH_POWERED_STOCKS',
    'UPSIDE_LOM_INTRA',
    'DOWNSIDE_LOM_INTRA',
    'DAILY_CONTRACTION',
    'MULTI_RESISTANCE_BO',
    'MULTI_SUPPORT_BO',
    'UPSIDE_LOM_SWING',
    'DOWNSIDE_LOM_SWING',
    'SHORT_TERM_SWING_BO_UP',
    'SHORT_TERM_SWING_BO_DOWN',
    'LONG_TERM_SWING_BO_UP',
    'LONG_TERM_SWING_BO_DOWN',
    'LONG_TERM_BO_UP'
];

console.log('\n' + '═'.repeat(80));
console.log('                    CATEGORY VALIDATION RESULTS');
console.log('═'.repeat(80));
console.log('');

const results = [];
let passCount = 0;
let failCount = 0;

for (const cat of categories) {
    const result = {
        category: cat,
        config: false,
        hasName: false,
        hasDirection: false,
        hasType: false,
        hasActive: false,
        hasAnalyzed: false,
        strategyFile: false,
        strategyExports: false,
        status: 'FAIL',
        error: null
    };

    try {
        // 1. Get config from strategyManager
        const config = strategyManager.getStrategyConfig(cat);
        result.config = !!config;

        // 2. Check required fields
        result.hasName = !!config?.name;
        result.hasDirection = !!config?.direction;
        result.hasType = !!config?.type;
        result.hasActive = config?.active === true;
        result.hasAnalyzed = config?.analyzed === true;

        // 3. Check if strategy file exists
        const strategyFile = config?.file;
        if (strategyFile) {
            const fullPath = path.join(__dirname, '../services/labs', strategyFile);
            try {
                const fs = require('fs');
                result.strategyFile = fs.existsSync(fullPath);

                // Try to load and check exports
                if (result.strategyFile) {
                    const strategy = require(fullPath);
                    result.strategyExports = !!(strategy.generateSignal || strategy.CONFIG || strategy.backtest);
                }
            } catch (e) {
                result.strategyFile = false;
                result.error = e.message;
            }
        }

        // Determine overall status
        const allPass = result.config && result.hasName && result.hasDirection &&
            result.hasType && result.hasActive && result.hasAnalyzed &&
            result.strategyFile && result.strategyExports;

        result.status = allPass ? 'PASS' : 'PARTIAL';

        if (allPass) passCount++;
        else failCount++;

    } catch (e) {
        result.error = e.message;
        result.status = 'ERROR';
        failCount++;
    }

    results.push(result);

    // Print result
    const statusIcon = result.status === 'PASS' ? '✅' : result.status === 'PARTIAL' ? '⚠️' : '❌';
    const checks = [
        result.hasName ? '✓' : '✗',
        result.hasDirection ? '✓' : '✗',
        result.hasType ? '✓' : '✗',
        result.hasActive ? '✓' : '✗',
        result.hasAnalyzed ? '✓' : '✗',
        result.strategyFile ? '✓' : '✗',
        result.strategyExports ? '✓' : '✗'
    ].join(' ');

    console.log(`${statusIcon} ${cat.padEnd(25)} | Name:${result.hasName ? '✓' : '✗'} Dir:${result.hasDirection ? '✓' : '✗'} Type:${result.hasType ? '✓' : '✗'} Active:${result.hasActive ? '✓' : '✗'} File:${result.strategyFile ? '✓' : '✗'} Exports:${result.strategyExports ? '✓' : '✗'}`);

    if (result.error) {
        console.log(`   ↳ Error: ${result.error}`);
    }
}

console.log('');
console.log('═'.repeat(80));
console.log(`SUMMARY: ${passCount} PASS | ${failCount} NEED ATTENTION`);
console.log('═'.repeat(80));

// List issues
const issues = results.filter(r => r.status !== 'PASS');
if (issues.length > 0) {
    console.log('\nISSUES TO FIX:');
    issues.forEach(r => {
        const missing = [];
        if (!r.hasActive) missing.push('active flag');
        if (!r.hasAnalyzed) missing.push('analyzed flag');
        if (!r.strategyFile) missing.push('strategy file');
        if (!r.strategyExports) missing.push('exports');
        if (r.error) missing.push(`error: ${r.error}`);
        console.log(`- ${r.category}: Missing ${missing.join(', ')}`);
    });
}

console.log('\n');
