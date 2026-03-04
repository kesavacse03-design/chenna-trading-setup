# CTS V5 — DEEP RESEARCH FRAMEWORK
## "What is the data actually saying?"

---

## WHY THE PREVIOUS ANALYSIS WAS WRONG

The agent tested each category with ONE basic approach:
  Multi Resistance BO → raw breakout buy → 33% WR → "scrap it"
  LOM Intra → single RSI divergence → 12% WR → "scrap it"

This is like testing a car without fuel and saying the engine is broken.

TradeCode built a business on these categories. Hundreds of traders 
profit from them daily. If our backtest says 33%, the problem is 
OUR ANALYSIS — not the categories.

A professional quant doesn't test one thing and quit.
They test HUNDREDS of combinations and find what works.

---

## THE RESEARCH METHOD: Factor-Based Combinatorial Analysis

### Step 1: Identify every measurable factor
### Step 2: Test each factor INDEPENDENTLY (does it add edge alone?)
### Step 3: Test the best factors in COMBINATION
### Step 4: Find the highest-probability confluence zones
### Step 5: Build the strategy around proven combinations

---

## MASTER FACTOR LIST — Every Measurable Technical Element

For EVERY stock-day in EVERY category, calculate ALL of these:

### A. TREND CONTEXT FACTORS (Daily)

```
Factor ID | Factor Name                    | How to Calculate
----------|--------------------------------|----------------------------------
D_EMA20   | Price vs 20 EMA (Daily)        | close > ema20 ? 'ABOVE' : 'BELOW'
D_EMA50   | Price vs 50 EMA (Daily)        | close > ema50 ? 'ABOVE' : 'BELOW'
D_EMA200  | Price vs 200 EMA (Daily)       | close > ema200 ? 'ABOVE' : 'BELOW'
D_STACK   | EMA Stack Order                | 20>50>200='BULL_STACK', reverse='BEAR_STACK', else 'MIXED'
D_SLOPE20 | 20 EMA Slope (last 5 days)     | (ema20_today - ema20_5daysago) / ema20_5daysago * 100
D_DIST20  | Distance from 20 EMA           | (close - ema20) / ema20 * 100
D_RSI     | RSI(14) on Daily               | Standard RSI calculation
D_RSI_ZONE| RSI Zone                        | <30='OVERSOLD', 30-50='WEAK', 50-70='HEALTHY', >70='OVERBOUGHT'
D_ADX     | ADX(14) on Daily               | Trend strength: >25='TRENDING', <25='RANGING'
D_ATR_PCT | ATR(14) as % of price          | atr14 / close * 100 (volatility measure)
D_TREND   | Higher Highs / Higher Lows     | Count HH/HL vs LH/LL over last 10 days
```

### B. TREND CONTEXT FACTORS (Weekly)

```
W_EMA20   | Price vs 20 EMA (Weekly)       | Synthesize weekly, calc EMA
W_EMA50   | Price vs 50 EMA (Weekly)       | Synthesize weekly, calc EMA
W_RSI     | RSI(14) on Weekly              | Standard RSI on weekly candles
W_TREND   | Weekly trend direction          | Last 4 weekly closes: up/down/mixed
W_RANGE   | Weekly range contraction        | Is this week's range < last week? (NR7 concept)
```

### C. VOLUME FACTORS

```
V_RATIO   | Breakout Vol / 20-day Avg Vol  | breakout_candle_vol / sma(vol, 20)
V_PROFILE | Volume at key levels            | Is max volume near breakout level? 
V_TREND   | Volume trend last 5 days       | Increasing or decreasing?
V_SPIKE   | Volume spike > 2x average      | Boolean
V_ACCUM   | Accumulation pattern           | Small candles + big volume = institutional
V_DIST    | Distribution pattern           | Big candles + big volume at top = distribution
```

### D. CANDLE PATTERN FACTORS

```
CP_N      | N-Pattern (Higher High/Low)    | Is there an N-shape in last 5 candles?
CP_REVN   | Reverse N (Lower High/Low)     | Mirror of N-pattern for shorts
CP_BASE   | Base Violation                  | Red candle → immediate green engulfing
CP_PIN    | Pin Bar / Hammer               | Long wick > 2x body, at key level
CP_DOJI   | Doji at key level              | Body < 10% of range, at S/R
CP_ENGULF | Engulfing candle               | Current body engulfs previous body
CP_VCP    | Volatility Contraction Pattern  | Each swing smaller than previous
CP_INSIDE | Inside Bar / NR7               | Current range inside previous range
```

### E. STRUCTURE FACTORS (Institutional Footprint / CRT / TBS)

```
SF_SWEEP  | Liquidity Sweep                | Price briefly broke key level then 
          |                                | reversed (stop hunt / false breakout)
SF_FVG    | Fair Value Gap                  | Gap between candle 1 high and candle 3 
          |                                | low (unfilled order flow)
SF_OB     | Order Block                     | Last opposite-color candle before 
          |                                | strong move (institutional entry zone)
SF_BOS    | Break of Structure              | Price broke previous swing high/low
          |                                | (market structure shift)
SF_CHOCH  | Change of Character             | First lower high in uptrend OR 
          |                                | first higher low in downtrend
SF_PDH    | Previous Day High proximity     | Is entry near PDH? (key level)
SF_PDL    | Previous Day Low proximity      | Is entry near PDL? (key level)
SF_RECLAIM| Level Reclaim                   | Price went below level, came back above
          |                                | (failed breakdown = strong demand)
SF_CRT    | Candle Range Theory             | High/Low of previous candle used as 
          |                                | S/R zone, sweep + reversal = entry
```

### F. MACRO ALIGNMENT FACTORS

```
M_NIFTY   | Nifty direction today           | Up/Down/Flat (from open)
M_SECTOR  | Sector performance today        | Sector avg % change
M_ALIGN   | Signal aligned with Nifty+Sector| Both same direction as trade
M_NEMA    | Nifty vs its 20 EMA             | Above/Below
M_SEMA    | Sector vs its 20 EMA            | Above/Below
M_DOW     | Day of Week                      | Mon/Tue/Wed/Thu/Fri
M_EXPIRY  | F&O Expiry proximity            | Days to expiry, is today expiry?
```

### G. PRICE STRUCTURE FACTORS

```
PS_GAP    | Gap from previous close         | (open - prevClose) / prevClose * 100
PS_GAPDIR | Gap direction                    | Gap UP / Gap DOWN / No gap
PS_PRICE  | Price range bucket              | <100, 100-300, 300-500, 500-1K, 1K-2K, 2K-5K, >5K
PS_OR_PCT | Opening Range size as % of price| (orH - orL) / orOpen * 100
PS_PREV   | Previous day candle color       | Green (bullish) / Red (bearish)
PS_PREVR  | Previous day range %            | (prevH - prevL) / prevL * 100
PS_2DAYH  | Breaking 2-day high?            | close > max(day-1 high, day-2 high)
PS_2DAYL  | Breaking 2-day low?             | close < min(day-1 low, day-2 low)
PS_5DAYH  | Breaking 5-day high?            | close > max of last 5 daily highs
PS_5DAYL  | Breaking 5-day low?             | close < min of last 5 daily lows
PS_NEAR_RES| Near daily resistance           | Within 1% of recent swing high
PS_NEAR_SUP| Near daily support              | Within 1% of recent swing low
```

---

## RESEARCH EXECUTION: How to Actually Do This

### Phase 1: Build the Factor Calculator

```javascript
// factorCalculator.cjs
// For ANY stock on ANY date, calculate ALL factors above

function calculateAllFactors(symbol, targetDate) {
    const dayData = loadDayCache(symbol);
    const data30m = load30mCache(symbol);
    
    if (!dayData || !data30m) return null;
    
    const idx = dayData.findIndex(d => d.date === targetDate);
    if (idx < 200) return null; // Need 200 days for EMA200
    
    const factors = {};
    
    // A. Daily Trend
    factors.D_EMA20 = dayData[idx].close > calcEMA(dayData, idx, 20) ? 'ABOVE' : 'BELOW';
    factors.D_EMA50 = dayData[idx].close > calcEMA(dayData, idx, 50) ? 'ABOVE' : 'BELOW';
    factors.D_EMA200 = dayData[idx].close > calcEMA(dayData, idx, 200) ? 'ABOVE' : 'BELOW';
    
    const e20 = calcEMA(dayData, idx, 20);
    const e50 = calcEMA(dayData, idx, 50);
    const e200 = calcEMA(dayData, idx, 200);
    factors.D_STACK = (e20 > e50 && e50 > e200) ? 'BULL_STACK' : 
                      (e20 < e50 && e50 < e200) ? 'BEAR_STACK' : 'MIXED';
    
    factors.D_DIST20 = ((dayData[idx].close - e20) / e20 * 100).toFixed(2);
    factors.D_RSI = calcRSI(dayData.slice(0, idx+1), 14);
    factors.D_RSI_ZONE = factors.D_RSI < 30 ? 'OVERSOLD' : 
                         factors.D_RSI < 50 ? 'WEAK' : 
                         factors.D_RSI < 70 ? 'HEALTHY' : 'OVERBOUGHT';
    
    // ... calculate ALL other factors
    
    return factors;
}
```

### Phase 2: Build the Factor-Outcome Database

```
For EVERY stock-day in EVERY category:

1. Calculate all factors (50+ measurements)
2. Record the OUTCOME:
   - Did T1 hit at 1:1? (WIN/LOSS)
   - Did T2 hit at 1:2? (WIN/LOSS)  
   - Max Favorable Excursion (highest profit reached)
   - Max Adverse Excursion (deepest drawdown)
   - Final result after holding period

Store this as a CSV:
symbol, date, category, factor1, factor2, ..., factor50, 
t1_hit, t2_hit, mfe_pct, mae_pct, final_result

This creates a DATASET we can mine for patterns.
```

### Phase 3: Individual Factor Analysis

```
For EACH factor, split the data into groups and compare WR:

Example: Factor D_EMA20 (Price vs 20 EMA)
  Group A: D_EMA20 = 'ABOVE' → WR = ?
  Group B: D_EMA20 = 'BELOW' → WR = ?
  Edge = Group_A_WR - Group_B_WR

Do this for ALL 50+ factors.
Sort by edge size.
The top 10 factors with biggest edge become our FILTER SET.

Expected discoveries:
  "When D_STACK = BULL_STACK, Multi Resistance BO WR = 65%"
  "When V_SPIKE = true + D_RSI < 70, LOM reversal WR = 58%"
  "When SF_SWEEP = true (liquidity sweep), WR jumps 20%"
```

### Phase 4: Combination Analysis

```
Take the top 10 individual factors.
Test every 2-factor combination: C(10,2) = 45 combinations.
Test every 3-factor combination: C(10,3) = 120 combinations.

For each combination, calculate:
  - Sample size (must be > 20 for significance)
  - Win rate
  - Average R-multiple
  - Profit factor

Find the BEST combinations where:
  WR > 60% AND sample_size > 20 AND profit_factor > 1.5

These become the STRATEGY RULES for each category.
```

---

## CATEGORY-SPECIFIC RESEARCH QUESTIONS

### MULTI_RESISTANCE_BO — What We Should Be Asking

Raw result was 33% WR. But we didn't ask:

```
Q1: What if we ONLY take Multi Res BO when D_STACK = BULL_STACK?
    (stock in full bullish EMA alignment)
    
Q2: What if we ONLY take it when W_RSI > 50?
    (weekly momentum is bullish)

Q3: What if we require V_SPIKE = true?
    (breakout happened with above-average volume)

Q4: What if we require the breakout to RETEST the level?
    (like ORB retest — don't chase, wait for pullback)

Q5: What if we look for VCP/NR7 BEFORE the breakout?
    (volatility contraction → expansion = explosive move)

Q6: What if we enter ONLY when the breakout coincides with 
    breaking a weekly consolidation too?
    (multi-timeframe breakout confluence)

Q7: What if we filter by SF_RECLAIM?
    (price went below 2-day high, came back above = 
     failed breakdown, now demand is proven)

Q8: What about CRT analysis?
    (previous candle range swept, then reversed = 
     institutional stop hunt completed, now real move starts)

Q9: What about PS_PRICE filter?
    (our IB data showed ₹1000-5000 sweet spot)

Q10: What about M_EXPIRY?
     (our IB data showed Thursday expiry = 65% WR)

Each of these could turn 33% into 60%+. 
We don't know until we TEST THEM ALL.
```

### LOM_INTRA — What We Should Be Asking

Raw result was 12% with basic RSI divergence. But:

```
Q1: What if we ONLY fade momentum when stock is at
    a DAILY resistance level? (SF approach)
    (LOM + daily resistance = much stronger reversal signal)

Q2: What if we require MACD histogram divergence TOO?
    (double divergence = RSI + MACD both confirming exhaustion)

Q3: What if we require VOLUME DIVERGENCE?
    (price higher but volume declining = true exhaustion)

Q4: What if we enter ONLY after a specific candle pattern?
    (pin bar, engulfing, or doji at the LOM level)

Q5: What if we use WIDER stops?
    (92% stop-out rate might mean stops are too tight)

Q6: What if we DON'T enter immediately but wait for 
    a lower high confirmation (Break of Structure)?
    (don't fight trend, wait for PROOF of reversal)

Q7: What about combining LOM with Order Block?
    (if LOM happens at a prior order block zone, stronger)

Q8: What if LOM works best at specific times?
    (11-12 PM exhaustion after morning move?)

Q9: What about the GAP direction?
    (LOM on a gap-up stock vs flat-open stock)

Q10: What if we use VCP/contraction AFTER the LOM?
     (LOM → small range consolidation → breakdown = confirmed)

Each question could reveal the REAL edge hiding in the data.
```

### LOM_SWING — What We Should Be Asking

```
Q1: What if we ONLY take Upside LOM Swing when the 
    stock hits WEEKLY resistance? (weekly overbought + 
    hourly divergence = powerful reversal signal)

Q2: What if we require the stock to be > 10% above 
    its 50 EMA? (stretched rubber band = mean reversion)

Q3: What if Downside LOM Swing ONLY works when the 
    stock hits WEEKLY support + monthly trendline?

Q4: What about using Point of Control (POC) from volume 
    profile to confirm accumulation at the LOM low?
    (TradeCode specifically teaches this!)

Q5: What about combining with NR7 at the reversal zone?
    (contraction at exhaustion = explosion in new direction)
```

---

## IMPLEMENTATION PLAN FOR AGENT

```
TASK 1: Create factorCalculator.cjs
  - Takes (symbol, targetDate)
  - Returns object with ALL 50+ factors calculated
  - Must handle missing data gracefully
  
TASK 2: Create factorDatabase.cjs
  - Loops through ALL stock-days in ALL categories
  - For each: calculate factors + record outcome
  - Exports to CSV: factor_analysis_master.csv
  - This CSV becomes our research dataset

TASK 3: Create factorAnalysis.cjs
  - Reads the CSV
  - For EACH factor:
    Split data by factor value
    Calculate WR for each group
    Calculate edge (difference between best and worst group)
  - Sort factors by edge size
  - Output: factor_rankings.csv

TASK 4: Create combinationAnalysis.cjs
  - Takes top 10 factors from Task 3
  - Tests all 2-factor and 3-factor combinations
  - For each combo: WR, sample size, profit factor
  - Filter: WR > 55% AND sample > 20
  - Output: best_combinations.csv

TASK 5: Generate strategy rules
  - For each category, the best combination becomes 
    the strategy entry rules
  - Build confirmation service functions for each
  - Backtest the final strategy to verify

IMPORTANT: This is iterative. We may need to:
  - Adjust factor calculations
  - Add new factors we didn't think of
  - Combine factors in non-obvious ways
  - Test different holding periods
  - Test different stop/target ratios

This is RESEARCH. It takes time. But it's the only way 
to build strategies that actually work.
```

---

## THE RIGHT MINDSET

TradeCode teaches:
  "Volume Profile confirms divergence is real accumulation"
  "NR7 at support = explosive move incoming"  
  "Breakout + pullback to breakout level = best entry"
  "Small candles + big volumes = institutional accumulation"
  "Don't enter at breakout. Wait for retest."

These are ALL filterable conditions we can measure 
programmatically. The 33% WR on Multi Res BO probably 
becomes 65%+ when we add:
  BULL_STACK + volume spike + retest entry + weekly uptrend

The 12% WR on LOM Intra probably becomes 50%+ when we add:
  daily resistance + MACD divergence + pin bar + BOS confirmation

WE DON'T KNOW UNTIL WE TEST. That's the point.
Don't declare a category dead after one test.
Test a hundred combinations. Then decide.
