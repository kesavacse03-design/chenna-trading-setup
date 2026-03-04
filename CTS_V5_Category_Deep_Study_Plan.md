# CTS V5 — Deep Category Study: Multi-Timeframe Analysis Plan
# For Agent Execution

---

## UNDERSTANDING: Each Category = Different Strategy

TradeCode categories are NOT all the same. Each surfaces 
stocks based on DIFFERENT market behaviors:

  ORB (INTRADAY_BOOST)      → Momentum CONTINUATION
  LOM (Loss of Momentum)    → Momentum REVERSAL  
  MULTI RESISTANCE/SUPPORT  → Multi-day BREAKOUT
  HIGH POWERED              → Sector heavyweight MOMENTUM

Using ORB strategy on LOM stocks would be WRONG.
Each needs its own analysis.

---

## STEP 0: BULK CACHE — Get the Data First

Before any analysis, we need multi-timeframe data cached.

### Task for Agent:

```javascript
// Update bulk_cache_job.cjs to fetch ALL timeframes needed:

const targetCategories = [
    'INTRADAY_BOOST',
    'HIGH_POWERED_STOCKS',
    'UPSIDE_LOM_INTRA',
    'DOWNSIDE_LOM_INTRA',
    'UPSIDE_LOM_SWING',
    'DOWNSIDE_LOM_SWING',
    'MULTI_RESISTANCE_BO',
    'MULTI_SUPPORT_BO',
    'SHORT_TERM_SWING_BO_DOWN',
    'SHORT_TERM_SWING_BO_UP',
    'LONG_TERM_SWING_BO_UP',
    'LONG_TERM_SWING_BO_DOWN'
];

// For EACH stock, fetch these intervals:
const intervals = ['30minute', 'day'];
// 15-minute: Upstox supports '15minute' interval
// Add '15minute' for LOM_INTRA stocks specifically

// API budget:
// ~150 unique stocks × 2 intervals = 300 calls
// + ~50 LOM_INTRA stocks × 1 extra (15min) = 50 calls  
// Total: ~350 calls (within 1000 limit)
```

### ALSO create synthesizer functions:

```javascript
// synthesizeCandles.cjs

function synthesize1Hour(thirtyMinCandles) {
    // Merge every 2 consecutive 30-min candles:
    // 9:15+9:45 → 9:15-10:15 (1hr candle)
    // 10:15+10:45 → 10:15-11:15 (1hr candle)
    const hourly = [];
    for (let i = 0; i < thirtyMinCandles.length - 1; i += 2) {
        const c1 = thirtyMinCandles[i];
        const c2 = thirtyMinCandles[i + 1];
        hourly.push({
            timestamp: c1.timestamp,
            open: c1.open,
            high: Math.max(c1.high, c2.high),
            low: Math.min(c1.low, c2.low),
            close: c2.close,
            volume: c1.volume + c2.volume
        });
    }
    return hourly;
}

function synthesizeWeekly(dailyCandles) {
    // Group daily candles by ISO week
    // Each week: open=Monday open, close=Friday close,
    //   high=max of week, low=min of week, vol=sum
    const weeks = {};
    for (const c of dailyCandles) {
        const d = new Date(c.date);
        const weekKey = getISOWeek(d); // e.g. "2026-W08"
        if (!weeks[weekKey]) {
            weeks[weekKey] = { 
                open: c.open, high: c.high, low: c.low, 
                close: c.close, volume: c.volume, date: c.date 
            };
        } else {
            weeks[weekKey].high = Math.max(weeks[weekKey].high, c.high);
            weeks[weekKey].low = Math.min(weeks[weekKey].low, c.low);
            weeks[weekKey].close = c.close;
            weeks[weekKey].volume += c.volume;
        }
    }
    return Object.values(weeks);
}

function calcRSI(candles, period = 14) {
    // Standard RSI calculation
    if (candles.length < period + 1) return [];
    const rsi = [];
    let avgGain = 0, avgLoss = 0;
    
    for (let i = 1; i <= period; i++) {
        const change = candles[i].close - candles[i-1].close;
        if (change > 0) avgGain += change;
        else avgLoss += Math.abs(change);
    }
    avgGain /= period;
    avgLoss /= period;
    rsi.push({ 
        date: candles[period].date || candles[period].timestamp, 
        value: 100 - (100 / (1 + avgGain / avgLoss)) 
    });
    
    for (let i = period + 1; i < candles.length; i++) {
        const change = candles[i].close - candles[i-1].close;
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? Math.abs(change) : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi.push({ 
            date: candles[i].date || candles[i].timestamp, 
            value: 100 - (100 / (1 + rs)) 
        });
    }
    return rsi;
}

function detectDivergence(priceCandles, rsiValues, lookback = 10) {
    // Bearish divergence: price higher high + RSI lower high
    // Bullish divergence: price lower low + RSI higher low
    if (rsiValues.length < lookback) return null;
    
    const len = priceCandles.length;
    const currentPrice = priceCandles[len - 1].high;
    const currentRSI = rsiValues[rsiValues.length - 1].value;
    
    // Look back for previous swing high/low
    let prevHighPrice = -Infinity, prevHighRSI = 0;
    let prevLowPrice = Infinity, prevLowRSI = 100;
    
    for (let i = Math.max(0, len - lookback); i < len - 2; i++) {
        if (priceCandles[i].high > prevHighPrice) {
            prevHighPrice = priceCandles[i].high;
            const rsiIdx = rsiValues.findIndex(r => r.date === 
                (priceCandles[i].date || priceCandles[i].timestamp));
            if (rsiIdx >= 0) prevHighRSI = rsiValues[rsiIdx].value;
        }
        if (priceCandles[i].low < prevLowPrice) {
            prevLowPrice = priceCandles[i].low;
            const rsiIdx = rsiValues.findIndex(r => r.date === 
                (priceCandles[i].date || priceCandles[i].timestamp));
            if (rsiIdx >= 0) prevLowRSI = rsiValues[rsiIdx].value;
        }
    }
    
    // Bearish divergence
    if (currentPrice > prevHighPrice && currentRSI < prevHighRSI) {
        return { type: 'BEARISH', priceDiff: currentPrice - prevHighPrice,
                 rsiDiff: prevHighRSI - currentRSI };
    }
    // Bullish divergence
    const currentLow = priceCandles[len - 1].low;
    if (currentLow < prevLowPrice && currentRSI > prevLowRSI) {
        return { type: 'BULLISH', priceDiff: prevLowPrice - currentLow,
                 rsiDiff: currentRSI - prevLowRSI };
    }
    return null;
}

module.exports = { synthesize1Hour, synthesizeWeekly, calcRSI, detectDivergence };
```

Run the bulk cache job FIRST. Show me:
  - Total stocks cached per category
  - Total API calls used
  - Confirmation that 30m + daily + 15m data exists

---

## STUDY 1: HIGH_POWERED_STOCKS (Quick — Same ORB Strategy)

### What it is:
Heavyweight sector movers. TradeCode ranks by R-factor 
which INCLUDES sector contribution weight. These are the 
stocks DRIVING sector movement.

### Analysis Task:

```
1. Get all stocks in HIGH_POWERED_STOCKS for last 30 days
   How many unique stocks? How many stock-days?

2. Find OVERLAP with INTRADAY_BOOST:
   For each day, how many HPS stocks also appear in IB?
   What % overlap?

3. Run SAME ORB logic on HPS stocks:
   (use confirmationService.confirmIntradaySignals 
    but with category = HIGH_POWERED_STOCKS)
   
   Results needed:
   - Total setups found
   - T1 hit rate at 1:1 R:R
   - Compare: HPS-only WR vs IB-only WR vs OVERLAP WR

4. If OVERLAP stocks have higher WR:
   → Add "⭐ DUAL" badge in dashboard
   → Use as tiebreaker when selecting top 3

Output: Table showing the comparison
```

---

## STUDY 2: MULTI_RESISTANCE_BO (Swing — Multi-Day Breakout)

### What it is:
Stocks breaking above 2-day high. TradeCode says 
"analyze on BIGGER timeframe, look for reaccumulation."

### Multi-Timeframe Analysis:

```
For each stock in MULTI_RESISTANCE_BO over last 60 days:

TIMEFRAME 1: WEEKLY CHART
  - Synthesize weekly candles from daily data
  - Is the stock in a weekly uptrend? (close > 20-week SMA?)
  - Is this breakout near a weekly consolidation breakout?
  - Weekly RSI: is it above 50? (bullish territory)

TIMEFRAME 2: DAILY CHART
  - Price position vs EMAs:
    Above 20 EMA? (short-term bullish)
    Above 50 EMA? (medium-term bullish)
    Above 200 EMA? (long-term bullish)
  - Is there a consolidation pattern in last 10 days?
    (range of last 10 days < range of previous 10 days?)
  - RSI(14) on daily: between 50-70? (healthy uptrend)
  - Volume on breakout day vs 20-day avg volume

TIMEFRAME 3: 30-MIN (Entry timing)
  - After the multi-day breakout:
    Did price pull back to the breakout level within 3 days?
    If yes: "retest" entry (like our ORB retest)
    If no: "runner" entry (entered on breakout day close)

SCORING:
  Weekly uptrend (+20 pts)
  Above daily 20 EMA (+15 pts)
  Above daily 50 EMA (+10 pts)
  Consolidation breakout (+15 pts)
  RSI 50-70 (+10 pts)
  Volume spike >1.5x (+10 pts)
  Pullback to breakout level (+20 pts)
  
  Total: /100
  Tier 1: 80+ | Tier 2: 50-79 | Tier 3: <50

RESULT TRACKING:
  For each setup, track:
  - Did it hold above breakout level after 1/3/5/10 days?
  - Max favorable move in 5 days (best possible R:R)
  - Max adverse move (worst drawdown before profit)
  - Final result after 5/10 days (WIN/LOSS)

Output: 
  Win rate by tier
  Optimal holding period
  Average R-multiple
```

---

## STUDY 3: MULTI_SUPPORT_BO (Swing — Breakdown or Bounce)

### What it is:
Stocks breaking below 2-day low. TWO possible strategies:
  a) SHORT the breakdown (ride the fall)
  b) LONG the bounce (mean reversion after support breaks)

### Multi-Timeframe Analysis:

```
For each MULTI_SUPPORT_BO stock over last 60 days:

TIMEFRAME 1: WEEKLY
  - Is this in a weekly downtrend? (close < 20-week SMA)
  - If weekly downtrend → SHORT strategy (continuation)
  - If weekly uptrend → LONG bounce strategy (pullback buy)

TIMEFRAME 2: DAILY
  - Below 20 EMA? → bearish bias
  - RSI < 30? → oversold (potential bounce)
  - RSI 30-50? → weak, may continue falling
  - Volume on breakdown day

TIMEFRAME 3: 30-MIN
  - After breakdown: did it form a base/double bottom?
  - If yes: entry above the base high
  - If no: continued falling → SHORT opportunity

RESULT TRACKING:
  Track BOTH strategies separately:
  SHORT strategy: entry below support, stop above
  LONG bounce: entry on reclaim of support, stop below
  
  Which has better WR? Which gives better R:R?
```

---

## STUDY 4: UPSIDE_LOM_INTRA (Intraday — Reversal SHORT)

### What it is:
15-minute DIVERGENCE. Stock going UP but momentum FADING.
TradeCode uses volume contraction + OI unwinding + RSI divergence.

### Multi-Timeframe Analysis:

```
For each UPSIDE_LOM_INTRA stock over last 30 days:

TIMEFRAME 1: 15-MINUTE (Divergence detection)
  - Fetch 15-min candle data
  - Calculate RSI(14) on 15-min
  - Detect bearish divergence:
    Price making HIGHER HIGH but RSI making LOWER HIGH
  - Record: divergence strength (RSI difference)
  - Record: signal time (which 15-min candle)

TIMEFRAME 2: DAILY (Context)
  - Is stock near daily resistance level?
  - Near the day's high?
  - Has the stock already moved >2% from open?
    (significant move that could exhaust)

TIMEFRAME 3: 5-MINUTE (Entry timing)
  - After LOM signal on 15-min:
    Wait for a RED 5-min candle closing below previous low
    Entry: below that candle's low
    Stop: above the LOM high (the swing high)
    Target: 1:1 (stop distance)

BACKTEST:
  For each signal:
  1. Was RSI divergence present? (verify TradeCode's detection)
  2. After signal, did the stock reverse within 30 min?
  3. If reversed: how far did it fall? (max R:R achieved)
  4. If continued up: was the LOM signal false?
  
  Calculate:
  - LOM accuracy (% of times stock actually reversed)
  - Average reversal size (in % and R-multiple)
  - False signal rate
  - Best confirmation filters (RSI level, daily context, etc)
```

---

## STUDY 5: DOWNSIDE_LOM_INTRA (Intraday — Reversal LONG)

### What it is:
15-minute DIVERGENCE. Stock going DOWN but selling FADING.
Mirror of Study 4 but for LONG reversals.

### Same analysis as Study 4 but inverted:
```
  - Bullish divergence: price LOWER LOW + RSI HIGHER LOW
  - Entry: above the reversal candle high
  - Stop: below the LOM low
  - Track: bounce rate, average bounce size
```

---

## STUDY 6: UPSIDE_LOM_SWING (Swing — Multi-Day Reversal SHORT)

### What it is:
1-HOUR DIVERGENCE. Same concept as LOM Intra but on hourly 
→ bigger moves, multi-day holding.

### Multi-Timeframe Analysis:

```
TIMEFRAME 1: 1-HOUR (Divergence detection)
  - Synthesize 1-hour candles from 30-min data
  - Calculate RSI(14) on 1-hour
  - Detect bearish divergence on hourly
  
TIMEFRAME 2: DAILY (Trend + Key levels)
  - Where is price vs 20/50 EMA?
  - Is it near a major daily resistance?
  - How many days has the uptrend lasted?
    (longer trend = more likely to exhaust)

TIMEFRAME 3: WEEKLY (Major context)
  - Near weekly resistance?
  - Weekly RSI > 70? (overbought on weekly = strong reversal)

ENTRY LOGIC:
  Trigger: 1-hour bearish divergence confirmed
  Confirm: Daily close below the 5-EMA (fast trend break)
  Entry: Below the LOM day's low
  Stop: Above the LOM high
  Target: 20 EMA on daily (mean reversion)
  Hold: 3-10 days

RESULT TRACKING:
  - Track for 10 trading days after signal
  - Did the stock reverse within 3 days?
  - How far did it fall?
  - What was the optimal exit point?
```

---

## STUDY 7: DOWNSIDE_LOM_SWING (Swing — Multi-Day Bounce LONG)

### What it is:
1-hour DIVERGENCE. Stock in multi-day downtrend but selling 
fading on hourly. Similar to our existing ST_SWING_DOWN 
mean reversion but with divergence confirmation.

### This is essentially an ENHANCED version of what we already built.

```
Compare:
  Our ST_SWING_DOWN strategy (SMA-based mean reversion)
  vs
  DOWNSIDE_LOM_SWING (divergence-based reversal)
  
  If LOM adds edge on top of our existing strategy,
  use LOM as an ADDITIONAL confirmation factor.
```

---

## EXECUTION ORDER FOR AGENT

```
DAY 1: BULK CACHE + SYNTHESIZERS
  □ Update bulk_cache_job with all categories
  □ Add 15-minute interval for LOM_INTRA stocks  
  □ Create synthesizeCandles.cjs (1hr, weekly, RSI, divergence)
  □ Run bulk cache job
  □ Show: stocks cached per category, API calls used

DAY 2: HIGH_POWERED_STOCKS ANALYSIS
  □ Overlap analysis with IB
  □ Run ORB backtest on HPS
  □ Compare WR: HPS vs IB vs OVERLAP
  □ Decision: merge, separate, or use as tiebreaker

DAY 3: MULTI_RESISTANCE_BO + MULTI_SUPPORT_BO
  □ Weekly + Daily + 30m multi-timeframe analysis
  □ Score each setup
  □ Track 5-day and 10-day outcomes
  □ Calculate WR by tier and optimal holding period

DAY 4: LOM_INTRA (Both Upside and Downside)
  □ 15-min RSI divergence verification
  □ Backtest reversal entries
  □ Calculate LOM accuracy and false signal rate
  □ Identify best filters

DAY 5: LOM_SWING (Both Upside and Downside)
  □ 1-hour RSI divergence on synthesized candles
  □ Daily + Weekly context analysis
  □ Compare DOWNSIDE_LOM_SWING with ST_SWING_DOWN
  □ Multi-day outcome tracking

DAY 6: COMPILE RESULTS
  □ Create category_analysis_results.md
  □ For EACH category show:
    - Sample size (how many setups)
    - Win rate at 1:1 R:R
    - Best confirming factors
    - Recommended strategy parameters
    - Whether to ACTIVATE or HOLD
  □ Update Controller page with status per category
```

---

## IMPORTANT PRINCIPLE

"Don't try to trade all categories simultaneously.
Master one, then add another."

Current mastered: INTRADAY_BOOST ✅
Next to validate: HIGH_POWERED_STOCKS (same strategy)
Then: MULTI_RESISTANCE_BO (different strategy, swing)
Then: LOM categories (reversal, completely different)

Only ACTIVATE a category in the Controller after 
backtesting proves it works with acceptable WR.
