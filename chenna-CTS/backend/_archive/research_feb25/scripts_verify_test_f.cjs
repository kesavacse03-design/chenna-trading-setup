const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const priceService = require('../services/priceService.cjs');
const { validateTechnicalConditions } = require('../services/labs/technicalValidation.cjs');

// Configuration
const CATEGORY_KEY = 'SHORT_TERM_SWING_BO_DOWN';
const TARGET_DATE_STR = '2025-12-04';
const TARGET_SYMBOL = 'UNIONBANK'; // For manual check

async function verifyTestF() {
    console.log(`\n🔍 VERIFICATION PROTOCOL: Test F (Strict Validation)`);
    console.log(`Target Date: ${TARGET_DATE_STR}`);
    console.log(`Category: ${CATEGORY_KEY}\n`);

    try {
        // 1. Get Category ID
        const category = await prisma.category.findFirst({
            where: { key: CATEGORY_KEY }
        });

        if (!category) {
            console.error('❌ Category not found');
            return;
        }

        // 2. Get All Stocks in Category
        // In backtest mode, we use ALL stocks associated with the category
        const stockCategories = await prisma.stockCategory.findMany({
            where: { categoryId: category.id },
            include: { stock: true }
        });

        const allStocks = stockCategories.map(sc => sc.stock);
        console.log(`1️⃣  Total Stocks in Category: ${allStocks.length}`);

        // 3. Filter Tier 1 (< 200)
        // We need price for Dec 4 to determine Tier
        console.log(`\n2️⃣  Checking Tier 1 (< 200) status for Dec 4...`);
        const tier1Stocks = [];
        const tierDetails = { Tier1: 0, Tier2: 0, Tier3: 0, Unknown: 0 };

        for (const stock of allStocks) {
            try {
                // Fetch price for Dec 4
                const priceData = await priceService.fetchPrice(stock.symbol, stock.instrumentKey, TARGET_DATE_STR, TARGET_DATE_STR);
                const candle = priceData && priceData.length > 0 ? priceData[0] : null;

                if (candle) {
                    const price = candle.close;
                    if (price < 200) {
                        tier1Stocks.push({ stock, candle });
                        tierDetails.Tier1++;
                    } else if (price < 1000) {
                        tierDetails.Tier2++;
                    } else {
                        tierDetails.Tier3++;
                    }
                } else {
                    tierDetails.Unknown++;
                }
            } catch (e) {
                console.log(`   ⚠️ Error fetching ${stock.symbol}: ${e.message}`);
                tierDetails.Unknown++;
            }
            // Add small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        console.log(`   Tier 1 (<200): ${tierDetails.Tier1}`);
        console.log(`   Tier 2 (200-1000): ${tierDetails.Tier2}`);
        console.log(`   Tier 3 (>1000): ${tierDetails.Tier3}`);
        console.log(`   No Data: ${tierDetails.Unknown}`);

        // 4. Filter Red Candle (Dec 4)
        console.log(`\n3️⃣  Checking Red Candle status for Tier 1 stocks...`);
        const redCandleStocks = [];
        for (const item of tier1Stocks) {
            const { stock, candle } = item;
            const isRed = candle.close < candle.open;
            if (isRed) {
                redCandleStocks.push(item);
            }
        }
        console.log(`   Tier 1 + Red Candle: ${redCandleStocks.length}`);

        // 5. Check Previous Day Red Candle (Dec 3) - Test F Requirement
        console.log(`\n4️⃣  Checking PREVIOUS Day Red Candle (Dec 3)...`);
        const prevDayRedStocks = [];
        const prevDateStr = '2025-12-03'; // Wednesday

        for (const item of redCandleStocks) {
            const { stock } = item;
            try {
                const prevPriceData = await priceService.fetchPrice(stock.symbol, stock.instrumentKey, prevDateStr, prevDateStr);
                const prevCandle = prevPriceData && prevPriceData.length > 0 ? prevPriceData[0] : null;

                if (prevCandle) {
                    const isPrevRed = prevCandle.close < prevCandle.open;
                    if (isPrevRed) {
                        prevDayRedStocks.push(item);
                    } else if (stock.symbol === TARGET_SYMBOL) {
                        console.log(`   ⚠️ ${stock.symbol} failed Prev Day Red check: Open=${prevCandle.open}, Close=${prevCandle.close}`);
                    }
                } else {
                    if (stock.symbol === TARGET_SYMBOL) console.log(`   ⚠️ ${stock.symbol} no data for Prev Day`);
                }
            } catch (e) {
                console.log(`   ⚠️ Error checking prev candle for ${stock.symbol}: ${e.message}`);
            }
            // Add small delay
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        console.log(`   Tier 1 + Red + Prev Day Red: ${prevDayRedStocks.length}`);

        // 6. Run Technical Validation (4 Checks)
        console.log(`\n5️⃣  Running Technical Validation (4 Checks) on survivors...`);
        let passedAll = 0;

        for (const item of prevDayRedStocks) {
            const { stock, candle } = item;
            const date = new Date(TARGET_DATE_STR);
            const price = candle.close;

            try {
                const result = await validateTechnicalConditions(stock.symbol, stock.instrumentKey, price, 0, date);

                if (result.isValid) {
                    passedAll++;
                    console.log(`   ✅ PASS: ${stock.symbol}`);
                } else if (stock.symbol === TARGET_SYMBOL) {
                    console.log(`   ❌ FAIL ${stock.symbol}: ${result.reason}`);
                    console.log(`      Support: ${result.checks.support.isValid}`);
                    console.log(`      MA: ${result.checks.belowMA.isValid}`);
                    console.log(`      Breakdown: ${result.checks.breakdown.isValid}`);
                    console.log(`      Volume: ${result.checks.volume.isValid}`);
                }
            } catch (e) {
                console.log(`   ⚠️ Error validating ${stock.symbol}: ${e.message}`);
            }
            // Add small delay
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        console.log(`   Final Survivors (Test F Candidates): ${passedAll}`);

        // 7. Manual Check for TARGET_SYMBOL
        if (TARGET_SYMBOL) {
            console.log(`\n🔍 MANUAL CHECK: ${TARGET_SYMBOL}`);
            const stock = allStocks.find(s => s.symbol === TARGET_SYMBOL);
            if (stock) {
                try {
                    // Check Price & Tier
                    const priceData = await priceService.fetchPrice(stock.symbol, stock.instrumentKey, TARGET_DATE_STR, TARGET_DATE_STR);
                    const candle = priceData[0];
                    console.log(`   Price (Dec 4): ${candle?.close} (Tier ${candle?.close < 200 ? '1' : 'Other'})`);
                    console.log(`   Candle: Open=${candle?.open}, Close=${candle?.close} (${candle?.close < candle?.open ? 'RED' : 'GREEN'})`);

                    // Check Prev Day
                    const prevPriceData = await priceService.fetchPrice(stock.symbol, stock.instrumentKey, '2025-12-03', '2025-12-03');
                    const prevCandle = prevPriceData[0];
                    console.log(`   Prev Day (Dec 3): Open=${prevCandle?.open}, Close=${prevCandle?.close} (${prevCandle?.close < prevCandle?.open ? 'RED' : 'GREEN'})`);

                    // Check Technicals
                    const date = new Date(TARGET_DATE_STR);
                    const result = await validateTechnicalConditions(stock.symbol, stock.instrumentKey, candle.close, 0, date);

                    console.log(`   Technicals: ${result.isValid ? 'PASS' : 'FAIL'}`);
                    console.log(`     - Support: ${result.checks.support.isValid} (${result.checks.support.details})`);
                    console.log(`     - MA: ${result.checks.belowMA.isValid} (${result.checks.belowMA.details})`);
                    console.log(`     - Breakdown: ${result.checks.breakdown.isValid} (${result.checks.breakdown.details})`);
                    console.log(`     - Volume: ${result.checks.volume.isValid} (${result.checks.volume.details})`);
                } catch (e) {
                    console.log(`   ⚠️ Error manual check ${TARGET_SYMBOL}: ${e.message}`);
                }
            } else {
                console.log(`   Stock ${TARGET_SYMBOL} not found in category`);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

verifyTestF();
