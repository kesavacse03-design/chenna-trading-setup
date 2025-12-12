/**
 * Test Time-Travel Labs Integration
 * Run this to verify Labs system is working
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testLabsIntegration() {
    console.log('🔬 Testing Time-Travel Labs Integration...\n');

    try {
        // Test 1: Verify new tables exist
        console.log('1️⃣ Checking database tables...');
        const labsRunCount = await prisma.labsRun.count();
        const labsCacheCount = await prisma.labsCache.count();
        const trapCount = await prisma.trapDetection.count();
        console.log(`   ✅ labs_runs: ${labsRunCount} records`);
        console.log(`   ✅ labs_cache: ${labsCacheCount} records`);
        console.log(`   ✅ trap_detections: ${trapCount} records\n`);

        // Test 2: Check StrategyVersion enhancements
        console.log('2️⃣ Checking StrategyVersion enhancements...');
        const versionCount = await prisma.strategyVersion.count();
        console.log(`   ✅ strategy_versions: ${versionCount} records\n`);

        // Test 3: Create a test Labs run
        console.log('3️⃣ Creating test Labs run...');
        const testRun = await prisma.labsRun.create({
            data: {
                categoryKey: 'TEST_CATEGORY',
                ttVersion: 'TT-V1',
                accuracy: 0.75,
                tradesTested: 100,
                recommendedLogic: {
                    entry: { rsi: { min: 26, max: 32 }, ema: { short: 20, long: 50 } },
                    exit: { target: 2.5, stopLoss: 1.5 },
                    trapAvoidance: ['Avoid volume spikes > 2.5x']
                },
                entryConditions: { rsi: { min: 26, max: 32 } },
                exitConditions: { target: 2.5 },
                trapRules: ['Avoid volume spikes'],
                cacheStatus: { cached: 15, uncached: 5, total: 20 },
                performanceMetrics: { pnl: 5000, drawdown: 1200, winRate: 0.75, expectancy: 50 }
            }
        });
        console.log(`   ✅ Created test run: ${testRun.id}`);
        console.log(`   📊 Accuracy: ${(testRun.accuracy * 100).toFixed(1)}%`);
        console.log(`   🎯 Version: ${testRun.ttVersion}\n`);

        // Test 4: Create test cache entry
        console.log('4️⃣ Creating test cache entry...');
        const testCache = await prisma.labsCache.upsert({
            where: { symbol: 'TESTSTOCK' },
            update: {
                lastResearchDate: new Date(),
                bestPatterns: { patterns: ['RSI oversold + EMA crossover'] },
                trapsDetected: { volumeTraps: 2, bullTraps: 1 },
                technicalCombos: { tested: 220 }
            },
            create: {
                symbol: 'TESTSTOCK',
                lastResearchDate: new Date(),
                bestPatterns: { patterns: ['RSI oversold + EMA crossover'] },
                trapsDetected: { volumeTraps: 2, bullTraps: 1 },
                technicalCombos: { tested: 220 }
            }
        });
        console.log(`   ✅ Created cache for: ${testCache.symbol}\n`);

        // Test 5: Create test trap detection
        console.log('5️⃣ Creating test trap detection...');
        const testTrap = await prisma.trapDetection.create({
            data: {
                symbol: 'TESTSTOCK',
                date: new Date(),
                trapType: 'volume_trap',
                confidence: 0.85,
                indicators: {
                    volumeRatio: 3.2,
                    wickRatio: 2.1
                }
            }
        });
        console.log(`   ✅ Created trap: ${testTrap.trapType}`);
        console.log(`   📈 Confidence: ${(testTrap.confidence * 100).toFixed(0)}%\n`);

        // Test 6: Verify relationships
        console.log('6️⃣ Testing promotion workflow...');
        const testVersion = await prisma.strategyVersion.create({
            data: {
                categoryKey: 'TEST_CATEGORY',
                version: 'V1',
                description: 'Test strategy from Labs',
                rules: testRun.recommendedLogic,
                params: { entry: testRun.entryConditions, exit: testRun.exitConditions },
                accuracy: testRun.accuracy,
                totalSignals: 100,
                successfulSignals: 75,
                failedSignals: 25,
                isActive: true,
                source: 'labs',
                labsRunId: testRun.id
            }
        });
        console.log(`   ✅ Created strategy version: ${testVersion.version}`);
        console.log(`   🔗 Linked to Labs run: ${testVersion.labsRunId}\n`);

        // Test 7: Query linked data
        console.log('7️⃣ Verifying data relationships...');
        const linkedVersion = await prisma.strategyVersion.findFirst({
            where: { labsRunId: testRun.id }
        });
        console.log(`   ✅ Found linked version: ${linkedVersion?.version}`);
        console.log(`   📊 Source: ${linkedVersion?.source}\n`);

        // Cleanup test data
        console.log('🧹 Cleaning up test data...');
        await prisma.strategyVersion.delete({ where: { id: testVersion.id } });
        await prisma.trapDetection.delete({ where: { id: testTrap.id } });
        await prisma.labsCache.delete({ where: { symbol: 'TESTSTOCK' } });
        await prisma.labsRun.delete({ where: { id: testRun.id } });
        console.log('   ✅ Cleanup complete\n');

        console.log('✅ All tests passed! Time-Travel Labs is ready! 🚀\n');
        console.log('Next steps:');
        console.log('1. Start backend: cd chenna-CTS/backend && npm start');
        console.log('2. Start frontend: npm run dev');
        console.log('3. Navigate to Watchlist page');
        console.log('4. Click "Run Labs" on any category card\n');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

testLabsIntegration();
