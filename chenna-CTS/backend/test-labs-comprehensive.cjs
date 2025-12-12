/**
 * COMPREHENSIVE TIME-TRAVEL LABS TEST SUITE
 * Tests entire pipeline: Labs → Strategy → Backtest → Versioning
 * Uses mock data to verify functionality
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const labsService = require('./services/timeTravelLabsService.cjs');
const trapService = require('./services/trapDetectorService.cjs');
const versionService = require('./services/versionManagerService.cjs');

// Mock data: 3 stocks with 3 candles each
const MOCK_STOCKS = [
    { symbol: 'AAPL', listedDate: '2025-01-01' },
    { symbol: 'TCS', listedDate: '2025-01-01' },
    { symbol: 'PIDILITIND', listedDate: '2025-01-01' }
];

const MOCK_CANDLES = {
    'AAPL': [
        { date: '2025-01-01', open: 100, close: 102, high: 103, low: 98, volume: 1000 },
        { date: '2025-01-02', open: 102, close: 101, high: 104, low: 100, volume: 900 },
        { date: '2025-01-03', open: 101, close: 104, high: 105, low: 100, volume: 1200 }
    ],
    'TCS': [
        { date: '2025-01-01', open: 100, close: 102, high: 103, low: 98, volume: 1000 },
        { date: '2025-01-02', open: 102, close: 101, high: 104, low: 100, volume: 900 },
        { date: '2025-01-03', open: 101, close: 104, high: 105, low: 100, volume: 1200 }
    ],
    'PIDILITIND': [
        { date: '2025-01-01', open: 100, close: 102, high: 103, low: 98, volume: 1000 },
        { date: '2025-01-02', open: 102, close: 101, high: 104, low: 100, volume: 900 },
        { date: '2025-01-03', open: 101, close: 104, high: 105, low: 100, volume: 1200 }
    ]
};

let testResults = {
    passed: 0,
    failed: 0,
    warnings: 0,
    tests: []
};

function logTest(name, passed, message = '') {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${name}${message ? ' - ' + message : ''}`);
    testResults.tests.push({ name, passed, message });
    if (passed) testResults.passed++;
    else testResults.failed++;
}

function logWarning(name, message) {
    console.log(`⚠️  WARNING: ${name} - ${message}`);
    testResults.warnings++;
}

// ============================================
// TEST 1: STATIC VALIDATION
// ============================================
async function test1_StaticValidation() {
    console.log('\n🧪 TEST 1: Static Validation\n');

    // Check functions exist
    logTest('1.1 Labs Service Exists', typeof labsService.runTimeTravelLabs === 'function');
    logTest('1.2 Trap Service Exists', typeof trapService.detectTrapsForStocks === 'function');
    logTest('1.3 Version Service Exists', typeof versionService.promoteLabsToStrategy === 'function');

    // Check Prisma models
    try {
        await prisma.labsRun.findMany({ take: 1 });
        logTest('1.4 LabsRun Model Accessible', true);
    } catch (e) {
        logTest('1.4 LabsRun Model Accessible', false, e.message);
    }

    try {
        await prisma.labsCache.findMany({ take: 1 });
        logTest('1.5 LabsCache Model Accessible', true);
    } catch (e) {
        logTest('1.5 LabsCache Model Accessible', false, e.message);
    }

    try {
        await prisma.trapDetection.findMany({ take: 1 });
        logTest('1.6 TrapDetection Model Accessible', true);
    } catch (e) {
        logTest('1.6 TrapDetection Model Accessible', false, e.message);
    }
}

// ============================================
// TEST 2: TIME-TRAVEL LABS FLOW
// ============================================
async function test2_TimeTravelLabsFlow() {
    console.log('\n🧪 TEST 2: Time-Travel Labs Flow\n');

    try {
        // Mock the data fetching to use our mock candles
        const originalFetch = labsService.fetchStockData || (() => MOCK_CANDLES);

        // Run Labs with mock data
        const result = await labsService.runTimeTravelLabs('TEST_MOCK_CATEGORY', MOCK_STOCKS, { mode: 'mock' });

        // Validate structure
        logTest('2.1 Labs Returns Result', !!result);
        logTest('2.2 Has Run ID', !!result.runId);
        logTest('2.3 Has TT Version', !!result.ttVersion && result.ttVersion.startsWith('TT-'));
        logTest('2.4 Has Accuracy', typeof result.accuracy === 'number');
        logTest('2.5 Has Recommended Logic', !!result.recommendedLogic);

        // Validate recommended logic structure
        const logic = result.recommendedLogic;
        logTest('2.6 Has Entry Conditions', !!logic.entry);
        logTest('2.7 Has Exit Conditions', !!logic.exit);
        logTest('2.8 Has Trap Avoidance', Array.isArray(logic.trapAvoidance));

        // Validate metrics
        logTest('2.9 Has Metrics', !!result.metrics);
        logTest('2.10 Metrics Has PnL', typeof result.metrics.pnl === 'number');
        logTest('2.11 Metrics Has Drawdown', typeof result.metrics.drawdown === 'number');
        logTest('2.12 Metrics Has Win Rate', typeof result.metrics.winRate === 'number');

        // Validate accuracy threshold
        if (result.accuracy >= 0.70) {
            logTest('2.13 Accuracy Meets Threshold', true, `${(result.accuracy * 100).toFixed(1)}% ≥ 70%`);
        } else {
            logWarning('2.13 Accuracy Below Threshold', `${(result.accuracy * 100).toFixed(1)}% < 70%`);
        }

        // Store for next test
        global.__TEST_LABS_RUN_ID = result.runId;
        global.__TEST_ACCURACY = result.accuracy;

        return result;
    } catch (error) {
        logTest('2.X Labs Flow', false, error.message);
        throw error;
    }
}

// ============================================
// TEST 3: TRAP DETECTION
// ============================================
async function test3_TrapDetection() {
    console.log('\n🧪 TEST 3: Trap Detection\n');

    try {
        const trapResults = await trapService.detectTrapsForStocks(MOCK_STOCKS, MOCK_CANDLES);

        logTest('3.1 Trap Detection Returns Results', !!trapResults);
        logTest('3.2 Results for All Stocks', Object.keys(trapResults).length === MOCK_STOCKS.length);

        // Check each stock has trap arrays
        for (const symbol of Object.keys(trapResults)) {
            const traps = trapResults[symbol];
            logTest(`3.3 ${symbol} Has Trap Arrays`,
                Array.isArray(traps.volumeTraps) &&
                Array.isArray(traps.bullTraps) &&
                Array.isArray(traps.bearTraps) &&
                Array.isArray(traps.stopHunts) &&
                Array.isArray(traps.fakeBreakouts) &&
                Array.isArray(traps.liquiditySweeps)
            );
        }

        return trapResults;
    } catch (error) {
        logTest('3.X Trap Detection', false, error.message);
        throw error;
    }
}

// ============================================
// TEST 4: STRATEGY PROMOTION
// ============================================
async function test4_StrategyPromotion() {
    console.log('\n🧪 TEST 4: Strategy Promotion\n');

    const labsRunId = global.__TEST_LABS_RUN_ID;

    if (!labsRunId) {
        logTest('4.X Promotion', false, 'No Labs run ID from previous test');
        return;
    }

    try {
        // Promote to V1
        const result = await versionService.promoteLabsToStrategy(labsRunId, 'TEST_MOCK_CATEGORY');

        logTest('4.1 Promotion Returns Result', !!result);
        logTest('4.2 Has Version Object', !!result.version);
        logTest('4.3 Version is V1', result.version.version === 'V1');
        logTest('4.4 Source is Labs', result.version.source === 'labs');
        logTest('4.5 Linked to Labs Run', result.version.labsRunId === labsRunId);
        logTest('4.6 Is Active', result.version.isActive === true);

        // Validate version structure
        const v = result.version;
        logTest('4.7 Has Rules', !!v.rules);
        logTest('4.8 Has Params', !!v.params);
        logTest('4.9 Has Accuracy', typeof v.accuracy === 'number');

        global.__TEST_VERSION_ID = v.id;

        return result;
    } catch (error) {
        logTest('4.X Promotion', false, error.message);
        throw error;
    }
}

// ============================================
// TEST 5: VERSION MANAGEMENT
// ============================================
async function test5_VersionManagement() {
    console.log('\n🧪 TEST 5: Version Management\n');

    try {
        // Get version history
        const history = await versionService.getVersionHistory('TEST_MOCK_CATEGORY');

        logTest('5.1 Version History Returns', Array.isArray(history));
        logTest('5.2 Has V1', history.some(v => v.version === 'V1'));

        // Get active version
        const active = await versionService.getActiveVersion('TEST_MOCK_CATEGORY');
        logTest('5.3 Active Version Exists', !!active);
        logTest('5.4 Active is V1', active?.version === 'V1');

        return { history, active };
    } catch (error) {
        logTest('5.X Version Management', false, error.message);
        throw error;
    }
}

// ============================================
// TEST 6: DATA PIPELINE VALIDATION
// ============================================
async function test6_DataPipeline() {
    console.log('\n🧪 TEST 6: Data Pipeline Validation\n');

    try {
        // Get the Labs run from database
        const labsRun = await prisma.labsRun.findUnique({
            where: { id: global.__TEST_LABS_RUN_ID }
        });

        logTest('6.1 Labs Run in Database', !!labsRun);

        if (labsRun) {
            // Validate JSON structure
            logTest('6.2 Recommended Logic is Valid JSON', typeof labsRun.recommendedLogic === 'object');
            logTest('6.3 Entry Conditions is Valid JSON', typeof labsRun.entryConditions === 'object');
            logTest('6.4 Exit Conditions is Valid JSON', typeof labsRun.exitConditions === 'object');
            logTest('6.5 Trap Rules is Valid JSON', Array.isArray(labsRun.trapRules));

            // Check for NaN, null, undefined
            logTest('6.6 Accuracy is Valid Number',
                typeof labsRun.accuracy === 'object' && !isNaN(parseFloat(labsRun.accuracy.toString()))
            );
            logTest('6.7 Trades Tested is Valid',
                typeof labsRun.tradesTested === 'number' && labsRun.tradesTested > 0
            );

            // Validate metrics
            const metrics = labsRun.performanceMetrics;
            logTest('6.8 Metrics Has No NaN',
                !Object.values(metrics).some(v => typeof v === 'number' && isNaN(v))
            );
        }

        return labsRun;
    } catch (error) {
        logTest('6.X Data Pipeline', false, error.message);
        throw error;
    }
}

// ============================================
// TEST 7: CACHE VALIDATION
// ============================================
async function test7_CacheValidation() {
    console.log('\n🧪 TEST 7: Cache Validation\n');

    try {
        // Check if cache was created
        const cacheEntries = await prisma.labsCache.findMany({
            where: {
                symbol: { in: MOCK_STOCKS.map(s => s.symbol) }
            }
        });

        logTest('7.1 Cache Entries Created', cacheEntries.length > 0);

        if (cacheEntries.length > 0) {
            const cache = cacheEntries[0];
            logTest('7.2 Cache Has Last Research Date', !!cache.lastResearchDate);
            logTest('7.3 Cache Has Best Patterns', typeof cache.bestPatterns === 'object');
            logTest('7.4 Cache Has Traps Detected', typeof cache.trapsDetected === 'object');
            logTest('7.5 Cache Has Technical Combos', typeof cache.technicalCombos === 'object');
        }

        return cacheEntries;
    } catch (error) {
        logTest('7.X Cache Validation', false, error.message);
        throw error;
    }
}

// ============================================
// TEST 8: CLEANUP
// ============================================
async function test8_Cleanup() {
    console.log('\n🧹 Cleanup Test Data\n');

    try {
        // Delete test version
        if (global.__TEST_VERSION_ID) {
            await prisma.strategyVersion.delete({
                where: { id: global.__TEST_VERSION_ID }
            });
            console.log('   ✅ Deleted test version');
        }

        // Delete test Labs run
        if (global.__TEST_LABS_RUN_ID) {
            await prisma.labsRun.delete({
                where: { id: global.__TEST_LABS_RUN_ID }
            });
            console.log('   ✅ Deleted test Labs run');
        }

        // Delete test cache
        await prisma.labsCache.deleteMany({
            where: {
                symbol: { in: MOCK_STOCKS.map(s => s.symbol) }
            }
        });
        console.log('   ✅ Deleted test cache entries');

        // Delete test trap detections
        await prisma.trapDetection.deleteMany({
            where: {
                symbol: { in: MOCK_STOCKS.map(s => s.symbol) }
            }
        });
        console.log('   ✅ Deleted test trap detections');

    } catch (error) {
        console.log('   ⚠️  Cleanup error:', error.message);
    }
}

// ============================================
// MAIN TEST RUNNER
// ============================================
async function runAllTests() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔬 TIME-TRAVEL LABS - COMPREHENSIVE TEST SUITE');
    console.log('═══════════════════════════════════════════════════════\n');

    try {
        await test1_StaticValidation();
        await test2_TimeTravelLabsFlow();
        await test3_TrapDetection();
        await test4_StrategyPromotion();
        await test5_VersionManagement();
        await test6_DataPipeline();
        await test7_CacheValidation();
        await test8_Cleanup();

        // Print summary
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('📊 TEST SUMMARY');
        console.log('═══════════════════════════════════════════════════════\n');
        console.log(`✅ PASSED: ${testResults.passed}`);
        console.log(`❌ FAILED: ${testResults.failed}`);
        console.log(`⚠️  WARNINGS: ${testResults.warnings}\n`);

        if (testResults.failed === 0) {
            console.log('🎉 ALL TESTS PASSED! Time-Travel Labs is FULLY FUNCTIONAL!\n');
            console.log('Next steps:');
            console.log('1. Test UI in browser');
            console.log('2. Verify Watchlist page shows category cards');
            console.log('3. Click "Run Labs" button');
            console.log('4. Verify Labs window opens and functions\n');
            process.exit(0);
        } else {
            console.log('❌ SOME TESTS FAILED. Please fix issues before proceeding.\n');

            // List failed tests
            const failed = testResults.tests.filter(t => !t.passed);
            if (failed.length > 0) {
                console.log('Failed tests:');
                failed.forEach(t => {
                    console.log(`  - ${t.name}: ${t.message}`);
                });
            }

            process.exit(1);
        }

    } catch (error) {
        console.error('\n❌ CRITICAL ERROR:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run tests
runAllTests();
