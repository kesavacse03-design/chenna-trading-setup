# CTS V5 — Agent Task Sheet: March 2, 2026 (Session 2)

> **Context for Agent:** You are working on Chenna Trading System (CTS V5) — an intraday trading platform for Indian stock markets. The system uses Opening Range Breakout (ORB) strategy with INTRADAY_BOOST stocks from TradeCode. The user (Kesava) has identified 5 critical issues from today's live trading session. Read `CTS_V5_Session_Summary_March2_DeepResearch.md` first for full system context.

> **Tech Stack:** Node.js (CommonJS/.cjs), PostgreSQL (Prisma ORM), React+Vite frontend, Upstox API for market data, TradingView Pine Script for charting.

> **IMPORTANT:** Only INTRADAY_BOOST category is proven (all others paused). Focus everything on IB production quality.

---

## ISSUE 1: STALE ACTIVE POSITIONS (CRITICAL — Fix First)

### Problem
The Trading Dashboard (Screenshot 5) shows **2 active positions** from a previous day:
- `TORNTPOWER` — INTRADAY_BOOST — Entry ₹1587.00 — P&L: ₹-2155
- `UNIONBANK` — INTRADAY_BOOST — Entry ₹202.78 — P&L: ₹-3210

Both show `D3` in the Day column. **These are INTRADAY stocks.** They MUST be closed at 3:20 PM the same day. They should NEVER carry over to the next day. The system is broken — it's showing ghost positions that should have been auto-closed.

### Root Cause to Investigate
1. Is there an EOD (End-of-Day) position cleanup job? If not, create one.
2. Is the position monitor service (`positionMonitor.cjs`) running during market hours?
3. Is there a 3:15-3:20 PM auto-close trigger for intraday positions?

### Required Fix

**Step 1: Create `istUtils.cjs`** (if not already exists)
```
File: backend/utils/istUtils.cjs

Purpose: Single source of truth for all IST timezone operations.

Functions needed:
- nowIST() → returns current time in IST (Asia/Kolkata)
- todayIST() → returns today's date string "YYYY-MM-DD" in IST
- isMarketOpen() → true if between 9:15 AM and 3:30 PM IST, Mon-Fri
- isIntradayExitTime() → true if after 3:15 PM IST
- isMarketClosed() → true if after 3:30 PM IST
- getMarketPhase() → returns "PRE_MARKET" | "OPENING" | "ACTIVE" | "CLOSING" | "CLOSED"
  - PRE_MARKET: before 9:15
  - OPENING: 9:15-9:45 (OR forming, no signals yet)
  - ACTIVE: 9:45-14:30 (signal generation window)
  - CLOSING: 14:30-15:20 (no new entries, monitor exits)
  - CLOSED: after 15:20

CRITICAL: All time comparisons must use IST, not UTC. The server may be running in UTC.
```

**Step 2: EOD Position Auto-Close Service**
```
File: backend/services/eodService.cjs

Trigger: Runs at 3:20 PM IST every trading day (cron or setInterval)

Logic:
1. Find all positions where:
   - status = "ACTIVE"
   - category contains "INTRADAY" or is "INTRADAY_BOOST"
   - entryDate < today OR (entryDate = today AND time > 15:20)
2. For each position:
   - Fetch last known price (from Upstox or cache)
   - Calculate final P&L
   - Set status = "CLOSED"
   - Set exitReason = "EOD_AUTO_CLOSE"
   - Set exitTime = 15:20 IST
   - Set exitPrice = last known price
3. Log all auto-closed positions
4. Update dashboard totals
```

**Step 3: Startup Cleanup**
```
When the server starts (in server.cjs or app.cjs):

1. Check for any ACTIVE intraday positions from previous days
2. If found:
   - Mark them as "MISSED_EXIT" (not "CLOSED" — different status so we can audit)
   - Set exitReason = "SYSTEM_MISSED_EOD"
   - P&L should be calculated using the closing price of the entry date
   - Log a WARNING so we know the system failed to auto-close
3. These should NEVER appear in the "Active Positions" UI

This prevents the exact bug we see in Screenshot 5.
```

**Step 4: Fix Active Positions Query**
```
The API endpoint that returns active positions (GET /api/v5/dashboard/positions or similar):

Add filter:
- For INTRADAY positions: only return if entryDate = todayIST()
- For SWING positions: only return if daysHeld <= maxHoldDays
- Status must be "ACTIVE" (not CLOSED, not MISSED_EXIT)

This is a safety net — even if cleanup fails, the UI won't show stale data.
```

### Verification
- After fix: Dashboard should show 0 active positions (since TORNTPOWER and UNIONBANK are from a previous day)
- Add a test: Create a fake intraday position from yesterday, run cleanup, verify it's gone

---

## ISSUE 2: INTRADAY BOOST LIVE SCANNER UI (New Feature)

### Problem
User added ~50 stocks to INTRADAY_BOOST (Screenshot 1 shows TMPV, TVSMOTOR, ASHOKLEY, IOC as today's IB stocks). The dashboard shows 4 stocks in WAITING status (Screenshot 5: NBCC, WAREEENER, PREMIERENE, etc.). But the user has NO visibility into what's happening with the other 46 stocks. Are they being scanned? What's their status? Is any stock close to breaking out?

The user needs a **real-time scanning panel** — like a professional trading terminal where you can see what the system is doing with each stock before a signal fires.

### What to Build: Intraday Scanner Dashboard

**New Page/Tab: "Scanner" (or add as a section in Watchlist & Analysis page)**

```
┌─────────────────────────────────────────────────────────────────┐
│  📡 INTRADAY BOOST SCANNER           Live ● 50 stocks scanning │
│  Last scan: 10:47:02 AM    Next scan: ~10:48:02 AM             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🔴 APPROACHING BREAKOUT (2)  ← These are about to trigger!    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ SUZLON   OR: 40.20-41.25  Current: 41.18  ▲ 97% to BO  │   │
│  │          Volume: 2.3x avg  │ Keep eye — testing OR High  │   │
│  │ TVSMOTOR OR: 374-382      Current: 381.2  ▲ 95% to BO  │   │
│  │          Volume: 1.8x avg  │ Strong push toward breakout │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  🟡 FORMING RANGE (12)  ← OR still forming                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ TMPV     OR: forming...   1st candle: green ▲            │   │
│  │ ASHOKLEY OR: forming...   2nd candle: red ▼ (OR set!)    │   │
│  │ IOC      OR: 174.5-176.2  Range: 0.97% ← narrow, good   │   │
│  │ ...8 more                                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  🟢 SIGNAL GENERATED (3)  ← Already fired signals              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ NBCC     RETEST SHORT  Entry: ₹75.5  → See Live Signals │   │
│  │ WAREEENER RETEST LONG  Entry: ₹2724  → See Live Signals │   │
│  │ PREMIERENE RETEST LONG Entry: ₹729   → See Live Signals │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ⚪ SIDEWAYS / NO SETUP (28)  ← Not doing anything useful      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ HDFC     Trading inside OR, no momentum                   │   │
│  │ RELIANCE Range too wide (3.5%), skip                      │   │
│  │ TATASTEEL Volume below threshold                          │   │
│  │ ...25 more (collapsed)                                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ❌ FAILED / STOPPED OUT (5)  ← Breakout failed                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ INFY     Broke down but reversed — false breakout         │   │
│  │ COLPAL   Hit stop loss after entry                        │   │
│  │ ...3 more                                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Backend Implementation

**Step 1: Create Scanner Status Tracker**
```
File: backend/services/scannerStatusTracker.cjs

This service maintains an in-memory map of all IB stocks and their current status.
Updated every scan cycle (every 1 minute during market hours).

Data structure per stock:
{
  symbol: "SUZLON",
  addedAt: "2026-03-02",
  orHigh: 41.25,
  orLow: 40.20,
  orFormed: true,
  orRangePercent: 2.61,
  currentPrice: 41.18,
  distanceToBreakout: 0.17,    // percent distance to nearest OR boundary
  breakoutSide: "LONG",        // which side is closer
  breakoutPercent: 97,          // how close to breakout (0-100%)
  volumeRatio: 2.3,            // current volume vs average
  status: "APPROACHING_BREAKOUT",
  statusMessage: "Testing OR High, volume expanding",
  signalGenerated: false,
  signalId: null,
  lastUpdated: "2026-03-02T10:47:02+05:30"
}

Status values:
- "OR_FORMING"           → OR not yet defined (still in first candles)
- "APPROACHING_BREAKOUT" → Price within 1% of OR boundary with volume
- "SIDEWAYS"             → Trading inside OR, no momentum
- "RANGE_TOO_WIDE"       → OR range > 3%, skip (too risky)
- "LOW_VOLUME"           → Volume below 1.0x average
- "SIGNAL_GENERATED"     → Breakout confirmed, signal sent to Live Signals
- "BREAKOUT_FAILED"      → Broke out but reversed back inside OR
- "STOPPED_OUT"          → Signal was taken but stop hit
- "TARGET_HIT"           → Signal was taken and target reached

Each status should have a human-readable message explaining WHY.
```

**Step 2: API Endpoint**
```
GET /api/v5/scanner/status

Response:
{
  lastScanTime: "10:47:02 AM",
  totalStocks: 50,
  scannerRunning: true,
  marketPhase: "ACTIVE",
  stocks: [
    { symbol: "SUZLON", status: "APPROACHING_BREAKOUT", ... },
    { symbol: "TMPV", status: "OR_FORMING", ... },
    ...
  ],
  summary: {
    approachingBreakout: 2,
    orForming: 12,
    signalGenerated: 3,
    sideways: 28,
    failed: 5
  }
}
```

**Step 3: Frontend Component**
```
File: frontend/src/components/ScannerDashboard.jsx

- Group stocks by status (use the categories above)
- Color-coded sections (red=approaching, yellow=forming, green=signal, gray=sideways)
- Auto-refresh every 30 seconds (poll the API)
- Collapsible sections (expand/collapse stock groups)
- Click a stock → opens TradingView chart link for that stock
- Show progress bar for "approaching breakout" stocks (visual indicator of how close)
```

### Integration with Existing Signal Pipeline
The scanner status tracker should be PART of the existing signal generation loop. When the system scans each stock every minute, it should also update the scanner status. This is NOT a separate scan — it's enriching the existing scan with status information.

```
In generateIntradaySignalsV21() or equivalent:

For each stock in today's IB list:
  1. Fetch 1-min candles
  2. Calculate OR (existing logic)
  3. Check breakout conditions (existing logic)
  4. >> NEW: Update scannerStatusTracker with current state <<
  5. If signal conditions met → generate signal (existing logic)
```

---

## ISSUE 3: EOD PERFORMANCE REPORT (New Feature)

### Problem
After market closes (3:30 PM), the user has no way to see a summary of the day's performance. If they had taken all signals, what would have happened? How many wins/losses? What's the net P&L?

### What to Build: End-of-Day Report

**Trigger:** Automatically generated at 3:35 PM IST every trading day. Also accessible via a button "View EOD Report" on the dashboard.

**Report Content:**
```
┌─────────────────────────────────────────────────────────────────┐
│  📊 EOD REPORT — March 2, 2026                                 │
│  Market: NIFTY 22,450 (+1.41%)  │  Sentiment: BULLISH          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SIGNALS SUMMARY                                                │
│  ──────────────────────────────────────────────────────────      │
│  Total Signals Generated: 10                                    │
│  Tradeable (score ≥ 25):  5                                     │
│  Skipped (GONE/low score): 5                                    │
│                                                                 │
│  IF ALL TRADEABLE SIGNALS WERE TAKEN:                           │
│  ──────────────────────────────────────────────────────────      │
│  Winners: 3 (60%)         │  Losers: 2 (40%)                   │
│  Avg Win: +1.2R (₹2,400)  │  Avg Loss: -1R (₹2,000)           │
│  Net P&L: +1.6R (₹3,200)  │  Capital Required: ₹5,00,000      │
│                                                                 │
│  TRADE DETAILS                                                  │
│  ──────────────────────────────────────────────────────────      │
│  #  Symbol     Dir    Entry    Exit     Result   R-Multiple     │
│  1  NBCC       SHORT  ₹75.5   ₹75.2    STOP ✗   -1.0R ❌      │
│  2  WAREEENER  LONG   ₹2724   ₹2648    WAITING  -1.09% ⏳     │
│  3  PREMIERENE LONG   ₹729.4  ₹734.4   T1 ✓    +1.0R ✅      │
│  4  INFY       SHORT  ₹1384.3 ₹1293.7  T2 ✓✓   +2.0R ✅      │
│  5  VOLTAS     LONG   ₹1555.5 ₹1529.3  WAITING  -1.68% ⏳     │
│                                                                 │
│  SKIPPED SIGNALS (for reference)                                │
│  ──────────────────────────────────────────────────────────      │
│  TMPV (SHORT) — GONE at signal time, score: 70                  │
│  COLPAL (SHORT) — GONE, too far from entry                      │
│  TATACONSM (SHORT) — GONE, score: 60                            │
│  EICHERMOTOR (SHORT) — GONE, score: 35                          │
│  BPCL (SHORT) — GONE, score: 28                                 │
│                                                                 │
│  USER'S ACTUAL TRADES (if any positions were taken)             │
│  ──────────────────────────────────────────────────────────      │
│  No positions entered today.                                    │
│                                                                 │
│  SCANNER STATISTICS                                             │
│  ──────────────────────────────────────────────────────────      │
│  Total IB stocks today: 50                                      │
│  Breakouts detected: 10                                         │
│  Valid signals (with retest/runner): 5                           │
│  Hit rate (signals/breakouts): 50%                              │
│                                                                 │
│  COMPARISON WITH TRADINGVIEW                                    │
│  ──────────────────────────────────────────────────────────      │
│  Signals matching TV chart: 4/5 (80%)                           │
│  Entry price accuracy: avg 0.3% deviation                       │
│  (Flag any stock where entry differs > 1% from TV)              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Backend Implementation

**Step 1: EOD Report Generator**
```
File: backend/services/eodReportService.cjs

Function: generateEODReport(date)

Logic:
1. Fetch all signals for the given date
2. For each signal:
   - Get entry price, stop, T1, T2 from the signal record
   - Get the actual price movement after entry (from 1-min candle data)
   - Determine outcome:
     * Did price hit T1? → +1R win
     * Did price hit T2? → +2R win  
     * Did price hit stop? → -1R loss
     * Neither? → Calculate unrealized P&L at 3:20 PM (EOD close price)
3. Calculate aggregate stats (wins, losses, win rate, net R, net PnL)
4. Fetch user's actual positions for comparison
5. Store report in database (eod_reports table)
6. Return structured report data

Note: "If all signals were taken" means calculate as if user entered every
signal that had status WAITING or PARTIAL at the time of generation.
Signals that were GONE should be listed separately as "skipped".
```

**Step 2: API Endpoint**
```
GET /api/v5/reports/eod?date=2026-03-02
GET /api/v5/reports/eod/latest

POST /api/v5/reports/eod/generate  (manual trigger)
```

**Step 3: Frontend**
```
- Add "EOD Report" button on Trading Dashboard (visible after 3:30 PM)
- Or add it as a section that appears after market close
- Include a "Generate Report" button for manual trigger
- Historical reports accessible via date picker
- Show a week/month summary view aggregating daily reports
```

---

## ISSUE 4: DATA TRANSPARENCY — CTS vs TradingView Must Match

### Problem
Looking at the TradingView charts vs the CTS dashboard, the data should be identical:

**SUZLON (Screenshot 2 — TradingView):**
- Pine Script shows: RETEST LONG, Entry ₹41.25, Stop ₹41.04, T1 ₹41.46, T2 ₹41.66
- OR HIGH: ₹41.25, OR LOW: ₹39.98, Range: 3.13%
- Result: T2 ✓✓ +2R

**But SUZLON is NOT in the Live Signals on the CTS Dashboard (Screenshot 5).** Why?
- Is SUZLON in today's IB list? (Need to verify)
- If yes, the system missed it. That's a critical bug.

**LT (Screenshot 3 — TradingView):**
- Pine Script shows: RETEST SHORT, Entry ₹4078.7, Stop ₹4109.6, T1 ₹4047.8, T2 ₹4016.9
- Result: T1 ✓ +1R
- LT is NOT in Live Signals either.

**OIL (Screenshot 4 — TradingView):**
- Pine Script shows: RETEST SHORT, Entry ₹483.2, Stop ₹485.62, T1 ₹480.78, T2 ₹478.37
- Result: T2 ✓✓ +2R → but then shows STOP ✗ -1R (reversed back up)
- OIL is NOT in Live Signals either.

**CTS Dashboard (Screenshot 5) shows these Live Signals:**
- NBCC (SHORT), WAREEENER (LONG), PREMIERENE (LONG), INFY (SHORT), VOLTAS (LONG)
- Plus several GONE signals: TMPV, COLPAL, TATACONSM, EICHERMOTOR, BPCL

### Required Fix: Transparency Audit

**Step 1: Cross-Reference Check**
```
Create a script: backend/scripts/auditSignalTransparency.cjs

For a given date:
1. Get all stocks in today's INTRADAY_BOOST list from database
2. For each stock:
   - Did the Pine Script indicator show a signal? (We can't check this directly,
     but we CAN check if the ORB pattern conditions were met in our data)
   - Did CTS generate a signal?
   - If Pine showed it but CTS didn't → WHY? Log the reason:
     * Stock not in IB list?
     * OR range filter rejected it?
     * Volume filter rejected it?
     * Breakout happened but no retest?
     * Data missing?
3. For stocks where BOTH generated signals:
   - Compare entry prices (should be within 0.5%)
   - Compare stop/target levels
   - Flag any deviation > 1%
4. Output a transparency report
```

**Step 2: Signal Generation Logging**
```
During signal generation, log EVERY stock that was evaluated and WHY it was
accepted or rejected. Store in a scan_log table or JSON file.

For each scan cycle:
{
  scanTime: "10:47:02",
  stocksScanned: 50,
  results: [
    { symbol: "SUZLON", passed: true, reason: "Breakout confirmed, retest valid" },
    { symbol: "HDFC", passed: false, reason: "OR range 3.5% exceeds 3% limit" },
    { symbol: "RELIANCE", passed: false, reason: "Volume ratio 0.8x below 1.0x threshold" },
    ...
  ]
}

This log feeds into the Scanner Dashboard (Issue 2) and also helps with
debugging when TV shows a signal but CTS doesn't.
```

**Step 3: Entry Price Verification**
```
CRITICAL: Our entry prices must match what TradingView shows.

The Pine Script calculates entry as: OR_HIGH + buffer (for LONG) or OR_LOW - buffer (for SHORT)

Verify in the backend:
1. The OR High/Low values match between CTS and Pine Script
2. The buffer calculation is identical
3. The retest entry price uses the ACTUAL retest candle close, not the OR boundary

If there's a mismatch, the most likely cause is:
- Different candle data source (Upstox vs TradingView data feed)
- Timezone mismatch in OR calculation
- Stale cached data being used instead of fresh data
```

---

## ISSUE 5: AUTO SIGNAL GENERATION (Not Manual/Force)

### Problem
Currently:
- "Generate Signals" button = FORCE generate (user has to manually click)
- "Refresh" button = just reloads UI to show signals
- Signals only appear after clicking "Generate Signals" or reloading the page
- If user doesn't click, they miss signals during market hours

**This is fundamentally wrong for a trading system.** Signals must generate AUTOMATICALLY during market hours. The user should just open the dashboard and see signals appearing in real-time.

### Required Architecture

**Step 1: Background Signal Generation Service**
```
File: backend/services/signalScheduler.cjs

This service starts when the server starts and runs autonomously.

Schedule:
- 9:15 AM IST: Start scanning (1-minute intervals)
- 9:15-9:45: OR forming phase (scan but don't generate signals yet)
- 9:45-14:30: Active signal generation window
  * Every 1 minute: scan all IB stocks, check for breakouts/retests
  * If signal conditions met → auto-generate signal, save to DB
- 14:30-15:20: No new signals, only monitor existing positions
- 15:20: Auto-close all intraday positions
- 15:35: Generate EOD report
- 15:45: Stop scanner until next trading day

Implementation:
- Use setInterval (1 minute) during market hours
- Check isMarketOpen() from istUtils.cjs before each scan
- On weekends/holidays: don't start the scanner
- Log every scan cycle (timestamp, stocks scanned, signals found)

The scanner should be IDEMPOTENT — if it finds a breakout that already
generated a signal, it should NOT generate a duplicate. Use a check:
"Does a signal already exist for this symbol + date + direction?"
```

**Step 2: Real-Time UI Updates (WebSocket or Polling)**
```
Option A: WebSocket (preferred for real-time)
- Server emits events when new signal is generated
- Frontend listens and adds signal to the list immediately
- Also emits position updates, scanner status changes

Option B: Auto-Polling (simpler, good enough for now)
- Frontend polls GET /api/v5/signals/today every 30 seconds
- Frontend polls GET /api/v5/scanner/status every 30 seconds
- Compare with previous response, if new signals → show notification toast

Recommendation: Start with Option B (polling). It's simpler and works.
Add WebSocket later as an enhancement.
```

**Step 3: Fix Button Behaviors**
```
Current buttons on dashboard:
- "Generate Signals" → RENAME to "Force Scan Now"
  * This should be an OVERRIDE button for when the user wants an immediate scan
  * Should NOT be required for normal operation
  * Add tooltip: "System auto-scans every minute. Use this for immediate scan."

- "Refresh" → Keep as is (refreshes UI data)
  * But with auto-polling, this becomes less necessary

- "Backtest" → Keep as is (historical testing)

Add new visual indicator:
- "Auto-Scanner: RUNNING ●" (green dot, pulsing)
- Shows last scan time and next scan time
- "Auto-Scanner: PAUSED ●" (yellow, outside market hours)
- "Auto-Scanner: ERROR ●" (red, if scanner crashes)
```

**Step 4: Dynamic Signal Updates Without Page Reload**
```
When the frontend receives new signal data (from polling or WebSocket):

1. New signal appears → 
   - Add to Live Signals table with animation (highlight briefly)
   - Show toast notification: "New Signal: SUZLON RETEST LONG ₹41.25"
   - Play subtle sound (optional, user can toggle)

2. Signal status changes (WAITING → PARTIAL → T1_HIT) →
   - Update the row in-place, no page reload
   - Flash the row briefly to draw attention

3. Signal expired (GONE) →
   - Gray out the row
   - Move to "Skipped" section

All of this should happen WITHOUT the user clicking Refresh or reloading.
```

---

## PRIORITY ORDER FOR IMPLEMENTATION

```
1. 🔴 ISSUE 1: Fix stale positions + create istUtils.cjs     (30 min)
2. 🔴 ISSUE 5: Auto signal generation scheduler               (1 hour)
3. 🟡 ISSUE 4: Signal transparency logging                    (45 min)
4. 🟡 ISSUE 2: Scanner status dashboard                       (2 hours)
5. 🟢 ISSUE 3: EOD report                                     (1.5 hours)
```

Issues 1 and 5 are BLOCKING — without them, the system is not usable for live trading.
Issue 4 is needed for trust — user can't trust signals they can't verify.
Issues 2 and 3 are valuable features that improve the trading experience.

---

## FILES TO CREATE/MODIFY

### New Files:
- `backend/utils/istUtils.cjs` — IST timezone utilities
- `backend/services/eodService.cjs` — End-of-day position cleanup
- `backend/services/scannerStatusTracker.cjs` — Real-time stock scanning status
- `backend/services/signalScheduler.cjs` — Auto signal generation scheduler
- `backend/services/eodReportService.cjs` — EOD report generator
- `backend/scripts/auditSignalTransparency.cjs` — Signal vs TradingView audit
- `frontend/src/components/ScannerDashboard.jsx` — Scanner UI
- `frontend/src/components/EODReport.jsx` — EOD report UI

### Modified Files:
- `backend/server.cjs` (or main entry) — Start scheduler on boot, run startup cleanup
- Active positions API endpoint — Add date filter for intraday
- Signal generation function — Add scanner status tracking + logging
- Trading Dashboard component — Add auto-polling, new indicators, rename buttons
- Watchlist & Analysis page — Add Scanner tab/section

---

## TESTING CHECKLIST

Before considering any issue "done":

- [ ] Start server → old intraday positions from previous days should NOT appear
- [ ] During market hours → signals should auto-generate without clicking any button
- [ ] Open Scanner page → should see all 50 IB stocks with their current status
- [ ] After 3:20 PM → all intraday positions auto-closed
- [ ] After 3:35 PM → EOD report available
- [ ] Compare CTS signals with TradingView Pine Script → entry prices match within 0.5%
- [ ] Reload page → signals should still be there (not lost)
- [ ] Leave dashboard open for 5 minutes → new signals appear without refresh

---

## REFERENCE: Today's TradingView Signals for Validation

From the screenshots, the Pine Script (CTS V5 ORB) generated these signals today:

| Stock  | Direction | Type   | Entry    | Stop     | T1       | T2       | Result      |
|--------|-----------|--------|----------|----------|----------|----------|-------------|
| SUZLON | LONG      | RETEST | ₹41.25   | ₹41.04   | ₹41.46   | ₹41.66   | T2 ✓✓ +2R   |
| LT     | SHORT     | RETEST | ₹4078.7  | ₹4109.6  | ₹4047.8  | ₹4016.9  | T1 ✓ +1R    |
| OIL    | SHORT     | RETEST | ₹483.2   | ₹485.62  | ₹480.78  | ₹478.37  | T2→STOP -1R |

CTS Backend should generate identical (or very close) signals for any stock that is in the IB list. If SUZLON, LT, OIL were in today's IB list and CTS didn't generate signals for them, that's a bug to investigate.
