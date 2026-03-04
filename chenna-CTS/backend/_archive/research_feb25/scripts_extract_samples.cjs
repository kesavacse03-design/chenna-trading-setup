const fs = require('fs');
const path = require('path');

const profilesPath = path.join(__dirname, '../outputs/st_swing_bo_up_profiles.json');
const profiles = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));

console.log("=== TRADINGVIEW VERIFICATION SAMPLES ===\n");

// 1. A classic Stage 2 Winner where D+3 entry was better than D+1
const stage2Pullback = profiles.find(p =>
    p.trendStage === 'STAGE_2' &&
    p.outcome.result === 'WIN' &&
    p.outcome.bestEntryDay >= 3 && p.outcome.bestEntryDay <= 5 &&
    p.indicators.rsi14 >= 60 && p.indicators.rsi14 <= 70
);

if (stage2Pullback) {
    console.log(`EXAMPLE 1: The "Wait for Pullback" Winner`);
    console.log(`Symbol: ${stage2Pullback.symbol}`);
    console.log(`Signal Date (Added Date): ${stage2Pullback.addedDate}`);
    console.log(`Trend Stage: ${stage2Pullback.trendStage}`);
    console.log(`RSI on Signal Day: ${stage2Pullback.indicators.rsi14}`);
    console.log(`\nTimeline to verify in TradingView:`);
    console.log(`- Day 0 (Signal): ${stage2Pullback.addedDate} [Close: ${stage2Pullback.signalDay.close}]`);
    console.log(`- Day 1 Open (Blind Entry): ${stage2Pullback.after.day1.o}`);
    console.log(`- Day ${stage2Pullback.outcome.bestEntryDay} (Best Entry): Drop to low of ${stage2Pullback.outcome.bestEntryPrice}`);
    console.log(`- Day 10 Close: ${stage2Pullback.after.day10.c}`);
    console.log(`\nWhat happened: If you bought Day 1 open, you suffered drawdown. If you waited for the pullback to Day ${stage2Pullback.outcome.bestEntryDay}, you got a perfect entry before the rally to Day 10.\n`);
}

// 2. A Stage 4 Loser that the scanner caught but we should skip
const stage4Loser = profiles.find(p =>
    p.trendStage === 'STAGE_4' &&
    p.outcome.result === 'LOSS' &&
    p.after.day10 !== undefined
);

if (stage4Loser) {
    console.log(`--------------------------------------------------`);
    console.log(`EXAMPLE 2: The "Stage 4 Value Trap" Loser`);
    console.log(`Symbol: ${stage4Loser.symbol}`);
    console.log(`Signal Date (Added Date): ${stage4Loser.addedDate}`);
    console.log(`Trend Stage: ${stage4Loser.trendStage}`);
    console.log(`SMA50: ${stage4Loser.indicators.priceVsSMA50}% below, SMA200: ${stage4Loser.indicators.priceVsSMA200}% below`);
    console.log(`\nTimeline to verify in TradingView:`);
    console.log(`- Day 0 (Signal): ${stage4Loser.addedDate} [Close: ${stage4Loser.signalDay.close}]`);
    console.log(`- Day 1 Open (Blind Entry): ${stage4Loser.after.day1.o}`);
    console.log(`- Day 10 Close: ${stage4Loser.after.day10.c}`);
    console.log(`- Max Loss: ${stage4Loser.outcome.maxLoss}% on Day ${stage4Loser.after.dayOfMaxDown}`);
    console.log(`\nWhat happened: Stock popped up on scanner, but was in a long-term downtrend (Stage 4). It immediately rolled over and dumped.\n`);
}

// 3. A bloated RSI (>70) that failed
const highRSILoser = profiles.find(p =>
    p.trendStage === 'STAGE_2' &&
    p.indicators.rsi14 > 75 &&
    p.outcome.result === 'LOSS' &&
    p.after.day10 !== undefined
);

if (highRSILoser) {
    console.log(`--------------------------------------------------`);
    console.log(`EXAMPLE 3: The "Overextended" RSI > 75 Loser`);
    console.log(`Symbol: ${highRSILoser.symbol}`);
    console.log(`Signal Date (Added Date): ${highRSILoser.addedDate}`);
    console.log(`RSI on Signal Day: ${highRSILoser.indicators.rsi14}`);
    console.log(`\nTimeline to verify in TradingView:`);
    console.log(`- Day 0 (Signal): ${highRSILoser.addedDate} [Close: ${highRSILoser.signalDay.close}]`);
    console.log(`- Day 10 Close: ${highRSILoser.after.day10.c}`);
    console.log(`\nWhat happened: Stock was in Stage 2, but too overextended (RSI > 75). It exhausted buyers and faded over the next 10 days.\n`);
}
