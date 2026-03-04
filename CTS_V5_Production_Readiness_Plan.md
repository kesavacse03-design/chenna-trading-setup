# CTS V5 — Production Readiness Plan
## Priority Tasks for Agent

---

## PHASE 1: FIX BROKEN THINGS (Do First)
*Nothing new until what exists actually works*

### 1.1 Fix Active Positions — NaN/UNKNOWN bugs
```
Active Positions shows:
  TORNTPOWER | UNKNOWN | ₹1587.80 | Target: NaN | Stop: ₹1569.40 | P&L: NaN
  UNIONBANK  | UNKNOWN | ₹202.78  | Target: NaN | Stop: ₹200.95  | P&L: NaN

Root causes:
  a) Category = "UNKNOWN" → positionService.openPositionFromSignal() 
     not copying category from the V5Signal record
  b) Target = NaN → t1Price not being copied to position
  c) P&L = NaN → currentPrice is null, calculation fails

Fix:
  - In positionService.cjs → openPositionFromSignal():
    Copy: category, direction, t1Price, t2Price from the signal
  - In P&L calculation: 
    if (!currentPrice) show "—" not NaN
  - In frontend: show category from position record
```

### 1.2 Fix entry price editing
```
When user clicks "Enter" on a signal:
  Show a small modal/popup:
    ┌─────────────────────────────┐
    │ ENTER TRADE: COLPAL SHORT   │
    │                             │
    │ System Entry: ₹2263.6       │
    │ Your Entry:   [₹2260.00]   │ ← editable input
    │ Stop Loss:    ₹2279.1       │
    │ Target T1:    ₹2248.1       │
    │ Quantity:     [auto-calc]   │
    │                             │
    │ [Confirm Entry]  [Cancel]   │
    └─────────────────────────────┘
  
  The "Your Entry" field auto-fills with system entry price
  but user can modify it (they got a different fill price).
  
  Quantity auto-recalculates based on the adjusted entry:
    qty = maxRisk / abs(yourEntry - stop)
  
  On confirm: POST /api/v5/positions/open with adjusted price
```

---

## PHASE 2: REDESIGN DASHBOARD LAYOUT
*Clean, professional, no clutter*

### 2.1 Remove/Reorganize sections
```
REMOVE completely:
  ✗ "Live Tracking Status" box (64 scanned, 0 patterns — useless noise)
  ✗ "Live Monitoring" section at bottom (strategies listed but not functional)
  
KEEP but redesign:
  ✓ Live Alerts → Collapse into a compact notification panel
  ✓ Live Signals → Main focus area
  ✓ Active Positions → Below signals
  ✓ Portfolio Snapshot → Right sidebar (already good)
```

### 2.2 Redesign Live Alerts → Compact Notification Bar
```
Current: 40+ rows of individual alerts taking half the screen
Redesign: Single collapsible bar at top

  ┌─────────────────────────────────────────────────────┐
  │ 🔔 Alerts: 3 Entries | 5 Breakouts | 8 Forming     │
  │    Latest: NESTLEIND BREAKOUT ▼ @ ₹1292 (2m ago)   │
  │                                          [Expand ▼] │
  └─────────────────────────────────────────────────────┘

  Click "Expand" → shows grouped alerts:
    ENTRY alerts at top (most important)
    BREAKOUT alerts below
    SETUP_FORMING collapsed by default (least important)
    
  Each alert shows: Symbol | Type | Price | Time ago | [Dismiss]
  
  Auto-dismiss SETUP_FORMING alerts older than 30 min
  Auto-dismiss BREAKOUT alerts older than 1 hour
  Keep ENTRY alerts until end of day
```

### 2.3 Live Signals — Add Category Column
```
Show the category for each signal:
  Currently only shows INTRADAY_BOOST signals.
  In future when swing strategies activate, show:
  
  Category column with color badges:
    🟡 INTRA BOOST — intraday (yellow badge)
    🔵 ST_SWING_UP — swing short term (blue badge)  
    🟢 LT_SWING_UP — swing long term (green badge)
    🔴 ST_SWING_DOWN — swing down (red badge)
    ⬜ (future categories greyed out with "Coming Soon")
```

---

## PHASE 3: SYSTEM HEALTH MONITORING
*User must NEVER see stale data without knowing*

### 3.1 Health Status Bar (always visible at top)
```
Add a persistent status bar below the nav:

  ┌──────────────────────────────────────────────────────────┐
  │ 🟢 Upstox: Connected  │ 🟢 DB: OK  │ API: 73/10000    │
  │ Last Refresh: 12:33 PM │ Next: 1:03 PM (auto)          │
  └──────────────────────────────────────────────────────────┘

  States:
    Upstox: 
      🟢 Connected — valid token, API responding
      🟡 Expiring — token expires in < 1 hour
      🔴 EXPIRED — token invalid, show big warning overlay:
      
        ╔═══════════════════════════════════════════╗
        ║  ⚠️  UPSTOX TOKEN EXPIRED                ║
        ║                                           ║
        ║  All data is STALE since 10:45 AM.       ║
        ║  Live prices and signals are NOT updating.║
        ║                                           ║
        ║  [🔑 Re-Login to Upstox]                 ║
        ╚═══════════════════════════════════════════╝
      
      This overlay blocks interaction until re-login.
    
    Database:
      🟢 OK — Prisma connection alive
      🔴 DOWN — Show warning, disable all actions
    
    API Usage:
      Green: < 500 calls used
      Yellow: 500-800 calls
      Red: > 800 calls — show "API limit approaching"
      
    Last Refresh:
      Show when intraday data was last fetched
      If > 30 min stale during market hours → yellow warning
```

### 3.2 API Health Check Endpoint
```
Create: GET /api/v5/health

Returns:
{
  upstox: {
    status: "connected" | "expired" | "error",
    tokenExpiresAt: "2026-02-27T18:00:00Z",
    lastApiCall: "2026-02-27T12:33:00Z",
    callsToday: 73,
    callsLimit: 10000
  },
  database: {
    status: "connected" | "error",
    signalCount: 11,
    positionCount: 2
  },
  market: {
    isOpen: true,
    lastRefresh: "2026-02-27T12:33:00Z",
    nextRefresh: "2026-02-27T13:03:00Z"
  }
}

Frontend polls this every 60 seconds.
```

---

## PHASE 4: SWING CATEGORY TRACKING LOGIC
*Stocks persist for days, not just today*

### 4.1 Swing Signal Lifecycle
```
INTRADAY signals:
  - Created when stock added to INTRADAY_BOOST for today
  - Scanned during market hours (9:45 - 12:00)
  - EXPIRES at 3:15 PM same day (EOD)
  - Never carries to next day

SWING signals (ST_UP, LT_UP, ST_DOWN):
  - Created when stock appears in swing category
  - Must be TRACKED for multiple days:
    ST_SWING_UP:    Track up to 5 trading days
    LT_SWING_UP:    Track up to 10 trading days
    ST_SWING_DOWN:  Track up to 10 trading days (mean reversion)
  
  - Each morning, the system checks:
    "Is this stock still meeting the confirmation criteria?"
    If YES on any day within window → CONFIRMED
    If NO after window expires → EXPIRED
  
  - Signal age calculation:
    daysTracked = tradingDays between signalDate and today
    if daysTracked > maxDays → auto-expire
```

### 4.2 Swing Signal Cleanup Logic
```
Daily cleanup job (runs at 9:00 AM before market open):

  1. Find all PENDING swing signals
  2. For each:
     - Calculate trading days since signalDate
     - If > category.maxTrackingDays → set status = 'EXPIRED'
     - If within window → keep PENDING for today's scan
  
  maxTrackingDays per category:
    SHORT_TERM_SWING_BO_UP:    5 days
    SHORT_TERM_SWING_BO_DOWN:  10 days  
    LONG_TERM_SWING_BO_UP:     10 days
    LONG_TERM_SWING_BO_DOWN:   10 days
    
  For the exact days, run an analysis:
    "For each swing category in the backtest data,
     on which day (1-15) did confirmation typically occur?
     What's the 90th percentile? That's the cutoff."
```

### 4.3 Watchlist Default Filters
```
INTRADAY tab: Default = TODAY only
  Shows stocks added to IB category today
  Filter dropdown: Today | Yesterday | Last 3 days

SWING CENTER tab: Default = LAST 7 DAYS  
  Shows stocks in swing categories from last 7 days
  Filter dropdown: 7 days | 14 days | 30 days | All

Live Price Sync: OFF by default
  Toggle button clearly visible
  When OFF: prices show last fetched value + timestamp
  When ON: refreshes every 30 seconds (shows countdown)
```

---

## PHASE 5: CODEBASE CLEANUP
*Remove junk without breaking anything*

### 5.1 Safe Cleanup Process
```
STEP 1: Map all dependencies
  Run a script that:
  a) Scans all .js/.cjs/.mjs files in the project
  b) For each file, extract all require() and import statements
  c) Build a dependency graph
  d) Identify files that are NEVER imported/required by anything
  
STEP 2: Identify active entry points
  These files are "roots" that must be kept:
  - server.cjs (main backend)
  - All files in routes/ (API endpoints)
  - All files in services/ that are imported by routes
  - package.json scripts
  - Prisma schema
  - Frontend src/ files
  
STEP 3: Identify junk candidates
  Files that are:
  - Not imported by any active file
  - Not a script in package.json
  - Not a config file (.env, prisma, etc)
  - Test files from old iterations (test_*.cjs)
  - Old strategy files from VS Code era
  - Duplicate/backup files (*_old.*, *_backup.*, *_v2.*)
  
STEP 4: Create junk manifest
  Generate: cleanup_manifest.md
  Lists every file proposed for removal with:
    - File path
    - Last modified date
    - Reason for removal
    - Risk level (SAFE / CHECK / KEEP)
    
  Show to user for approval BEFORE moving anything.

STEP 5: Move to junk (don't delete)
  mkdir _junk_20260227/
  Move approved files there
  Run full test suite after moving
  If anything breaks → move back immediately
```

---

## EXECUTION ORDER
```
Priority 1 (TODAY):
  1.1 Fix Active Positions NaN/UNKNOWN
  1.2 Fix entry price editing modal
  3.1 Health status bar (Upstox token warning is CRITICAL)

Priority 2 (THIS WEEK):
  2.1 Remove useless sections
  2.2 Redesign alerts to compact bar
  2.3 Add category to signals
  3.2 Health check API

Priority 3 (NEXT WEEK):  
  4.1 Swing signal lifecycle
  4.2 Swing cleanup job
  4.3 Watchlist defaults
  5.1-5.5 Codebase cleanup
```
