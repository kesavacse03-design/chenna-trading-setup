/**
 * Check OHLCV Cache Status
 * 
 * Queries database to see which stocks have cached candle data
 * and how many candles each has
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkOHLCVCache() {
    console.log('\n📊 Checking OHLCV Cache Status\n');
    console.log('='.repeat(60));

    try {
        // Get all cached data grouped by symbol
        const cacheEntries = await prisma.ohlcvCache.findMany({
            where: { interval: 'day' },
            orderBy: { symbol: 'asc' }
        });

        console.log(`\n✅ Found ${cacheEntries.length} cache entries\n`);

        // Group by symbol and count candles
        const symbolStats = {};

        for (const entry of cacheEntries) {
            if (!symbolStats[entry.symbol]) {
                symbolStats[entry.symbol] = {
                    symbol: entry.symbol,
                    entries: 0,
                    totalCandles: 0,
                    lastUpdate: entry.createdAt
                };
            }

            // Data is already a JSON object from Prisma (JsonValue type)
            const candles = Array.isArray(entry.data) ? entry.data : [];
            symbolStats[entry.symbol].entries++;
            symbolStats[entry.symbol].totalCandles = Math.max(
                symbolStats[entry.symbol].totalCandles,
                candles.length
            );

            if (entry.createdAt > symbolStats[entry.symbol].lastUpdate) {
                symbolStats[entry.symbol].lastUpdate = entry.createdAt;
            }
        }

        const symbols = Object.values(symbolStats);

        console.log('📈 Cache Summary:');
        console.log(`   Total Symbols: ${symbols.length}`);
        console.log(`   Total Entries: ${cacheEntries.length}\n`);

        // Categorize by data sufficiency
        const sufficient = symbols.filter(s => s.totalCandles >= 100);
        const partial = symbols.filter(s => s.totalCandles >= 50 && s.totalCandles < 100);
        const insufficient = symbols.filter(s => s.totalCandles < 50);

        console.log('✅ Sufficient Data (≥100 candles):');
        console.log(`   Count: ${sufficient.length}`);
        if (sufficient.length > 0 && sufficient.length <= 10) {
            sufficient.forEach(s => {
                console.log(`   - ${s.symbol}: ${s.totalCandles} candles`);
            });
        } else if (sufficient.length > 10) {
            sufficient.slice(0, 5).forEach(s => {
                console.log(`   - ${s.symbol}: ${s.totalCandles} candles`);
            });
            console.log(`   ... and ${sufficient.length - 5} more`);
        }

        console.log('\n⚠️ Partial Data (50-99 candles):');
        console.log(`   Count: ${partial.length}`);
        if (partial.length > 0 && partial.length <= 5) {
            partial.forEach(s => {
                console.log(`   - ${s.symbol}: ${s.totalCandles} candles`);
            });
        }

        console.log('\n❌ Insufficient Data (<50 candles):');
        console.log(`   Count: ${insufficient.length}`);
        if (insufficient.length > 0 && insufficient.length <= 5) {
            insufficient.forEach(s => {
                console.log(`   - ${s.symbol}: ${s.totalCandles} candles`);
            });
        }

        console.log('\n' + '='.repeat(60));

        // Check stocks in DOWNSIDE_LOM_SWING category
        console.log('\n🎯 Checking DOWNSIDE_LOM_SWING Category:\n');

        const categoryStocks = await prisma.stockCategory.findMany({
            where: {
                category: { key: 'DOWNSIDE_LOM_SWING' }
            },
            include: { stock: true }
        });

        console.log(`   Total stocks in category: ${categoryStocks.length}`);

        const stocksWithData = categoryStocks.filter(cs =>
            symbolStats[cs.stock.symbol] && symbolStats[cs.stock.symbol].totalCandles >= 50
        );

        console.log(`   Stocks with ≥50 candles: ${stocksWithData.length}`);
        console.log(`   Stocks needing data: ${categoryStocks.length - stocksWithData.length}\n`);

        if (stocksWithData.length < 5) {
            console.log('⚠️ WARNING: Need more data for meaningful backtest!');
            console.log('   Recommendation: Add OHLCV data for at least 10+ stocks\n');
        }

        return {
            totalSymbols: symbols.length,
            sufficient: sufficient.length,
            partial: partial.length,
            insufficient: insufficient.length,
            categoryStocks: categoryStocks.length,
            categoryWithData: stocksWithData.length,
            needsData: categoryStocks.length - stocksWithData.length > 5
        };

    } catch (error) {
        console.error('❌ Error checking cache:', error.message);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run check
checkOHLCVCache()
    .then(result => {
        console.log('\n✅ Cache check complete!\n');
        if (result.needsData) {
            console.log('💡 Next step: Run data caching for missing stocks');
            console.log('   Use your existing OHLCV cache endpoints\n');
        }
        process.exit(0);
    })
    .catch(err => {
        console.error('\n❌ Fatal error:', err);
        process.exit(1);
    });
