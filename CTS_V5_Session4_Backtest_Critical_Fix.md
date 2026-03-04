# CTS V5 — Session 4 CRITICAL FIX: Backtest Logic Mismatch

> **For Agent: READ THIS ENTIRE DOCUMENT BEFORE WRITING ANY CODE.**
> 
> This is a RECURRING bug that has been "fixed" 4 times and keeps coming back.
> The root cause is NOT a simple code fix — it's a fundamental architecture problem.
> The backtest engine and the live signal engine are TWO DIFFERENT CODE PATHS
> that produce DIFFERENT results. They MUST use the EXACT SAME logic.

---

## THE CORE PROBLEM (Read Carefully)

There are TWO systems that should produce identical results but DON'T:

```
SYSTEM A: Live Signal Generator (runs during market hours)
  - Scans IB stocks every 1 minute
  - Detects Opening Range (first opposite-color candle method)
  - Detects breakout (30-min candle close outside OR)
  - Detects retest or runner
  - Generates ONE signal per stock per day
  - Tracks outcome (T1/T2/Stop) using 1-minute candles
  - Results match TradingView Pine Script ✅

SYSTEM B: Backtest / EOD Analysis (runs after market or on historical data)
  - SHOULD replay the exact same logic on historical data
  - BUT: Uses different candle intervals (30-min instead of 1-min)
  - BUT: Uses different outcome detection (stop checked before T1)
  - BUT: May generate multiple signals per stock per day
  - BUT: May use different OR calculation
  - Results DO NOT match TradingView ❌
```

**The ONLY acceptable fix is: System B must call System A's functions directly.** Not reimplementing them. Not "similar" logic. The SAME function.

---

## THE ARCHITECTURE FIX

### Current (BROKEN):
```
Live Scanner → intradayStrategyV2_1.cjs → signal generation logic
Backtest     → backtestReplayService.cjs → DIFFERENT reimplemented logic
EOD Analysis → eodReportService.cjs → ANOTHER different reimplementation
EOD Sim      → eodSimulationService.cjs → YET ANOTHER reimplementation
```

Four separate implementations of the same logic = four places for bugs.

### Required (CORRECT):
```
SHARED CORE: signalEngine.cjs
  ├─ detectOpeningRange(candles1min) → { orHigh, orLow, orFormed, orEndBar }
  ├─ detectBreakout(candles1min, or) → { direction, breakoutBar, type }
  ├─ detectEntry(candles1min, breakout) → { entryPrice, stop, t1, t2 }
  ├─ evaluateOutcome(candles1min, signal) → { outcome, exitPrice, exitBar, rMultiple }
  └─ processStock(symbol, date, candles1min) → { signal or null, outcome }

Live Scanner → calls signalEngine.processStock() with LIVE 1-min candles
Backtest     → calls signalEngine.processStock() with HISTORICAL 1-min candles  
EOD Analysis → calls signalEngine.evaluateOutcome() with stored signal + 1-min candles
```

ONE implementation. THREE callers. Results are ALWAYS identical.

---

## STEP-BY-STEP IMPLEMENTATION

### Step 1: Create the Shared Signal Engine

```
File: backend/services/signalEngine.cjs

This file contains ALL the trading logic in pure functions.
No database calls. No API calls. Just candle data in, signal/outcome out.

/**
 * Process a single stock for a single day.
 * 
 * @param {Array} candles1min - Array of 1-minute OHLCV candles for the day
 *   Each candle: { timestamp, open, high, low, close, volume }
 *   Timestamps must be in IST (or converted before calling)
 *   Must cover 9:15 AM to 3:30 PM
 * 
 * @param {Object} prevDay - Previous day's OHLCV data
 *   { open, high, low, close, volume }
 * 
 * @returns {Object|null}
 *   null if no valid signal
 *   { signal: {...}, outcome: {...} } if signal found
 */
function processStock(candles1min, prevDay) {
  // PHASE 1: Detect Opening Range
  const or = detectOpeningRange(candles1min);
  if (!or.formed) return null;
  
  // PHASE 2: Check OR validity
  if (or.rangePercent > 3.0) return null;  // Too wide, skip
  if (or.rangePercent < 0.3) return null;  // Too narrow, skip
  
  // PHASE 3: Detect breakout after OR
  const breakout = detectBreakout(candles1min, or);
  if (!breakout.found) return null;
  
  // PHASE 4: Detect entry (retest or runner)
  const entry = detectEntry(candles1min, or, breakout);
  if (!entry.found) return null;
  
  // PHASE 5: Evaluate outcome
  const outcome = evaluateOutcome(candles1min, entry);
  
  return {
    signal: {
      direction: breakout.direction,
      type: entry.type,  // 'RETEST' or 'RUNNER'
      entryPrice: entry.price,
      stopPrice: entry.stop,
      t1Price: entry.t1,
      t2Price: entry.t2,
      entryBar: entry.barIndex,
      entryTime: entry.time,
      orHigh: or.high,
      orLow: or.low,
      orRangePercent: or.rangePercent,
      riskPercent: entry.riskPercent,
      score: calculateScore(candles1min, or, breakout, entry, prevDay)
    },
    outcome: {
      result: outcome.result,  // 'T1_HIT', 'T2_HIT', 'STOP_HIT', 'EOD_CLOSE'
      exitPrice: outcome.exitPrice,
      exitTime: outcome.exitTime,
      rMultiple: outcome.rMultiple,
      maxFavorable: outcome.maxFavorable,  // Best price reached
      maxAdverse: outcome.maxAdverse       // Worst price reached
    }
  };
}
```

### Step 2: Opening Range Detection (MUST match Pine Script)

```
/**
 * Detect Opening Range using the "first opposite color candle" method.
 * NOT a fixed time window. OR ends when the first candle of opposite 
 * color appears after market open.
 * 
 * Example (bullish open):
 *   9:15 Green candle → OR extends
 *   9:20 Green candle → OR extends
 *   9:25 RED candle → OR IS NOW SET
 *   OR High = highest high of candles 9:15-9:25
 *   OR Low = lowest low of candles 9:15-9:25
 */
function detectOpeningRange(candles1min) {
  // Get candles from 9:15 to 9:45 (max OR period)
  const orCandles = candles1min.filter(c => {
    const t = getISTTime(c.timestamp);
    return t.hours === 9 && t.minutes >= 15 && t.minutes < 45;
  });
  
  if (orCandles.length === 0) return { formed: false };
  
  // First candle determines initial color
  const firstCandle = orCandles[0];
  const isFirstGreen = firstCandle.close >= firstCandle.open;
  
  let orEndIndex = 0;
  let orHigh = firstCandle.high;
  let orLow = firstCandle.low;
  
  // Walk forward until opposite color candle appears
  for (let i = 1; i < orCandles.length; i++) {
    const candle = orCandles[i];
    const isGreen = candle.close >= candle.open;
    
    // Update OR boundaries
    orHigh = Math.max(orHigh, candle.high);
    orLow = Math.min(orLow, candle.low);
    orEndIndex = i;
    
    // Opposite color candle found → OR is set
    if (isGreen !== isFirstGreen) {
      break;
    }
  }
  
  // NOTE: The above uses 1-minute candles. If the live system uses
  // 5-minute candles for OR detection, change the filter accordingly.
  // The key is: BOTH live and backtest use the SAME candle interval.
  
  const rangePercent = ((orHigh - orLow) / orLow) * 100;
  
  return {
    formed: true,
    high: orHigh,
    low: orLow,
    rangePercent,
    endIndex: orEndIndex,
    endTime: getISTTime(orCandles[orEndIndex].timestamp)
  };
}
```

### Step 3: Breakout Detection

```
/**
 * Detect breakout: a candle CLOSES outside the OR after OR is set.
 * 
 * For the Pine Script, this uses 5-minute candles (30-min in some versions).
 * CRITICAL: Use the same interval as live system.
 */
function detectBreakout(candles1min, or) {
  // Get candles AFTER OR formation until 2:30 PM (no signals after that)
  const postOrCandles = candles1min.filter(c => {
    const idx = candles1min.indexOf(c);
    const t = getISTTime(c.timestamp);
    return idx > or.endIndex && t.hours < 15;
  });
  
  // Aggregate to 5-minute candles if that's what the live system uses
  // OR use 1-minute candles directly — just be CONSISTENT
  
  for (let i = 0; i < postOrCandles.length; i++) {
    const candle = postOrCandles[i];
    
    // Breakout UP: candle CLOSES above OR High
    if (candle.close > or.high) {
      return {
        found: true,
        direction: 'LONG',
        breakoutBar: candles1min.indexOf(candle),
        breakoutPrice: candle.close,
        breakoutTime: getISTTime(candle.timestamp)
      };
    }
    
    // Breakout DOWN: candle CLOSES below OR Low
    if (candle.close < or.low) {
      return {
        found: true,
        direction: 'SHORT',
        breakoutBar: candles1min.indexOf(candle),
        breakoutPrice: candle.close,
        breakoutTime: getISTTime(candle.timestamp)
      };
    }
  }
  
  return { found: false };
}
```

### Step 4: Entry Detection (Retest vs Runner)

```
/**
 * After breakout, detect entry type:
 * RETEST: Price pulls back to OR level and bounces
 * RUNNER: Price never comes back — enters on momentum
 */
function detectEntry(candles1min, or, breakout) {
  const postBreakoutCandles = candles1min.filter((c, idx) => 
    idx > breakout.breakoutBar
  );
  
  if (breakout.direction === 'LONG') {
    // Look for retest: price comes back to OR High
    // Or runner: price stays above OR High for N candles
    
    const orLevel = or.high;
    let retestFound = false;
    let retestBar = -1;
    
    for (let i = 0; i < postBreakoutCandles.length; i++) {
      const candle = postBreakoutCandles[i];
      const t = getISTTime(candle.timestamp);
      if (t.hours >= 14 && t.minutes >= 30) break;  // No entries after 2:30 PM
      
      // Retest: candle low touches OR level but closes above it
      if (candle.low <= orLevel * 1.003 && candle.close > orLevel) {
        retestFound = true;
        retestBar = candles1min.indexOf(candle);
        
        const entryPrice = orLevel;  // Enter at OR level
        const stop = or.low;  // Stop below OR Low
        const risk = entryPrice - stop;
        
        return {
          found: true,
          type: 'RETEST',
          price: entryPrice,
          stop: stop,
          t1: entryPrice + risk,      // 1R target
          t2: entryPrice + (risk * 2), // 2R target
          riskPercent: (risk / entryPrice) * 100,
          barIndex: retestBar,
          time: t
        };
      }
      
      // Runner: if price stayed above OR High for 3+ candles without retest
      if (i >= 2 && !retestFound) {
        const allAbove = postBreakoutCandles.slice(0, i + 1)
          .every(c => c.low > orLevel * 0.997);
        
        if (allAbove) {
          const entryPrice = candle.close;
          const stop = or.high;  // Stop at OR High
          const risk = entryPrice - stop;
          
          // Only valid if risk is reasonable
          if (risk > 0 && (risk / entryPrice) * 100 <= 2.0) {
            return {
              found: true,
              type: 'RUNNER',
              price: entryPrice,
              stop: stop,
              t1: entryPrice + risk,
              t2: entryPrice + (risk * 2),
              riskPercent: (risk / entryPrice) * 100,
              barIndex: candles1min.indexOf(candle),
              time: t
            };
          }
        }
      }
    }
    
    return { found: false };
    
  } else {  // SHORT
    // Mirror logic for SHORT direction
    const orLevel = or.low;
    let retestFound = false;
    
    for (let i = 0; i < postBreakoutCandles.length; i++) {
      const candle = postBreakoutCandles[i];
      const t = getISTTime(candle.timestamp);
      if (t.hours >= 14 && t.minutes >= 30) break;
      
      // Retest: candle high touches OR Low but closes below it
      if (candle.high >= orLevel * 0.997 && candle.close < orLevel) {
        const entryPrice = orLevel;
        const stop = or.high;
        const risk = stop - entryPrice;
        
        return {
          found: true,
          type: 'RETEST',
          price: entryPrice,
          stop: stop,
          t1: entryPrice - risk,
          t2: entryPrice - (risk * 2),
          riskPercent: (risk / entryPrice) * 100,
          barIndex: candles1min.indexOf(candle),
          time: t
        };
      }
      
      // Runner for SHORT
      if (i >= 2 && !retestFound) {
        const allBelow = postBreakoutCandles.slice(0, i + 1)
          .every(c => c.high < orLevel * 1.003);
        
        if (allBelow) {
          const entryPrice = candle.close;
          const stop = or.low;
          const risk = stop - entryPrice;
          
          if (risk > 0 && (risk / entryPrice) * 100 <= 2.0) {
            return {
              found: true,
              type: 'RUNNER',
              price: entryPrice,
              stop: stop,
              t1: entryPrice - risk,
              t2: entryPrice - (risk * 2),
              riskPercent: (risk / entryPrice) * 100,
              barIndex: candles1min.indexOf(candle),
              time: t
            };
          }
        }
      }
    }
    
    return { found: false };
  }
}
```

### Step 5: Outcome Evaluation (THE CRITICAL FIX)

```
/**
 * Walk through 1-minute candles AFTER entry to determine outcome.
 * 
 * RULES:
 * 1. Check candles CHRONOLOGICALLY — first hit wins
 * 2. If both T1 and Stop are hit in same candle → use candle open
 * 3. After T1 hit → move stop to entry (breakeven), keep tracking for T2
 * 4. After T2 hit → trade is done (WIN +2R)
 * 5. If nothing hit by 3:20 PM → EOD close
 * 6. ONE signal per stock per day — never multiple
 */
function evaluateOutcome(candles1min, entry) {
  const postEntryCandles = candles1min.filter((c, idx) => 
    idx > entry.barIndex
  );
  
  let t1Hit = false;
  let currentStop = entry.stop;
  let maxFavorable = entry.price;
  let maxAdverse = entry.price;
  
  for (const candle of postEntryCandles) {
    const t = getISTTime(candle.timestamp);
    
    // EOD cutoff at 3:20 PM
    if (t.hours > 15 || (t.hours === 15 && t.minutes >= 20)) break;
    
    // Track extremes
    if (entry.type === 'LONG' || entry.direction === 'LONG') {
      maxFavorable = Math.max(maxFavorable, candle.high);
      maxAdverse = Math.min(maxAdverse, candle.low);
    } else {
      maxFavorable = Math.min(maxFavorable, candle.low);
      maxAdverse = Math.max(maxAdverse, candle.high);
    }
    
    const isLong = entry.direction === 'LONG' || 
                   entry.t1 > entry.price;  // T1 above entry = LONG
    
    if (isLong) {
      const stopHit = candle.low <= currentStop;
      const t1Hit_candle = !t1Hit && candle.high >= entry.t1;
      const t2Hit_candle = t1Hit && entry.t2 && candle.high >= entry.t2;
      
      // AMBIGUITY: Both stop and target in same candle
      if (stopHit && t1Hit_candle) {
        if (candle.open > entry.price) {
          // Price was in our favor → T1 hit first
          t1Hit = true;
          currentStop = entry.price;  // Move to breakeven
          // Continue to check T2
        } else {
          return result('STOP_HIT', currentStop, t, -1);
        }
      } else if (stopHit) {
        const rMult = t1Hit ? 0 : -1;  // If T1 was hit, stop at breakeven = 0R
        return result(t1Hit ? 'BREAKEVEN' : 'STOP_HIT', currentStop, t, rMult);
      } else if (t1Hit_candle) {
        t1Hit = true;
        currentStop = entry.price;  // Move stop to breakeven
      }
      
      if (t2Hit_candle) {
        return result('T2_HIT', entry.t2, t, 2);
      }
      
    } else {  // SHORT
      const stopHit = candle.high >= currentStop;
      const t1Hit_candle = !t1Hit && candle.low <= entry.t1;
      const t2Hit_candle = t1Hit && entry.t2 && candle.low <= entry.t2;
      
      if (stopHit && t1Hit_candle) {
        if (candle.open < entry.price) {
          t1Hit = true;
          currentStop = entry.price;
        } else {
          return result('STOP_HIT', currentStop, t, -1);
        }
      } else if (stopHit) {
        const rMult = t1Hit ? 0 : -1;
        return result(t1Hit ? 'BREAKEVEN' : 'STOP_HIT', currentStop, t, rMult);
      } else if (t1Hit_candle) {
        t1Hit = true;
        currentStop = entry.price;
      }
      
      if (t2Hit_candle) {
        return result('T2_HIT', entry.t2, t, 2);
      }
    }
  }
  
  // EOD Close — calculate actual P&L
  const lastCandle = postEntryCandles[postEntryCandles.length - 1];
  if (!lastCandle) return result('NO_DATA', entry.price, null, 0);
  
  const isLong = entry.t1 > entry.price;
  const pnl = isLong 
    ? lastCandle.close - entry.price 
    : entry.price - lastCandle.close;
  const risk = Math.abs(entry.price - entry.stop);
  const rMult = parseFloat((pnl / risk).toFixed(2));
  
  if (t1Hit) {
    return result('T1_HIT', entry.t1, getISTTime(lastCandle.timestamp), 1);
  }
  
  return result('EOD_CLOSE', lastCandle.close, getISTTime(lastCandle.timestamp), rMult);
}

function result(outcome, exitPrice, exitTime, rMultiple) {
  return { result: outcome, exitPrice, exitTime, rMultiple };
}
```

### Step 6: Wire Everything Together

```
LIVE SCANNER (signalScheduler.cjs):
  const candles = await fetch1MinCandles(symbol, today);
  const prevDay = await getPrevDayCandle(symbol);
  const result = signalEngine.processStock(candles, prevDay);
  if (result) saveSignal(result.signal);

BACKTEST (backtestReplayService.cjs):
  for (const date of dateRange) {
    const ibStocks = await getIBStocksForDate(date);
    for (const symbol of ibStocks) {
      const candles = await fetch1MinCandlesHistorical(symbol, date);
      const prevDay = await getPrevDayCandle(symbol, date);
      const result = signalEngine.processStock(candles, prevDay);
      if (result) backtestResults.push({ symbol, date, ...result });
    }
  }

EOD ANALYSIS (eodReportService.cjs):
  const todaysSignals = await getSignalsForDate(today);
  for (const signal of todaysSignals) {
    const candles = await fetch1MinCandles(signal.symbol, today);
    const outcome = signalEngine.evaluateOutcome(candles, signal);
    // This uses the SAME evaluateOutcome as live + backtest
    updateSignalOutcome(signal.id, outcome);
  }
```

### Step 7: Deduplication Guard

```
In EVERY caller (live, backtest, EOD):

const processedToday = new Set();

for (const symbol of stockList) {
  const key = `${symbol}_${date}`;
  if (processedToday.has(key)) continue;  // ONE signal per stock per day
  
  const result = signalEngine.processStock(candles, prevDay);
  if (result) {
    processedToday.add(key);
    // ... save/track result
  }
}
```

---

## VALIDATION PROTOCOL

After implementing, run this EXACT test:

```
TEST: March 2, 2026 — LT (SHORT RETEST)

1. Get 1-minute candles for LT from database
2. Run: signalEngine.processStock(candles, prevDay)
3. Expected output:
   signal.direction = 'SHORT'
   signal.type = 'RETEST'
   signal.entryPrice ≈ ₹4078.7 (within 1% of Pine Script value)
   signal.stopPrice ≈ ₹4109.6
   signal.t1Price ≈ ₹4047.8
   outcome.result = 'T1_HIT'
   outcome.rMultiple = 1

4. Compare with TradingView Pine Script:
   Pine: RETEST SHORT, Entry ₹4078.7, T1 ✓ +1R
   CTS:  RETEST SHORT, Entry ₹????, T1 ??? 
   
   IF ENTRY PRICES DON'T MATCH:
   → Print both values
   → The difference reveals which part of OR detection differs
   → Fix OR detection to match Pine Script exactly
   
   IF ENTRY MATCHES BUT OUTCOME DIFFERS:
   → The outcome logic is wrong
   → Print first 10 candles after entry with H/L values
   → Manually verify which candle hits T1

5. Repeat for OIL (expect T2_HIT) and JIOFIN (expect STOP_HIT)
```

---

## CRITICAL REMINDERS

```
1. ONE function for signal logic — called by live, backtest, AND EOD
2. ONE signal per stock per day — ALWAYS deduplicate  
3. 1-MINUTE candles — NEVER use 30-minute for outcome evaluation
4. STORED signal prices for EOD — never recalculate entry/stop/T1
5. IST timezone — all candle times must be in IST
6. After T1 hit → move stop to breakeven → continue tracking T2
7. After T2 hit → trade DONE → book +2R
8. 3:20 PM EOD close — anything still open gets closed at last price
9. Compare with Pine Script values — they are the ground truth
```
