# CTS - IMPLEMENTATION ROADMAP (NO CODE, PURE DIRECTION)
## WHAT TO BUILD, WHY, AND HOW

**Version:** 2.0 - Pure Directives
**Date:** January 7, 2026

---

## 🎯 THE PROBLEM YOU'RE SOLVING

You have:
- Stocks from external website
- Grouped by category names (like "DOWNSIDE_LOM_SWING")
- Each stock has an "added_date" (when it appeared in that category)

You want:
- Understand what these categories REALLY mean (not the name, the actual behavior)
- Learn which stocks succeed vs fail
- Build rules to identify good trades in future

Current issue:
- Your system shows 24% success = Something is fundamentally wrong

---

## 📊 COMPLETE SYSTEM MAP

```
PHASE 1: UNDERSTAND THE DATA
│
├─► What actually happened to these stocks?
├─► Did they go up? Down? Sideways?
├─► Success rate calculation
└─► GOAL: Get >60% success rate, confirm patterns exist
    │
    └─► OUTPUT: List of stocks with outcomes (SUCCESS/FAILURE)

PHASE 2: FIND CATEGORY MEANING
│
├─► Look at successful stocks - what do they have in common?
├─► Look at failed stocks - what do they have in common?
├─► Write human description of what this category means
└─► GOAL: Category signature in plain English
    │
    └─► OUTPUT: "This category means: stocks near support showing exhaustion..."

PHASE 3: DISCOVER BEHAVIOR GROUPS
│
├─► Not all successful stocks behave the same way
├─► Group them: "Slow grind" vs "Fast spike" vs "Noisy chaos"
├─► Calculate success rate per group
└─► GOAL: 2-4 behavior clusters with characteristics
    │
    └─► OUTPUT: 60% stocks → Pattern A (72% success)
                30% stocks → Pattern B (58% success)
                10% stocks → Avoid (30% success)

PHASE 4: UNDERSTAND MARKET CONTEXT
│
├─► When did this category work? Bull market? Flat market?
├─► What was NIFTY doing on successful days?
├─► What was VIX level?
└─► GOAL: Know when to trade this category vs when to avoid
    │
    └─► OUTPUT: "Works when NIFTY uptrend + VIX < 18"
                "Fails when NIFTY down + VIX > 22"

PHASE 5: BUILD RULES
│
├─► Entry rules per behavior cluster
├─► Exit rules per behavior cluster
├─► Avoid criteria (what NOT to trade)
└─► GOAL: Clear IF-THEN rules for future trading
    │
    └─► OUTPUT: JSON file with all rules

PHASE 6: APPLY TO NEW STOCKS
│
└─► When user adds NEW stocks tomorrow:
    ├─► Check if current behavior matches historical patterns
    ├─► Check if market conditions match
    └─► Generate BUY/AVOID signals
```

---

# 🔥 PHASE 1: UNDERSTAND THE DATA

## Purpose
Before learning patterns, we must know: Did stocks go up or down after added_date?

## What This Phase Does

### INPUT
- Database table with stocks
- Each stock has: symbol, category, added_date

### PROCESS

**Step 1: Fetch Price History**
- For each stock, get daily price data (OHLC + Volume)
- Time range: 5 days BEFORE added_date to 15 days AFTER added_date
- Source: Upstox API

**Step 2: Calculate Outcome**
For each stock, determine:
- Did it reach profit target? (e.g., +3%)
- Did it hit stop loss? (e.g., -2%)
- How many days did it take?

**Logic:**
```
Entry = Close price on added_date
Target = Entry × 1.03 (3% profit)
Stop = Entry × 0.98 (2% loss)
Max Days = 10 days

FOR each day after entry (up to 10 days):
  IF stock's HIGH touched or crossed TARGET
    → MARK as SUCCESS
    → Exit at target price
    → STOP checking further
  
  ELSE IF stock's LOW touched or crossed STOP
    → MARK as FAILURE
    → Exit at stop price
    → STOP checking further
  
  ELSE continue to next day

IF after 10 days, neither target nor stop hit:
  → MARK as FAILURE_TIMEOUT
  → Exit at closing price on day 10
```

### OUTPUT

**Data Table (CSV or Database):**
```
| Stock     | Added Date | Entry Price | Outcome        | Exit Price | Return % | Days |
|-----------|------------|-------------|----------------|------------|----------|------|
| ICICIBAN  | 2025-12-30 | 1418.00     | SUCCESS        | 1460.54    | +3.00    | 5    |
| COLPAL    | 2025-12-30 | 2068.10     | FAILURE_STOP   | 2026.74    | -2.00    | 3    |
| CDFORGE   | 2025-12-29 | 1650.30     | FAILURE_TIMEOUT| 1658.20    | +0.48    | 10   |
```

**Summary Statistics (Show in UI):**
```
CATEGORY: DOWNSIDE_LOM_SWING
═══════════════════════════════════════

📊 ANALYSIS SUMMARY
Total Stocks: 242
Date Range: Dec 20, 2025 - Dec 30, 2025

OUTCOMES:
✅ Success: 165 stocks (68.2%)
❌ Hit Stop Loss: 48 stocks (19.8%)
⏱️  Timeout (No Move): 29 stocks (12.0%)

RETURNS:
Average Winner: +3.2%
Average Loser: -1.4%
Overall Average: +1.8%

TIMING:
Avg Days (Winners): 5.3 days
Avg Days (Losers): 6.8 days

RETURN DISTRIBUTION:
Less than -5%:     █░░ 8 stocks
-5% to -2%:        ████░ 40 stocks
-2% to 0%:         ███░░ 29 stocks
0% to +2%:         ████░ 38 stocks
+2% to +5%:        ██████████ 98 stocks ← Most common
+5% to +10%:       ███░░ 26 stocks
More than +10%:    █░░ 3 stocks
```

### UI Display (Phase 1 Complete Screen)

```
┌────────────────────────────────────────────────────┐
│  PHASE 1: DATA ANALYSIS COMPLETE                   │
├────────────────────────────────────────────────────┤
│                                                     │
│  Category: DOWNSIDE_LOM_SWING                      │
│  Status: ✅ ANALYZED                               │
│                                                     │
│  📊 Results:                                       │
│     • 242 stocks analyzed                          │
│     • 68.2% success rate                           │
│     • Average return: +1.8%                        │
│                                                     │
│  [View Detailed Results] [View Sample Charts]      │
│  [Next: Discover Patterns] [Change Parameters]     │
│                                                     │
└────────────────────────────────────────────────────┘
```

### What Goes to Phase 2

The outcome table (each stock tagged as SUCCESS or FAILURE) + the price history data.

### CHECKPOINT - Don't Proceed If:

❌ Success rate < 50% → Fix parameters or source data is bad
❌ Too few stocks (< 50) → Need more data
❌ Data quality issues → Some stocks have no price data

✅ Proceed if: Success rate > 60% AND you have clean data for >100 stocks

---

# 🔍 PHASE 2: FIND CATEGORY MEANING

## Purpose
Understand what "DOWNSIDE_LOM_SWING" REALLY means by observing actual stock behavior.

## What This Phase Does

### INPUT
- Outcome table from Phase 1 (stocks tagged SUCCESS/FAILURE)
- Price history for all stocks

### PROCESS

**Observation Approach:**

Look at the 5 days BEFORE added_date for all successful stocks.

**Questions to Answer:**

1. **Price Position:**
   - Where was the stock before added_date?
   - Near support level?
   - Breaking resistance?
   - Random middle of range?

2. **Price Movement:**
   - Was it falling before added_date?
   - Consolidating (sideways)?
   - Already rising?

3. **Volume Behavior:**
   - Was volume increasing?
   - Decreasing (drying up)?
   - Normal/stable?

4. **Speed of Move (after entry):**
   - Did successful stocks move fast (1-2 days)?
   - Or slow and steady (5-7 days)?
   - Or choppy but eventually worked?

5. **Candle Patterns:**
   - Small body candles (indecision)?
   - Large green candles (strong buying)?
   - Long wicks (rejection)?

**How to Find Common Threads:**

Take 20 SUCCESSFUL stocks:
- Look at their charts 5 days before → 10 days after added_date
- Note what you observe
- Find what most of them (>70%) have in common

Example observations:
```
Stock 1 (ICICIBAN): Was falling for 5 days, hit support zone, volume dried up, then bounced slowly
Stock 2 (COLPAL): Was falling, near 200 DMA, low volume, then recovered over 6 days
Stock 3 (TATASTEEL): Dropped to support, built small base for 2 days, then climbed
...
Stock 20: Same pattern - support zone, low volume, slow recovery

COMMON THREAD: 
"Most successful stocks were at support zones after decline,
volume was declining (not spiking), and recovery was slow/steady over 5-7 days"
```

Take 20 FAILED stocks:
- Same process
- Find what most failures have in common

Example:
```
Failed Stock 1: Had volume spike on entry day (false move)
Failed Stock 2: No clear support level (random price)
Failed Stock 3: Continued falling (support broke)
...
Failed Stock 20: Most had either volume spikes or no support level

COMMON THREAD:
"Failures showed volume spikes (traps), or no support structure,
or continued decline after entry"
```

### OUTPUT

**Category Signature (Human Readable Description):**

```
CATEGORY: DOWNSIDE_LOM_SWING

DEFINITION (from data observation):
"Stocks showing downside exhaustion at support zones. 
After declining for several days, stock reaches support 
level and stabilizes with declining volume. Recovery 
is typically slow and steady over 5-7 days."

TYPICAL SETUP:
• Stock declined 5-10% before added_date
• Found support at technical level (previous low, moving average)
• Volume decreased during decline (selling exhausted)
• Price stabilized 1-2 days before entry
• Recovery was gradual, not spike

SUCCESS CHARACTERISTICS:
• Clear support level visible
• Volume declining (not spiking)
• Small consolidation before move
• Market neutral or positive
• 68.2% success rate historically

FAILURE CHARACTERISTICS:
• Volume spike on entry (false breakout)
• No clear support level
• Continued weakness after entry
• Market strongly negative
• 31.8% of stocks failed
```

### UI Display (Phase 2 Complete Screen)

```
┌────────────────────────────────────────────────────┐
│  PHASE 2: CATEGORY SIGNATURE DISCOVERED            │
├────────────────────────────────────────────────────┤
│                                                     │
│  📝 What This Category Means:                      │
│                                                     │
│  "Stocks at support showing exhaustion after       │
│   decline. Volume dries up, recovery is slow       │
│   and steady over 5-7 days."                       │
│                                                     │
│  ✅ Success Pattern (68.2%):                       │
│     • Clear support level                          │
│     • Declining volume                             │
│     • Slow steady recovery                         │
│     • Takes 5-7 days on average                    │
│                                                     │
│  ❌ Failure Pattern (31.8%):                       │
│     • Volume spikes (false moves)                  │
│     • No support structure                         │
│     • Continued decline                            │
│                                                     │
│  [View Sample Charts] [Next: Behavior Clusters]    │
│                                                     │
└────────────────────────────────────────────────────┘
```

### What Goes to Phase 3

The category signature description + understanding of success vs failure patterns.

---

# 🎭 PHASE 3: DISCOVER BEHAVIOR GROUPS

## Purpose
Not all successful stocks behave the same way. Group them into distinct behavior patterns.

## What This Phase Does

### INPUT
- List of successful stocks (from Phase 1)
- Price history + volume data
- Category signature understanding (from Phase 2)

### PROCESS

**Clustering Approach:**

Even among successful stocks, there are sub-patterns. Find 2-4 distinct groups.

**Dimensions to Group By:**

1. **Speed of Movement:**
   - Fast movers (hit target in 1-3 days)
   - Medium movers (hit target in 4-7 days)
   - Slow movers (hit target in 8-10 days)

2. **Volume Pattern:**
   - Low volume throughout
   - Volume spike on entry day
   - Volume gradually increasing

3. **Price Action Style:**
   - Smooth upward trend (no pullbacks)
   - Choppy but net positive (many small moves)
   - Gap up then consolidate

4. **Setup Before Entry:**
   - Built base for 2+ days (consolidation)
   - Immediate bounce (V-shape)
   - Gradual bottom formation

**Grouping Method:**

Take all SUCCESSFUL stocks (165 stocks with 68% success):

**Group 1: Identify FAST MOVERS**
- Filter: Stocks that hit target in ≤ 3 days
- Count how many: e.g., 50 stocks
- Observe: What else do they have in common?
  - Maybe they all had volume spikes
  - Maybe they were small caps (high volatility)
  - Maybe they bounced sharply (V-shape)

Name this group based on observation:
- "FAST_SPIKE" if volume spike + quick move
- Calculate success rate WITHIN this group

**Group 2: Identify SLOW GRINDERS**
- Filter: Stocks that took 5-8 days to hit target
- Count: e.g., 95 stocks
- Observe common patterns:
  - Maybe low/declining volume
  - Maybe larger market cap
  - Maybe gradual upward trend

Name: "SLOW_GRIND"

**Group 3: Identify NOISE**
- Remaining stocks that don't fit clear patterns
- Count: e.g., 20 stocks
- These might have just gotten lucky

Name: "NOISY_CHAOS" → Mark as AVOID

### OUTPUT

**Behavior Clusters:**

```
CATEGORY: DOWNSIDE_LOM_SWING
Total Stocks: 242

CLUSTER 1: SLOW_GRIND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Stocks: 150 (61.9% of total)
Success Rate: 72.0% (108 success, 42 fail)

CHARACTERISTICS:
• Price stabilized 2-3 days before entry
• Volume declining (0.8x to 1.2x of 20-day average)
• Move happened over 5-7 days
• Smooth gradual climb, minimal pullbacks
• Mostly mid-cap to large-cap stocks

RETURNS:
• Average: +4.2%
• Typical: +3% to +5%
• Time: 5.8 days average

WHEN IT WORKS BEST:
• Market trending up or sideways
• Sector showing strength
• Clear support level present

RISK LEVEL: LOW (consistent, predictable)


CLUSTER 2: FAST_SPIKE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Stocks: 71 (29.3% of total)
Success Rate: 59.2% (42 success, 29 fail)

CHARACTERISTICS:
• Immediate bounce from support
• Volume spike on entry day (2x+ average)
• Move happened in 2-4 days
• Quick sharp move, then stall/reverse
• Mostly small-cap stocks

RETURNS:
• Average: +3.8%
• Typical: +3% to +4%
• Time: 2.9 days average

WHEN IT WORKS BEST:
• Strong market trending up
• High momentum environment
• Clear catalyst (news/results)

RISK LEVEL: MEDIUM (fast but risky - can reverse quickly)


CLUSTER 3: NOISY_CHAOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Stocks: 21 (8.7% of total)
Success Rate: 28.6% (6 success, 15 fail)

CHARACTERISTICS:
• No clear pattern
• Erratic price movement
• Volume inconsistent
• No support structure
• Random outcomes

RETURNS:
• Average: -0.8%
• Unpredictable

RECOMMENDATION: AVOID
These stocks show no reliable pattern. Success appears random.
```

### UI Display (Phase 3 Complete Screen)

```
┌────────────────────────────────────────────────────┐
│  PHASE 3: BEHAVIOR CLUSTERS IDENTIFIED             │
├────────────────────────────────────────────────────┤
│                                                     │
│  🎯 3 Distinct Behavior Patterns Found:            │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │ 1. SLOW_GRIND (150 stocks)                  │  │
│  │    Success: 72.0% | Risk: LOW               │  │
│  │    "Steady climb over 5-7 days"             │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │ 2. FAST_SPIKE (71 stocks)                   │  │
│  │    Success: 59.2% | Risk: MEDIUM            │  │
│  │    "Quick bounce in 2-4 days"               │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │ 3. NOISY_CHAOS (21 stocks)                  │  │
│  │    Success: 28.6% | Risk: HIGH              │  │
│  │    ⚠️ AVOID - No reliable pattern           │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
│  [View Cluster Details] [Next: Market Context]     │
│                                                     │
└────────────────────────────────────────────────────┘
```

### What Goes to Phase 4

The behavior clusters with their characteristics and success rates.

---

# 🌍 PHASE 4: UNDERSTAND MARKET CONTEXT

## Purpose
Learn WHEN this category works (market conditions matter).

## What This Phase Does

### INPUT
- Successful vs failed stocks (from Phase 1)
- Their added_dates
- Behavior clusters (from Phase 3)

### PROCESS

**For each stock's added_date, fetch:**

1. **NIFTY Data:**
   - NIFTY close price
   - NIFTY trend: Is it going up/down/sideways?
   - Calculate: Was NIFTY above or below 50-day moving average?

2. **VIX Data:**
   - VIX level on that date
   - Low VIX (< 15) = calm market
   - Medium VIX (15-20) = normal
   - High VIX (> 20) = fearful market

3. **Market Breadth:**
   - How many NSE stocks advanced vs declined that day?
   - Ratio > 1.5 = strong breadth (good)
   - Ratio < 0.7 = weak breadth (bad)

**Analysis:**

**For SUCCESSFUL stocks:**
```
Take 108 successful SLOW_GRIND stocks:

Group by NIFTY trend:
• NIFTY uptrend: 72 stocks (67%) → 78% success rate
• NIFTY sideways: 28 stocks (26%) → 68% success rate
• NIFTY downtrend: 8 stocks (7%) → 38% success rate

Group by VIX level:
• VIX < 15: 45 stocks → 82% success rate
• VIX 15-18: 48 stocks → 74% success rate
• VIX 18-22: 12 stocks → 58% success rate
• VIX > 22: 3 stocks → 33% success rate

Group by Breadth:
• Strong breadth (>1.5): 52 stocks → 81% success rate
• Neutral breadth (0.9-1.5): 41 stocks → 71% success rate
• Weak breadth (<0.9): 15 stocks → 47% success rate
```

**Pattern Emerges:**
```
SLOW_GRIND works best when:
• NIFTY trending up OR sideways (not down)
• VIX < 18 (calm to normal volatility)
• Breadth positive (more stocks advancing)

SLOW_GRIND struggles when:
• NIFTY strongly down
• VIX > 22 (panic)
• Breadth negative (most stocks falling)
```

Do same for FAST_SPIKE cluster.

### OUTPUT

**Market Condition Rules:**

```
CATEGORY: DOWNSIDE_LOM_SWING

FAVORABLE CONDITIONS (Trade with confidence):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NIFTY: Uptrend (above 50-day MA)
VIX: < 18
Breadth: Advancing/Declining ratio > 1.2

Historical Performance in Favorable:
• SLOW_GRIND: 78% success
• FAST_SPIKE: 68% success
• Overall: 75% success

→ RECOMMENDATION: Generate signals freely


SELECTIVE CONDITIONS (Trade only best setups):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NIFTY: Sideways (choppy, no clear trend)
VIX: 18-22
Breadth: Neutral (0.9-1.2 ratio)

Historical Performance in Selective:
• SLOW_GRIND: 68% success
• FAST_SPIKE: 52% success
• Overall: 62% success

→ RECOMMENDATION: Only high-confidence signals, reduce position size


HOSTILE CONDITIONS (Avoid trading):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NIFTY: Downtrend (below 50-day MA, falling)
VIX: > 22
Breadth: Negative (< 0.9 ratio)

Historical Performance in Hostile:
• SLOW_GRIND: 38% success
• FAST_SPIKE: 31% success
• Overall: 35% success

→ RECOMMENDATION: NO SIGNALS - Don't trade this category today
```

### UI Display (Phase 4 Complete Screen)

```
┌────────────────────────────────────────────────────┐
│  PHASE 4: MARKET CONTEXT MAPPED                    │
├────────────────────────────────────────────────────┤
│                                                     │
│  🚦 Success Depends on Market Conditions:          │
│                                                     │
│  ✅ FAVORABLE (75% success):                       │
│     • NIFTY trending up                            │
│     • VIX < 18                                     │
│     • Strong market breadth                        │
│     → Trade confidently                            │
│                                                     │
│  ⚠️ SELECTIVE (62% success):                       │
│     • NIFTY sideways                               │
│     • VIX 18-22                                    │
│     • Neutral breadth                              │
│     → Trade only best setups                       │
│                                                     │
│  ❌ HOSTILE (35% success):                         │
│     • NIFTY trending down                          │
│     • VIX > 22                                     │
│     • Weak breadth                                 │
│     → Don't trade at all                           │
│                                                     │
│  [View Detailed Analysis] [Next: Build Rules]      │
│                                                     │
└────────────────────────────────────────────────────┘
```

### What Goes to Phase 5

Market condition thresholds and success rates per condition.

---

# 📋 PHASE 5: BUILD TRADING RULES

## Purpose
Convert all learnings into actionable IF-THEN rules for future trading.

## What This Phase Does

### INPUT
- Behavior clusters (Phase 3)
- Market conditions (Phase 4)
- Success/failure patterns (Phase 2)

### PROCESS

Generate rules for each behavior cluster.

**Entry Rule Structure:**
```
IF stock matches [cluster characteristics]
AND market is [favorable/selective condition]
AND stock does NOT have [avoid criteria]
THEN generate BUY signal with [specific entry type]
```

**Exit Rule Structure:**
```
WHILE position is open:
  IF [target hit] THEN exit with profit
  IF [stop hit] THEN exit with loss
  IF [days exceed max] THEN exit (timeout)
  IF [market changes to hostile] THEN exit (protect capital)
  IF [trailing stop triggered] THEN exit (protect profit)
```

### OUTPUT

**Trading Rules Document:**

```
CATEGORY: DOWNSIDE_LOM_SWING
TRADING RULES (Generated from 242 historical stocks)

═══════════════════════════════════════════════════════════

CLUSTER 1: SLOW_GRIND RULES

ENTRY CONDITIONS:
────────────────────────────────────────────────────────
Must have ALL of these:

1. Stock Characteristics:
   • Price at or near support level (within 2% of recent low)
   • Volume declining (current < 1.2x of 20-day average)
   • No gap down on current day (gap < -2%)
   • Price stable last 2 days (daily change < 2%)

2. Market Conditions:
   • NIFTY above 50-day MA (uptrend or sideways)
   • VIX < 18
   • Breadth ratio > 1.0

3. Avoid If:
   • Volume spike (> 2x average) on current day
   • Stock price > ₹2000 AND volume < 100,000
   • Gap down > 2% today
   • Earnings announcement within 2 days

ENTRY EXECUTION:
• Type: LIMIT order
• Price: Current price - 0.5% (don't chase)
• Valid: Until 3:20 PM same day
• Reason: Wait for stability, slow pattern allows patience

EXIT CONDITIONS:
────────────────────────────────────────────────────────
Exit when ANY of these occur:

1. Target Hit:
   • Return reaches +3% to +5% (depending on stock volatility)
   • Exit: LIMIT order at target price

2. Stop Loss Hit:
   • Return reaches -2%
   • Exit: MARKET order (exit immediately)

3. Time Stop:
   • 7 days passed AND return < +1%
   • Reason: Too slow, opportunity cost
   • Exit: LIMIT order at market price

4. Market Change:
   • Market state changes from FAVORABLE → HOSTILE
   • AND position is in profit
   • Exit: LIMIT order, book profit

5. Trailing Stop (Profit Protection):
   • IF return > +4% THEN activate trailing stop
   • Trailing stop = Entry + (50% of current profit)
   • Example: Entry ₹100, Current ₹106 (+6%)
     → Trailing stop = ₹100 + (6% × 0.5) = ₹103

POSITION SIZING:
• Minimum capital: ₹10,000 per trade
• Recommended: 10-20 shares (adjust for price)
• Risk per trade: Max -2% of position size

═══════════════════════════════════════════════════════════

CLUSTER 2: FAST_SPIKE RULES

ENTRY CONDITIONS:
────────────────────────────────────────────────────────
Must have ALL of these:

1. Stock Characteristics:
   • Sharp bounce visible (> 2% move from support)
   • Volume spike (> 2x average)
   • Support level clear and tested
   • Move happening NOW (not waiting)

2. Market Conditions:
   • NIFTY strongly uptrending (above 50-day MA by >1%)
   • VIX < 20
   • Breadth strongly positive (> 1.5)

3. Avoid If:
   • Market not strongly bullish
   • Late in day (after 2 PM)
   • User trades manually (execution delay kills this pattern)

ENTRY EXECUTION:
• Type: MARKET order
• Urgency: IMMEDIATE (within 5 minutes)
• Reason: Speed matters, delay = failure

EXIT CONDITIONS:
────────────────────────────────────────────────────────
Exit when ANY of these occur:

1. Target Hit:
   • Return reaches +3% to +4%
   • Exit: LIMIT order at target
   • Note: Don't be greedy, fast moves reverse fast

2. Stop Loss Hit:
   • Return reaches -2%
   • Exit: MARKET order immediately

3. Time Stop:
   • 4 days passed (fast pattern, if not working by day 4, won't work)
   • Exit: LIMIT order

4. Pattern Break:
   • Volume dries up after entry (< 1x average)
   • Momentum lost (stock sideways for 2 days)
   • Exit: LIMIT order

═══════════════════════════════════════════════════════════

CLUSTER 3: NOISY_CHAOS

ACTION: AVOID COMPLETELY
Reason: Only 28.6% success, no reliable pattern

═══════════════════════════════════════════════════════════

AVOID CRITERIA (Apply to ALL clusters):
────────────────────────────────────────────────────────
Do NOT generate signal if ANY of these:

1. Price & Liquidity:
   • Stock price > ₹2000 AND avg volume < 100,000
   • Reason: Manual execution impossible, illiquid

2. Gap Behavior:
   • Stock gaps down > 2% on signal day
   • Reason: Shows weakness, 72% fail historically

3. Volume Trap:
   • Volume spike > 3x average on signal day
   • Reason: Usually false breakout, 68% fail

4. Market State:
   • Market is HOSTILE (NIFTY down, VIX > 22)
   • Reason: Success rate drops to 35%

5. Earnings / Events:
   • Earnings announcement within 2 days
   • Reason: Unpredictable volatility

6. No Support:
   • Stock not at identifiable support level
   • Reason: Entry point unclear, 65% fail

═══════════════════════════════════════════════════════════
```

### UI Display (Phase 5 Complete Screen)

```
┌────────────────────────────────────────────────────┐
│  PHASE 5: TRADING RULES GENERATED                  │
├────────────────────────────────────────────────────┤
│                                                     │
│  ✅ LABS Analysis Complete!                        │
│                                                     │
│  Generated Rules:                                  │
│  • 2 entry strategies (SLOW_GRIND, FAST_SPIKE)     │
│  • 5 exit rules per strategy                       │
│  • 6 avoid criteria                                │
│                                                     │
│  Ready for Signal Generation:                      │
│  • Apply to new stocks starting tomorrow           │
│  • Check market conditions each morning            │
│  • Generate only high-probability signals          │
│                                                     │
│  ┌──────────────────────────────────────────────┐ │
│  │ Would you like to:                           │ │
│  │                                              │ │
│  │ [Activate Signal Generator] ← Start using    │ │
│  │ [Re-run with Different Parameters]           │ │
│  │ [Export Rules as JSON]                       │ │
│  │ [View Detailed Report]                       │ │
│  └──────────────────────────────────────────────┘ │
│                                                     │
└────────────────────────────────────────────────────┘
```

### What Goes to Phase 6

JSON file with all rules that Signal Generator will use.

**JSON Structure:**
```
{
  "category": "DOWNSIDE_LOM_SWING",
  "last_analysis": "2026-01-07",
  "total_stocks": 242,
  "overall_success_rate": 68.2,
  
  "clusters": [
    {
      "name": "SLOW_GRIND",
      "success_rate": 72.0,
      "entry_rules": { ... },
      "exit_rules": { ... }
    },
    {
      "name": "FAST_SPIKE",
      "success_rate": 59.2,
      "entry_rules": { ... },
      "exit_rules": { ... }
    }
  ],
  
  "market_conditions": {
    "favorable": { ... },
    "selective": { ... },
    "hostile": { ... }
  },
  
  "avoid_criteria": [ ... ]
}
```

---

# 🎯 PHASE 6: APPLY TO NEW STOCKS

## Purpose
When user adds NEW stocks tomorrow, use learned rules to generate signals.

## What This Phase Does

### INPUT
- User uploads 20 new stocks under "DOWNSIDE_LOM_SWING" on Jan 8, 2026
- Rules JSON from Phase 5

### PROCESS

**Step 1: Market State Check (8:00 AM)**
```
Fetch current market data:
• NIFTY: 23,450 (above 50-day MA at 23,200) → UPTREND ✅
• VIX: 14.8 → LOW ✅
• Yesterday's breadth: 1680 advances, 1120 declines → 1.5 ratio ✅

DECISION: Market is FAVORABLE → Proceed with signal generation
```

**Step 2: Stock-by-Stock Analysis**

For each of 20 new stocks:

**Stock 1: ABC**
```
Current price: ₹850
Price 5 days ago: ₹895 (declined -5%)
Support level: ₹845 (previous low from 2 weeks ago)
Distance to support: 0.6% → NEAR SUPPORT ✅

Volume today: 280,000
20-day avg volume: 320,000
Ratio: 0.88x → DECLINING ✅

Price last 2 days: ₹853, ₹850
Change: -0.35%, -0.35% → STABLE ✅

Gap today: -0.2% → NO GAP DOWN ✅

Match to cluster: SLOW_GRIND ✅
Check avoid criteria:
• Price < ₹2000 ✅
• Volume > 100,000 ✅
• No gap down ✅
• No volume spike ✅
• Earnings not within 2 days ✅

DECISION: GENERATE BUY SIGNAL
```

**Stock 2: XYZ**
```
Current price: ₹2,450
Volume: 65,000
20-day avg: 75,000

Check avoid criteria:
• Price > ₹2000 AND volume < 100,000 ❌ FAILS

DECISION: AVOID - Illiquid, manual execution difficult
```

**Step 3: Signal Output**

After checking all 20 stocks:

```
RESULTS:
• 8 stocks → PRIMARY SIGNALS (high confidence)
• 4 stocks → CONDITIONAL SIGNALS (medium confidence)
• 8 stocks → AVOID LIST (failed criteria)
```

### OUTPUT

**Morning Signal Dashboard (8:30 AM):**

```
╔════════════════════════════════════════════════════╗
║        CTS SIGNALS - January 8, 2026               ║
╚════════════════════════════════════════════════════╝

🚦 TODAY'S MARKET: ✅ FAVORABLE
"NIFTY uptrending, VIX low, good breadth - ideal for trading"

───────────────────────────────────────────────────────

📊 CATEGORY: DOWNSIDE_LOM_SWING (20 new stocks analyzed)

🎯 PRIMARY SIGNALS (8) - High Confidence

1. ✅ ABC - ₹850.00
   Pattern: SLOW_GRIND (72% success historically)
   Entry: Limit ₹846 (valid till 3:20 PM)
   Stop: ₹833 (-2%)
   Target: ₹876 (+3%)
   Capital: ₹8,460 (10 shares)
   
   💡 Why: Near support (₹845), volume declining,
   stable 2 days, market favorable
   
   [Buy Now] [Set Alert] [Skip]

2. ✅ DEF - ₹1,240.00
   Pattern: SLOW_GRIND
   ...

───────────────────────────────────────────────────────

⚠️ CONDITIONAL SIGNALS (4) - Medium Confidence

9. ⚠️ GHI - ₹680.00
   Pattern: FAST_SPIKE (59% success)
   Note: Requires immediate entry, fast execution needed
   Only for experienced traders
   
   [Details] [Skip]

───────────────────────────────────────────────────────

⛔ AVOID TODAY (8 stocks)

17. ❌ XYZ - ₹2,450
    Reason: High price + low liquidity
    (₹2,450 per share, volume only 65,000)
    
18. ❌ LMN - ₹320
    Reason: Volume spike (3.2x average)
    Likely false breakout
    
19. ❌ OPQ - ₹560
    Reason: No clear support level
    Entry point unclear

───────────────────────────────────────────────────────

[View All Details] [My Positions] [Settings]
```

---

# 🔄 HOW DATA FLOWS BETWEEN PHASES

```
PHASE 1: OUTCOMES
├─► Calculate: Each stock SUCCESS or FAILURE
└─► Output: outcomes.csv
    │
    ├───► PHASE 2: CATEGORY MEANING
    │     ├─► Analyze successful stocks: Find common traits
    │     ├─► Analyze failed stocks: Find common traits
    │     └─► Output: Category signature (text description)
    │         │
    │         ├───► PHASE 3: BEHAVIOR CLUSTERS
    │         │     ├─► Group successful stocks by behavior
    │         │     ├─► Calculate success rate per cluster
    │         │     └─► Output: clusters.json
    │         │         │
    │         │         ├───► PHASE 4: MARKET CONTEXT
    │         │         │     ├─► Map each cluster's success by market state
    │         │         │     └─► Output: market_rules.json
    │         │         │         │
    │         │         │         └───► PHASE 5: TRADING RULES
    │         │         │               ├─► Generate entry rules per cluster
    │         │         │               ├─► Generate exit rules per cluster
    │         │         │               ├─► Generate avoid criteria
    │         │         │               └─► Output: complete_rules.json
    │         │         │                   │
    │         │         │                   └───► PHASE 6: SIGNAL GENERATOR
    │         │         │                         ├─► Check market state
    │         │         │                         ├─► Match new stocks to clusters
    │         │         │                         ├─► Apply avoid criteria
    │         │         │                         └─► Output: BUY/AVOID signals
    │         │         
```

---

# ⚠️ CRITICAL SUCCESS FACTORS

## 1. Phase 1 Must Show >60% Success

If Phase 1 shows <50% success:
- **Don't proceed** to Phase 2
- Either: Parameters wrong (target too high, stop too tight)
- Or: Source data has no patterns (random stocks)

**Fix options:**
- Try: 2% target, 1.5% stop, 15 days max
- Or: Manually check 10 stock charts - do they share anything?
- Or: Get better source data

## 2. Phase 2 Requires Human Observation

The category signature CANNOT be auto-generated by code alone.

**You (or someone) must:**
- Look at 20 success charts
- Look at 20 failure charts
- Write down what you observe
- Find common thread

**Example:**
"I looked at 20 successful stocks. 16 of them (80%) were at support zones with declining volume. The other 4 were random."

This observation becomes the signature.

## 3. Phase 3 Clustering is Not ML

Don't use K-means or complex algorithms.

**Simple approach:**
- Sort successful stocks by "days to target"
- Fast (1-3 days) = Group 1
- Medium (4-7 days) = Group 2
- Slow (8-10 days) = Group 3

Then see if each group has other common traits.

## 4. Phase 4 Needs Real Market Data

Must fetch actual NIFTY/VIX data for each added_date.

**Not acceptable:**
- Estimating VIX
- Assuming market conditions

**Must have:**
- Historical NIFTY OHLC
- Historical VIX values (or India VIX)
- Advance/Decline data from NSE

## 5. Phase 5 Rules Must Be Clear

Rules should be readable by non-technical user.

**Bad:** `if (volume > mean_vol * 1.2 && rsi < 30)`
**Good:** "Volume is declining (less than 1.2x of 20-day average) AND stock is oversold"

## 6. Phase 6 Signals Must Filter Heavily

**Don't show 20 signals.** Show 3-5 best.

Quality over quantity. User can't take 20 trades anyway.

---

# 📊 EXPECTED TIMELINE

Phase 1: 2-3 days (data fetch + outcome calculation)
Phase 2: 1 day (observation + signature writing)
Phase 3: 1-2 days (clustering + analysis)
Phase 4: 1 day (market context mapping)
Phase 5: 1 day (rule generation)
Phase 6: 2-3 days (signal generator build)

**Total: ~10-12 days for one category**

Once process is proven for one category, can parallelize for others.

---

# 🎯 VALIDATION CHECKPOINTS

## After Phase 1:
"Success rate is 68%. I see patterns exist. Proceeding to Phase 2."

## After Phase 2:
"Category signature: 'Support bounce with exhaustion'. Validated by looking at 20 charts. Proceeding to Phase 3."

## After Phase 3:
"Found 2 clusters: SLOW_GRIND (72% success), FAST_SPIKE (59% success). Proceeding to Phase 4."

## After Phase 4:
"Works best when NIFTY up + VIX < 18. Success drops to 35% when NIFTY down. Proceeding to Phase 5."

## After Phase 5:
"Rules generated. JSON file created. Ready to activate Signal Generator."

## After Phase 6:
"Signal Generator tested on yesterday's data. Generated 5 signals, 4 were valid setups. Going live."

---

**END OF IMPLEMENTATION ROADMAP**

**Remember: Each phase builds on previous. Don't skip. Don't rush. Validate before proceeding.**
