# CTS V5 — CORRECTED Analysis + Consolidated Agent Tasks
## After the Direction Inversion Discovery

---

## THE CORRECTION: What the Data Actually Says

### OLD (WRONG) Interpretation:
  "ST_SWING_DOWN + BULL_STACK = buy the dip → 80% WR bounce"

### NEW (CORRECT) Interpretation:
  "ST_SWING_DOWN + BULL_STACK = SHORT the flush → 80% WR continuation"
  
  When a stock in an uptrend breaks support:
    - Longs trapped → stop-loss cascade → price flushes DOWN
    - STRONGER the uptrend = MORE longs trapped = BIGGER flush
    - Shorting that flush for 1-3 days is profitable
    
  This is the "stop hunt" / "trapped trader" pattern.
  Institutional players break support to trigger retail stops,
  creating a forced-selling wave that shorts can ride.

### Why BULL_STACK Makes SHORT More Profitable (Not LONG):
  More bulls positioned → more stop-losses below support 
  → bigger cascade when support breaks → bigger short profit

  In a BEAR_STACK, few longs exist → support break has 
  less fuel → the flush is smaller → short is less profitable

---

## TWO SEPARATE STRATEGIES EXIST IN THE SAME CATEGORY

ST_SWING_BO_DOWN contains TWO distinct trading opportunities
that happen in SEQUENCE, not simultaneously:

### Strategy A: "Short the Flush" (Days 0-3)

```
WHAT: Short the immediate breakdown continuation
WHEN: Day 0 (signal day) — enter SHORT at close
WHY:  Stop-loss cascade of trapped longs
DATA: 60-80% WR with BULL_STACK + W_EMA20 filters

Entry: SHORT at breakdown close (Chase method)
Stop:  ATR(14) × 1.5 ABOVE entry
Target: 1:1 R:R (ATR-based target below)
Hold:  Maximum 3 days (Day 3 = peak flush, +0.71%)
Exit:  Target hit OR Day 3 close (time stop)

Filter Requirements:
  ✅ W_EMA20 = ABOVE (stock in weekly uptrend)
  ✅ D_STACK = BULL_STACK (more trapped longs = bigger flush)
  ✅ TOUCH_COUNT >= 2 (level was tested, stops accumulated there)

Expected: 60-66% WR, +0.45R to +0.63R per trade
```

### Strategy B: "Buy the Bounce" (Days 3-15)

```
WHAT: LONG after the flush exhausts and price reclaims SMA10
WHEN: Day 3-15 (after the flush completes)
WHY:  Mean reversion — rubber band snaps back to the mean
DATA: NOT YET TESTED (current backtest only tests Day 0 entry)

This is what the EXISTING confirmSwingDownSignals() does:
  - Wait for close > SMA10 
  - Wait for double bottom structure
  - Enter LONG with stop below the flush low

But we've never properly measured this with the new 
factor framework. We need a separate backtest.

Entry: LONG when close > SMA10 (after the flush)
Stop:  Below the absolute low of the flush
Target: SMA20 or 1:2 R:R
Hold:  Until SMA20 reached or 10 days (time stop)
```

### The Complete Flow:

```
Day 0:  Support breaks → TradeCode flags ST_SWING_BO_DOWN
Day 0-3: SHORT the flush (Strategy A) — ride the cascade
Day 3:  Cover SHORT (time stop)
Day 3-7: WAIT for signs of recovery (SMA10 reclaim)
Day 7-15: If reclaimed → LONG the bounce (Strategy B)

Both strategies profit from the SAME event:
  Strategy A profits from the DROP
  Strategy B profits from the RECOVERY
  
  If you could trade both, you get:
    Short profit from Day 0-3
    Long profit from Day 7-15
    Double dipping on one signal.
```

---

## WHAT WE NEED: Dedicated Bounce Backtest Engine

The current factorDatabase_v2.cjs enters on Day 0/Day 1.
It can't test the bounce because the bounce entry happens 
on Day 3-15 (whenever SMA10 is reclaimed).

### Task: Create bounceBacktest.cjs

```javascript
// bounceBacktest.cjs
// Tests the LONG mean reversion AFTER the flush

For each ST_SWING_BO_DOWN signal:

  1. Record signal date and breakdown level
  
  2. Scan forward from Day 1 to Day 15:
     For each day:
       Calculate SMA10 of daily closes
       If close > SMA10:
         → This is the "bounce entry" day
         → Record: days_to_entry (how long the flush lasted)
         → Record: entry_price = close
         → Record: stop = absolute low between signal and today
         → Record: risk = entry - stop
         → Record: target = entry + risk (1:1) or entry + 2*risk (1:2)
         
  3. After entry, track:
     For each subsequent day (up to 20 more days):
       Did price hit target? → WIN
       Did price hit stop? → LOSS
       Day 10 after entry → EXIT flat (time stop)
       
  4. Calculate all factors ON THE ENTRY DAY (not signal day)
     W_EMA20, D_STACK, RSI2, etc. as of the day we enter LONG
     
  5. Run full factor analysis on bounce entries
     Find which factors predict successful bounces
     
  6. Output: bounce_backtest_results.csv
     With: symbol, signalDate, entryDate, daysToEntry,
           entryPrice, stopPrice, risk, targetPrice,
           allFactors..., result (WIN/LOSS), mfe, mae
```

This gives us the ACTUAL "buy the dip" backtest,
not the confused version from Round 2.

---

## CONSOLIDATED TASK LIST FOR AGENT

### Priority 1: Build the Bounce Backtest (NEW)

```
Create bounceBacktest.cjs as described above.
Run it on ST_SWING_BO_DOWN with 90 days of data.
Run full factor analysis on the results.
Output: report_BOUNCE_ST_SWING_DOWN.md

Key questions to answer:
  - What % of flushes produce a valid SMA10 reclaim?
  - Average days to reclaim (how long to wait)?
  - WR of the bounce trade at 1:1, 1:2, 1:3 R:R?
  - Which factors improve the bounce WR?
  - Does the bounce work BETTER or WORSE when 
    the flush was preceded by BULL_STACK?
```

### Priority 2: Verify NR7/VCP Factors Are Calculated

```
Check factorCalculator.cjs:
  Does it calculate NR7, NR4, INSIDER_NR7, VCP_SCORE?
  
  If NOT → add them:
    NR7: is today's (high-low) the smallest of last 7 days?
    NR4: smallest of last 4?
    INSIDER: today's high < yesterday's high AND 
             today's low > yesterday's low?
    VCP_SCORE: count of last 5 days where range was smaller 
               than the day before (0-5)
    ATR_CONTRACT: current ATR(14) / ATR(14) from 20 days ago

  Rerun analysis with these factors included.
  Check: does NR7 before a breakout improve any category?
```

### Priority 3: Run Remaining Category Reports (with 90-day data)

```
Agent says reports exist at backend/scripts/report_[CATEGORY].md
for all categories. Share the key findings from:

  report_MULTI_SUPPORT_BO.md
  report_LOM_INTRA_UPSIDE.md
  report_LOM_INTRA_DOWNSIDE.md  
  report_LOM_SWING_UPSIDE.md
  report_LOM_SWING_DOWNSIDE.md
  report_ST_SWING_BO_UP.md
  report_LT_SWING_BO_UP.md
  report_LT_SWING_BO_DOWN.md

For each, show:
  - Sample size (if < 30, flag as insufficient)
  - Best single factor by edge
  - Best 2-factor golden combo
  - Optimal R:R ratio
  - Optimal holding period
```

### Priority 4: Test Wyckoff Spring on Multi Support BO

```
For every MULTI_SUPPORT_BO signal:
  Track: Within 2 days of the breakdown, 
         did price close BACK ABOVE the broken level?
  
  If yes (= "Spring"):
    Enter LONG on the close that reclaimed
    Stop below the spring low
    Target: 1:2 R:R
    
  Calculate Spring WR and expected value.
  
  Also check: does BULL_STACK improve Spring WR?
  (Stock in uptrend + failed breakdown + reclaim = 
   strongest possible long signal)
```

### Priority 5: Test Failed Breakout on Multi Resistance BO

```
For every MULTI_RESISTANCE_BO signal:
  Track: Within 2 days of the breakout,
         did price close BACK BELOW the breakout level?
  
  If yes (= "Upthrust" / failed breakout):
    Enter SHORT on the close that failed
    Stop above the upthrust high
    Target: 1:2 R:R
    
  Calculate Failed BO WR and expected value.
```

### Priority 6: Implement Strategy A in confirmationService.cjs

```
Once bounce backtest is complete and we have both strategies 
validated, update the confirmation service:

For ST_SWING_BO_DOWN:

  Phase 1 (Flush SHORT — Strategy A):
    On signal day, IF W_EMA20=ABOVE + D_STACK=BULL_STACK:
      Create signal: direction='SHORT', hold=3 days
      entryType='FLUSH_SHORT'
      
  Phase 2 (Bounce LONG — Strategy B):
    Starting Day 3, check daily: has close > SMA10?
    IF yes + absolute low formed double bottom:
      Create signal: direction='LONG', hold=10 days
      entryType='MEAN_REVERSION'

  This means ONE scanner event produces TWO trades
  in opposite directions at different times.
```

---

## UPDATED CATEGORY STATUS

```
✅ INTRADAY_BOOST      — PRODUCTION READY (80% Tier 1 WR)
✅ HIGH_POWERED_STOCKS  — Tiebreaker (+15 pts in IB scoring)
✅ ST_SWING_BO_UP       — PRODUCTION READY (V5 swing engine)

🔬 ST_SWING_BO_DOWN     — SHORT flush validated (60-80% WR)
                          LONG bounce needs dedicated backtest
                          
⚠️ MULTI_RESISTANCE_BO  — Need 90-day data (16 samples too few)
                          Day 10 return +1.23% is promising
                          Test failed BO reversal (Upthrust)
                          
⚠️ MULTI_SUPPORT_BO     — Test Wyckoff Spring (failed breakdown → LONG)
                          67% failure rate might = 67% WR reversal

🔬 LOM_INTRA_UP/DOWN    — Reports generated, need review
                          Test with RSI(2) + wider stops + BOS entry
                          
🔬 LOM_SWING_UP/DOWN    — Reports generated, need review
                          Test NR7 + divergence + key level combo

⬜ LT_SWING_BO_UP       — Reports generated, need review
⬜ LT_SWING_BO_DOWN     — Reports generated, need review
```

---

## LESSON LEARNED

The direction inversion catch is exactly why we demand 
"verification at every step." 

The factor analysis framework is WORKING — it found real edges.
But interpreting the results requires knowing exactly what 
the backtest simulated (SHORT vs LONG direction).

This is also why production systems need:
  - Clear trade direction labels in every signal
  - Backtest reports that explicitly state "SIMULATED AS SHORT"
  - Visual confirmation on TradingView charts
  - Paper trading before real money

Good catch by the agent. This is how professional 
development should work — test, verify, correct, iterate.
