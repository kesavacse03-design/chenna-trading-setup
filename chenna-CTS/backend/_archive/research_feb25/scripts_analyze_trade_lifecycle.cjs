const fs = require('fs');
const path = require('path');

const DOWN_FILE = path.join(__dirname, '../results/deep_analysis_data.json');
const UP_FILE = path.join(__dirname, '../results/deep_analysis_st_up_data.json');

function analyzeLifecycle(categoryName, filePath, targetPct, stopPct) {
    if (!fs.existsSync(filePath)) { console.log(`No data for ${categoryName}`); return; }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    let totalTrades = 0;
    let entryDay1 = 0, entryDay2 = 0, entryDay3 = 0, entryLater = 0;
    let hitTarget = 0, hitStop = 0, hitTimeExit = 0;
    let daysToTargetSum = 0, daysToStopSum = 0;

    console.log(`\nAnalyzing ${categoryName} (Target: ${targetPct}%, Stop: ${stopPct}%)`);

    Object.values(data).forEach(stock => {
        if (!stock.daily) return;
        const daily = stock.daily.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Find Signal Date
        const addedDate = stock.addedDate.split('T')[0];
        const idx = daily.findIndex(c => c.timestamp.startsWith(addedDate));
        if (idx === -1 || idx >= daily.length - 1) return;

        totalTrades++;

        // Check Weekly Trend (Simple approximation if weekly data exists)
        let trendUp = false;
        if (stock.weekly && stock.weekly.length > 0) {
            const weekly = stock.weekly.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            let wIdx = -1;
            for (let k = 0; k < weekly.length; k++) {
                if (weekly[k].timestamp > daily[idx].timestamp) {
                    wIdx = k - 1; break;
                }
            }
            if (wIdx === -1) wIdx = weekly.length - 1;

            if (wIdx >= 20) {
                let sum = 0;
                for (let j = 0; j < 20; j++) sum += weekly[wIdx - j].close;
                const sma20 = sum / 20;
                if (weekly[wIdx].close > sma20) trendUp = true;
            }
        } else {
            // If no weekly data, assume false or skip?
            // For ST_DOWN we might not have weekly data in old file.
            // But for ST_UP we do.
            if (categoryName === 'ST_SWING_BO_UP') trendUp = false;
            else trendUp = true; // Fallback for DOWN if data missing
        }

        if (categoryName === 'ST_SWING_BO_UP' && !trendUp) return; // FILTER STRICTLY


        const signalClose = daily[idx].close;

        // Check Entry Opportunities (Day 1 to 5)
        // Assume we want to enter near Signal Close or better (Pullback)
        // Or just Next Day Open (Simpler)
        // User asked: "Best entry day?"
        // Let's see if price dipped below Signal Close in next few days
        const day1 = daily[idx + 1];
        if (!day1) return;

        // Simulation: Enter Next Open
        const entryPrice = day1.open;

        // Track Trade Result
        let result = 'HOLD';
        let daysHeld = 0;

        for (let i = 1; i <= 10; i++) { // Max 10 days hold
            const day = daily[idx + i];
            if (!day) break;
            daysHeld = i;

            // Check High for Target
            const highPct = ((day.high - entryPrice) / entryPrice) * 100;
            // Check Low for Stop
            const lowPct = ((day.low - entryPrice) / entryPrice) * 100;

            // Conservative: Assume Stop hit first if both hit same day? 
            // Or use OHLC logic.
            // If Open is between SL and TP, check Low < SL first.
            if (lowPct <= -stopPct) {
                result = 'STOP';
                daysToStopSum += i;
                hitStop++;
                break;
            }
            if (highPct >= targetPct) {
                result = 'TARGET';
                daysToTargetSum += i;
                hitTarget++;
                break;
            }
        }

        if (result === 'HOLD') hitTimeExit++;
    });

    console.log(`Trades Analyzed: ${totalTrades}`);
    console.log(`Target Hit: ${hitTarget} (${((hitTarget / totalTrades) * 100).toFixed(1)}%)`);
    console.log(`Stop Hit: ${hitStop} (${((hitStop / totalTrades) * 100).toFixed(1)}%)`);
    console.log(`Time Exit (10d): ${hitTimeExit} (${((hitTimeExit / totalTrades) * 100).toFixed(1)}%)`);

    if (hitTarget > 0) console.log(`Avg Days to Target: ${(daysToTargetSum / hitTarget).toFixed(1)}`);
    if (hitStop > 0) console.log(`Avg Days to Stop: ${(daysToStopSum / hitStop).toFixed(1)}`);
}

// Params based on V2 Strategy
analyzeLifecycle('ST_SWING_BO_DOWN', DOWN_FILE, 5.0, 3.0); // Target 5%, Stop 3%
analyzeLifecycle('ST_SWING_BO_UP', UP_FILE, 6.0, 4.0);     // Target 6%, Stop 4%
