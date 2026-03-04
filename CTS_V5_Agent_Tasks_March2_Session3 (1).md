# CTS V5 — Agent Task Sheet: March 2, 2026 (Session 3 — Post Market)

> **Context:** CTS V5 is now live with auto-scanner working (good progress from Session 2). The agent successfully implemented: Auto-Scanner RUNNING indicator, Force Scan Now button, stale position cleanup (TORNTPOWER/UNIONBANK now show as SYSTEM_MISSED_EOD in Trade Journal), and live signal generation. Now we need to fix remaining issues and add production-quality features.

> **IMPORTANT:** Read `CTS_V5_Session_Summary_March2_DeepResearch.md` for full system context. Only INTRADAY_BOOST category is proven. Focus everything on IB quality.

> **Current State (from Screenshot at 2:25 PM):**
> - Auto-Scanner: RUNNING ✅ (Last scan 02:25 pm, #55)
> - API Usage: 1941/10000
> - 10 Live Signals generated (7 tradeable), including OIL, LT, JIOFIN, CAMS, CONCOR, SUZLON, SOLARINDS, SUPREMEIND, UNITDSPR, BAJAJFINSV
> - Active Positions: 0 (none taken today)
> - Trade Journal sidebar: Shows TORNTPOWER and UNIONBANK as closed/missed
> - Market Sentiment: BULLISH (+170% from neutral)

---

## ISSUE 1: BACKTEST FIX (CRITICAL — Must Work Before Tomorrow)

### Problem
User clicks "Backtest" button, selects INTRADAY_BOOST category, puts date range 27/02/2026 to 02/03/2026, and wants to see: if we took ALL signals on those days, what would the results be? How many wins, how many losses, net P&L?

This is NOT the time-travel backtest (which tests the strategy against historical 1-min data). This is a **SIGNAL REPLAY backtest** — replay all the signals the system generated (or would have generated) for a date range and show the outcomes.

### What to Build

**The Backtest Modal should have TWO modes:**

**Mode 1: Signal Replay (Quick — uses existing signals from database)**
```
Input:
- Category: INTRADAY_BOOST
- Date Range: 2026-02-27 to 2026-03-02

Process:
1. Query all signals from the signals table for this category + date range
2. For each signal that had status WAITING, PARTIAL, or LIVE (tradeable signals):
   - Check: Did price hit T1 before hitting Stop? → WIN (+1R)
   - Check: Did price hit T2 before hitting Stop? → WIN (+2R)
   - Check: Did price hit Stop before any target? → LOSS (-1R)
   - Check: If neither hit by 3:20 PM → Calculate unrealized P&L at EOD price
3. Compile results

Output:
┌──────────────────────────────────────────────────────────────┐
│  BACKTEST RESULTS: INTRADAY_BOOST                            │
│  Period: Feb 27 - Mar 02 (3 trading days)                    │
│                                                              │
│  SUMMARY                                                     │
│  Total Signals: 28    Tradeable: 18    Skipped (GONE): 10    │
│  Winners: 11 (61%)   Losers: 5 (28%)   Open/EOD: 2 (11%)   │
│                                                              │
│  P&L ANALYSIS                                                │
│  Gross Win: +14.2R    Gross Loss: -5.0R    Net: +9.2R       │
│  If ₹2000 risk/trade: Net P&L = ₹18,400                     │
│  If ₹5000 risk/trade: Net P&L = ₹46,000                     │
│                                                              │
│  PER-DAY BREAKDOWN                                           │
│  Feb 27: 6 signals → 4W 1L 1EOD → +3.8R                    │
│  Feb 28: 5 signals → 3W 2L → +1.0R                          │
│  Mar 02: 7 signals → 4W 2L 1EOD → +4.4R                    │
│                                                              │
│  TRADE LOG                                                   │
│  # Symbol    Dir    Entry    Stop    T1      Result   R      │
│  1 NBCC      SHORT  ₹75.5   ₹75.8   ₹75.2   T1 ✓   +1.0R  │
│  2 LT        SHORT  ₹4061   ₹4125   ₹3997   T1 ✓   +1.0R  │
│  3 OIL       SHORT  ₹483    ₹485    ₹480    T2 ✓✓  +2.0R  │
│  4 SUZLON    LONG   ₹41.3   ₹41.0   ₹41.5   WAIT   -2.5%  │
│  ...                                                         │
│                                                              │
│  [📥 Export CSV]  [📊 View Charts]                            │
└──────────────────────────────────────────────────────────────┘
```

**Mode 2: Time-Travel Backtest (Deep — re-runs strategy on historical 1-min data)**
```
This already exists (or was built earlier). 
Keep it as a separate tab within the Backtest modal.
Uses the intradayStrategyV2_1.cjs to re-scan historical data.
Takes longer but gives deeper analysis.
```

### Backend Implementation

```
File: backend/services/backtestReplayService.cjs

async function replaySignals(category, startDate, endDate) {
  // 1. Fetch all signals for this category + date range
  const signals = await prisma.signal.findMany({
    where: {
      category,
      createdAt: { gte: startDate, lte: endDate },
      // Only tradeable signals (not GONE)
      status: { in: ['WAITING', 'PARTIAL', 'LIVE', 'CONFIRMED'] }
    }
  });

  const results = [];
  
  for (const signal of signals) {
    // 2. Get 1-min candle data AFTER the signal time
    const candles = await get1MinCandlesAfterTime(
      signal.symbol, 
      signal.signalTime, 
      '15:20'  // End of intraday
    );
    
    // 3. Walk through candles to determine outcome
    let outcome = 'EOD_CLOSE';
    let exitPrice = null;
    let exitTime = null;
    let rMultiple = 0;
    
    const riskPerShare = Math.abs(signal.entryPrice - signal.stopPrice);
    
    for (const candle of candles) {
      if (signal.direction === 'SHORT') {
        // Check stop hit (price went UP above stop)
        if (candle.high >= signal.stopPrice) {
          outcome = 'STOP_HIT';
          exitPrice = signal.stopPrice;
          exitTime = candle.timestamp;
          rMultiple = -1;
          break;
        }
        // Check T1 hit
        if (candle.low <= signal.t1Price) {
          outcome = 'T1_HIT';
          exitPrice = signal.t1Price;
          exitTime = candle.timestamp;
          rMultiple = 1;
          // Continue checking for T2...
          // (Use trailing logic: after T1, move stop to entry)
        }
        // Check T2 hit
        if (signal.t2Price && candle.low <= signal.t2Price) {
          outcome = 'T2_HIT';
          exitPrice = signal.t2Price;
          exitTime = candle.timestamp;
          rMultiple = 2;
          break;
        }
      } else { // LONG
        if (candle.low <= signal.stopPrice) {
          outcome = 'STOP_HIT';
          exitPrice = signal.stopPrice;
          exitTime = candle.timestamp;
          rMultiple = -1;
          break;
        }
        if (candle.high >= signal.t1Price) {
          outcome = 'T1_HIT';
          exitPrice = signal.t1Price;
          exitTime = candle.timestamp;
          rMultiple = 1;
        }
        if (signal.t2Price && candle.high >= signal.t2Price) {
          outcome = 'T2_HIT';
          exitPrice = signal.t2Price;
          exitTime = candle.timestamp;
          rMultiple = 2;
          break;
        }
      }
    }
    
    // If neither target nor stop hit → EOD close
    if (outcome === 'EOD_CLOSE') {
      const lastCandle = candles[candles.length - 1];
      exitPrice = lastCandle?.close || signal.entryPrice;
      const pnl = signal.direction === 'SHORT' 
        ? signal.entryPrice - exitPrice 
        : exitPrice - signal.entryPrice;
      rMultiple = pnl / riskPerShare;
    }
    
    results.push({
      symbol: signal.symbol,
      date: signal.createdAt,
      direction: signal.direction,
      type: signal.type, // RETEST or RUNNER
      entryPrice: signal.entryPrice,
      stopPrice: signal.stopPrice,
      t1Price: signal.t1Price,
      t2Price: signal.t2Price,
      exitPrice,
      exitTime,
      outcome,
      rMultiple,
      score: signal.score
    });
  }
  
  // 4. Calculate aggregate stats
  const winners = results.filter(r => r.rMultiple > 0);
  const losers = results.filter(r => r.rMultiple < 0);
  const totalR = results.reduce((sum, r) => sum + r.rMultiple, 0);
  
  return {
    period: { start: startDate, end: endDate },
    category,
    totalSignals: signals.length,
    tradeableSignals: results.length,
    winners: winners.length,
    losers: losers.length,
    winRate: (winners.length / results.length * 100).toFixed(1),
    totalR: totalR.toFixed(1),
    avgWinR: winners.length > 0 
      ? (winners.reduce((s, r) => s + r.rMultiple, 0) / winners.length).toFixed(2) 
      : 0,
    avgLossR: losers.length > 0 
      ? (losers.reduce((s, r) => s + r.rMultiple, 0) / losers.length).toFixed(2) 
      : 0,
    trades: results,
    perDay: groupByDate(results) // group results by date with daily subtotals
  };
}
```

**API Endpoint:**
```
POST /api/v5/backtest/replay
Body: { category: "INTRADAY_BOOST", startDate: "2026-02-27", endDate: "2026-03-02" }

GET /api/v5/backtest/replay/:id  (for retrieving saved backtest results)
```

**Frontend: Enhance the Backtest Modal**
```
File: Modify existing Backtest modal component

- Add date range picker (start date, end date)
- Category dropdown (default: INTRADAY_BOOST)
- "Run Backtest" button
- Results display:
  * Summary cards at top (Win Rate, Net R, Total Trades)
  * Per-day breakdown table
  * Individual trade log table (sortable, filterable)
  * Export CSV button
- Loading state while backtest runs
- Error handling if no signals found for date range
```

---

## ISSUE 2: UI PROFESSIONAL REDESIGN

### Problem
The current UI works but doesn't feel like a professional trading terminal. Several specific issues from the screenshot:

1. **T2 column is empty** for all signals — T2 target is not being displayed
2. **Signal Time shows "4h 40m ago"** — not useful, should show actual time prominently
3. **Score column** — numbers like 85, 75, 70 don't tell user what they mean
4. **Action column shows "Disabled"** — not clear why, and not helpful
5. **Trade Journal sidebar** is cramped and doesn't belong next to signals
6. **No entry price RANGE** — just a single price, but user needs a range to place limit order
7. **Status colors** need better meaning — WAITING/PARTIAL/LIVE/GONE should be visually distinct

### Live Signals Table Redesign

```
Current columns:
# | Symbol | Cat | Dir | Signal Time | Status | Entry | Current | Dist | Stop | T1 | T2 | Score | Action

Redesigned columns:
# | Symbol+Type | Dir | Time | Status | Entry Range | Current | Stop | T1 | T2 | Risk% | Score | Action

Changes:
1. Merge Symbol + Type (RETEST/RUNNER) into one column
   "OIL RETEST" or "CAMS RUNNER" with badge

2. Signal Time → Show as "09:45 AM" (not "4h 40m ago")
   Keep relative time as tooltip only

3. Entry → Entry RANGE (see Issue 3 below for details)
   Show "₹483.2 - ₹485.1" instead of just "₹483.2"
   
4. ADD T2 values (currently empty/missing)
   T2 = 2R target. Calculate: entry ± 2 × (entry - stop)
   
5. Score → Show as colored bar/badge with meaning:
   85+ = "A+" (bright green)
   70-84 = "A" (green)  
   50-69 = "B" (yellow)
   Below 50 = "C" (gray)
   Tooltip shows: "Score 85: Strong volume + Sector aligned + Quiet prev day"

6. Action column:
   If WAITING → Show "Enter" button (green) + "Skip" button (gray)
   If LIVE/PARTIAL → Show "Track" badge (signal already in play)
   If GONE → Show "Missed" badge (grayed out)
   
   "Disabled" text should NEVER appear. If auto-entry is disabled,
   show the manual "Enter" button instead.

7. Add "Dist" column back but make it meaningful:
   Show as percentage AND color:
   Within 0.5% of entry → GREEN "0.3% ↑" (good entry zone!)
   0.5-1.5% away → YELLOW "1.2% ↓" (still ok)
   >1.5% away → RED "2.5% ↑" (too far, risky)

8. Row coloring:
   WAITING signals → default dark row
   LIVE/PARTIAL → subtle green tint (active trade!)
   GONE → darker/grayed out, moved to bottom
   Approaching breakout → subtle pulse animation
```

### Market Phase Indicator Enhancement

```
Current: "Market Open 2:25:48 pm" (small text)

Redesigned: Prominent phase indicator

Before 9:15:    "⏳ PRE-MARKET" (gray)
9:15-9:45:      "📊 OPENING RANGE FORMING" (yellow, pulsing)
9:45-14:30:     "🟢 ACTIVE TRADING WINDOW" (green)
14:30-15:20:    "🟡 CLOSING — No New Entries" (yellow)
After 15:20:    "🔴 MARKET CLOSED" (red)

This tells the user AT A GLANCE whether they should be looking for entries.
```

### Dashboard Layout Restructure

```
Current layout:
┌─────────────────────────────────┬──────────────────┐
│  Live Signals (full width-ish)  │  Trade Journal   │
│                                 │  (sidebar)       │
│                                 │                  │
├─────────────────────────────────┤                  │
│  Active Positions               │                  │
└─────────────────────────────────┴──────────────────┘

Redesigned layout:
┌────────────────────────────────────────────────────┐
│  [Summary Cards Row]                               │
│  Signals: 10 | Tradeable: 7 | Win: 3 | Net: +4.2R │
├────────────────────────────────────────────────────┤
│  Live Signals (FULL WIDTH — no sidebar)            │
│  [All 10 rows with improved columns]               │
├────────────────────────────────────────────────────┤
│  Active Positions (FULL WIDTH)                     │
│  [When user enters trades]                         │
└────────────────────────────────────────────────────┘

Trade Journal → SEPARATE PAGE (see Issue 5)
```

---

## ISSUE 3: ENTRY PRICE RANGE (Critical for Real Trading)

### Problem
UI shows entry at ₹483.2 for OIL. User opens Upstox, the price is at ₹487.9 (+0.98% away). Should they still enter? What's the maximum price they should pay?

In real trading, you don't get the exact signal price. You need a RANGE: "Enter between ₹483.2 and ₹485.5" — this gives the user flexibility for slippage while keeping the risk-reward valid.

### Logic for Entry Range

```
For each signal, calculate:

ENTRY RANGE = [ideal_entry, max_acceptable_entry]

Where:
- ideal_entry = the signal's calculated entry price (OR level after retest)
- max_acceptable_entry = ideal_entry + (buffer based on stop distance)

Buffer calculation:
- risk_per_share = |entry - stop|
- max_buffer = risk_per_share × 0.30  (30% of risk — keeps R:R above 1:1 at T1)
- max_acceptable_entry = ideal_entry + max_buffer (for LONG)
- max_acceptable_entry = ideal_entry - max_buffer (for SHORT)

Example (OIL SHORT):
- Entry: ₹483.2
- Stop: ₹485.62
- Risk per share: ₹2.42
- Buffer: ₹2.42 × 0.30 = ₹0.73
- Entry range: ₹483.2 to ₹482.47 (for SHORT, you want LOWER entry)
  Actually for SHORT: ₹482.47 to ₹483.2 (enter between these)
  Max entry for SHORT: ₹483.93 (entry + 30% of risk upward)

Wait — let me think about this more carefully for the user's perspective:

For LONG signals:
- Ideal entry: ₹41.3 (SUZLON)
- Stop: ₹41.0 (below)  
- Risk: ₹0.30
- Buffer: ₹0.30 × 0.30 = ₹0.09
- "Enter between ₹41.3 and ₹41.39"
- Beyond ₹41.39 → Risk too high relative to target, SKIP

For SHORT signals:
- Ideal entry: ₹483.2 (OIL)
- Stop: ₹485.62 (above)
- Risk: ₹2.42
- Buffer: ₹2.42 × 0.30 = ₹0.73  
- "Enter between ₹482.47 and ₹483.2"
- Actually: ideal SHORT entry is AT or slightly ABOVE the OR level
- "Enter between ₹483.2 and ₹483.93" (can pay up to 30% more risk)
- Beyond ₹483.93 → R:R degraded too much, SKIP
```

### UI Display
```
Instead of just "₹483.2" in Entry column, show:

┌─────────────────┐
│ ₹483.2          │  ← Ideal entry (bold)
│ Range: ₹482.5-₹483.9 │  ← Acceptable range (smaller text)
│ ⚠️ Max: ₹483.9   │  ← Hard limit (red if current > this)
└─────────────────┘

Color the Current price based on entry range:
- Current within range → GREEN (go!)
- Current slightly outside → YELLOW (risky but possible)
- Current far outside → RED (don't chase)
```

### Research Question to Validate

The user asks: "If we place at the exact UI entry price, how many times does the stock come back to that price and the trade succeeds?"

**Create an analysis script:**
```
File: backend/scripts/analyzeEntryFillRate.cjs

For all historical signals:
1. At the signal time, what was the exact entry price?
2. After the signal, did the stock TOUCH that exact price again?
   - If RETEST signal: Yes by definition (retest = price comes back to OR level)
   - If RUNNER signal: Usually NO (that's why it's a runner)
3. If we give the entry price 30 seconds EARLIER (when breakout candle is still 
   forming, before it closes), does the fill rate improve?
4. How many signals would have been filled if we set a limit order 0.1% better 
   than the ideal entry? 0.2%? 0.3%?

Output:
Entry at exact signal price: 72% fill rate
Entry at signal price + 0.1% buffer: 81% fill rate  
Entry at signal price + 0.2% buffer: 89% fill rate
Entry at signal price + 0.3% buffer: 94% fill rate

Recommendation: Give entry price with 0.15-0.2% buffer built in.
```

### Implementation

**Backend: Add entry range fields to signal generation**
```
When generating a signal, calculate and store:
- entryPrice (ideal)
- entryRangeMin
- entryRangeMax  
- maxAcceptableEntry

In the signal generation code, after calculating entry:
  const riskPerShare = Math.abs(entryPrice - stopPrice);
  const buffer = riskPerShare * 0.30;
  
  if (direction === 'LONG') {
    entryRangeMin = entryPrice;
    entryRangeMax = entryPrice + buffer;
  } else {
    entryRangeMin = entryPrice - buffer;
    entryRangeMax = entryPrice;
  }
```

**Frontend: Update Live Signals table Entry column**
```
Show entry range in the Entry column.
Color-code the Current column:
  currentPrice within [entryRangeMin, entryRangeMax] → green background
  currentPrice within 0.5% of range → yellow background
  currentPrice > 1% outside range → red background, show "TOO FAR" badge
```

---

## ISSUE 4: SIGNAL VALIDITY — Are Signals Still Valid at 2:25 PM?

### Problem
At 2:25 PM, the dashboard still shows signals from 9:45 AM with status "WAITING". The user asks: "Is that still a valid trading opportunity?"

**Answer based on our research: NO.** For intraday ORB strategy:
- The signal is generated when breakout + retest/runner occurs (usually 9:30-11:00 AM)
- Once generated, the user has a LIMITED WINDOW to enter
- If the stock has already moved significantly from the entry price, the opportunity is GONE
- After 2:30 PM, NO new entries should be taken (closing phase)

### What to Implement

**Signal Expiry Logic:**
```
Each signal should have a validity window:

1. TIME-BASED EXPIRY:
   - Signals generated before 11:00 AM → Valid until 12:30 PM
   - Signals generated 11:00-12:00 → Valid until 1:30 PM
   - Signals generated after 12:00 → Valid until 2:30 PM
   - After 2:30 PM → ALL signals expired for entry (market closing)
   
   Why: Our research showed that same-day signals degrade over time.
   The ORB setup has momentum that fades by afternoon.

2. PRICE-BASED EXPIRY:
   - If current price is > entryRangeMax → Signal EXPIRED (moved too far)
   - If current price has already hit T1 → Signal status should be "T1_HIT" not "WAITING"
   - If current price has already hit Stop → Signal status should be "STOPPED" not "WAITING"

3. STATUS FLOW:
   WAITING → Price within entry range, time valid → User can enter
   PARTIAL → Breakout confirmed but price slightly outside range → Risky entry
   LIVE → Price hit entry and is tracking toward target → Active trade signal
   EXPIRED → Time or price exceeded validity → Grayed out
   GONE → Signal was never reachable (gapped past entry) → Grayed out
   T1_HIT → Target 1 reached → Green highlight
   T2_HIT → Target 2 reached → Bright green highlight  
   STOPPED → Stop loss hit → Red highlight
```

**Implementation:**
```
In the signal status update logic (run every scan cycle):

for (const signal of todaysSignals) {
  const now = nowIST();
  const currentPrice = await getLivePrice(signal.symbol);
  
  // Check if target hit
  if (signal.direction === 'LONG' && currentPrice >= signal.t1Price) {
    signal.status = signal.t2Price && currentPrice >= signal.t2Price ? 'T2_HIT' : 'T1_HIT';
  }
  if (signal.direction === 'SHORT' && currentPrice <= signal.t1Price) {
    signal.status = signal.t2Price && currentPrice <= signal.t2Price ? 'T2_HIT' : 'T1_HIT';
  }
  
  // Check if stop hit
  if (signal.direction === 'LONG' && currentPrice <= signal.stopPrice) {
    signal.status = 'STOPPED';
  }
  if (signal.direction === 'SHORT' && currentPrice >= signal.stopPrice) {
    signal.status = 'STOPPED';
  }
  
  // Check time expiry (if not already in a terminal state)
  if (['WAITING', 'PARTIAL'].includes(signal.status)) {
    const signalAge = now - signal.signalTime; // in hours
    if (signalAge > 3 || now.hours >= 14.5) { // 3 hours old or past 2:30 PM
      signal.status = 'EXPIRED';
    }
  }
  
  // Check price expiry
  if (signal.status === 'WAITING') {
    if (signal.direction === 'LONG' && currentPrice > signal.entryRangeMax * 1.005) {
      signal.status = 'GONE'; // price ran away
    }
    if (signal.direction === 'SHORT' && currentPrice < signal.entryRangeMin * 0.995) {
      signal.status = 'GONE';
    }
  }
  
  await updateSignalStatus(signal.id, signal.status, currentPrice);
}
```

---

## ISSUE 5: TRADE JOURNAL — Separate Page

### Problem
Trade Journal is currently a small sidebar on the right. It shows TORNTPOWER and UNIONBANK with "SYSTEM_MISSED_EOD 27 Feb" but there's no detail. The user wants a proper journal where they can review trades like an Excel sheet.

### What to Build: Full Trade Journal Page

**New page accessible from nav: "Trade Journal" (or add as tab alongside Trading Dashboard)**

```
┌──────────────────────────────────────────────────────────────────────┐
│  📒 Trade Journal                                                    │
│  [All] [Open] [Closed] [Won ✅] [Lost ❌]  Period: [This Week ▼]    │
│                                                                      │
│  SUMMARY BAR                                                         │
│  Total: 15 | Won: 9 | Lost: 4 | Open: 2 | Win Rate: 69%           │
│  Gross P&L: +₹24,500 | Net (after charges): +₹21,200              │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Date       Symbol    Type     Dir    Entry   Target   Stop    │  │
│  │                                                               │  │
│  │ 02-Mar-26  OIL       RETEST   SHORT  ₹483.2  ₹480.8  ₹485.6 │  │
│  │            Shares: 200  |  T2: ₹478.4  |  Score: 85          │  │
│  │            Status: T1 HIT ✅                                   │  │
│  │            Exit: ₹480.8 at 11:30 AM  |  P&L: +₹480 (+0.50%) │  │
│  │            Duration: 1h 45m  |  R-Multiple: +1.0R             │  │
│  │            Notes: [user can add notes here]                    │  │
│  │                                                               │  │
│  │ 02-Mar-26  SUZLON    RETEST   LONG   ₹41.3   ₹41.5   ₹41.0  │  │
│  │            Shares: 500  |  T2: ₹41.9  |  Score: 48           │  │
│  │            Status: STOP HIT ❌                                 │  │
│  │            Exit: ₹41.0 at 10:15 AM  |  P&L: -₹150 (-0.73%)  │  │
│  │            Duration: 30m  |  R-Multiple: -1.0R                │  │
│  │            Notes: "Low score, should have skipped"            │  │
│  │                                                               │  │
│  │ 27-Feb-26  TORNTPOWER  RETEST  LONG  ₹1587  ₹1606  ₹1569   │  │
│  │            Status: SYSTEM_MISSED_EOD ⚠️                       │  │
│  │            Exit: ₹1587.8 (EOD close)  |  P&L: +₹0.8         │  │
│  │            Note: "System failed to auto-close"                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  [📥 Export to CSV]  [📊 Performance Chart]                          │
│                                                                      │
│  PERFORMANCE CHART (Line chart showing cumulative R over time)       │
│  ─────────────────────────────────────────────────                   │
│      +8R ─                                          ╱──              │
│      +6R ─                              ╱──────────╱                 │
│      +4R ─                    ╱────────╱                             │
│      +2R ─          ╱────────╱                                       │
│       0R ─ ────────╱                                                 │
│      -2R ─╱                                                          │
│           Feb 24    Feb 25    Feb 26    Feb 27    Feb 28    Mar 02   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Key Features
```
1. Each trade row is EXPANDABLE — click to see full details
2. User can ADD:
   - Number of shares traded
   - Actual entry price (may differ from signal price)
   - Actual exit price
   - Notes/comments
   - Tags (e.g., "high confidence", "news-driven", "sector play")
3. Calculated fields:
   - P&L in rupees and percentage
   - R-Multiple (based on risk per share)
   - Duration (entry to exit time)
   - Slippage (difference between signal price and actual price)
4. Filters:
   - Date range picker
   - Status filter (Won/Lost/Open)
   - Direction filter (Long/Short)
   - Symbol search
5. Export:
   - CSV export with all fields
   - Include calculated fields in export
6. Performance chart:
   - Cumulative R-Multiple line chart
   - Win rate rolling average
   - Daily P&L bar chart
```

### Backend
```
Table: trade_journal (or extend existing positions table)

Columns:
- id, signalId (FK to signals table)
- symbol, category, direction, type (RETEST/RUNNER)
- signalEntryPrice, actualEntryPrice, shares
- stopPrice, t1Price, t2Price
- exitPrice, exitTime, exitReason
- pnlRupees, pnlPercent, rMultiple
- duration (minutes)
- slippage (actual vs signal entry)
- notes (user text)
- tags (JSON array)
- createdAt, updatedAt

API:
GET /api/v5/journal?startDate=...&endDate=...&status=...
GET /api/v5/journal/:id
PUT /api/v5/journal/:id  (update shares, actual prices, notes)
GET /api/v5/journal/performance?period=week|month|all
POST /api/v5/journal/export  (returns CSV)
```

---

## ISSUE 6: UPSTOX API STATUS & TOKEN ALERTS

### Problem
When Upstox API limit is reached (10000/day) or token expires, the UI only shows the issue AFTER the user reloads the browser. It should show a real-time alert.

### Implementation
```
1. API Usage Monitor (already shows 1941/10000 — good start):
   - Add WARNING at 7000: Yellow "⚠️ API: 7000/10000 — Approaching limit"
   - Add CRITICAL at 9000: Red "🔴 API: 9000/10000 — Will exhaust soon!"
   - Add EXHAUSTED at 10000: Red alert banner "API LIMIT REACHED — No live data"
   - Show estimated time until limit (based on current rate)

2. Token Expiry:
   - Check token validity every 5 minutes
   - If token expired → Show RED banner at top of page:
     "⚠️ Upstox Token Expired — Live data unavailable. Click to re-login."
   - Banner should persist until user re-authenticates
   - DON'T hide it — make it impossible to miss

3. Connection Health (real-time check):
   - Every 30 seconds, ping the Upstox API
   - If 3 consecutive failures → Show disconnected status
   - Green dot → Connected
   - Yellow dot → Slow response (>2 seconds)
   - Red dot → Disconnected

4. Frontend polling:
   - The API status should be part of the regular polling cycle
   - When status changes → Show toast notification immediately
   - Don't wait for page reload
```

**Implementation:**
```
// In the auto-polling that already runs every 30 seconds:
const healthCheck = await fetch('/api/v5/health');
const health = await healthCheck.json();

if (health.apiUsage > 9000) {
  showBanner('critical', `API limit critical: ${health.apiUsage}/10000`);
}
if (!health.upstoxConnected) {
  showBanner('error', 'Upstox disconnected! Click to re-login.');
}
if (health.tokenExpired) {
  showBanner('error', 'Token expired! Re-authentication required.');
}
```

---

## ISSUE 7: TELEGRAM NOTIFICATIONS (Real-Time Alerts)

### Problem
When a signal is generated, the user should get a Telegram notification IMMEDIATELY, not discover it by looking at the dashboard.

### Telegram Message Templates

**Signal Generated:**
```
🎯 NEW SIGNAL: OIL

📊 RETEST SHORT
Entry: ₹483.2 (Range: ₹482.5 - ₹483.9)
Stop: ₹485.62
T1: ₹480.78 (+1R)
T2: ₹478.37 (+2R)
Risk: 0.5%

Score: 85/100 (A+)
⏰ Valid until: 12:30 PM

💡 Open CTS Dashboard to enter trade
```

**Target Hit:**
```
✅ T1 HIT: OIL

Entry: ₹483.2 → Exit: ₹480.78
P&L: +₹2.42/share (+0.50%)
R-Multiple: +1.0R
Duration: 1h 45m

📊 Today: 3W / 1L (75%)
```

**Stop Hit:**
```
🛑 STOP HIT: SUZLON

Entry: ₹41.3 → Exit: ₹41.0
P&L: -₹0.30/share (-0.73%)
R-Multiple: -1.0R
Duration: 30m

📊 Today: 3W / 2L (60%)
```

**Setup Forming (Early Warning):**
```
👀 SETUP FORMING: TVSMOTOR

Price pressing OR High (₹382)
Current: ₹381.2 (97% to breakout)
Volume: 1.8x average

⏰ Watch for breakout in next 30 mins
📊 If breakout → Expect RETEST signal
```

**EOD Summary:**
```
📊 EOD REPORT — March 2, 2026

Signals: 10 (7 tradeable)
Results: 4W / 2L / 1 EOD (67% WR)
Net P&L: +4.2R

Top: OIL +2R, LT +1R, SOLARINDS +1R
Loss: SUZLON -1R, NBCC -1R

Cumulative this week: +12.8R ✅
```

**Market Phase Alerts:**
```
🟢 9:45 AM — Active Trading Window OPEN
Scanner running. Watching 50 IB stocks.

🟡 2:30 PM — Closing Phase
No new entries. Monitor open positions.

🔴 3:20 PM — Market Closing
All intraday positions auto-closed.
```

### Implementation
```
File: backend/services/telegramService.cjs

Requirements:
1. Bot token and chat ID (user needs to provide these — check if already configured)
2. Send function that formats messages with Markdown
3. Called from:
   - signalScheduler.cjs → when new signal generated
   - scannerStatusTracker.cjs → when setup forming (approaching breakout)
   - positionMonitor.cjs → when target/stop hit
   - eodService.cjs → when market closes
   - signalScheduler.cjs → when market phase changes

Rate limiting:
- Max 1 message per stock per 5 minutes (avoid spam)
- Batch multiple signals into one message if generated within 30 seconds
- Queue messages and send with 1-second delay between them

Error handling:
- If Telegram API fails, LOG the error but don't crash the scanner
- Retry up to 3 times with exponential backoff
- If bot is not configured, skip silently (don't spam console with errors)
```

**Check first: Is Telegram bot already configured?**
```
Look for:
- .env file for TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID
- Any existing telegramService.cjs or similar file
- If not configured, add a setup section in the Controller page:
  "Telegram Setup: Enter Bot Token [____] Chat ID [____] [Test] [Save]"
```

---

## PRIORITY ORDER

```
1. 🔴 ISSUE 4: Signal validity/expiry logic           (45 min)
      This directly fixes the "is it still valid at 2:25 PM?" question
      
2. 🔴 ISSUE 1: Backtest replay                        (1.5 hours)
      User needs this to validate yesterday's signals
      
3. 🔴 ISSUE 3: Entry price range                       (1 hour)
      Critical for actual trade execution
      
4. 🟡 ISSUE 2: UI redesign                             (2 hours)
      Professional look + missing T2 column fix
      
5. 🟡 ISSUE 7: Telegram notifications                  (1.5 hours)
      Real-time alerts for tomorrow's trading
      
6. 🟡 ISSUE 6: Upstox API status alerts                (30 min)
      Quick win, prevents silent failures
      
7. 🟢 ISSUE 5: Trade Journal separate page             (2 hours)
      Important but not blocking trading
```

---

## FILES TO CREATE/MODIFY

### New Files:
- `backend/services/backtestReplayService.cjs` — Signal replay backtest engine
- `backend/scripts/analyzeEntryFillRate.cjs` — Entry price fill rate analysis
- `backend/services/telegramService.cjs` — Telegram notification service
- `frontend/src/pages/TradeJournal.jsx` — Full trade journal page
- `frontend/src/components/BacktestResults.jsx` — Backtest results display

### Modified Files:
- Signal generation code → Add entry range calculation (entryRangeMin, entryRangeMax)
- Signal status update code → Add time-based and price-based expiry
- Live Signals table component → New column layout, entry range display, T2 fix
- Dashboard layout → Remove Trade Journal sidebar, full-width signals
- Navigation → Add Trade Journal link
- Health check API → Add API usage warnings, token expiry check
- Auto-polling code → Add health status checks, toast alerts
- Scanner status service → Trigger Telegram on signal generation

---

## TESTING CHECKLIST

- [ ] Backtest: Select Feb 27 - Mar 02 → Shows results with win/loss breakdown
- [ ] Backtest: Export CSV → Opens in Excel with all trade details
- [ ] Entry range: Each signal shows min-max entry price, not just single price
- [ ] T2 column: All signals show T2 target (not empty)
- [ ] Signal expiry: Old signals (>3 hours) show as EXPIRED, not WAITING
- [ ] Signal expiry: After 2:30 PM, all signals show "CLOSED — Market closing"
- [ ] Trade Journal: Separate page, shows all historical trades
- [ ] Trade Journal: Can add shares, actual price, notes to each trade
- [ ] Trade Journal: Export to CSV works
- [ ] Upstox: When API > 9000 → Yellow/red warning banner appears WITHOUT reload
- [ ] Upstox: When token expires → Red banner appears WITHOUT reload
- [ ] Telegram: New signal → Message received in Telegram within 5 seconds
- [ ] Telegram: Target hit → Message received
- [ ] Telegram: EOD summary → Message received at 3:35 PM
- [ ] Score: Shows as A+/A/B/C badge, not just number
- [ ] Action: Shows "Enter"/"Skip" buttons, NEVER "Disabled"
