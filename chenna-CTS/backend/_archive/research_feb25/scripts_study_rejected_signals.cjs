const path = require('path');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log(' REJECTED SIGNALS ANALYSIS (False BOs & Duplicates)');
    console.log('═══════════════════════════════════════════════════════\n');

    const cat = await prisma.category.findUnique({ where: { key: 'SHORT_TERM_SWING_BO_UP' } });
    if (!cat) process.exit(1);

    const stockEntries = await prisma.stockCategory.findMany({
        where: { categoryId: cat.id, addedDate: { gte: new Date('2025-08-01T00:00:00Z') } },
        include: { stock: true }
    });

    const uniqueSignals = Array.from(new Map(stockEntries.map(s => [`${s.stock.symbol}_${toISTDateString(s.addedDate)}`, s])).values())
        .map(sc => ({
            symbol: sc.stock.symbol,
            instrumentKey: sc.stock.instrumentKey,
            addedDate: toISTDateString(sc.addedDate),
            addedDateObj: sc.addedDate,
            sector: sc.sector || sc.stock.sector || 'Unknown'
        }))
        .sort((a, b) => a.addedDate.localeCompare(b.addedDate));

    console.log(`Processing ${uniqueSignals.length} raw signals...\n`);

    const clusters = {};
    const stockLastSeen = {};

    const falseBOs = [];
    const validSignals = [];
    const duplicates = [];

    // Phase 1: Reconstruct the Pipeline Exactly
    for (const req of uniqueSignals) {
        const dayOfWeek = req.addedDateObj.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        const signalDateObj = new Date(req.addedDate + 'T00:00:00+05:30');
        const dailyFrom = toISTDateString(new Date(signalDateObj.getTime() - 150 * 86400000));
        const dailyTo = toISTDateString(new Date(signalDateObj.getTime() + 25 * 86400000));

        try {
            const dailyData = await priceService.fetchFromUpstox(req.instrumentKey, dailyFrom, dailyTo, 'day', req.symbol);
            if (!dailyData || dailyData.length === 0) continue;

            const dailyC = dailyData.map(c => ({
                date: String(c.timestamp || c.date).split('T')[0],
                open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close), volume: parseFloat(c.volume)
            })).sort((a, b) => a.date.localeCompare(b.date));

            const sIdx = dailyC.findIndex(c => c.date === req.addedDate);
            if (sIdx < 15 || sIdx + 10 >= dailyC.length) continue;

            const sCandle = dailyC[sIdx];
            req.dailyC = dailyC;
            req.sIdx = sIdx;
            req.sCandle = sCandle;

            // Duplicate logic
            let isDuplicate = false;
            if (stockLastSeen[req.symbol]) {
                const daysSinceLast = (req.addedDateObj.getTime() - stockLastSeen[req.symbol].getTime()) / (1000 * 3600 * 24);
                if (daysSinceLast <= 7) {
                    isDuplicate = true;
                    req.leader = clusters[req.symbol].firstSignal;
                    req.daysSinceLeader = (req.addedDateObj.getTime() - req.leader.addedDateObj.getTime()) / (1000 * 3600 * 24);
                    req.clusterPos = clusters[req.symbol].duplicates.length + 2; // 2nd, 3rd, etc.

                    clusters[req.symbol].duplicates.push(req);
                    duplicates.push(req);
                    stockLastSeen[req.symbol] = req.addedDateObj;
                }
            }

            if (!isDuplicate) {
                clusters[req.symbol] = { firstSignal: req, duplicates: [] };
                stockLastSeen[req.symbol] = req.addedDateObj;
                req.clusterPos = 1;

                // False Breakout Logic ONLY applies to first signals (as per previous script)
                const highestClosePrior10 = Math.max(...dailyC.slice(sIdx - 10, sIdx).map(c => c.close));
                req.highestClosePrior10 = highestClosePrior10;

                if (sCandle.close <= highestClosePrior10) {
                    falseBOs.push(req);
                } else {
                    validSignals.push(req);
                }
            }

        } catch (e) {
            continue;
        }
    }

    console.log(`Reconstructed pipeline:`);
    console.log(`- Valid First Signals: ${validSignals.length}`);
    console.log(`- False Breakouts:     ${falseBOs.length}`);
    console.log(`- Duplicates:          ${duplicates.length}\n`);

    // ==========================================
    // STUDY 1: FALSE BREAKOUTS
    // ==========================================
    const outData = [];
    outData.push(`--- STUDY 1: FALSE BREAKOUT TRACKING (Next 5 Days) ---`);
    outData.push(`Total False Breakouts tracking: ${falseBOs.length}`);

    let delayedBO_count = 0;
    let delayedBO_wins = 0;
    let delayedBO_pnl = 0;
    const delayedBreakoutDays = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    let trueRejection_count = 0;
    let trueRejection_wins = 0;
    let trueRejection_pnl = 0;

    for (const req of falseBOs) {
        const { dailyC, sIdx, highestClosePrior10, signalDate } = req;

        let foundDelayed = false;
        let delayDay = 0;
        let newSIdx = 0;

        // Check next 5 days
        for (let i = 1; i <= 5; i++) {
            if (!dailyC[sIdx + i]) break;
            if (dailyC[sIdx + i].close > highestClosePrior10) {
                foundDelayed = true;
                delayDay = i;
                newSIdx = sIdx + i;
                break;
            }
        }

        if (foundDelayed) {
            delayedBO_count++;
            delayedBreakoutDays[delayDay] = (delayedBreakoutDays[delayDay] || 0) + 1;

            if (dailyC[newSIdx + 10]) {
                const fClose = dailyC[newSIdx + 10].close;
                const eClose = dailyC[newSIdx].close;
                const pnl = ((fClose - eClose) / eClose) * 100;
                delayedBO_pnl += pnl;
                if (pnl > 0) delayedBO_wins++;
            }
        } else {
            trueRejection_count++;
            if (dailyC[sIdx + 10]) {
                const fClose = dailyC[sIdx + 10].close;
                const eClose = dailyC[sIdx].close;
                const pnl = ((fClose - eClose) / eClose) * 100;
                trueRejection_pnl += pnl;
                if (pnl > 0) trueRejection_wins++;
            }
        }
    }

    outData.push(`Did the stock eventually CLOSE above the 10-day high close within 5 days?`);
    outData.push(`YES (Delayed Breakout): ${delayedBO_count} out of ${falseBOs.length}`);
    outData.push(`NO (True Rejection):    ${trueRejection_count} out of ${falseBOs.length}\n`);

    outData.push(`For the 'Delayed Breakout' group:`);
    outData.push(`  Which day did it finally close above?`);
    for (let i = 1; i <= 5; i++) outData.push(`  Day+${i}: ${delayedBreakoutDays[i]} stocks`);

    if (delayedBO_count > 0) {
        outData.push(`  10-day forward return from the ACTUAL breakout day:`);
        outData.push(`  Win rate: ${((delayedBO_wins / delayedBO_count) * 100).toFixed(1)}%`);
        outData.push(`  Avg P&L:  ${(delayedBO_pnl / delayedBO_count).toFixed(2)}%`);
    }

    if (trueRejection_count > 0) {
        outData.push(`\nFor the 'True Rejection' group:`);
        outData.push(`  10-day forward return from original signal date:`);
        outData.push(`  Win rate: ${((trueRejection_wins / trueRejection_count) * 100).toFixed(1)}%`);
        outData.push(`  Avg P&L:  ${(trueRejection_pnl / trueRejection_count).toFixed(2)}%`);
    }

    // Baseline calculation to compare
    let baseline_wins = 0; let baseline_pnl = 0;
    for (const req of validSignals) {
        if (req.dailyC[req.sIdx + 10]) {
            const fClose = req.dailyC[req.sIdx + 10].close;
            const pnl = ((fClose - req.sCandle.close) / req.sCandle.close) * 100;
            baseline_pnl += pnl;
            if (pnl > 0) baseline_wins++;
        }
    }

    // ==========================================
    // STUDY 2: DUPLICATES (2ND / 3RD+ SIGNALS)
    // ==========================================
    outData.push(`\n--- STUDY 2: DUPLICATE SIGNAL QUALITY ---`);
    outData.push(`First signal in a cluster:  ${validSignals.length} signals | ${((baseline_wins / validSignals.length) * 100).toFixed(1)}% WR | Avg P&L ${(baseline_pnl / validSignals.length).toFixed(2)}%`);

    const dupStats = {
        second: { count: 0, wins: 0, pnl: 0 },
        thirdPlus: { count: 0, wins: 0, pnl: 0 },
        withRed: { count: 0, wins: 0, pnl: 0 },
        withoutRed: { count: 0, wins: 0, pnl: 0 }
    };

    for (const dup of duplicates) {
        const leader = dup.leader;

        // Wait, what if the leader was a false breakout? Should we count the duplicate vs the leader?
        // The prompt asked "For the 91 duplicates that were removed..." meaning ALL of them.

        // Calculate performance from dup's entry
        if (!dup.dailyC[dup.sIdx + 10]) continue;
        const fClose = dup.dailyC[dup.sIdx + 10].close;
        const eClose = dup.sCandle.close;
        const pnl = ((fClose - eClose) / eClose) * 100;
        const isWin = pnl > 0 ? 1 : 0;

        if (dup.clusterPos === 2) {
            dupStats.second.count++; dupStats.second.wins += isWin; dupStats.second.pnl += pnl;
        } else {
            dupStats.thirdPlus.count++; dupStats.thirdPlus.wins += isWin; dupStats.thirdPlus.pnl += pnl;
        }

        // Check for red candle between leader and dup
        let hasRed = false;
        // Search from leader.sIdx to dup.sIdx
        const startIndex = leader.sIdx;
        const endIndex = dup.sIdx;
        if (startIndex >= 0 && startIndex < endIndex) {
            for (let i = startIndex; i < endIndex; i++) {
                // Determine if candle is red
                if (dup.dailyC[i].close < dup.dailyC[i].open) {
                    hasRed = true;
                    break;
                }
            }
        }

        if (hasRed) {
            dupStats.withRed.count++; dupStats.withRed.wins += isWin; dupStats.withRed.pnl += pnl;
        } else {
            dupStats.withoutRed.count++; dupStats.withoutRed.wins += isWin; dupStats.withoutRed.pnl += pnl;
        }
    }

    const calc = (s) => `${s.count} signals | ${s.count ? ((s.wins / s.count) * 100).toFixed(1) : 0}% WR | Avg P&L ${s.count ? (s.pnl / s.count).toFixed(2) : 0}%`;

    outData.push(`Second signal (1-2 days later): ${calc(dupStats.second)}`);
    outData.push(`Third+ signal (3-5 days later): ${calc(dupStats.thirdPlus)}\n`);

    outData.push(`Did ANY of the removed duplicates occur after a pullback? (Red candle gap between 1st and dup)`);
    outData.push(`Duplicates WITH a red candle gap:  ${calc(dupStats.withRed)}`);
    outData.push(`Duplicates WITHOUT red candle gap: ${calc(dupStats.withoutRed)}  (consecutive green days)`);

    const fs = require('fs');
    fs.writeFileSync(path.join(__dirname, '../outputs/rejected_study.txt'), outData.join('\n'));
    console.log("Successfully wrote output to outputs/rejected_study.txt");

    process.exit(0);
}

main().catch(console.error);
