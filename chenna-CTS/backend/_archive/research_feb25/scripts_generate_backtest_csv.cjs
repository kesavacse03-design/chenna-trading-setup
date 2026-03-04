const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '../results');
const JSON_PATH = path.join(RESULTS_DIR, 'intraday_full_results.json');
const CSV_PATH = path.join(RESULTS_DIR, 'intraday_backtest_verified.csv');

function generateCSV() {
    if (!fs.existsSync(JSON_PATH)) {
        console.error(`❌ JSON results not found at: ${JSON_PATH}`);
        return;
    }

    try {
        const raw = fs.readFileSync(JSON_PATH, 'utf8');
        const data = JSON.parse(raw);

        const allTrades = [];

        // Extract trades from all strategies
        for (const [strategyName, stats] of Object.entries(data.strategies)) {
            if (stats.trades && Array.isArray(stats.trades)) {
                stats.trades.forEach(t => {
                    // Normalize fields
                    const date = t.signalDate || t.date || (t.timestamp ? t.timestamp.split('T')[0] : 'N/A');
                    const time = t.timestamp ? t.timestamp.split('T')[1].substring(0, 5) : 'N/A';

                    allTrades.push({
                        Strategy: strategyName,
                        Date: date,
                        Time: time,
                        Symbol: t.symbol,
                        Direction: t.direction || 'LONG', // Default to LONG if missing
                        EntryPrice: t.entryPrice,
                        ExitPrice: t.exitPrice,
                        ExitTime: t.exitTime || (t.exitReason === 'EOD_EXIT' ? (t.eodExit || '15:15') : '-'),
                        ExitReason: t.exitReason,
                        PnL_Percent: typeof t.pnlPercent === 'number' ? t.pnlPercent.toFixed(2) + '%' : t.pnlPercent, // Keep raw if string
                        PnL_Amount: typeof t.pnl === 'number' ? t.pnl.toFixed(2) : t.pnl,
                        Outcome: t.outcome,
                        Confidence: t.confidence || '-',
                        Reason: (t.reason || '').replace(/,/g, ';') // Escape commas for CSV
                    });
                });
            }
        }

        // Sort by Date, then Strategy, then Time
        allTrades.sort((a, b) => {
            if (a.Date !== b.Date) return a.Date.localeCompare(b.Date);
            if (a.Strategy !== b.Strategy) return a.Strategy.localeCompare(b.Strategy);
            return a.Time.localeCompare(b.Time);
        });

        // Generate CSV Content
        const headers = [
            'Date', 'Time', 'Strategy', 'Symbol', 'Direction',
            'Entry Price', 'Exit Price', 'Exit Time', 'Exit Reason',
            'PnL %', 'PnL Amount', 'Outcome', 'Confidence', 'Reason'
        ];

        const csvRows = [headers.join(',')];

        for (const t of allTrades) {
            const row = [
                t.Date,
                t.Time,
                t.Strategy,
                t.Symbol,
                t.Direction,
                t.EntryPrice,
                t.ExitPrice,
                t.ExitTime,
                t.ExitReason,
                t.PnL_Percent,
                t.PnL_Amount,
                t.Outcome,
                t.Confidence,
                `"${t.Reason}"` // Quote the reason field
            ];
            csvRows.push(row.join(','));
        }

        fs.writeFileSync(CSV_PATH, csvRows.join('\n'));
        console.log(`✅ CSV Report generated successfully!`);
        console.log(`📂 Path: ${CSV_PATH}`);
        console.log(`📊 Total Trades: ${allTrades.length}`);

    } catch (e) {
        console.error('❌ Failed to generate CSV:', e);
    }
}

generateCSV();
