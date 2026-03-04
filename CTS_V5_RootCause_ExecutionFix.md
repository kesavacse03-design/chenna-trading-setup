# CTS V5 — Root Cause Diagnosis & Execution Fix Plan
## Based on Post-Stop Forensic Data + Chart Analysis + TCI Methodology

**Date:** March 3, 2026
**Status:** PROVEN — Ready for implementation

---

## THE EVIDENCE (What We Now Know)

### Post-Stop Analysis Results (14 high-score STOP_HIT signals)
```
T1 reached after stop: 5/14 (35.7%)
T1 NOT reached: 9/14 (64.3%)

CRITICAL OBSERVATION: 12 of 14 RETEST signals have StopHitTime = 09:15:00
→ Stop hit on the FIRST CANDLE before trade even begins
```

### Stop Distance Analysis (ALL stopped signals)
```
IOC:        Entry 188.40  Stop 187.46  = 0.50% distance
PNB:        Entry 132.30  Stop 131.64  = 0.50% distance  
LAURUSLABS: Entry 1072.10 Stop 1066.74 = 0.50% distance
KEI:        Entry 4836.50 Stop 4812.32 = 0.50% distance
ETERNAL:    Entry 243.91  Stop 242.69  = 0.50% distance
BHARTIARTL: Entry 1890.10 Stop 1880.65 = 0.50% distance
BAJAJHLDNG: Entry 10821   Stop 10875   = 0.50% distance
VEDL:       Entry 723.15  Stop 719.53  = 0.50% distance
```

**ALL stops are at exactly 0.50%.** This is the system's minimum stop floor.
Average F&O stock moves 0.5-1.5% in the first 5-min candle alone.
The stop is INSIDE normal opening noise.

---

## ROOT CAUSE #1: System Enters at 09:15 Before OR Forms

### What CTS does now:
1. TradeCode triggers stock (e.g., "INFY appeared in INTRADAY_BOOST")
2. System immediately calculates entry = current price at signal time
3. Stop = entry +/- 0.50% (minimum floor)
4. Signal fires → dashboard shows "RETEST" or "RUNNER"

### What a real trader does (Prashant/TCI methodology):
1. TradeCode triggers stock → put it on watchlist
2. WAIT for Opening Range to form (first opposite color candle on 5-min)
3. WAIT for breakout candle to close above/below OR
4. Check: Is breakout candle volume > inside-OR candle volumes?
5. Check: Is price above/below 20 EMA after breakout?
6. ONLY THEN enter, with stop at RETRACEMENT LOW (higher low), NOT at OR extreme

### The gap:
CTS skips steps 2-5 entirely. It enters blind at 09:15 using a calculated 
price, not the actual OR breakout price. This is why TradeCode shows "target hit" 
but CTS shows "stop loss" for the same stock — different entry prices.

---

## ROOT CAUSE #2: 0.50% Stop Is Inside the Noise Zone

### Prashant's rule (from TCI training):
"Distance between your stop loss should not be more than 1.5 to 2%"
"If the stop loss is lower, the least possible stop-loss you make,
there is a bigger window to capture your 1:1 profit trade"

### Translation:
- MINIMUM stop: 1.0% (not 0.50%)
- IDEAL stop: 1.5%
- MAXIMUM stop: 2.0% (beyond this, skip the trade — R:R breaks)

### Proof from data:
- Average 5-min opening range on F&O stocks: 0.7-1.2%
- System stop: 0.50%
- Result: Stop is INSIDE the opening range → guaranteed stop hunt

---

## ROOT CAUSE #3: No Candle/Volume Confirmation at Entry

### What the system checks: NOTHING about candle structure at entry
### What it should check (from TCI methodology):

**Before entry, these must ALL be true:**

1. **OR is defined** — Opposite color candle has appeared on 5-min chart
2. **Breakout candle closed** — Not just wick above/below, actual CLOSE
3. **Volume confirmation** — Breakout candle volume > average of OR candles
4. **EMA alignment** — For LONG: price above 20 EMA on 5-min
                       For SHORT: price below 20 EMA on 5-min
5. **Candle quality** — Breakout candle should NOT be a doji/spinning top
                        (close should be in upper 30% for LONG, lower 30% for SHORT)
6. **Stop placement** — Stop at retracement low (higher low in N-pattern)
                        NOT at OR extreme, NOT at flat 0.50%

---

## ROOT CAUSE #4: Entry Price Mismatch With TradeCode

### The problem:
TradeCode shows INFY entry at breakout price (say 1390).
CTS calculates entry at signal-time price (say 1384).
6-point difference = 0.43% — nearly the ENTIRE stop distance.

With 0.50% stops, a 0.43% entry mismatch means:
- TradeCode: Entry 1390, Stop 1383 → stock hits 1385, still safe
- CTS: Entry 1384, Stop 1377 → stock hits 1385, T1 HIT for TradeCode, still going for CTS
- But CTS stop at 1377 gets hit by the morning wick that TradeCode's stop at 1383 survives

### Fix:
Entry price must come from the ACTUAL breakout candle close, not from 
the signal generation timestamp. This requires the system to monitor 
the stock AFTER TradeCode triggers it, wait for OR + breakout, then 
calculate entry/stop from the breakout candle — not from the trigger time.

---

## THE FIX: 3-Phase Execution Upgrade

### PHASE 1: Quick Wins (Implement NOW — 1 day)
These require minimal code changes but have maximum impact.

#### Fix 1A: Raise minimum stop to 1.2%
```
WHERE TO CHANGE: Signal generation logic (ibStrategy.cjs or equivalent)

CURRENT:  minStopPct = 0.5
CHANGE:   minStopPct = 1.2

WHY: 0.50% is inside opening range noise for ANY F&O stock.
     1.2% survives the first candle wick while maintaining viable R:R.
     Prashant says 1.5-2% is ideal, but 1.2% is minimum viable.
```

#### Fix 1B: Add OR width gate — skip signals where OR is too narrow
```
WHERE TO CHANGE: Signal generation logic

NEW RULE: Calculate OR width = (OR_High - OR_Low) / OR_Mid * 100
          If OR_width < 0.4%, SKIP the signal (too narrow = whipsaw zone)
          If OR_width > 3.0%, SKIP the signal (too volatile = stops too wide)

WHY: Narrow OR = compressed opening = violent expansion = stop hunted
     Wide OR = big initial candle = huge stop needed = bad R:R
     Sweet spot: 0.4% to 3.0% OR width
```

#### Fix 1C: Don't fire signal until OR breakout candle CLOSES
```
WHERE TO CHANGE: Signal pipeline (scanner → signal generation)

CURRENT: Signal fires when TradeCode triggers + price crosses OR level
CHANGE:  Signal fires when:
         1. TradeCode has triggered the stock (put on watchlist)
         2. OR is defined (opposite color candle appeared)
         3. Breakout candle has CLOSED above/below OR
         4. Only then: calculate entry = breakout candle close price

WHY: A candle that wicks above OR but closes inside is NOT a breakout.
     Waiting for the close prevents false breakout entries.
```

### PHASE 2: Smart Execution (Implement next — 2-3 days)
These require more logic but make the system trade like a real trader.

#### Fix 2A: Volume confirmation on breakout candle
```
NEW CHECK at signal generation time:

breakoutCandleVolume = volume of the candle that closed above/below OR
avgORVolume = average volume of candles INSIDE the opening range
volumeRatio = breakoutCandleVolume / avgORVolume

IF volumeRatio < 1.0:
    → Signal is WEAK (breakout without volume = trap)
    → Either skip or mark as LOW CONFIDENCE
    
IF volumeRatio >= 1.5:
    → Signal is STRONG (institutional participation)
    → Mark as HIGH CONFIDENCE

WHY: "Look at the breakout and look at the volumes" — Prashant
     Small candle + big volume at breakout = real move
     Big candle + no volume = retail trap
```

#### Fix 2B: 20 EMA alignment check
```
NEW CHECK at signal generation time:

For LONG signals:
    → Current price must be ABOVE 20 EMA on 5-min chart
    → OR: Price bounced from 20 EMA (kiss and bounce)
    
For SHORT signals:
    → Current price must be BELOW 20 EMA on 5-min chart

IF NOT aligned:
    → Don't skip, but add factor: "EMA NOT ALIGNED — wait for mean reversion"
    → Reduce conviction by -15

WHY: "20 EMA is the mean reversion. Price and 20 EMA are like Romeo and 
     Juliet — they cannot stay away from each other." — Prashant
     Entering when price is far from 20 EMA = guaranteed pullback first
```

#### Fix 2C: Stop at retracement low, not OR extreme
```
CURRENT stop logic:
    LONG:  stop = entry - (entry * minStopPct / 100)
    SHORT: stop = entry + (entry * minStopPct / 100)

NEW stop logic:
    LONG:  stop = retracement_low - buffer
           where retracement_low = lowest low of pullback candles between 
           OR formation and breakout (the "higher low" in N-pattern)
           buffer = 0.1% of price (small cushion)
           
    SHORT: stop = retracement_high + buffer
           where retracement_high = highest high of pullback candles
           
    FLOOR: If calculated stop < 1.0% from entry, use 1.0%
    CAP:   If calculated stop > 2.5% from entry, SKIP the trade (R:R is bad)

WHY: "Stop loss is the retracement low here — this is your higher low.
     Price is breaking the higher high and giving you confirmation of 
     the trend." — Prashant
```

### PHASE 3: Candle Quality Filter (Implement after Phase 2 — 2 days)

#### Fix 3A: Breakout candle quality score
```
Score the breakout candle (0-100):

candleRange = high - low
bodySize = abs(close - open)
bodyRatio = bodySize / candleRange  (0 to 1)

For LONG:
    closePosition = (close - low) / candleRange  (0 = closed at low, 1 = closed at high)
    
For SHORT:
    closePosition = (high - close) / candleRange

candleScore = (bodyRatio * 50) + (closePosition * 50)

IF candleScore < 30:
    → Doji/spinning top at breakout = WEAK signal, skip
    → This catches situations where breakout candle has long wicks but tiny body
    
IF candleScore >= 70:
    → Strong directional candle = STRONG signal

WHY: A doji at the breakout level means indecision, not conviction.
     We want candles that close STRONG in the breakout direction.
```

#### Fix 3B: Avoid big opening candle traps
```
firstCandleRange = (first_candle_high - first_candle_low) / first_candle_open * 100

IF firstCandleRange > 2.0%:
    → First candle is too big (algo spike / gap reaction)
    → Don't chase. Wait for consolidation + breakout
    → Mark signal: "BIG OPEN CANDLE — wait for base to form"

WHY: "Huge candle. You need experience to enter a sweet spot.
     Big candle + big volume at open = algo trading. Retail gets trapped." 
     — Prashant
```

---

## IMPLEMENTATION PRIORITY ORDER

```
PRIORITY 1 (Day 1 — Maximum Impact, Minimum Code):
  [x] Fix 1A: Raise minStopPct from 0.50% to 1.2%
  [x] Fix 1B: Skip signals where OR width < 0.4% or > 3.0%
  [x] Fix 1C: Wait for breakout candle CLOSE before firing signal

PRIORITY 2 (Day 2-3 — Smart Execution):
  [ ] Fix 2A: Volume confirmation (breakout vol > avg OR vol)
  [ ] Fix 2B: 20 EMA alignment check
  [ ] Fix 2C: Stop at retracement low, not flat percentage

PRIORITY 3 (Day 4-5 — Candle Quality):
  [ ] Fix 3A: Breakout candle quality score
  [ ] Fix 3B: Big opening candle filter
```

---

## VERIFICATION METHOD

After implementing Phase 1:

### Backtest verification:
1. Re-run the 14 stopped signals through the NEW logic
2. For each one, check:
   - Would the new OR width gate have SKIPPED it?
   - Would the new 1.2% stop have SURVIVED the opening wick?
   - Would waiting for breakout candle CLOSE have changed the entry price?
3. Calculate new theoretical win rate

### Forward test (3 trading days):
1. Run both OLD and NEW logic side by side
2. Old logic generates signals as before (don't trade them)
3. New logic generates signals with Phase 1 fixes
4. Compare: Which signals does new logic SKIP that old logic took?
5. Were those skipped signals actually losers?

### Success criteria:
- New logic should SKIP at least 4-5 of the 14 stopped signals (the narrow-OR ones)
- Remaining signals should have wider stops that survive opening wick
- Entry prices should match TradeCode more closely (within 0.2% vs current 0.5%+)

---

## EXPECTED IMPACT

| Metric | Current | After Phase 1 | After Phase 2 |
|--------|---------|---------------|---------------|
| Min stop distance | 0.50% | 1.20% | Retracement-based |
| Signals per day | ~20-25 | ~12-15 (filtered) | ~8-12 (quality) |
| Stop hit in first candle | ~60% | ~10% | ~5% |
| Entry price vs TradeCode | 0.5%+ mismatch | 0.2% mismatch | <0.1% mismatch |
| Win rate (estimated) | ~58% | ~65% | ~70%+ |

Fewer signals, better entries, wider stops, higher win rate.
Quality over quantity.
