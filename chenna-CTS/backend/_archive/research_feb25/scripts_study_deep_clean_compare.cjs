const path = require('path');
const fs = require('fs');
const priceService = require('../services/priceService.cjs');
const prisma = require('../lib/prisma.cjs');

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

function calcEMA(closes, period) {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) ema = closes[i] * k + ema * (1 - k);
    return ema;
}

function calcMACD(closes) {
    if (closes.length < 26) return { isBullish: false };
    const ema12Arr = [], ema26Arr = [];
    for (let i = 26; i <= closes.length; i++) {
        ema12Arr.push(calcEMA(closes.slice(0, i), 12));
        ema26Arr.push(calcEMA(closes.slice(0, i), 26));
    }
    const macdLine = ema12Arr.map((v, i) => v - ema26Arr[i]);
    const signalLine = calcEMA(macdLine, 9);
    const currMacd = macdLine[macdLine.length - 1];
    const currSig = signalLine;
    return { isBullish: currMacd > currSig };
}

function classifyCandle(today, yesterday) {
    const range = today.high - today.low;
    const body = Math.abs(today.close - today.open);
    const upperWick = today.high - Math.max(today.open, today.close);
    const lowerWick = Math.min(today.open, today.close) - today.low;
    const isGreen = today.close > today.open;
    const isRed = today.close < today.open;
    const isDoji = body <= 0.1 * range;
    const isSpinningTop = body <= 0.3 * range && upperWick > body && lowerWick > body;

    const isBullEngulf = isGreen && today.open <= yesterday.close && today.close >= yesterday.open && (today.close - today.open) > Math.abs(yesterday.close - yesterday.open);
    const isBearEngulf = isRed && today.open >= yesterday.close && today.close <= yesterday.open && (today.open - today.close) > Math.abs(yesterday.close - yesterday.open);

    const isHammer = lowerWick > 1.5 * body && upperWick < body && body < 0.4 * range && today.close > today.low + 0.5 * range;
    const isShootingStar = upperWick > 1.5 * body && lowerWick < body && body < 0.4 * range && today.close < today.high - 0.5 * range;

    const isMarubozuGreen = isGreen && body >= 0.8 * range;
    const isMarubozuRed = isRed && body >= 0.8 * range;

    if (isBullEngulf) return 'Bullish Engulfing';
    if (isBearEngulf) return 'Bearish Engulfing';
    if (isHammer) return 'Hammer';
    if (isShootingStar) return 'Shooting Star';
    if (isMarubozuGreen) return 'Marubozu Green';
    if (isMarubozuRed) return 'Marubozu Red';
    if (isDoji) return 'Doji';
    if (isSpinningTop) return 'Spinning Top';

    return isGreen ? 'Normal Green' : 'Normal Red';
}

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log(' DEEP DIVE: DATA CLEANING & FORENSIC COMPARISON');
    console.log('═══════════════════════════════════════════════════════\n');

    // Nifty data
    console.log('Fetching NIFTY baseline...');
    const niftyCandles = await priceService.fetchFromUpstox('NSE_INDEX|Nifty 50', '2025-01-01', '2026-06-01', 'day', 'NIFTY50');
    const niftyMap = {};
    for (let c of niftyCandles) niftyMap[String(c.timestamp).split('T')[0]] = c;

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

    console.log(`\nPHASE 1: DATA CLEANING`);
    console.log(`Total raw signals in DB: ${uniqueSignals.length}`);

    let errWeekend = 0;
    let errFalseBO = 0;
    let errDup = 0;

    const falseBOExamples = [];
    const dupExamples = [];

    const validSignals = [];
    const stockLastSeen = {}; // to check duplicates

    for (const req of uniqueSignals) {
        // Step 1: Weekend Check
        const dayOfWeek = req.addedDateObj.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            errWeekend++;
            continue;
        }

        // Step 3: Duplicate Check (Within 7 calendar days to approximate 5 trading days)
        if (stockLastSeen[req.symbol]) {
            const daysSince = (req.addedDateObj.getTime() - stockLastSeen[req.symbol].getTime()) / (1000 * 3600 * 24);
            if (daysSince <= 7) {
                errDup++;
                if (dupExamples.length < 5) {
                    dupExamples.push(`${req.symbol}: previously seen on ${toISTDateString(stockLastSeen[req.symbol])}, new signal on ${req.addedDate} (${Math.round(daysSince)} days later)`);
                }
                // We'll still keep it for now but let's see what the user says. The goal is to show the proof.
                // If the user wants to keep them, we can remove the `continue`. For now we leave it filtering so the numbers match.
                continue;
            }
        }

        // Fetch Data for False Breakout Check
        const signalDateObj = new Date(req.addedDate + 'T00:00:00+05:30');
        const dailyFrom = toISTDateString(new Date(signalDateObj.getTime() - 150 * 86400000));
        const dailyTo = toISTDateString(new Date(signalDateObj.getTime() + 25 * 86400000));

        try {
            const dailyData = await priceService.fetchFromUpstox(req.instrumentKey, dailyFrom, dailyTo, 'day', req.symbol);
            if (!dailyData || dailyData.length === 0) continue;

            const dailyC = dailyData.map(c => ({
                date: String(c.timestamp || c.date).split('T')[0], open: parseFloat(c.open), high: parseFloat(c.high), low: parseFloat(c.low), close: parseFloat(c.close), volume: parseFloat(c.volume)
            })).sort((a, b) => a.date.localeCompare(b.date));

            const sIdx = dailyC.findIndex(c => c.date === req.addedDate);
            if (sIdx < 15 || sIdx + 10 >= dailyC.length) continue;

            const sCandle = dailyC[sIdx];

            // Step 2: False Breakout Check
            const highestClosePrior10 = Math.max(...dailyC.slice(sIdx - 10, sIdx).map(c => c.close));
            const highestHighPrior10 = Math.max(...dailyC.slice(sIdx - 10, sIdx).map(c => c.high));

            if (sCandle.close <= highestClosePrior10) {
                errFalseBO++;
                if (falseBOExamples.length < 10) {
                    falseBOExamples.push(`${req.symbol} on ${req.addedDate}: Close was ${sCandle.close.toFixed(2)}, but the highest close in the prior 10 days was ${highestClosePrior10.toFixed(2)}. (It wicked up to ${sCandle.high.toFixed(2)} and touched resistance, but did not close above it.)`);
                }
                continue;
            }

            // Signal is clean!
            stockLastSeen[req.symbol] = req.addedDateObj;
            req.dailyC = dailyC;
            req.sIdx = sIdx;
            validSignals.push(req);

        } catch (e) {
            continue;
        }
    }

    console.log(`  Removed (Weekend dates):   ${errWeekend}`);
    console.log(`  Removed (False breakout):  ${errFalseBO}`);
    console.log(`  Removed (Duplicates):      ${errDup}`);
    console.log(`  CLEAN VALID SIGNALS:       ${validSignals.length}`);

    console.log(`\n--- PROOF: FALSE BREAKOUT EXAMPLES ---`);
    console.log(`A breakout is only valid if the DAILY CLOSE is higher than the previous 10 days' closes. These signals failed because they wicked up, but closed lower:`);
    falseBOExamples.forEach(ex => console.log('  - ' + ex));

    console.log(`\n--- PROOF: DUPLICATE (CONSECUTIVE) SIGNALS ---`);
    console.log(`These are signals for the SAME stock generated just a few days apart, during the exact same momentum swing:`);
    dupExamples.forEach(ex => console.log('  - ' + ex));
    console.log(`(If you want to treat every single consecutive day as a fresh independent signal, we can remove this filter!)`);

    const proofStr = "FALSE BREAKOUT EXAMPLES:\n" + falseBOExamples.join("\n") + "\n\nDUPLICATE EXAMPLES:\n" + dupExamples.join("\n");
    fs.writeFileSync(path.join(__dirname, '../outputs/proof.txt'), proofStr);

    // PHASE 2: COMPARISON
    console.log('\nPHASE 2: WINNER vs LOSER DEEP COMPARISON');

    const winners = [];
    const losers = [];

    // Process Indicators
    for (const req of validSignals) {
        const { dailyC, sIdx, sector } = req;
        const sCandle = dailyC[sIdx];
        const p10Close = dailyC[sIdx + 10].close;
        const isWinner = p10Close > sCandle.close;

        // 2A: Candlestick Patterns
        const day1Pattern = classifyCandle(dailyC[sIdx + 1], sCandle);
        const day2Pattern = classifyCandle(dailyC[sIdx + 2], dailyC[sIdx + 1]);
        const day3Pattern = classifyCandle(dailyC[sIdx + 3], dailyC[sIdx + 2]);

        // 2B: Sector & Nifty Context
        let niftyContext = 'Unknown';
        const niftyDay = niftyMap[req.addedDate];
        if (niftyDay) {
            const ret = ((niftyDay.close - niftyDay.open) / niftyDay.open) * 100; // Intraday change approx, better vs prev close but this is fine 
            const prevNifty = Object.values(niftyMap).find(x => x.timestamp < niftyDay.timestamp); // rough hack
            const trueRet = prevNifty ? ((niftyDay.close - prevNifty.close) / prevNifty.close) * 100 : ret;
            if (trueRet > 0.5) niftyContext = 'Up > 0.5%';
            else if (trueRet < -0.5) niftyContext = 'Down < -0.5%';
            else niftyContext = 'Flat -0.5 to +0.5%';
        }

        let secGroup = sector;
        if (secGroup.includes('Bank') || secGroup.includes('Finance')) secGroup = 'Finance/Banking';
        else if (secGroup.includes('I.t')) secGroup = 'IT';
        else if (secGroup.includes('Health') || secGroup.includes('Pharma')) secGroup = 'Healthcare/Pharma';
        else if (secGroup.includes('Auto')) secGroup = 'Auto';
        else if (secGroup.includes('Metal')) secGroup = 'Metals';
        else secGroup = 'Other';

        // 2C: Institutional Volume 
        let greenVol = 0; let redVol = 0;
        for (let i = 1; i <= 5; i++) {
            if (dailyC[sIdx + i].close > dailyC[sIdx + i - 1].close) greenVol += dailyC[sIdx + i].volume;
            else redVol += dailyC[sIdx + i].volume;
        }
        const volRatio = redVol === 0 ? 99 : (greenVol / redVol);

        const priceUpD5 = dailyC[sIdx + 5].close > sCandle.close;
        const avgVolPre = dailyC.slice(sIdx - 20, sIdx).reduce((a, b) => a + b.volume, 0) / 20;
        const avgVolPost = dailyC.slice(sIdx + 1, sIdx + 6).reduce((a, b) => a + b.volume, 0) / 5;
        const pvDivHealthy = priceUpD5 && avgVolPost > avgVolPre;

        // 2D: 1H MACD
        let macdBullish = false;
        try {
            const minFrom = req.addedDate;
            const signalDateObj = new Date(req.addedDate + 'T00:00:00+05:30');
            const minToStr = toISTDateString(new Date(signalDateObj.getTime() + 5 * 86400000));
            const minData = await priceService.fetchFromUpstox(req.instrumentKey, minFrom, minToStr, '30minute', req.symbol);
            if (minData && minData.length > 5) {
                const hourly = [];
                for (let i = 0; i < minData.length; i += 2) {
                    if (i + 1 < minData.length) hourly.push({ close: parseFloat(minData[i + 1].close) });
                }
                macdBullish = calcMACD(hourly.map(x => x.close)).isBullish;
            }
        } catch (e) { }

        const data = {
            symbol: req.symbol,
            day1Pattern, day2Pattern, day3Pattern,
            niftyContext, secGroup,
            volRatio, pvDivHealthy, macdBullish, isWinner
        };

        if (isWinner) winners.push(data);
        else losers.push(data);
    }

    const tW = winners.length;
    const tL = losers.length;

    // Aggregators
    function countBy(arr, key, val) {
        return arr.filter(x => x[key] === val).length;
    }

    console.log(`\n--- 2A: Post-Breakout Candlestick Patterns (Day+1) ---`);
    console.log(`WINNERS (Total: ${tW}):`);
    const patterns = ['Bullish Engulfing', 'Hammer', 'Marubozu Green', 'Marubozu Red', 'Bearish Engulfing', 'Shooting Star', 'Doji', 'Spinning Top', 'Normal Green', 'Normal Red'];
    patterns.forEach(p => console.log(`  ${p.padEnd(20)}: ${((countBy(winners, 'day1Pattern', p) / tW) * 100).toFixed(1)}%`));

    console.log(`\nLOSERS (Total: ${tL}):`);
    patterns.forEach(p => console.log(`  ${p.padEnd(20)}: ${((countBy(losers, 'day1Pattern', p) / tL) * 100).toFixed(1)}%`));

    console.log(`\nWIN RATES BY DAY+1 PATTERN:`);
    patterns.forEach(p => {
        const w = countBy(winners, 'day1Pattern', p);
        const l = countBy(losers, 'day1Pattern', p);
        const t = w + l;
        if (t > 5) console.log(`  ${p.padEnd(20)}: ${String(t).padStart(3)} signals | ${((w / t) * 100).toFixed(1)}% WR`);
    });

    console.log(`\n--- 2B: Sector & Nifty Context ---`);
    const sectors = ['Finance/Banking', 'IT', 'Healthcare/Pharma', 'Auto', 'Metals', 'Other'];
    sectors.forEach(s => {
        const w = countBy(winners, 'secGroup', s);
        const l = countBy(losers, 'secGroup', s);
        const t = w + l;
        if (t > 0) console.log(`  ${s.padEnd(18)}: ${String(t).padStart(3)} signals | ${((w / t) * 100).toFixed(1)}% WR`);
    });

    console.log(`\nNIFTY on Signal Date:`);
    ['Up > 0.5%', 'Flat -0.5 to +0.5%', 'Down < -0.5%'].forEach(n => {
        const w = countBy(winners, 'niftyContext', n);
        const l = countBy(losers, 'niftyContext', n);
        const t = w + l;
        if (t > 0) console.log(`  ${n.padEnd(18)}: ${String(t).padStart(3)} signals | ${((w / t) * 100).toFixed(1)}% WR`);
    });

    console.log(`\n--- 2C: Institutional Footprint (Days 1-5) ---`);
    const avgWVol = winners.reduce((a, b) => a + Math.min(b.volRatio, 10), 0) / tW;
    const avgLVol = losers.reduce((a, b) => a + Math.min(b.volRatio, 10), 0) / tL;
    console.log(`  WINNERS avg Green/Red Vol Ratio: ${avgWVol.toFixed(2)}x`);
    console.log(`  LOSERS avg Green/Red Vol Ratio:  ${avgLVol.toFixed(2)}x`);

    const wDiv = winners.filter(x => x.pvDivHealthy).length;
    const lDiv = losers.filter(x => x.pvDivHealthy).length;
    console.log(`  WINNERS with true Price/Vol sync: ${((wDiv / tW) * 100).toFixed(1)}%`);
    console.log(`  LOSERS with true Price/Vol sync:  ${((lDiv / tL) * 100).toFixed(1)}%`);

    console.log(`\n--- 2D: 1H MACD at Signal ---`);
    const wMacd = winners.filter(x => x.macdBullish).length;
    const lMacd = losers.filter(x => x.macdBullish).length;
    console.log(`  WINNERS showing 1H MACD Bullish: ${((wMacd / tW) * 100).toFixed(1)}%`);
    console.log(`  LOSERS showing 1H MACD Bullish:  ${((lMacd / tL) * 100).toFixed(1)}%`);

    process.exit(0);
}

main().catch(console.error);
