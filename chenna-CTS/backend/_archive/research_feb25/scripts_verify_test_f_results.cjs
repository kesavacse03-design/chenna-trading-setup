const fs = require('fs');
const path = require('path');
const priceService = require('../services/priceService.cjs');
const { validateTechnicalConditions } = require('../services/labs/technicalValidation.cjs');
const { PrismaClient } = require('@prisma/client');

const CSV_FILE = 'backtest_SHORT_TERM_SWING_BO_DOWN_2025-12-01_2025-12-31.csv';
const prisma = new PrismaClient();

async function verifyResults() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔍 CAPTAIN\'S VERIFICATION PROTOCOL: TEST F');
    console.log('═══════════════════════════════════════════════════════════════');

    const csvPath = path.join(__dirname, '..', CSV_FILE);
    if (!fs.existsSync(csvPath)) {
        console.error(`❌ CSV file not found: ${CSV_FILE}`);
        return;
    }

    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    console.log('Headers:', headers);

    const trades = lines.slice(1).map(line => {
        const values = line.split(',');
        const trade = {};
        headers.forEach((h, i) => trade[h] = values[i]?.trim());
        return trade;
    });

    // 1. Verify Win Rate & EV
    console.log('\n📊 VERIFICATION 3 & 4: METRICS CHECK');
    const pnlKey = headers.find(h => h.includes('P&L') || h.includes('PnL'));

    if (!pnlKey) {
        console.log('❌ Could not find P&L column');
        return;
    }

    const winners = trades.filter(t => parseFloat(t[pnlKey]) > 0);
    const losers = trades.filter(t => parseFloat(t[pnlKey]) <= 0);
    const total = trades.length;

    if (total === 0) {
        console.log('❌ No trades found');
        return;
    }

    const winRate = (winners.length / total) * 100;
    const avgWin = winners.length > 0 ? winners.reduce((sum, t) => sum + parseFloat(t[pnlKey]), 0) / winners.length : 0;
    const avgLoss = losers.length > 0 ? losers.reduce((sum, t) => sum + parseFloat(t[pnlKey]), 0) / losers.length : 0;
    const ev = (winners.length / total * avgWin) + (losers.length / total * avgLoss);

    console.log(`Total Trades: ${total}`);
    console.log(`Winners: ${winners.length}`);
    console.log(`Losers: ${losers.length}`);
    console.log(`Win Rate: ${winRate.toFixed(1)}% (Claim: 64.3%)`);
    console.log(`Avg Win: ${avgWin.toFixed(2)}%`);
    console.log(`Avg Loss: ${avgLoss.toFixed(2)}%`);
    console.log(`Expected Value (EV): ${ev.toFixed(2)}% (Claim: 0.75%)`);

    if (Math.abs(winRate - 64.3) < 0.1 && Math.abs(ev - 0.75) < 0.05) {
        console.log('✅ METRICS VERIFIED');
    } else {
        console.log('❌ METRICS MISMATCH');
    }

    // 2. Random Spot Check
    console.log('\n🕵️ VERIFICATION 2: RANDOM SPOT CHECK (5 TRADES)');
    const shuffled = trades.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 5);

    for (const [i, trade] of selected.entries()) {
        console.log(`\n---------------------------------------------------------------`);
        console.log(`TRADE #${i + 1}: ${trade.Symbol} (${trade.Outcome})`);
        console.log(`Entry: ${trade.EntryDate} @ ₹${trade.EntryPrice}`);
        console.log(`Exit:  ${trade.ExitDate} @ ₹${trade.ExitPrice} (${trade.ExitReason})`);
        console.log(`P&L:   ${trade[pnlKey]}%`);

        try {
            const symbol = trade.Symbol;
            if (!trade.EntryDate) continue;

            const entryDate = new Date(trade.EntryDate);
            if (isNaN(entryDate.getTime())) continue;
            const entryDateStr = entryDate.toISOString().split('T')[0];

            const stock = await prisma.stock.findFirst({ where: { symbol: symbol } });

            if (stock && stock.instrumentKey) {
                console.log(`\n[RAW DATA VERIFICATION]`);

                // 1. Entry Candle
                const entryData = await priceService.fetchPrice(symbol, stock.instrumentKey, entryDateStr, entryDateStr);
                if (entryData.length > 0) {
                    const c = entryData[0];
                    const isRed = c.close < c.open;
                    console.log(`1. Entry Candle (${entryDateStr}):`);
                    console.log(`   Open: ₹${c.open}, Close: ₹${c.close}`);
                    console.log(`   Color: ${isRed ? 'RED' : 'GREEN'} (Claim: RED) -> ${isRed ? '✅' : '❌'}`);
                }

                // 2. Technicals
                console.log(`2. Technical Validation (As of ${entryDateStr}):`);
                const techResult = await validateTechnicalConditions(symbol, stock.instrumentKey, parseFloat(trade.EntryPrice), 0, entryDate);

                console.log(`   At Support?      ${techResult.checks.support.isValid ? 'YES' : 'NO'} (Details: ${techResult.checks.support.details})`);
                console.log(`   Below 20MA?      ${techResult.checks.belowMA.isValid ? 'YES' : 'NO'} (Details: ${techResult.checks.belowMA.details})`);
                console.log(`   Breakdown?       ${techResult.checks.breakdown.isValid ? 'YES' : 'NO'} (Details: ${techResult.checks.breakdown.details})`);
                console.log(`   Normal Volume?   ${techResult.checks.volume.isValid ? 'YES' : 'NO'} (Details: ${techResult.checks.volume.details})`);
                console.log(`   OVERALL:         ${techResult.isValid ? 'PASS' : 'FAIL'} -> ${techResult.isValid ? '✅' : '❌'}`);

                // 3. Exit Verification
                if (trade.ExitDate) {
                    const exitDate = new Date(trade.ExitDate);
                    if (!isNaN(exitDate.getTime())) {
                        const exitDateStr = exitDate.toISOString().split('T')[0];
                        const exitData = await priceService.fetchPrice(symbol, stock.instrumentKey, exitDateStr, exitDateStr);
                        if (exitData.length > 0) {
                            const c = exitData[0];
                            console.log(`3. Exit Candle (${exitDateStr}):`);
                            console.log(`   Open: ₹${c.open}, High: ₹${c.high}, Low: ₹${c.low}, Close: ₹${c.close}`);
                            console.log(`   Exit Price: ₹${trade.ExitPrice}`);
                            const low = c.low;
                            const high = c.high;
                            const exitP = parseFloat(trade.ExitPrice);
                            const hit = exitP >= low && exitP <= high;
                            console.log(`   Price in Range? ${hit ? 'YES' : 'NO'} (Low: ${low}, High: ${high}) -> ${hit ? '✅' : '❌'}`);
                        }
                    }
                }
            } else {
                console.log(`⚠️ Could not find instrument key for ${symbol}`);
            }
        } catch (e) {
            console.log(`❌ Error verifying trade: ${e.message}`);
        }
    }
    await prisma.$disconnect();
}

verifyResults().catch(console.error);
