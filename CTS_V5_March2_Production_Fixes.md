# CTS V5 — URGENT PRODUCTION FIX: March 2 Dashboard Issues
## Screenshot Analysis + Exact Code Fixes Needed

---

## WHAT I SEE IN THE SCREENSHOT (March 2, 10:47 AM)

### BUG 1: 🔴 CRITICAL — Friday's Signals Still Showing as "Live"

Signals showing: NBFC, WAAREEENER, PREMIERENE, INFY, VOLTAS, TMPV, 
COLPAL, TATACONSUM, EICHERMOT, BPCL

Signal timestamps show "7h 30m ago", "73h 0m ago" — these are 
FRIDAY (Feb 27) signals, NOT today (March 2).

The dashboard shows "3 tradeable" but these are 3-day-old signals!
Trading on 3-day-old signals = guaranteed loss.

**Root Cause**: The dashboard API (`GET /api/v5/signals`) does NOT 
filter by today's date. It returns ALL recent signals regardless 
of when they were generated.

**Also**: "Generate Signals" button runs `confirmIntradaySignals(targetDateStr)` 
but the `targetDateStr` might be incorrect, OR the signal generation 
worked but the dashboard is showing old + new signals mixed together.

### FIX NEEDED in dashboardService.cjs (or v5Routes.cjs):

```javascript
// In the GET /api/v5/signals endpoint:
// BEFORE (broken): Returns all recent signals
const signals = await prisma.v5Signal.findMany({
    where: { category: 'INTRADAY_BOOST' },
    orderBy: { confirmedAt: 'desc' },
    take: 20
});

// AFTER (fixed): Only return TODAY's signals
const today = new Date();
today.setHours(0, 0, 0, 0);
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);

const signals = await prisma.v5Signal.findMany({
    where: { 
        category: 'INTRADAY_BOOST',
        signalDate: {
            gte: today,
            lt: tomorrow
        }
    },
    orderBy: { confirmedAt: 'desc' }
});
```

### ALSO FIX in confirmIntradaySignals():

```javascript
// The stock filtering at line ~195 of confirmationService.cjs:
const activeIBStocks = ibCats
    .filter(r => r.addedDate && 
        r.addedDate.toISOString().split('T')[0] === targetDateStr)
    .map(r => r.stock);

// PROBLEM: addedDate comparison might fail if the date in DB is 
// stored as midnight UTC (2026-03-02T00:00:00.000Z) but 
// targetDateStr is '2026-03-02' — the comparison should work,
// BUT if Kesava added stocks via the Watchlist page and the 
// addedDate was set to IST midnight (which is previous day UTC),
// then the dates DON'T MATCH.

// Example: Kesava adds stocks at 9 AM IST on March 2
// If addedDate is stored as new Date() → 2026-03-02T03:30:00Z (UTC)
// But .toISOString().split('T')[0] = '2026-03-02' ✅ this should work
//
// HOWEVER, if addedDate was stored as:
//   new Date('2026-03-02') → JavaScript creates 2026-03-02T00:00:00Z
// And targetDateStr = '2026-03-02' → match ✅
//
// The most likely issue: addedDate is stored with TIME component
// and the comparison is doing exact string match on date portion.
// This SHOULD work. So the problem might be elsewhere.

// CHECK: Run this query to verify stocks exist for today:
// SELECT * FROM "StockCategory" sc 
// JOIN "Category" c ON c.id = sc."categoryId"
// WHERE c.key = 'INTRADAY_BOOST' 
// AND sc."addedDate"::date = '2026-03-02';
```

---

### BUG 2: 🔴 Cache Data Missing for Today's New Stocks

Even if stocks are in the database for today, the 30-min candle 
data for TODAY needs to be fetched. The system uses disk cache files:
  cache/30minute/{SYMBOL}_master.json

For NEW stocks added today, these cache files either:
  a) Don't exist at all (stock was never cached before)
  b) Exist but have no data for March 2 (last update was Feb 27)

**When confirmIntradaySignals runs and finds no 30m data for today:**
```javascript
const data30 = load30mCache(sym);
if (!data30 || !data30[targetDateStr]) continue; // SILENTLY SKIPS!
```
It just skips the stock — no signal generated, no error shown.

**FIX: The pipeline must be:**
```
Step 1: Kesava adds new IB stocks in database (done ✅)
Step 2: Run intraday_refresh.cjs to fetch TODAY's 30m candles
        for all IB stocks (MISSING — this is the gap)
Step 3: Run confirmIntradaySignals('2026-03-02') 
Step 4: Dashboard shows only today's signals
```

**The "Refresh" button in the header bar should trigger Step 2 + Step 3.**
Currently it might only trigger Step 3 without Step 2.

---

### BUG 3: 🟡 Active Positions Show Stale Swing Trades

TORNTPOWER: Entry ₹1587, Target ₹1606.20, P&L ₹-2155, Day D3
UNIONBANK: Entry ₹282.78, Target ₹284.61, P&L ₹-3210, Day D3

These are D3 (3 days old) swing positions from last week.
Both are in significant loss.

**Questions to answer:**
  - Are these real positions or test data?
  - If real, they need P&L updates based on today's live price
  - If test data, they need to be cleaned up
  
**Also**: Target shows ₹1606.20 for TORNTPOWER but current 
price isn't shown. The P&L column shows ₹-2155 but there's 
no "Current Price" column in Active Positions, making it 
hard to assess the position.

---

### BUG 4: 🟡 "Signals: 0 pending" Is Misleading

The header shows "Signals: 0 pending" but there are 10 signals 
in the Live Signals table. "Pending" probably means 
PENDING_CONFIRMATION status, which is 0 because all signals 
are already CONFIRMED or EXPIRED.

But the signal count should show TODAY's signals count:
  "Today's Signals: 0" (because no new signals generated yet)

---

### BUG 5: 🟡 API Usage Shows 335/10000

335 API calls already used. That's from:
  - Previous cache jobs
  - Today's refresh attempts
  
Not a critical issue but should be monitored.
The daily limit is 1000 (not 10000), so double-check 
which limit is correct.

---

## EXACT TASK LIST FOR AGENT

### TASK 1: Fix Dashboard Date Filter (HIGHEST PRIORITY)

```
File: dashboardService.cjs (or wherever GET /api/v5/signals lives)

The Live Signals query MUST filter by today's date.
Only show signals where signalDate = today.

Also: Add a "date" query parameter so the dashboard 
can request signals for a specific date:
  GET /api/v5/signals?date=2026-03-02

Default to today if no date parameter.

Previous days' signals should NEVER appear in Live Signals 
unless the user explicitly requests a historical date.
```

### TASK 2: Fix the "Generate Signals" + "Refresh" Pipeline

```
The "Generate Signals" button should do this EXACT sequence:

Step 1: Determine today's date (IST, not UTC!)
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const todayIST = istNow.toISOString().split('T')[0];

Step 2: Query database for today's INTRADAY_BOOST stocks
  Check: SELECT COUNT(*) FROM "StockCategory" sc 
         JOIN "Category" c ON c.id = sc."categoryId"
         WHERE c.key = 'INTRADAY_BOOST' 
         AND sc."addedDate"::date = todayIST;
  
  If 0 → Show error: "No IB stocks found for today. 
         Add stocks in Watchlist first."

Step 3: Run intraday_refresh.cjs for today's stocks
  This fetches TODAY's 30-min candles from Upstox intraday API
  For each stock: GET /v2/historical-candle/intraday/{key}/30minute
  Save to cache/30minute/{SYMBOL}_master.json (merge with existing)

Step 4: Run confirmIntradaySignals(todayIST)
  This reads the fresh cache and generates signals

Step 5: Return the new signals to the dashboard

ALL of this should happen in ONE button click.
Show a loading spinner with progress:
  "Fetching candles for 49 stocks... (23/49)"
  "Analyzing breakouts..."
  "Found 7 signals"
```

### TASK 3: Fix Date Comparison for Stock Filtering

```
File: confirmationService.cjs, around line 195

The addedDate filter needs to handle timezone properly:

// BEFORE (potentially broken with timezone):
const activeIBStocks = ibCats
    .filter(r => r.addedDate && 
        r.addedDate.toISOString().split('T')[0] === targetDateStr)

// AFTER (timezone-safe):
const activeIBStocks = ibCats.filter(r => {
    if (!r.addedDate) return false;
    // Convert to IST date string for comparison
    const addedIST = new Date(r.addedDate.getTime() + 5.5*60*60*1000);
    const addedDateStr = addedIST.toISOString().split('T')[0];
    return addedDateStr === targetDateStr;
}).map(r => r.stock);

// ALSO: Log the count so we can see if stocks are found:
console.log(`[ConfirmationService] IB stocks for ${targetDateStr}: 
  Total in category: ${ibCats.length}, 
  Matched today: ${activeIBStocks.length},
  Names: ${activeIBStocks.map(s => s.symbol).join(', ')}`);
```

### TASK 4: Auto-Archive Previous Day's Signals

```
When the dashboard loads or when "Generate Signals" runs:

Step 0: Mark all signals from PREVIOUS days as 'ARCHIVED' or 'CLOSED'

// Archive old intraday signals
await prisma.v5Signal.updateMany({
    where: {
        category: 'INTRADAY_BOOST',
        signalDate: { lt: new Date(todayIST + "T00:00:00Z") },
        status: { in: ['CONFIRMED', 'EXPIRED'] }
    },
    data: {
        status: 'CLOSED'  // or 'ARCHIVED'
    }
});

This ensures old signals disappear from the Live view.
They're still in the database for EOD analysis / historical review.
```

### TASK 5: Add Diagnostic Endpoint

```
Create: GET /api/v5/diagnostics

Returns:
{
    today: "2026-03-02",
    todayIST: "2026-03-02",
    ibStocksForToday: 49,       // Count from database
    cachedStocksFor30m: 45,     // How many have 30m cache files
    cachedWithTodayData: 12,    // How many cache files have today's candles
    signalsGeneratedToday: 0,   // Signals with signalDate = today
    signalsFromPreviousDays: 10, // Signals from before today
    upstoxTokenValid: true,
    apiCallsUsed: 335,
    lastCacheRefresh: "2026-02-27T10:45:00Z"  // When was cache last updated
}

This immediately tells us WHERE the pipeline is stuck.
```

### TASK 6: Fix Dashboard Frontend

```
File: TradingDashboard.tsx (or equivalent)

1. Live Signals section:
   - Only show signals where signalDate = today
   - Show "No signals yet for today" if empty
   - Show "Run Generate Signals after 9:45 AM" before market open

2. Signal timestamps:
   - Show "10:15 AM" not "73h 0m ago"
   - If signal is from a previous day, show date: "Feb 27, 10:15 AM"

3. Header stats:
   - "Today's Signals: 7" (count of today's signals)
   - "Tradeable: 3" (LIVE + PARTIAL + WAITING status only)
   - Remove "0 pending" — confusing

4. Market Phase indicator:
   - Currently shows "Active Trading Window" 
   - Should show time: "Active Trading Window (10:47 AM)"
```

---

## THE COMPLETE DAILY WORKFLOW (What Should Happen)

```
8:30 AM  — Kesava opens TradeCode, sees today's IB stocks
9:00 AM  — Kesava adds stocks to CTS via Watchlist page
           (this creates StockCategory entries with addedDate = today)
9:15 AM  — Market opens, OR starts forming
9:45 AM  — OR complete (first 30-min candle done)
9:50 AM  — Kesava clicks "Refresh" → system fetches today's 30m candles
10:00 AM — Kesava clicks "Generate Signals" → system finds breakouts
           → Dashboard shows TODAY's signals with LIVE/WAITING/PARTIAL status
           → Entry buttons enabled for tradeable signals
10:00-12:00 — Active trading window
           → Kesava enters trades via modal
           → Positions tracked in Active Positions
12:00 PM — Entry window closes
           → "No new entries" message
           → Monitor existing positions only
3:30 PM  — Market closes
           → All signals → CLOSED status
           → Run EOD Analysis
           → Archive today's signals

NEXT DAY:
8:30 AM  — Previous day's signals are gone
           → Clean dashboard, ready for new day
           → Add new IB stocks, repeat
```

---

## DEBUGGING CHECKLIST FOR AGENT

Before fixing code, run these diagnostic queries:

```sql
-- 1. Are today's stocks in the database?
SELECT s.symbol, sc."addedDate", c.key 
FROM "StockCategory" sc 
JOIN "Stock" s ON s.id = sc."stockId"
JOIN "Category" c ON c.id = sc."categoryId"
WHERE c.key = 'INTRADAY_BOOST' 
AND sc."addedDate"::date = '2026-03-02'
ORDER BY s.symbol;

-- 2. How many signals exist for today vs Friday?
SELECT DATE(s."signalDate") as signal_day, COUNT(*), 
       STRING_AGG(s.symbol, ', ') as symbols
FROM "V5Signal" s 
WHERE s.category = 'INTRADAY_BOOST'
GROUP BY DATE(s."signalDate")
ORDER BY signal_day DESC
LIMIT 5;

-- 3. What date does the system think "today" is?
-- Run in Node.js:
const now = new Date();
console.log('UTC:', now.toISOString());
console.log('IST:', new Date(now.getTime() + 5.5*60*60*1000).toISOString());

-- 4. Check cache files for today's data:
-- ls -la cache/30minute/ | head -20
-- Check any file: does it have candles for 2026-03-02?
```

Run these FIRST, show the output, then fix based on results.
