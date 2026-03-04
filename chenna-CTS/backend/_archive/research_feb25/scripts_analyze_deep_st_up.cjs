const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../results/deep_analysis_st_up_data.json');
const REPORT_FILE = path.join(__dirname, '../results/st_swing_bo_up_deep_analysis.md');
const STRATEGY_FILE = path.join(__dirname, '../results/st_swing_bo_up_strategy_rules.md');

function calculateRSI(candles, period = 14) {
    if (candles.length < period + 1) return 50;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const change = candles[candles.length - i].close - candles[candles.length - i - 1].close;
        if (change > 0) gains += change;
        else losses += Math.abs(change);
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + (avgGain / avgLoss)));
}

function calculateSMA(candles, period) {
    if (candles.length < period) return null;
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += candles[candles.length - 1 - i].close;
    }
    return sum / period;
}

function analyzeStats() {
    console.log('Starting Deep Analysis ST_SWING_BO_UP...');
    if (!fs.existsSync(DATA_FILE)) {
        console.log('Data file not found yet');
        return;
    }
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    const reports = [];
    // Segments
    const segments = {
        'FRESH_BREAKOUT': { count: 0, wins: 0, pnl: 0, max_up: 0, max_down: 0 },
        'EXTENDED_RALLY': { count: 0, wins: 0, pnl: 0, max_up: 0, max_down: 0 },
        'COUNTER_TREND': { count: 0, wins: 0, pnl: 0, max_up: 0, max_down: 0 },
        'OTHER': { count: 0, wins: 0, pnl: 0, max_up: 0, max_down: 0 }
    };

    let mdContent = '# Deep Analysis: SHORT_TERM_SWING_BO_UP\n\n';

    Object.keys(data).forEach(symbol => {
        const stockData = data[symbol];
        if (stockData.error || !stockData.daily || stockData.daily.length === 0) return;

        // SORT ASCENDING
        const daily = stockData.daily.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const weekly = stockData.weekly ? stockData.weekly.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)) : [];
        const nifty = stockData.nifty ? stockData.nifty.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)) : [];
        const addedDate = stockData.addedDate.split('T')[0];

        // Find Signal Index
        let signalIdx = -1;
        // Match exact or closest prior date
        for (let i = 0; i < daily.length; i++) {
            if (daily[i].timestamp.startsWith(addedDate)) {
                signalIdx = i; break;
            }
        }

        // Safety check range
        if (signalIdx === -1 || signalIdx < 20 || signalIdx >= daily.length - 5) return;

        const day0 = daily[signalIdx];
        const day5 = daily[signalIdx + 5]; // Outcome Day

        // --- METRICS ---

        // 1. Prior Move (20d)
        const dayMinus20 = daily[signalIdx - 20];
        const priorMove20 = ((day0.close - dayMinus20.close) / dayMinus20.close) * 100;

        // 2. Prior Move (5d)
        const dayMinus5 = daily[signalIdx - 5];
        const priorMove5 = ((day0.close - dayMinus5.close) / dayMinus5.close) * 100;

        // 3. RSI
        const priors = daily.slice(0, signalIdx + 1);
        const rsi = calculateRSI(priors, 14);

        // 4. Volume Ratio
        let volSum = 0;
        for (let k = 1; k <= 20; k++) volSum += daily[signalIdx - k].volume;
        const avgVol = volSum / 20;
        const volRatio = day0.volume / (avgVol || 1);

        // 5. Nifty Trend
        let niftyTrend = 'UNKNOWN';
        // (Simplified Nifty check)

        // --- OUTCOME ---
        const pnl5 = ((day5.close - day0.close) / day0.close) * 100;
        const isWin = pnl5 > 0;

        // Max Up/Down in next 10 days (or available days)
        let maxUp = -Infinity, maxDown = Infinity;
        const future = daily.slice(signalIdx + 1, signalIdx + 11);
        future.forEach(c => {
            const chg = ((c.high - day0.close) / day0.close) * 100;
            if (chg > maxUp) maxUp = chg;
            const chgLow = ((c.low - day0.close) / day0.close) * 100;
            if (chgLow < maxDown) maxDown = chgLow;
        });
        if (future.length === 0) { maxUp = 0; maxDown = 0; }

        // --- CLASSIFICATION ---
        let cls = 'OTHER';

        // Use Weekly SMA20 for Trend (Primary Trend)
        let primaryTrend = 'UNKNOWN';
        if (weekly.length >= 20) {
            // Find weekly candle corresponding to signal date
            let wIdx = -1;
            // Weekly timestamp is usually Start of Week or End. Upstox is Start?
            // Let's find the candle that covers the signal date.
            // Simplified: Find last weekly candle before/on signal date
            for (let i = 0; i < weekly.length; i++) {
                if (weekly[i].timestamp > daily[signalIdx].timestamp) {
                    wIdx = i - 1; break;
                }
            }
            if (wIdx === -1) wIdx = weekly.length - 1; // Last one

            // Need 20 weeks prior
            if (wIdx >= 20) {
                const wPriors = weekly.slice(0, wIdx + 1);
                const wsma20 = calculateSMA(wPriors, 20);
                primaryTrend = (wsma20 && weekly[wIdx].close > wsma20) ? 'UP' : 'DOWN';
            }
        }

        // Fallback to Daily SMA20 if Weekly not available or inconclusive
        if (primaryTrend === 'UNKNOWN') {
            const dsma20 = calculateSMA(priors, 20);
            primaryTrend = (dsma20 && day0.close > dsma20) ? 'UP' : 'DOWN';
        }

        const trendUp = (primaryTrend === 'UP');

        if (!trendUp) {
            cls = 'COUNTER_TREND';
        } else {
            if (rsi > 70) cls = 'EXTENDED_RALLY';
            else cls = 'FRESH_BREAKOUT';
        }

        // --- STATS ---
        const seg = segments[cls];
        seg.count++;
        seg.pnl += pnl5;
        if (isWin) seg.wins++;
        seg.max_up += maxUp;
        seg.max_down += maxDown;

        // Report
        if (reports.length < 10) {
            reports.push(symbol);
            mdContent += `## STOCK: ${symbol} (${day0.timestamp.split('T')[0]})\n`;
            mdContent += `- **Class**: ${cls} | **RSI**: ${rsi.toFixed(1)} | **Vol**: ${volRatio.toFixed(1)}x\n`;
            mdContent += `- **Prior 20d**: ${priorMove20.toFixed(1)}% | **Prior 5d**: ${priorMove5.toFixed(1)}%\n`;
            mdContent += `- **Outcome (+5d)**: ${pnl5.toFixed(2)}%\n`;
            mdContent += `- **Max Up**: ${maxUp.toFixed(2)}% | **Max Down**: ${maxDown.toFixed(2)}%\n\n`;
        }
    });

    // Summary Table
    mdContent += `\n## Segment Summary\n\n`;
    mdContent += `| Segment | Count | Win Rate | Avg P&L | Avg Max Up | Avg Max Down | Action |\n`;
    mdContent += `|---|---|---|---|---|---|---|\n`;

    Object.keys(segments).forEach(k => {
        const s = segments[k];
        if (s.count === 0) return;
        const wr = (s.wins / s.count * 100).toFixed(1);
        const av = (s.pnl / s.count).toFixed(2);
        const avUp = (s.max_up / s.count).toFixed(2);
        const avDown = (s.max_down / s.count).toFixed(2);

        let act = 'SKIP';
        if (parseFloat(av) > 1.0) act = 'BUY';
        else if (parseFloat(av) < -1.0) act = 'SHORT';

        mdContent += `| ${k} | ${s.count} | ${wr}% | ${av}% | ${avUp}% | ${avDown}% | ${act} |\n`;
    });

    fs.writeFileSync(REPORT_FILE, mdContent);
    console.log('Reports generated at ' + REPORT_FILE);

    // Strategy Rules Placeholder
    fs.writeFileSync(STRATEGY_FILE, '# Strategy Rules (Pending Data Evaluation)\n');
}

analyzeStats();
