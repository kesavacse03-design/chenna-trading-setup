const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../results/deep_analysis_data.json');
const REPORT_FILE = path.join(__dirname, '../results/stock_deep_analysis_reports.md');
const SEGMENT_FILE = path.join(__dirname, '../results/segmented_results_summary.md');
const MARKET_FILE = path.join(__dirname, '../results/market_context_analysis.md');
const RULES_FILE = path.join(__dirname, '../results/strategy_rules_v2.md');

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
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
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
    console.log('Starting Analysis...');
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    // Flatten Nifty data for easy lookup
    // Assuming first key with 'NIFTY' is nifty data or it was stored separately?
    // In fetch script: results[stock.symbol] = {nifty: ...}
    // So each stock has its own nifty slice. Good.

    const reports = [];
    const segments = {
        'OVERSOLD_REVERSAL': { count: 0, wins: 0, pnl: 0 },
        'DIP_IN_UPTREND': { count: 0, wins: 0, pnl: 0 },
        'TREND_CONT_DOWN': { count: 0, wins: 0, pnl: 0 },
        'NOISE': { count: 0, wins: 0, pnl: 0 }
    };

    const marketStats = {
        'NIFTY_UP': { count: 0, wins: 0, pnl: 0 },
        'NIFTY_DOWN': { count: 0, wins: 0, pnl: 0 }
    };

    let detailedReportsMd = '# Deep Stock Analysis Reports\n\n';

    Object.keys(data).forEach(symbol => {
        const stockData = data[symbol];
        if (stockData.error || !stockData.daily || stockData.daily.length === 0) return;

        // SORT ASCENDING (Oldest first)
        const daily = stockData.daily.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const weekly = stockData.weekly ? stockData.weekly.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)) : [];
        const nifty = stockData.nifty ? stockData.nifty.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)) : [];
        const addedDate = stockData.addedDate.split('T')[0];

        // Find Index of Signal Date in Daily
        let signalIdx = -1;
        for (let i = 0; i < daily.length; i++) {
            if (daily[i].timestamp.startsWith(addedDate)) {
                signalIdx = i; break;
            }
        }

        if (signalIdx === -1 || signalIdx < 20 || signalIdx >= daily.length - 5) return; // Need prior & future

        // --- METRICS ---

        // 1. Stock Trend (Daily 50 SMA - rough proxy if enough data)
        const priorCandles = daily.slice(0, signalIdx + 1); // Up to signal
        const sma50 = calculateSMA(priorCandles, 50);
        const price = daily[signalIdx].close;
        const stockTrend = (sma50 && price > sma50) ? 'UP' : 'DOWN';

        // Weekly Trend
        // Find weekly candle confirming date
        // ... (complex, skip for now, focus on Daily SMA50 as primary trend proxy)

        // 2. RSI
        const rsi = calculateRSI(priorCandles, 14);

        // 3. Prior Move (20 days)
        const dayMinus20 = daily[signalIdx - 20];
        const priorMove = ((price - dayMinus20.close) / dayMinus20.close) * 100;

        // 4. Volume Ratio
        let volSum = 0;
        for (let k = 1; k <= 20; k++) volSum += daily[signalIdx - k].volume;
        const avgVol = volSum / 20;
        const volRatio = daily[signalIdx].volume / (avgVol || 1);

        // 5. Nifty Trend
        // Find Nifty price on signal date
        let niftyTrend = 'UNKNOWN';
        if (nifty && nifty.length > 0) {
            // Find matching date
            const nCandle = nifty.find(n => n.timestamp.startsWith(addedDate));
            if (nCandle) {
                // Calculate Nifty SMA50? we assume fetched -30 to +15. 
                // We don't have enough history for Nifty SMA50 if we only fetched -30.
                // We'll use SMA20 for Nifty short term trend.
                // Actually the fetch script fetched -40 days.
                // So we can do SMA20.
                // Or just Price vs Start of Period?
                // Let's use SMA20 logic on nifty array.
                // Find index in nifty array
                const nIdx = nifty.findIndex(n => n.timestamp.startsWith(addedDate));
                if (nIdx >= 20) {
                    let nSum = 0;
                    for (let k = 0; k < 20; k++) nSum += nifty[nIdx - k].close;
                    niftyTrend = nCandle.close > (nSum / 20) ? 'UP' : 'DOWN';
                }
            }
        }

        // --- OUTCOME ---
        const day0 = daily[signalIdx];
        const day1 = daily[signalIdx + 1];
        const day5 = daily[signalIdx + 5];
        if (!day5) return;

        const pnl5 = ((day5.close - day0.close) / day0.close) * 100;
        const win = pnl5 > 0;

        // --- SEGMENTATION ---
        let cls = 'NOISE';
        if (stockTrend === 'UP') {
            if (priorMove < -10 && rsi < 35) cls = 'OVERSOLD_REVERSAL';
            else if (priorMove >= -10 && priorMove < -3) cls = 'DIP_IN_UPTREND'; // Adjusted range
        } else {
            cls = 'TREND_CONT_DOWN';
        }

        // --- AGGREGATE ---
        segments[cls].count++;
        segments[cls].pnl += pnl5;
        if (win) segments[cls].wins++;

        const mktKey = niftyTrend === 'UP' ? 'NIFTY_UP' : 'NIFTY_DOWN';
        marketStats[mktKey].count++;
        marketStats[mktKey].pnl += pnl5;
        if (win) marketStats[mktKey].wins++;

        // --- REPORTING ---
        if (reports.length < 10) { // Keep first 10 reports
            detailedReportsMd += `## STOCK: ${symbol} (${daily[signalIdx].timestamp.split('T')[0]})\n`;
            detailedReportsMd += `- **Class**: ${cls}\n`;
            detailedReportsMd += `- **Context**: Nifty ${niftyTrend} | Stock Trend ${stockTrend}\n`;
            detailedReportsMd += `- **Setup**: RSI ${rsi.toFixed(1)} | Prior Move ${priorMove.toFixed(1)}% | Vol ${volRatio.toFixed(1)}x\n`;
            detailedReportsMd += `- **Outcome (+5d)**: ${pnl5 > 0 ? '+' : ''}${pnl5.toFixed(2)}%\n`;
            detailedReportsMd += `\n`;
            reports.push(symbol);
        }
    });

    fs.writeFileSync(REPORT_FILE, detailedReportsMd);

    // Segmented Summary
    let segMd = '| Segment | Count | Win Rate | Avg P&L | Action |\n|---|---|---|---|---|\n';
    Object.keys(segments).forEach(k => {
        const s = segments[k];
        if (s.count === 0) return;
        const wr = (s.wins / s.count * 100).toFixed(1);
        const av = (s.pnl / s.count).toFixed(2);
        let act = 'SKIP';
        if (parseFloat(av) > 2) act = 'STRONG BUY';
        else if (parseFloat(av) > 0.5) act = 'BUY';

        segMd += `| ${k} | ${s.count} | ${wr}% | ${av}% | ${act} |\n`;
    });
    fs.writeFileSync(SEGMENT_FILE, segMd);

    // Market Context
    let mktMd = '| Condition | Count | Win Rate | Avg P&L |\n|---|---|---|---|\n';
    Object.keys(marketStats).forEach(k => {
        const s = marketStats[k];
        if (s.count === 0) return;
        const wr = (s.wins / s.count * 100).toFixed(1);
        const av = (s.pnl / s.count).toFixed(2);
        mktMd += `| ${k} | ${s.count} | ${wr}% | ${av}% |\n`;
    });
    fs.writeFileSync(MARKET_FILE, mktMd);

    // Rules V2
    let rulesMd = '# Strategy Rules V2 (Data-Driven)\n\n based on analysis...\n';
    // Logic to fill this based on best segment
    fs.writeFileSync(RULES_FILE, rulesMd);

    console.log('Analysis Complete. Reports generated.');
}

analyzeStats();
