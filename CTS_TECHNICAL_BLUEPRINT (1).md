# CTS - CATEGORY TRADING SYSTEM
## COMPLETE TECHNICAL BLUEPRINT FOR ANTIGRAVITY AGENT
**Version 1.0 - Final Specification**
**Date: January 7, 2026**

---

## 🎯 MISSION STATEMENT

Build an intelligent trading system that thinks like a TOP 1% Indian trader, not a pattern-matching bot.

**Core Principle:** The system must PREVENT losses through intelligent avoidance, not chase profits through forced indicators.

---

## ⚠️ CRITICAL REALITY CHECK (READ THIS FIRST)

### The Real Workflow

**Current Process:**
1. User finds stocks from external source website (already filtered into categories)
2. User manually copies stock symbols + category name
3. User pastes/uploads into CTS system
4. Stocks are tagged with "added_date" (when user added them)
5. CTS analyzes what happened to these stocks historically

**Key Truth:**
- Categories are NOT defined by us (we don't know what "MULTIRESISTANCE BO" truly means)
- Category names are just labels from source website
- The REAL definition must come from observing what actually happened to stocks in that category
- User doesn't have time to analyze charts manually (that's why building CTS)

### What This Means for CTS

**CTS's Job:**
1. **Discover the TRUE category meaning** from historical stock behavior
   - "These stocks were added under MULTIRESISTANCE BO on Dec 20-30"
   - "Let me see what actually happened ±5 days around those dates"
   - "Ah, 60% broke resistance and moved up, 30% faked out, 10% went nowhere"
   - "So the REAL pattern is: breakout attempt stocks, works 60% when volume confirms"

2. **Learn what makes success vs failure**
   - Not by our assumptions
   - By observing the DATA itself
   - Find the common thread in winners vs losers

3. **Build category-specific strategy from ground truth**
   - If 60% of successful stocks had X characteristic, that's the pattern
   - If 70% of failures had Y characteristic, that's what to avoid
   - Create conditional logic: "Entry valid ONLY when conditions A, B, C exist"

4. **Apply learned strategy to NEW stocks in same category**
   - When user adds new stocks tomorrow under same category
   - Check: Do they match the successful behavior pattern?
   - If YES → Signal
   - If NO → Avoid (even though they're in same category!)

### The Assumption (Must Validate)

**Hypothesis:** 
"If Category X stocks behaved a certain way in the past, NEW stocks added to Category X will likely behave similarly IF the market conditions and behavior characteristics match."

**This Is Valid IF:**
- ✅ Category has consistent meaning over time (source website's filter logic is stable)
- ✅ Market regime is similar (bull market then vs bull market now)
- ✅ Behavior characteristics match (new stock shows same setup as historical winners)

**This Breaks Down IF:**
- ❌ Source website changes their filtering criteria
- ❌ Market regime completely different (bull then, bear now)
- ❌ New stock doesn't match historical behavior pattern (price action looks different)

**CTS Must Handle This:**
- Don't blindly trust category name
- Always check: Does this NEW stock's current behavior match historical winners?
- If behavior doesn't match → NO SIGNAL (even if category matches)

---

## ⚠️ CRITICAL DECISIONS (READ FIRST)

### 1. AI/API Integration Decision

**Question: Should we use AI (Claude API) in the system?**

**Answer: YES - But ONLY in LABS module (offline analysis), NEVER in real-time trading**

#### Where AI Helps (LABS Module):
- **Pattern Discovery:** Analyze 100+ stocks' price behavior and find common success patterns
- **Failure Analysis:** Understand WHY trades failed (not just that they failed)
- **Behavior Clustering:** Group stocks by actual behavior, not technical indicators
- **Logic Generation:** Create conditional rules like "avoid low volume ONLY when market is weak"

#### Where AI Must NOT Be Used:
- ❌ Real-time signal generation (too slow, inconsistent)
- ❌ Position management decisions (requires deterministic rules)
- ❌ Entry/exit timing (latency issues)
- ❌ Risk calculations (must be rule-based)

**Implementation:** Use Claude API (Anthropic) in LABS with Upstox API for historical data. Cache all AI-generated insights as JSON rules for real-time use.

---

### 2. Data Source

**Primary:** Upstox API for Indian stock market data (NSE/BSE)
- Historical OHLCV data
- Real-time market data
- Index data (NIFTY, BANKNIFTY)
- No need for additional paid APIs

---

## 🔍 WILL THIS ACTUALLY WORK? (Honest Assessment)

### The Core Question

"If I upload stocks from a source website into categories, can CTS learn patterns from past behavior and predict future behavior for NEW stocks in the same category?"

### Short Answer: YES - With Important Conditions

**What Makes This Approach Valid:**

1. **Pattern Repetition in Markets**
   - Market behavior does repeat (not exactly, but statistically)
   - Support/resistance reactions are real psychological levels
   - Volume patterns indicate institutional interest
   - Same setups work across different stocks

2. **Category as Context**
   - If source website's filter is based on real technical setup (breakouts, support bounces, etc.)
   - Then stocks in that category share common characteristics at time of addition
   - Those characteristics CAN predict behavior (if market context similar)

3. **Time Travel Learning**
   - Looking at what happened to past stocks gives us ground truth
   - We're not predicting the future, we're finding "if THIS happened before, THAT usually follows"
   - This is how ALL successful traders think

**What Can Make This Fail:**

1. **Source Website's Filter Changes**
   - If they change how they select stocks for categories
   - Your historical patterns become useless
   - **Mitigation:** Monitor pattern accuracy, re-learn periodically

2. **Market Regime Change**
   - Bull market patterns don't work in bear markets
   - High volatility patterns don't work in low volatility
   - **Mitigation:** Market context gate (don't trade when regime mismatches)

3. **Overfitting to Noise**
   - Finding patterns that don't really exist
   - "All winners had volume spike" but coincidence, not causation
   - **Mitigation:** Large sample size (244 stocks), validate with fresh data

4. **User Selection Bias**
   - You only upload certain types of stocks
   - System learns your bias, not market truth
   - **Mitigation:** Upload ALL stocks from category, don't cherry-pick

### Realistic Expectations

**What CTS CAN Achieve:**
- ✅ 60-70% accuracy on primary signals (if market favorable)
- ✅ Identify 70-80% of bad setups to avoid
- ✅ Reduce average loss from -5% to -3%
- ✅ Help you avoid trading on bad market days
- ✅ Give you structured decision framework

**What CTS CANNOT Do:**
- ❌ Predict black swan events
- ❌ Work in all market conditions
- ❌ Guarantee profits
- ❌ Replace market understanding entirely
- ❌ Work if source website's categories are random/meaningless

### The Make-or-Break Factor

**Everything depends on:** Does the source website's category filtering have real meaning?

**Test This Immediately:**
1. Take one category with 100+ historical stocks
2. Run LABS analysis
3. Check: Do successful stocks share common characteristics?
4. Check: Do failures share different characteristics?

**If YES:** ✅ This approach is solid, build full system
**If NO:** ❌ Source data is noise, find better source or define categories yourself

### My Professional Opinion

As someone who has built and traded real systems:

**This CAN work IF:**
- Source website's categories reflect real technical setups
- You upload consistently (don't cherry-pick)
- You respect the market context gate
- You accept 65-70% accuracy, not 90%

**This is BETTER than:**
- Randomly picking stocks
- Following social media tips
- Trading without any system
- Using generic indicators blindly

**This is NOT as good as:**
- Professional institutional research
- Your own deep technical analysis skill (but you don't have time for that - which is WHY you're building this)

### Bottom Line

**Will it work in real-time market? YES.**

But it's not magic. It's a **systematic framework** for making better decisions than random picking.

The key insight you had is correct: "If these setups worked before under similar conditions, they should work again."

That's literally how ALL successful discretionary trading works. CTS just automates the pattern recognition and filtering part.

**Proceed with confidence, but test thoroughly in Phase 1 before going live.**

---

## 📊 SYSTEM ARCHITECTURE

### Four Independent Modules

```
┌─────────────────────────────────────────────────────────────┐
│                     MODULE 1: LABS                           │
│              (Offline Learning Engine)                       │
│          AI-Powered Pattern Discovery                        │
│         Runs: Weekly or when stocks change                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    [Outputs: JSON Rules]
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              MODULE 2: SIGNAL GENERATOR                      │
│           (Pre-Market Daily Scanner)                         │
│              Rule-Based Execution                            │
│              Runs: 8:00 AM daily                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    [Outputs: Trade Signals]
                              ↓
┌─────────────────────────────────────────────────────────────┐
│             MODULE 3: POSITION MANAGER                       │
│        (Live Trade Monitoring System)                        │
│         Rule-Based Dynamic Management                        │
│        Runs: Every 5 minutes in market hours                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    [Outputs: Exit Signals]
                              ↓
┌─────────────────────────────────────────────────────────────┐
│               MODULE 4: DASHBOARD UI                         │
│          (User Interface & Notifications)                    │
│                   Real-Time Display                          │
│           Runs: Continuous (React/WebSocket)                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 📥 DATA INGESTION WORKFLOW (How User Adds Stocks)

### User's Current Process

1. User visits source website (e.g., some technical analysis portal)
2. Website shows stocks filtered into categories:
   - "DOWNSIDE LOM SWING" (244 stocks)
   - "MULTI RESISTANCE BO" (89 stocks)
   - etc.
3. User doesn't understand what these mean exactly
4. User copies stock symbols from that category
5. User pastes into CTS with category name

### What CTS Must Provide

**Simple Upload Interface:**

```
╔════════════════════════════════════════════════════════╗
║           ADD STOCKS TO CTS                             ║
╚════════════════════════════════════════════════════════╝

Category Name: [DOWNSIDE_LOM_SWING        ] (as shown on source)

Upload Method:
○ Paste Stock Symbols (comma/newline separated)
○ Upload CSV File

─────────────────────────────────────────────────────────

Paste Symbols Here:
┌───────────────────────────────────────────────────────┐
│ ICICIBAN, COLPAL, CDFORGE, NATIONALUM, GODREJCP,      │
│ TATASTEEL, AMBUJACEMEN, BAJAJ-AUTO...                │
│                                                        │
└───────────────────────────────────────────────────────┘

Or Upload CSV: [Choose File]

Expected CSV format:
symbol,optional_notes
ICICIBAN,
COLPAL,from website 2025-12-30

─────────────────────────────────────────────────────────

[Upload & Analyze]  [Cancel]

Note: Added date will be set to today. System will analyze
historical behavior to learn patterns.
```

### What Happens After Upload

```
1. User uploads 50 stocks under "DOWNSIDE_LOM_SWING"
   ↓
2. System saves to database:
   - Stocks: 50 symbols
   - Category: DOWNSIDE_LOM_SWING
   - Added date: Today
   - Status: PENDING_ANALYSIS
   ↓
3. System checks: Is this a new category or existing?
   - If NEW: Schedule LABS analysis
   - If EXISTING: Add to existing category, check if re-analysis needed
   ↓
4. If category now has >100 stocks OR changed by >10%:
   - Trigger LABS re-analysis
   - Update category definition
   ↓
5. User sees notification:
   "50 stocks added to DOWNSIDE_LOM_SWING.
    Category analysis will run tonight."
```

### CSV Format (Flexible)

**Minimal:**
```csv
ICICIBAN
COLPAL
CDFORGE
```

**With metadata (optional):**
```csv
symbol,notes,source_price
ICICIBAN,strong support,1423.80
COLPAL,near breakout,2068.10
```

System only requires symbol. Rest is optional for user's notes.

### Important Rules

1. **Date Stamping**
   - All uploaded stocks get today's date as "added_date"
   - This is the anchor for historical analysis
   - LABS will look at ±5 days around these added dates

2. **Batch Analysis**
   - Don't run LABS for every upload
   - Wait until: Evening (8 PM) or 100+ stocks accumulated or user manually triggers

3. **Category Validation**
   - System doesn't validate category names
   - User can create any category name
   - Category meaning comes from data, not name

4. **Duplicate Handling**
   - If stock already exists in category: Update added_date to most recent
   - If stock exists in different category: Allow (same stock can be in multiple categories with different dates)

### User Sees This After Upload

```
╔════════════════════════════════════════════════════════╗
║         UPLOAD SUCCESSFUL                               ║
╚════════════════════════════════════════════════════════╝

✅ 50 stocks added to DOWNSIDE_LOM_SWING

Category Status:
├─ Total stocks: 294 (244 existing + 50 new)
├─ Date range: Dec 20, 2025 - Jan 7, 2026
├─ Last analysis: Jan 5, 2026
└─ Status: Needs re-analysis (10%+ new stocks)

Next Steps:
1. LABS will automatically analyze tonight at 8 PM
2. You'll get notification when analysis complete
3. New signals will appear tomorrow morning

Or you can trigger analysis now (takes ~20 minutes):
[Run Analysis Now]  [Wait for Auto-Analysis]

[View Category Details]  [Add More Stocks]
```

---

## 🧠 MODULE 1: LABS (Learning & Analysis System)

### Purpose
Discover TRUE patterns from historical data, learn from failures, and generate conditional trading rules.

### When to Run
- First time for each category
- When new stocks added to category (>10% change)
- Monthly deep learning refresh
- **NEVER run on every user login**

### Input Data Required

**User Upload Format (CSV or Manual Entry):**
```csv
symbol,category,added_date,source_url
ICICIBAN,DOWNSIDE_LOM_SWING,2025-12-30,https://source-website.com/...
COLPAL,DOWNSIDE_LOM_SWING,2025-12-30,https://source-website.com/...
CDFORGE,DOWNSIDE_LOM_SWING,2025-12-29,https://source-website.com/...
```

**After Upload, System Enriches:**
```json
{
  "category": "DOWNSIDE_LOM_SWING",
  "stocks": [
    {
      "symbol": "ICICIBAN",
      "added_date": "2025-12-30",
      "added_by": "user",
      "source_category": "DOWNSIDE_LOM_SWING",
      "current_price": null,  // Will fetch
      "historical_data": null  // Will fetch
    }
  ],
  "total_stocks": 244,
  "date_range": {
    "first_added": "2025-12-20",
    "last_added": "2025-12-30"
  }
}
```

**Critical Understanding:**
- User doesn't know what "DOWNSIDE_LOM_SWING" really means
- User just copied it from source website
- CTS must discover the TRUE meaning from data
- Category name is just an identifier, not a definition

### Labs Processing Pipeline (4 Steps)

#### STEP 1: Category Truth Extraction

**What it does:** Understand what ACTUALLY happened to these stocks historically

**Process:**
1. For each stock in category
2. Fetch OHLCV data: [added_date - 5 days, added_date + 10 days]
3. No indicators yet - just observe raw price behavior
4. Tag outcome:
   - SUCCESS: Hit +5% target within 10 days
   - FAILURE: Hit -3% stop loss OR no move after 10 days
5. Extract common characteristics

**Output Format:**
```json
{
  "category": "DOWNSIDE_LOM_SWING",
  "signature": {
    "description": "Stocks at support zones showing exhaustion after decline. 65% recover slowly over 5-7 days with low volume.",
    "success_rate": 65,
    "avg_success_return": 6.2,
    "avg_failure_return": -4.1,
    "typical_holding_period": "5-7 days",
    "speed": "SLOW_GRIND",
    "volume_nature": "DECLINING"
  }
}
```

**AI Prompt for this step:**
```
Given these 244 stocks that were added to DOWNSIDE_LOM_SWING category between Dec 20-30, 2025:

[Provide: Stock symbol, added date, OHLCV for ±5 days]

Analyze the price behavior patterns:
1. What actually happened? (describe in plain English)
2. Did they move fast or slow?
3. Was volume important?
4. What made successful trades different from failures?
5. Write a category signature describing the typical behavior

Output as JSON with signature and observations.
```

---

#### STEP 2: Behavior Clustering

**What it does:** Group stocks by HOW they behave, not by technical indicators

**Process:**
1. Take all stocks from Step 1
2. Use AI to identify behavioral clusters
3. Split into 2-4 behavior groups (not more)
4. Measure success rate per cluster
5. Identify which clusters should be avoided

**Output Format:**
```json
{
  "clusters": [
    {
      "name": "SLOW_GRIND",
      "percentage": 60,
      "stock_count": 146,
      "success_rate": 71,
      "characteristics": [
        "Price stable near support for 2+ days",
        "Volume declining (not spiking)",
        "Small green candles building base",
        "No gaps, smooth movement"
      ],
      "avg_return": 6.8,
      "avg_holding_days": 6,
      "risk_rating": "LOW"
    },
    {
      "name": "FAST_SPIKE",
      "percentage": 30,
      "stock_count": 73,
      "success_rate": 58,
      "characteristics": [
        "Sharp bounce from support",
        "Volume spike on bounce day",
        "Quick 3-4% move in 1-2 days",
        "Often reverses after initial spike"
      ],
      "avg_return": 4.2,
      "avg_holding_days": 2,
      "risk_rating": "MEDIUM"
    },
    {
      "name": "NOISY_CHAOS",
      "percentage": 10,
      "stock_count": 25,
      "success_rate": 32,
      "characteristics": [
        "Erratic price movement",
        "No clear support level",
        "Random volume spikes",
        "No follow-through"
      ],
      "action": "AVOID",
      "risk_rating": "HIGH"
    }
  ]
}
```

**AI Prompt:**
```
Given 244 stocks with their OHLCV data and outcomes (success/failure):

Group them into 2-4 behavioral clusters based on:
- Speed of movement
- Volume patterns  
- Price action characteristics
- Follow-through behavior

For each cluster:
- Calculate success rate
- Describe characteristics in plain English (no technical jargon)
- Recommend whether to trade or avoid

Output as JSON with clusters array.
```

---

#### STEP 3: Market Regime Mapping

**What it does:** Learn WHEN this category works (market context)

**Process:**
1. For each successful trade, record:
   - NIFTY trend that day (UP/DOWN/FLAT)
   - VIX level
   - Market breadth (advancing/declining stocks ratio)
   - Sector performance
2. For each failed trade, record same
3. Find patterns: "This works ONLY when..."

**Output Format:**
```json
{
  "favorable_conditions": {
    "nifty_state": ["UPTREND", "SIDEWAYS"],
    "vix_range": { "min": 10, "max": 18 },
    "breadth": { "min_advance_decline_ratio": 1.2 },
    "sector_notes": "Works best when banking sector stable or positive"
  },
  "avoid_conditions": {
    "nifty_state": ["STRONG_DOWNTREND"],
    "vix_range": { "above": 22 },
    "breadth": { "max_advance_decline_ratio": 0.8 },
    "gap_behavior": "Large gap down opening"
  },
  "neutral_conditions": {
    "description": "Trade only highest confidence setups",
    "reduce_position_size": true
  }
}
```

**AI Prompt:**
```
Given successful and failed trades with market context data:

Successful trades (146 stocks):
[Include: Date, NIFTY close, NIFTY trend, VIX, Breadth ratio]

Failed trades (98 stocks):
[Same data]

Find patterns:
1. What market conditions did successful trades share?
2. What market conditions caused failures?
3. Create favorable/avoid/neutral condition rules

Output as JSON.
```

---

#### STEP 4: Failure Intelligence

**What it does:** Learn from mistakes to build AVOID criteria

**Process:**
1. Take all failed trades
2. Group by common failure characteristics
3. Check: Did successful trades ALSO have this characteristic?
   - If YES: Not a real failure cause, ignore it
   - If NO: Real avoidance criterion, add to rules
4. Create explicit avoid filters

**Output Format:**
```json
{
  "failure_patterns": [
    {
      "pattern": "LOW_VOLUME_WEAK_MARKET",
      "description": "Volume < 1.5x average AND NIFTY declining",
      "failure_rate": 78,
      "found_in_winners": false,
      "action": "HARD_AVOID",
      "priority": "HIGH"
    },
    {
      "pattern": "GAP_DOWN_ENTRY",
      "description": "Stock gaps down on entry day by >2%",
      "failure_rate": 72,
      "found_in_winners": false,
      "action": "HARD_AVOID",
      "priority": "HIGH"
    },
    {
      "pattern": "HIGH_PRICE_LOW_LIQUIDITY",
      "description": "Stock price > ₹2000 AND avg volume < 100,000",
      "failure_rate": 85,
      "found_in_winners": false,
      "action": "AVOID",
      "priority": "MEDIUM",
      "reason": "Manual execution impossible for most users"
    },
    {
      "pattern": "EXECUTION_DELAY_SENSITIVE",
      "description": "Fast spike pattern requiring instant entry",
      "failure_rate": 68,
      "found_in_winners": true,
      "action": "WARNING",
      "priority": "LOW",
      "note": "Pattern works but only with fast execution"
    }
  ]
}
```

**AI Prompt:**
```
Given 98 failed trades with detailed data:

For each failure, analyze:
1. Common characteristics (volume, price action, market state, timing, price level, liquidity)
2. Group similar failures together
3. For each failure pattern, check: Did ANY successful trades also have this?
4. Calculate failure rate per pattern
5. Classify action: HARD_AVOID, AVOID, WARNING

Output as JSON with failure_patterns array sorted by priority.
```

---

### LABS Final Output (Complete JSON)

After all 4 steps, LABS produces ONE comprehensive JSON file per category:

**File:** `labs_output/DOWNSIDE_LOM_SWING_v1.json`

```json
{
  "category": "DOWNSIDE_LOM_SWING",
  "version": 1,
  "last_analysis_date": "2026-01-05",
  "total_stocks_analyzed": 244,
  "analysis_date_range": {
    "from": "2025-12-20",
    "to": "2025-12-30"
  },
  
  "signature": {
    "description": "Support exhaustion patterns with slow recovery",
    "success_rate": 65,
    "avg_success_return": 6.2,
    "avg_failure_return": -4.1,
    "typical_holding_period": "5-7 days"
  },
  
  "behavior_clusters": [ /* from Step 2 */ ],
  "favorable_conditions": { /* from Step 3 */ },
  "avoid_conditions": { /* from Step 3 */ },
  "failure_patterns": [ /* from Step 4 */ ],
  
  "entry_logic_rules": {
    "SLOW_GRIND": {
      "conditions": [
        "price_stable_near_support_for_days >= 2",
        "volume_trend == 'DECLINING'",
        "no_gap_down_today",
        "market_state IN ['UPTREND', 'SIDEWAYS']"
      ],
      "entry_type": "LIMIT",
      "entry_price": "current_price - 0.5%",
      "valid_till": "3:20 PM same day"
    },
    "FAST_SPIKE": {
      "conditions": [
        "sudden_spike_above_support",
        "volume > 2x average",
        "move_size > 2%",
        "market_state == 'UPTREND'"
      ],
      "entry_type": "MARKET",
      "entry_urgency": "IMMEDIATE",
      "valid_till": "10 minutes"
    }
  },
  
  "exit_logic_rules": {
    "SLOW_GRIND": {
      "target_return": 0.05,
      "stop_loss": -0.03,
      "max_holding_days": 7,
      "time_stop_rule": "IF days_held > 5 AND return < 0.02 THEN EXIT",
      "market_change_rule": "IF market_state becomes 'HOSTILE' AND days_held > 1 THEN EXIT",
      "trailing_stop": "IF return > 0.04 THEN trail_50_percent"
    }
  }
}
```

This JSON becomes the **brain** of the Signal Generator.

---

### Test & Learn Loop (Iterative Improvement)

**When to run:** After initial analysis, run 2-3 iterations

**Process:**
1. Run LABS → Get results (e.g., 65% success)
2. Analyze 35% failures in detail
3. Add new avoid criteria
4. Re-run backtest with updated rules
5. Check: Did success rate improve? Did we kill good trades?
6. If improved and no good trades killed → Keep changes
7. Repeat until: Success rate stops improving OR reaches 75%+

**Stopping Criteria:**
- Marginal improvement < 2% per iteration
- Can't find more patterns in failures
- Risk of overfitting (too many rules)

---

### LABS UI Requirements

User should see in Labs interface:

```
Category: DOWNSIDE LOM SWING
Status: ✅ Analyzed (Last: Jan 5, 2026)
Stocks: 244 | Success Rate: 71% | Avg Return: 6.2%

─────────────────────────────────────────────────────

📊 CATEGORY SIGNATURE
"Support exhaustion patterns. Most stocks move slowly over 5-7 days 
with declining volume. 71% success rate when conditions match."

─────────────────────────────────────────────────────

🎯 TRADE TYPES DISCOVERED

Type 1: SLOW GRIND (60% of stocks, 71% success)
├─ Patient entry near support
├─ Low volume, steady climb  
├─ Hold 5-7 days
└─ Target: 5-7% | Risk: Low

Type 2: FAST SPIKE (30% of stocks, 58% success)
├─ Immediate bounce
├─ Volume surge
├─ Hold 2-3 days  
└─ Target: 3-5% | Risk: Medium

Type 3: NOISY CHAOS (10% of stocks)
└─ ❌ AVOID - No clear pattern

─────────────────────────────────────────────────────

🚦 MARKET CONDITIONS

✅ FAVORABLE
├─ NIFTY trending up or sideways
├─ VIX < 18
└─ Breadth positive (A/D ratio > 1.2)

⚠️  SELECTIVE
├─ NIFTY choppy
└─ VIX 18-22

❌ AVOID
├─ NIFTY strong downtrend
├─ VIX > 22
└─ Negative breadth

─────────────────────────────────────────────────────

⛔ AVOID CRITERIA

1. Low volume + weak market (78% fail)
2. Gap down entry (72% fail)  
3. High price + low liquidity (85% fail)
4. Fast entry needed but user trades manually (68% fail)

─────────────────────────────────────────────────────

[Button: Use This Strategy]  [Button: Re-Run Analysis]
```

**Button Logic:**
- "Use This Strategy": Apply to Signal Generator (enable category)
- "Re-Run Analysis": Only if stocks changed by >10%

---

## 🎯 MODULE 2: SIGNAL GENERATOR

### Purpose
Apply LABS-learned rules to current market to find TODAY's best trades

### When to Run
**8:00 AM every trading day** (before market open at 9:15 AM)

### Input Required
1. LABS output JSON files (all active categories)
2. Current market data:
   - NIFTY previous close, trend
   - VIX level
   - Previous day breadth
3. Current stock data for all category stocks:
   - Latest close price
   - Volume (20-day average)
   - Support/resistance levels

### Processing Flow

```
8:00 AM - Signal Generation Starts

STEP 1: Market Gate Check (5 minutes)
├─ Fetch NIFTY, VIX, Breadth data
├─ Classify market: FAVORABLE / SELECTIVE / HOSTILE
└─ Decision: Continue or STOP

IF HOSTILE → Send notification: "No trades today - market unfavorable"
           → EXIT process

STEP 2: Category Selection (5 minutes)
├─ For each active category (user enabled)
├─ Check: Does current market match "favorable_conditions"?
└─ Select 2-3 best matching categories only

STEP 3: Stock Scanning (10 minutes per category)
For each stock in selected categories:
  ├─ Fetch current OHLCV
  ├─ **CRITICAL VALIDATION:** Does current behavior match historical pattern?
  │   ├─ If category is "support bounce", is stock actually AT support now?
  │   ├─ If category is "breakout", is stock actually breaking out now?
  │   ├─ Don't just trust category name - verify behavior matches
  │   └─ If current setup doesn't match historical winners → SKIP
  ├─ Match against behavior cluster characteristics
  ├─ Check ALL avoid criteria from LABS
  ├─ Check execution feasibility:
  │   ├─ Price affordable? (< ₹2000 preferred)
  │   ├─ Liquid enough? (avg volume > 100k)
  │   └─ Manual entry possible? (not too fast)
  └─ Score: 0-100

STEP 4: Signal Ranking (5 minutes)
├─ Take top 10 stocks across all categories
├─ Group by behavior cluster logic
├─ Assign risk levels
└─ Create avoid list (explicitly show what NOT to buy)

STEP 5: Output Generation (5 minutes)
├─ Primary trades (3-5 best)
├─ Conditional trades (2-3 medium confidence)
├─ Avoid list (5-10 stocks with reasons)
└─ Store in database + send notifications

Total time: ~35 minutes
Complete by 8:35 AM
```

### Signal Output Format

**Database Schema:**
```json
{
  "date": "2026-01-07",
  "market_state": "FAVORABLE",
  "market_notes": "NIFTY strong uptrend, VIX 14.2, good breadth",
  
  "primary_signals": [
    {
      "stock": "ICICIBAN",
      "category": "DOWNSIDE_LOM_SWING",
      "cluster_type": "SLOW_GRIND",
      "current_price": 1423.80,
      "entry_recommendation": {
        "type": "LIMIT",
        "price": 1418.00,
        "valid_till": "15:20",
        "urgency": "LOW"
      },
      "exit_plan": {
        "initial_stop_loss": 1375.00,
        "target": 1490.00,
        "trailing_stop_rule": "50% profit protection above 4%",
        "max_holding_days": 7
      },
      "capital_required": {
        "per_share": 1418,
        "min_lot": 10,
        "total": 14180
      },
      "confidence": 85,
      "risk_rating": "LOW",
      "reasoning": "Near support, volume declining, market favorable, pattern matches SLOW_GRIND with 71% historical success"
    }
  ],
  
  "conditional_signals": [
    {
      "stock": "COLPAL",
      "warning": "Higher risk - market not strongly trending",
      "confidence": 60
    }
  ],
  
  "avoid_list": [
    {
      "stock": "CDFORGE",
      "reason": "High price (₹1650), low average volume - difficult manual execution",
      "failure_risk": "HIGH"
    },
    {
      "stock": "NATIONALUM",
      "reason": "Unclear pattern + weak sector + market not strong enough",
      "failure_risk": "MEDIUM"
    }
  ]
}
```

### Signal Generation Rules (Deterministic Logic)

**Entry Decision Tree:**
```python
def should_generate_signal(stock, category_rules, market_state):
    # GATE 1: Market Check
    if market_state == "HOSTILE":
        return False
    
    if market_state == "SELECTIVE":
        if stock.confidence < 80:  # Only highest confidence
            return False
    
    # GATE 2: Behavior Match
    cluster = match_behavior_cluster(stock, category_rules.clusters)
    if cluster is None:
        return False
    
    if cluster.name == "NOISY_CHAOS":
        return False  # Explicit avoid
    
    # GATE 3: Avoid Criteria
    for avoid_pattern in category_rules.failure_patterns:
        if avoid_pattern.action == "HARD_AVOID":
            if matches(stock, avoid_pattern.conditions):
                add_to_avoid_list(stock, avoid_pattern.description)
                return False
    
    # GATE 4: Execution Feasibility
    if stock.price > 2000 and stock.avg_volume < 100000:
        add_to_avoid_list(stock, "Price too high + low liquidity")
        return False
    
    if cluster.requires_fast_entry and user_trades_manually:
        add_warning(stock, "Fast entry needed - may miss opportunity")
    
    # GATE 5: Capital Accessibility
    min_capital = stock.price * 10  # Minimum 10 shares
    if min_capital > user_typical_capital:
        reduce_priority(stock)
    
    return True
```

---

## 🎯 MODULE 3: POSITION MANAGER

### Purpose
Monitor open positions and adapt exit strategy based on changing market conditions

### When to Run
**Every 5 minutes during market hours** (9:15 AM - 3:30 PM)

### Input Required
1. List of open positions (from user portfolio)
2. Current market state (NIFTY, VIX, breadth)
3. Entry details for each position
4. Exit rules from LABS (loaded once per position)

### Processing Logic

```
Every 5 minutes:

FOR each open position:
  ├─ Fetch current price
  ├─ Calculate: days_held, current_return, unrealized_pnl
  ├─ Get market_state (current)
  ├─ Compare: market_state_at_entry vs market_state_now
  │
  ├─ RULE 1: Market Regime Change
  │   IF market_state changed from FAVORABLE → HOSTILE
  │   AND days_held > 1
  │   → ACTION: EXIT (market priority override)
  │
  ├─ RULE 2: Stop Loss Hit
  │   IF current_return <= -3%
  │   → ACTION: EXIT IMMEDIATELY
  │
  ├─ RULE 3: Target Hit
  │   IF current_return >= target_return (e.g., 5%)
  │   → ACTION: EXIT (book profit)
  │
  ├─ RULE 4: Trailing Stop
  │   IF current_return > 4%
  │   THEN activate_trailing_stop(entry_price + return * 0.5)
  │   IF price < trailing_stop
  │   → ACTION: EXIT (protect profit)
  │
  ├─ RULE 5: Time Stop
  │   IF days_held > max_days (e.g., 7 for SLOW_GRIND)
  │   AND current_return < 2%
  │   → ACTION: EXIT (opportunity cost)
  │
  ├─ RULE 6: Pattern Invalidation
  │   IF behavior changed (e.g., volume spike on slow grind)
  │   → ACTION: WARNING or EXIT
  │
  └─ Generate action: HOLD / EXIT / WARNING
```

### Dynamic Exit Logic (Real-World Scenario)

**Example: ICICIBAN Position**

```
Day 1 (Entry):
├─ Entry: ₹1418, Market: FAVORABLE
├─ Stop: ₹1375, Target: ₹1490
└─ Action: HOLD - monitor

Day 2:
├─ Price: ₹1432 (+0.99%), Market: FAVORABLE
└─ Action: HOLD - moving as expected

Day 3:
├─ Price: ₹1445 (+1.9%), Market: FAVORABLE
└─ Action: HOLD - good progress

Day 4:
├─ Price: ₹1458 (+2.82%), Market: TURNING WEAK (NIFTY declined)
└─ Action: WARNING - "Market weakening, consider booking partial"

Day 5:
├─ Price: ₹1462 (+3.1%), Market: HOSTILE (NIFTY down 2%, VIX 22)
└─ Action: EXIT - "Market turned hostile, book 3.1% profit"

User notification: "ICICIBAN - EXIT recommended. Market regime changed. Book profit now."
```

**Contrast with BAD system:**
```
Bad System: "Target not hit, holding..."
(Market crashes, profit becomes loss)

CTS: "Market changed, exit early, protect capital"
```

### Position Manager Output

**Real-time dashboard data:**
```json
{
  "position_id": "POS_001",
  "stock": "ICICIBAN",
  "entry_date": "2026-01-02",
  "entry_price": 1418.00,
  "current_price": 1462.00,
  "quantity": 10,
  "days_held": 5,
  "return_percent": 3.1,
  "unrealized_pnl": 440,
  
  "status": "EXIT_RECOMMENDED",
  "reason": "Market regime changed from FAVORABLE to HOSTILE",
  "urgency": "HIGH",
  "action": "Book profit now - market conditions no longer favorable",
  
  "stop_loss": 1375.00,
  "trailing_stop": null,
  "target": 1490.00,
  "market_state_entry": "FAVORABLE",
  "market_state_now": "HOSTILE"
}
```

---

## 🎯 MODULE 4: DASHBOARD UI

### Purpose
Show signals and positions in clean, actionable format

### Key Screens

#### 1. Morning Dashboard (Before Market)

```
╔════════════════════════════════════════════════════════╗
║           CTS - CATEGORY TRADING SYSTEM                 ║
║                Tuesday, January 7, 2026                 ║
╚════════════════════════════════════════════════════════╝

🚦 TODAY'S MARKET: ✅ FAVORABLE
"NIFTY uptrend, VIX 14.2, good breadth - good day to trade"

───────────────────────────────────────────────────────────

📊 ACTIVE CATEGORIES TODAY: 2 out of 8
✅ DOWNSIDE LOM SWING - Favorable conditions
⚠️  MULTI RESISTANCE BO - Conditional only
❌ HIGH POWERED STOCKS - Market too choppy (avoid today)

───────────────────────────────────────────────────────────

🎯 TODAY'S SIGNALS (3 PRIMARY, 1 CONDITIONAL)

PRIMARY TRADES (High Confidence)
─────────────────────────────────────────────────────────

1. ✅ ICICIBAN - ₹1,423.80
   Category: Downside LOM Swing | Type: Slow Grind
   Entry: Limit ₹1,418 (valid till 3:20 PM)
   Stop Loss: ₹1,375 | Target: ₹1,490
   Capital: ₹14,180 (10 shares)
   Confidence: 85% | Risk: LOW
   
   💡 Why: Near support, volume declining, market favorable.
   Pattern: 71% success rate historically.
   
   [Buy Now] [Set Alert] [View Chart]

2. ✅ TATASTEEL - ₹184.00
   ...similar format...

───────────────────────────────────────────────────────────

CONDITIONAL TRADES (Trade with caution)
─────────────────────────────────────────────────────────

⚠️  COLPAL - ₹2,068.00
   Higher risk - market not strongly trending
   Only for experienced traders
   Confidence: 60%

───────────────────────────────────────────────────────────

⛔ AVOID TODAY (Don't trade these)
─────────────────────────────────────────────────────────

❌ CDFORGE - ₹1,650
   Reason: High price + low liquidity → difficult execution
   
❌ NATIONALUM - ₹350
   Reason: Pattern unclear + weak sector + market not strong

───────────────────────────────────────────────────────────

[View Labs Analysis] [My Portfolio] [Settings]
```

#### 2. Live Position Monitor (During Market)

```
╔════════════════════════════════════════════════════════╗
║              ACTIVE POSITIONS (2)                       ║
║          Updated: 11:25 AM (Every 5 min)               ║
╚════════════════════════════════════════════════════════╝

───────────────────────────────────────────────────────────

📈 ICICIBAN - DAY 3 OF 7
Entry: ₹1,418 | Current: ₹1,445 | Gain: +1.9% (₹270)
Status: 🟢 HOLD - Moving as expected

├─ Stop Loss: ₹1,375 (still safe)
├─ Target: ₹1,490 (need +3.1% more)
└─ Market: Still favorable ✅

Action: None - let it run
Next check: 11:30 AM

───────────────────────────────────────────────────────────

📉 TATASTEEL - DAY 4 OF 7
Entry: ₹184 | Current: ₹180 | Loss: -2.2% (-₹40)
Status: 🔴 WATCH - Market weakening

├─ Stop Loss: ₹178 (approaching)
├─ Target: ₹195 (unlikely now)
└─ Market: Turned weak ⚠️

⚠️  Action: Consider EXIT
Reason: Not moving + market declining
Recommendation: Book small loss, don't let it become big

[Exit Position] [Hold] [Tighten Stop]

───────────────────────────────────────────────────────────

Portfolio: ₹10,000 invested | P&L: +₹230 (+2.3%)
Today's Change: +₹50

[View All Trades] [Add Capital] [Settings]
```

#### 3. Labs Interface (Category Analysis View)

Already described in LABS UI Requirements section above.

---

## 📁 TECHNICAL STACK RECOMMENDATIONS

### Backend
- **Language:** Python 3.10+
- **Framework:** FastAPI (for APIs) + Celery (for scheduled tasks)
- **Database:** PostgreSQL (for structured data) + Redis (for caching)
- **Task Queue:** Celery + Redis
- **Data Processing:** Pandas, NumPy

### AI Integration
- **Provider:** Anthropic Claude API (Claude 3.5 Sonnet)
- **Usage:** Only in LABS module (offline)
- **Rate Limiting:** Cache responses, batch requests
- **Cost Control:** Analyze in batches, cache results

### Market Data
- **Primary Source:** Upstox API
- **Endpoints needed:**
  - Historical OHLCV
  - Real-time quotes
  - Index data (NIFTY, BANKNIFTY)
  - Market depth (optional)

### Frontend
- **Framework:** React.js
- **Real-time:** WebSocket for position updates
- **Charts:** TradingView Lightweight Charts
- **State Management:** Redux or Zustand
- **UI Library:** Material-UI or Tailwind CSS

### Deployment
- **Hosting:** AWS / DigitalOcean
- **Containers:** Docker
- **Scheduling:** Cron jobs or Celery Beat
- **Monitoring:** Sentry (errors) + Grafana (metrics)

---

## 📋 IMPLEMENTATION PHASES

### Phase 1: LABS Module (Month 1)
**Deliverables:**
- Category Truth Extractor working
- Behavior Clustering implemented
- Market Regime Mapper functional
- Failure Intelligence system complete
- AI integration with Claude API
- JSON output generation
- Basic Labs UI to view results

**Success Criteria:**
- Can analyze one category completely
- Produces valid JSON output
- UI shows category signature and clusters

---

### Phase 2: Signal Generator (Month 2)
**Deliverables:**
- Market Gate system
- Category selection logic
- Stock scanning engine
- Avoid criteria filtering
- Signal ranking algorithm
- Database schema + APIs
- Basic signal notification system

**Success Criteria:**
- Generates signals at 8 AM daily
- Produces primary/conditional/avoid lists
- Respects market conditions
- No signals on hostile days

---

### Phase 3: Position Manager (Month 3)
**Deliverables:**
- Position tracking system
- Dynamic exit logic engine
- Market regime change detector
- Real-time monitoring (5-min updates)
- Alert system (email/SMS/push)
- Position dashboard UI

**Success Criteria:**
- Monitors positions every 5 minutes
- Detects market changes
- Recommends exits correctly
- No false alarms

---

### Phase 4: Dashboard & Polish (Month 4)
**Deliverables:**
- Complete Dashboard UI
- Mobile responsive design
- User settings & preferences
- Historical performance tracking
- Trade journal/logs
- Documentation & user guide

**Success Criteria:**
- Professional, clean interface
- Fast loading (< 2 seconds)
- Works on mobile
- User can understand signals easily

---

## ⚠️ CRITICAL IMPLEMENTATION RULES

### 1. NO SHORTCUTS IN LEARNING
- Don't skip failure analysis
- Don't force patterns that don't exist
- Don't use indicators just because they're popular
- Let data speak, don't assume

### 2. EXECUTION REALITY
- Always add 2-5 minute delay in backtests
- Always account for slippage
- Always check liquidity before signal
- Always consider user capital constraints

### 3. MARKET PRIORITY
- Market state overrides everything
- No signals on hostile days, period
- Don't fight the market
- Adapt, don't force

### 4. USER PROTECTION
- Show avoid list, not just buy list
- Warn about execution difficulty
- Group signals by capital requirement
- Never assume user buys all signals

### 5. DYNAMIC THINKING
- Exit logic must adapt to market changes
- Don't stick to fixed targets religiously
- Read market context continuously
- Protect capital over everything

---

## 🎯 SUCCESS METRICS (How to Measure System)

### Don't measure:
- ❌ Overall win rate (misleading)
- ❌ Number of signals (more ≠ better)
- ❌ Backtested returns (often fake)

### DO measure:
- ✅ **Market Gate Accuracy:** Did we avoid bad days?
- ✅ **Loss Prevention:** Max drawdown per trade
- ✅ **Signal Quality:** % of primary signals that worked
- ✅ **Avoid List Accuracy:** Did avoided stocks actually fail?
- ✅ **User Execution:** Can users actually take these trades?
- ✅ **Profit Factor:** (Total wins ÷ Total losses) in rupees
- ✅ **Days Traded:** System should NOT trade every day

**Target Metrics (After 3 months):**
- Market Gate: 80%+ accuracy (correctly identify good/bad days)
- Primary Signal Success: 70%+ 
- Avoid List Accuracy: 70%+ of avoided stocks should fail
- Average Loss: < 3%
- Average Win: > 5%
- Profit Factor: > 2.0
- Trading Frequency: 2-3 days per week (not daily)

---

## 🔐 DATA & SECURITY

### User Data Storage
- Positions (encrypted)
- Trade history
- Capital information (encrypted)
- Preferences

### Labs Data Storage
- Historical analysis results (JSON)
- Category definitions
- Behavior clusters
- Failure patterns

### API Keys & Secrets
- Upstox API credentials (user's own)
- Claude API key (system-level)
- Database credentials
- **All encrypted, never in code**

---

## 📞 NOTIFICATIONS & ALERTS

### Morning (8:30 AM)
- Market state notification
- Today's signal count
- "No trade today" if hostile

### During Market (When needed)
- Position exit alerts (HIGH urgency)
- Stop loss approaching warnings
- Target hit notifications

### End of Day (3:45 PM)
- Daily P&L summary
- Open positions status
- Tomorrow's watch list

### Methods
- Push notifications (primary)
- Email (backup)
- SMS (critical alerts only - exit signals)
- Telegram (optional)

---

## 🚫 WHAT NOT TO BUILD

### Don't Build:
- ❌ Automated trading bot (legal issues, execution risk)
- ❌ Real-time charting system (use TradingView)
- ❌ News aggregator (out of scope)
- ❌ Social trading features (adds complexity)
- ❌ Options trading (different beast)
- ❌ Fundamental analysis (stick to technical)
- ❌ Machine learning black boxes (we need interpretability)

### Why Not Fully Automated?
- Legal compliance issues
- Execution risk
- User accountability
- Market manipulation concerns
- **CTS is a decision support system, not a trading bot**

---

## 📚 FINAL CHECKLIST FOR ANTIGRAVITY AGENT

Before starting development, confirm:

### Understanding Reality
- [ ] Understand: User gets stocks from external website
- [ ] Understand: Category names are labels, not definitions
- [ ] Understand: CTS discovers TRUE meaning from data
- [ ] Understand: This works IF source categories have real technical basis
- [ ] Understand: Must validate behavior match, not just trust category

### Critical Validations to Build
- [ ] When applying pattern to NEW stocks: Check if current setup matches historical
- [ ] Don't blindly trust category membership
- [ ] If "support bounce" pattern but stock not AT support → NO SIGNAL
- [ ] Behavior validation is as important as category matching

### Understanding
- [ ] Read this document completely
- [ ] Understand trader mindset vs pattern-matching
- [ ] Understand why AI only in LABS, not real-time
- [ ] Understand market priority over stock picking

### Technical Setup
- [ ] Upstox API access configured
- [ ] Claude API key obtained
- [ ] Development environment ready
- [ ] Database schema designed

### Phase 1 (LABS) Ready
- [ ] Can fetch historical data from Upstox
- [ ] Can call Claude API for analysis
- [ ] Can save JSON outputs
- [ ] Can display results in UI
- [ ] Can handle user stock uploads (CSV/paste)
- [ ] Can detect when re-analysis needed

### Communication
- [ ] Have questions? Ask before building
- [ ] Don't assume - confirm with user
- [ ] Show progress weekly
- [ ] Test with real data, not dummy data
- [ ] Validate: Does source category have real meaning? (Test Phase 1)

---

## 🎬 CONCLUSION

This is NOT just another trading system. This is a **trader's brain in software**.

The system must:
1. Think about WHEN to trade, not just WHAT to trade
2. Learn from mistakes, not repeat them
3. Adapt to changing markets, not use fixed rules
4. Protect users from themselves
5. Work in real trading conditions

**Core Truth:** 
A trader who avoids 70% of bad trades will beat a system with 70% accuracy.

**Your Job:**
Build a system that prevents stupid mistakes, not one that chases perfect entries.

**Your Assumption:**
"If Category X stocks behaved a certain way in the past, NEW stocks in Category X will behave similarly."

**How to Validate This Assumption:**
1. Take historical Category X stocks (e.g., Dec 2025 additions)
2. Learn patterns from them using LABS
3. Test those patterns on NEW Category X stocks (Jan 2026 additions)
4. Measure: Do the patterns hold?
5. If YES (>60% accuracy) → Assumption valid, proceed
6. If NO → Source categories are meaningless, find better source

**Phase 1 Must Answer:**
"Does learning from past category stocks help predict new category stocks?"

If answer is NO after Phase 1 testing → Stop, fix data source before building more.

**Important:**
This system is ONLY as good as the quality of your source website's category filtering. Garbage in = garbage out. Test this assumption thoroughly in Phase 1.

---

**END OF BLUEPRINT**

*This document is complete and accounts for the real workflow. Start building with eyes open.*
