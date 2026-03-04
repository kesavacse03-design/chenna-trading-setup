# ============================================================================
# CTS V6 — MASTER BLUEPRINT FOR AGENT
# ============================================================================
# This is a STANDALONE document. Agent must not need to ask Kesava anything.
# Read this FULLY before writing a single line of code.
# ============================================================================

## CONTEXT: WHERE WE ARE

We have been building CTS (Chenna Trading System) — an automated intraday trading 
platform for Indian stock markets. We previously tested a 30-minute ORB strategy 
on 597 stocks and got terrible results:

OLD APPROACH (30-min ORB):
- T1 hit rate: 15-20%
- 74.7% of trades drifted to EOD (no target, no stop)
- Range size >2% had only 2.1% T1 hit rate
- Net negative returns

WHY IT FAILED:
- Fixed 30-minute OR definition (wrong — OR is DYNAMIC)
- Tested on ALL 597 F&O stocks (wrong — only test on IB/HP stocks)
- Stop loss at OR opposite end (wrong — SL is at RETRACEMENT LOW, the higher low)
- No EMA filter (wrong — EMA proximity is critical for entry quality)
- No stock quality filter (wrong — need R-Factor ranking from TradeCode)

TODAY (March 4, 2026): We studied TCI Mentorship Modules 01 & 02 deeply and 
discovered the CORRECT ORB definition and entry rules. We are now rebuilding 
everything from scratch with the right approach.

---

## PART A: WHAT THE AGENT MUST DO

### TASK 1: PAUSE BACKGROUND ACTIVITIES

Before ANY development work:
```
1. Turn OFF the INTRADAY_BOOST category in the controller
2. Turn OFF signal generator for INTRADAY_BOOST
3. Turn OFF scanner for INTRADAY_BOOST
4. Confirm all three are OFF
5. Log: "Background activities paused for INTRADAY_BOOST at [timestamp]"
```

This prevents stale signals from old logic interfering with testing.
Resume ONLY after new strategy is validated and deployed.

---

### TASK 2: STOCK RESEARCH — TODAY (March 4, 2026)

Pull today's INTRADAY_BOOST and HIGH_POWERED_STOCKS lists from the database.

For INTRADAY BOOST stocks, show:
```
| Symbol | R-Factor | Sector | In HP also? | Gap% | OR Width% |
```

For HIGH POWERED stocks, show:
```
| Symbol | Turnover | Sector | In IB also? | Gap% |
```

THEN analyze the MARKET CONTEXT:
```
1. NIFTY 50 today: Open, High, Low, Current, % change
2. BANK NIFTY: same
3. VIX: current level (>15 = volatile, <12 = calm)
4. Which sectors are UP today? Which are DOWN?
5. FII/DII flow direction (if available from database)
```

WHY THIS MATTERS (from Module 01):
- "Pick 4-5 stocks which have high volume in HP and high R-Factor in IB"
- "If stock appears in BOTH lists = highest conviction"
- "Check what Nifty is doing — if Nifty is down, most stocks will be bearish"
- "Look at sectoral flow — strongest/weakest sectors guide trade direction"

FOR EACH OF THE TOP 5 STOCKS by R-Factor today, provide:
```
Stock: [SYMBOL]
Sector: [sector]
NIFTY direction today: [up/down/flat]
Sector performance today: [sector up/down relative to NIFTY]
Gap at open: [X.X%]
First candle (3-min): [open, high, low, close, color]
OR detected: [how many candles until opposite color]
OR High: [price]
OR Low: [price]
OR Width: [X.X%]
ORB signal: [long/short/none] at [time]
Breakout candle: [OHLC, body%]
EMA 10 at breakout: [price]
Distance from EMA: [X.X%]
SL (retracement low/high): [price]
SL %: [X.X%]
T1 (1:1): [price]
T2 (1:2): [price]
Current price: [price]
Would T1 have hit? [yes/no at what time]
Would SL have hit? [yes/no at what time]
RESULT: [WIN T1 / WIN T2 / LOSS SL / STILL OPEN]
```

---

### TASK 3: STOCK RESEARCH — FEBRUARY 2, 2025

This is the COMPARISON date. We want to see if the OLD 30-min ORB would have 
given different results vs the NEW dynamic ORB on the SAME stocks.

Steps:
```
1. Query database: What stocks were in INTRADAY_BOOST on Feb 2, 2025?
   (or nearest available date if Feb 2 was not a trading day)
2. Query database: What stocks were in HIGH_POWERED_STOCKS on same date?
3. Get 1-minute candle data for top 5 stocks (by R-Factor or Turnover)
   - If 1-min data not available (>30 days old), use 5-min or 30-min
4. For each stock, run BOTH approaches:

   APPROACH A: OLD 30-MIN ORB
   - OR = first 30-min candle (9:15-9:45)
   - OR High = high of first 30-min candle
   - OR Low = low of first 30-min candle
   - Entry when next candle closes above/below
   - SL = opposite end of OR
   
   APPROACH B: NEW DYNAMIC ORB (Prashant method)
   - First candle on 3-min/5-min chart
   - Wait for opposite color candle
   - OR = range from first candle to opposite color (inclusive)
   - Entry on decisive breakout (50%+ body outside OR)
   - SL = retracement low (swing high/low in zone from entry back to opposite candle)
   - EMA proximity check
   
5. Compare:
   | Stock | Old OR H/L | New OR H/L | Old Entry | New Entry | Old SL% | New SL% | Old Result | New Result |
```

This gives us PROOF of whether the new approach is better.

---

### TASK 4: DEEP ANALYSIS — WHAT-IF SCENARIOS

For each of today's top 5 stocks, think through these scenarios:

```
WHAT IF...
- NIFTY was down 2%+ today → would this stock still have given same signal?
- This stock's sector was weak → would the signal direction change?
- OR width was >2.5% → would we skip ORB and wait for LEG?
- EMA was far at breakout → would we wait or enter with warning?
- Breakout was only 40% body (not decisive) → would we skip?
- SL was >1.5% → would we skip or adjust entry?
- Price was below previous day close → does that change bias?
- It was after 11:30 AM → would we use 5-min instead of 3-min?
- It was after 1 PM → would we reduce targets to 1:1 only?
- This was the 3rd signal today → do we skip (max 3 legs)?

HOW WOULD...
- A pro trader handle a stock that breaks OR then comes back inside?
- You differentiate between a real breakout and a fake breakout?
- Volume confirmation help (big volume on breakout candle = real)?
- EMA crossover (10 crossing below 20) change the bias?
- Previous day's trend affect today's ORB direction preference?

WHEN SHOULD WE...
- NOT trade at all today? (high VIX, NIFTY gap down 3%+, no clear sector trend)
- Take ONLY short trades? (NIFTY bearish, most sectors red)
- Prefer LEG over ORB? (OR too wide, EMA far from OR, volatile open)
- Scale position size? (tight SL = bigger position, wide SL = smaller)
```

---

### TASK 5: ARCHITECTURE DECISION — PINE SCRIPT

**ANSWER: ONE combined script with Mode selector (Auto/ORB Only/LEG Only)**

Reasons:
- ORB and LEG share 80% code (OR detection, EMA, gap, dashboard)
- Splitting creates duplicate maintenance burden
- Mode selector gives user control to test each independently
- "Auto" mode tries ORB first, falls back to LEG — which is how Prashant trades

The Pine Script is being handled separately (not agent's task).
Agent's task is BACKEND strategy testing and validation.

---

### TASK 6: BUILD BACKEND STRATEGY TESTER

Create a Node.js script: `strategy_tester_v6.cjs`

This script must:
```
1. Accept parameters:
   - date (single date or date range)
   - category ('INTRADAY_BOOST' or 'HIGH_POWERED_STOCKS')
   - timeframe (3 or 5 minutes)
   - orMethod ('dynamic' or '30min')
   - mode ('ORB' or 'LEG' or 'AUTO')

2. For each stock in the category on that date:
   a. Fetch candle data (1-min from Upstox, aggregate to 3/5-min)
   b. Detect Opening Range:
      - Dynamic: first candle → wait for opposite color → lock
      - 30min: high/low of 9:15-9:45 candle
   c. Detect breakout (decisive close beyond OR)
   d. Calculate entry, SL (retracement swing), targets
   e. Track forward: did T1 hit before SL? When?
   f. Log complete trade trace

3. Output:
   - CSV file: every signal with full details
   - Summary table: total trades, T1 WR, T2 WR, SL rate, net R
   - Comparison table if both methods tested
   - Individual trade traces for manual verification
```

IMPORTANT: The tester must simulate EXACTLY what a human trader would see 
in real-time. No lookahead bias. No future data. Process candles one by one 
in chronological order.

---

### TASK 7: EXPECTED OUTPUT FORMAT

The agent must produce these files:

```
1. /reports/stock_analysis_2026-03-04.md
   - Today's market context (NIFTY, sectors, VIX)
   - Top 5 IB stocks analysis with full trade traces
   - Top 5 HP stocks analysis
   - What-if analysis for each

2. /reports/stock_comparison_2025-02-02.md  
   - Feb 2, 2025 stocks: old ORB vs new dynamic ORB
   - Side-by-side comparison table
   - Which approach won and by how much

3. /reports/strategy_test_results.csv
   - Every signal: date, symbol, method, entry, SL, T1, T2, result
   - Machine-readable for further analysis

4. /backend/strategies/strategy_tester_v6.cjs
   - Reusable testing script
   - Can be run on any date range

5. /reports/architecture_decision.md
   - Why one combined Pine Script with Mode selector
   - How ORB and LEG complement each other
   - Edge cases and when each method shines
```

---

## PART B: STRATEGY RULES REFERENCE

### OPENING RANGE (Dynamic — NOT 30 minutes)

```
1. Day starts → first candle (note color)
2. If same color continues → keep extending OR High/Low
3. Moment OPPOSITE color candle forms → OR LOCKED
4. OR High = highest high of all candles (first through opposite, inclusive)
5. OR Low = lowest low of all candles (first through opposite, inclusive)
6. OR Width = (OR High - OR Low) / OR Low * 100
7. If Width > 2.5% → "Too Wide" → ORB not valid, only LEG
```

### ORB ENTRY

```
- Candle CLOSES beyond OR boundary with body 50%+ outside
- Entry = close of that candle
- EMA 10 distance check: warning if >0.5%, NOT a block
- SL = swing high/low of zone from entry back to opposite color candle
  (the RETRACEMENT point — higher low for longs, lower high for shorts)
- SL must be <1.5% from entry
- T1 = 1:1 R:R → book 70%
- T2 = 1:2 R:R → trail 30%
```

### LEG ENTRY

```
Prerequisites: price outside OR, prior leg exists, consolidation near EMA,
strength candle bounces from EMA, max 3 per day
- Entry = close of strength candle
- SL = extreme of consolidation zone (NOT the whole prior leg)
- SL must be <1.5%
- Same targets as ORB
```

### TIMEFRAMES

```
- 3-minute: standard, before 11:30 AM
- 5-minute: after 11:30 AM
- 1-minute: ONLY for 3%+ gap-up shorts
```

### STOCK SELECTION

```
From TradeCode:
- INTRADAY_BOOST: ranked by R-Factor (proprietary momentum score)
- HIGH_POWERED_STOCKS: ranked by Turnover
- Best trades: stocks appearing in BOTH lists
- Pick top 4-5 by volume/R-Factor
- After picking, manage trades purely on price action
```

---

## PART C: CRITICAL REMINDERS

1. **PROOF OVER THEORY**: Every result must be verifiable against actual candle data.
   No aggregate stats without detailed trade traces. Show me the candles.

2. **IF ACCURACY IS LOW**: The strategy has 70-80% win rate when executed correctly.
   If testing shows <60%, the BUG IS IN THE CODE. Audit SL calculation first.

3. **NO SHORTCUTS**: Don't skip the market context analysis. NIFTY direction and 
   sector flow determine whether we should even trade that day.

4. **PAUSE BACKGROUND**: Scanner and signal generator must be OFF while developing.
   Turn them back ON only after validation is complete.

5. **COMPARE BOTH APPROACHES**: The whole point is proving the new dynamic OR 
   is better than the old 30-min OR. Without the comparison, this work is useless.

6. **DON'T ASK KESAVA**: This document has everything you need. If something 
   is unclear, re-read the module summaries in the project files. The answers 
   are there. Kesava's weekly message limit is exhausting — execute independently 
   and show results, don't ask questions.

7. **SAVE FREQUENTLY**: Push to git after each major task completion. Don't lose work.

---

## PART D: EXECUTION ORDER

```
Step 1: Pause INTRADAY_BOOST background tasks (5 min)
Step 2: Pull today's stock lists + market context (15 min)
Step 3: Analyze today's top 5 stocks with full traces (30 min)
Step 4: Pull Feb 2, 2025 stocks + run comparison (30 min)
Step 5: Build strategy_tester_v6.cjs (60 min)
Step 6: Run tester on available date range (30 min)
Step 7: Write what-if analysis (15 min)
Step 8: Compile all reports (15 min)
Step 9: Push everything to git
Step 10: Report results to Kesava with summary + file links
```

Total estimated time: 3-4 hours of focused work.

---

## PART E: SUCCESS CRITERIA

The agent's work is COMPLETE when:

✅ Background tasks paused and confirmed
✅ Today's market context documented (NIFTY, VIX, sectors)
✅ Today's top 5 IB stocks analyzed with full trade traces
✅ Feb 2, 2025 comparison completed (old vs new ORB)
✅ Strategy tester script built and producing results
✅ What-if scenarios documented
✅ Net R and win rate calculated for both approaches
✅ All results in /reports/ folder with proper formatting
✅ Git committed with descriptive message

The agent's work FAILS if:
❌ Results are aggregate only without trade-by-trade traces
❌ SL is calculated wrong (using OR opposite end instead of retracement)
❌ Stocks tested are not from the actual IB/HP category on that date
❌ No comparison between old and new approach
❌ Background tasks not paused
❌ Kesava has to ask for clarification or redo anything
