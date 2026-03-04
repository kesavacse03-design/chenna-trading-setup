# CTS V5 — PRODUCTION READY TASK SHEET (Session 5)
# Date: March 3, 2026 — No More Experiments, Ship It

> **AGENT: This is the FINAL push. Every issue listed here has been identified 
> from actual screenshots. No theoretical problems — only real bugs with real evidence.**
>
> **RULE: Do NOT create new files that reimplement existing logic.**
> **Instead: REUSE intradayStrategyV2_1.cjs functions for everything.**

---

## SCREENSHOT EVIDENCE OF CURRENT BUGS

```
Screenshot 1 (EOD Analysis - 11:01 PM):
  → EVERY signal shows "BREAKEVEN 0.00R"
  → Win Rate: 0%, Net R: 0R, W/L: 0:0 / 13
  → This means evaluateOutcome() is returning 0 for everything
  → evaluateOutcome() is COMPLETELY BROKEN

Screenshot 2 (Dashboard - 11:01 PM, Market Closed):
  → 13 signals all show "WAITING" status (should be EXPIRED/T1_HIT/STOPPED)
  → T2 column is EMPTY (dash) for ALL signals
  → Signal statuses never updated after market close
  → T2 target never calculated or stored

Screenshot 3 (Backtest CSV Export):
  → 37 trades for Feb 23 - Mar 01
  → 34 out of 37 are STOP_HIT (92% loss rate!)
  → Only 3 wins (UPL, KPITTECH, COLPAL)
  → Backtest is NOT using the same V2.1 logic as live
  → It's generating signals with different/no filters
  → Entry prices look wrong (SOLARINDS entry ₹13401 vs live ₹13880)
  → "Tier" column all shows "1" — confidence scoring not working
  → "Confidence" column is empty for most rows

Screenshot 4 (Controller Page):
  → COMPLETELY EMPTY — no categories shown
  → Should show INTRADAY_BOOST with toggle switches
  → API endpoint for categories is broken or returning empty
```

---

## BUG 1: EOD ANALYSIS — ALL BREAKEVEN (CRITICAL)

### What's Happening
Every signal returns `BREAKEVEN 0.00R`. This means the `evaluateOutcome()` function is:
- Not finding any 1-minute candle data, OR
- The candle data timestamps don't match the signal's entry time, OR  
- The function has a bug where it returns 0 for everything

### Diagnosis Steps (Agent MUST do before coding)

```javascript
// Add this temporary debug to eodReportService.cjs or wherever EOD runs:

async function debugEODForSignal(signal) {
  console.log('=== EOD DEBUG ===');
  console.log('Signal:', signal.symbol, signal.direction, signal.type);
  console.log('Entry:', signal.entryPrice, 'Stop:', signal.stopPrice, 'T1:', signal.t1Price);
  
  // Check: Does T1 even exist?
  if (!signal.t1Price) {
    console.log('❌ T1 is NULL — outcome will always be BREAKEVEN');
  }
  
  // Check: Do we have candle data?
  const candles = await fetch1MinCandles(signal.symbol, signal.date);
  console.log('Candles found:', candles?.length || 0);
  
  if (candles?.length > 0) {
    console.log('First candle:', candles[0].timestamp, candles[0].open, candles[0].close);
    console.log('Last candle:', candles[candles.length-1].timestamp);
    
    // Check: Are candles AFTER signal time?
    const signalTime = new Date(signal.signalTime || signal.createdAt);
    const postEntry = candles.filter(c => new Date(c.timestamp) > signalTime);
    console.log('Candles after signal time:', postEntry.length);
    
    // Check: Do any candles touch T1 or Stop?
    if (signal.direction === 'SHORT') {
      const hitT1 = postEntry.find(c => c.low <= signal.t1Price);
      const hitStop = postEntry.find(c => c.high >= signal.stopPrice);
      console.log('Any candle hits T1?', hitT1 ? 'YES at ' + hitT1.timestamp : 'NO');
      console.log('Any candle hits Stop?', hitStop ? 'YES at ' + hitStop.timestamp : 'NO');
    } else {
      const hitT1 = postEntry.find(c => c.high >= signal.t1Price);
      const hitStop = postEntry.find(c => c.low <= signal.stopPrice);
      console.log('Any candle hits T1?', hitT1 ? 'YES at ' + hitT1.timestamp : 'NO');
      console.log('Any candle hits Stop?', hitStop ? 'YES at ' + hitStop.timestamp : 'NO');
    }
  }
  console.log('=== END DEBUG ===');
}

// Call this for LT before running the full EOD:
// debugEODForSignal(ltSignal);
```

### Most Likely Root Cause

```
CAUSE 1 (90% likely): T1 price is NULL in the database
  → The signal was stored WITHOUT t1Price or t2Price
  → evaluateOutcome() has no targets to check against
  → Returns BREAKEVEN because nothing to compare
  
  FIX: Check the v5Signal table:
  SELECT symbol, entry_price, stop_price, t1_price, t2_price 
  FROM v5_signals WHERE DATE(created_at) = '2026-03-02';
  
  If t1_price is NULL → the signal generation code isn't calculating T1/T2
  
  T1 = entry ± 1R (where R = |entry - stop|)
  T2 = entry ± 2R

CAUSE 2: No 1-minute candle data available after market close
  → During market hours, live candles are fetched from Upstox intraday API
  → After market close, that API returns empty
  → Need to use HISTORICAL candle endpoint instead
  
  FIX: Use Upstox historical 1-min candle API for EOD analysis
  
CAUSE 3: The function literally returns 0 for all cases
  → Check if there's a try/catch that swallows errors and returns default
```

### Fix

```
STEP 1: Verify T1/T2 exist in database
  Run SQL query above. If NULL, fix signal generation to always calculate:
  
  const risk = Math.abs(entryPrice - stopPrice);
  const t1 = direction === 'LONG' ? entryPrice + risk : entryPrice - risk;
  const t2 = direction === 'LONG' ? entryPrice + (risk * 2) : entryPrice - (risk * 2);

STEP 2: Verify candle data source
  After market close, use historical candle API, not intraday API.

STEP 3: Fix evaluateOutcome()
  Use the shared evaluateOutcome from signalEngine.cjs (if built)
  OR fix the existing one to properly walk candles chronologically.
```

---

## BUG 2: T2 TARGET MISSING FROM ALL SIGNALS

### Evidence
Screenshot 2 shows T2 column as "—" for every signal. This is consistent with Bug 1 — if T2 isn't stored, EOD can't evaluate it.

### Fix

```
In the signal generation code (intradayStrategyV2_1.cjs or wherever signals are created):

FIND where the signal object is constructed before saving to database.
ENSURE these fields are calculated and included:

  const risk = Math.abs(entryPrice - stopPrice);
  
  signal.t1Price = direction === 'LONG' 
    ? entryPrice + risk 
    : entryPrice - risk;
    
  signal.t2Price = direction === 'LONG'
    ? entryPrice + (risk * 2)
    : entryPrice - (risk * 2);

Also check: Does the v5Signal database schema have t1_price and t2_price columns?
  If not, add them with a migration.

Also check: Does the API endpoint that returns signals include t1Price and t2Price?
  If not, add them to the SELECT/response.
```

---

## BUG 3: SIGNAL STATUS NOT UPDATING AFTER MARKET CLOSE

### Evidence
All 13 signals show "WAITING" at 11:01 PM. Market closed at 3:30 PM. In 7.5 hours, no status was updated. They should show:
- T1_HIT, T2_HIT, STOPPED, or EOD_CLOSE — based on what actually happened
- At minimum: EXPIRED (market is closed, can't enter anymore)

### Fix

```
The status update should happen in TWO places:

1. DURING MARKET HOURS (already exists — scanner updates):
   Every scan cycle, check if current price has hit T1/Stop.
   Update signal status accordingly.

2. AFTER MARKET CLOSE (the EOD Analysis trigger):
   When "Run EOD Analysis" is clicked (or automatically at 3:35 PM):
   - Fetch final 1-minute candle data for each signal
   - Walk candles to determine outcome
   - UPDATE the signal status in the database:
     signal.status = outcome.result (T1_HIT, STOP_HIT, EOD_CLOSE, etc.)
   - This status should then reflect in the dashboard on reload

   The current EOD Analysis creates a REPORT but doesn't UPDATE signal statuses.
   
   FIX: After EOD analysis calculates outcomes, also update v5Signal records:
   
   await prisma.v5Signal.update({
     where: { id: signal.id },
     data: { 
       status: outcome.result,
       exitPrice: outcome.exitPrice,
       exitTime: outcome.exitTime,
       rMultiple: outcome.rMultiple
     }
   });
```

---

## BUG 4: BACKTEST USING WRONG LOGIC (92% Loss Rate)

### Evidence
The CSV shows 34/37 STOP_HIT. Our validated research shows IB RETEST strategy has ~67-77% WIN rate. A 92% loss rate means the backtest is fundamentally broken.

### Root Causes (Multiple)

```
PROBLEM A: Backtest generates signals DIFFERENTLY than live scanner

The live scanner (intradayStrategyV2_1.cjs) has:
  - OR detection using first opposite color candle
  - Volume filter (1.2x minimum)
  - EMA filter
  - Quality scoring (score 0-100)
  - Buffer/gap filter
  - Retest vs Runner detection
  
The backtest (backtestReplayService.cjs) likely:
  - Uses a SIMPLIFIED signal generation
  - Missing volume filter → enters on weak breakouts that fail
  - Missing quality scoring → takes bad setups
  - Different OR detection → different entry prices

EVIDENCE: Backtest entry for SOLARINDS = ₹13401
           Live signal entry for SOLARINDS = ₹13880
           DIFFERENCE: ₹479 (3.5%) → Completely different OR levels!
           
PROBLEM B: Entry price mismatch means stop/target are also wrong
  If entry is ₹13401 instead of ₹13880, the stop distance is wrong,
  targets are wrong, and the outcome evaluation is meaningless.

PROBLEM C: No deduplication
  Should be ONE signal per stock per day maximum.
  37 signals across 5 dates and ~50 stocks seems too many.
```

### THE FIX — Use intradayStrategyV2_1.cjs For Backtest

```
The backtest MUST call the same functions as the live scanner.

DO NOT rewrite signal generation logic in backtestReplayService.cjs.
INSTEAD:

1. Import the signal generation function from intradayStrategyV2_1.cjs
2. Feed it historical candle data instead of live data
3. Use the results as-is

Pseudocode:

const { generateSignalForStock } = require('./intradayStrategyV2_1.cjs');

async function runBacktest(category, startDate, endDate) {
  const results = [];
  const tradingDays = getTradingDaysInRange(startDate, endDate);
  
  for (const date of tradingDays) {
    // Get the stocks that were in IB category on this date
    const ibStocks = await getIBStocksForDate(date);
    const processedToday = new Set();
    
    for (const symbol of ibStocks) {
      if (processedToday.has(symbol)) continue;
      
      // Fetch 1-minute candle data for this stock on this date
      const candles1min = await getHistorical1MinCandles(symbol, date);
      if (!candles1min || candles1min.length < 30) continue;
      
      // Get previous day data
      const prevDay = await getPrevDayData(symbol, date);
      
      // CALL THE SAME FUNCTION THAT LIVE SCANNER USES
      const signal = generateSignalForStock(symbol, candles1min, prevDay, {
        // Pass any config that the live scanner uses
        minVolume: 1.2,
        maxORRange: 3.0,
        minScore: 0  // For backtest, generate all signals (filter later in UI)
      });
      
      if (signal) {
        processedToday.add(symbol);
        
        // Evaluate outcome using shared function
        const outcome = evaluateOutcome(candles1min, signal);
        
        results.push({
          symbol,
          date,
          ...signal,
          ...outcome
        });
      }
    }
  }
  
  return results;
}
```

**CRITICAL QUESTION FOR AGENT:** 
Does `intradayStrategyV2_1.cjs` export its signal generation as a callable function?
Or is it tightly coupled to the live scanner loop?

If tightly coupled → REFACTOR it:
1. Extract the pure signal logic into an exportable function
2. Keep the scanner loop calling that function for live
3. Have backtest also call that same function for historical

If already exported → Just import and call from backtest.

---

## BUG 5: CONTROLLER PAGE EMPTY

### Evidence
Screenshot 4 shows the Controller page with headers but NO category rows. 

### Fix
```
Check the API endpoint that populates the Controller:
GET /api/v5/controller/categories or similar

Possible issues:
1. Database table for categories is empty
   → Run seed script to populate INTRADAY_BOOST category config

2. API returns error silently (frontend catches and shows empty)
   → Check browser console for errors
   → Check backend logs for errors on this endpoint

3. Frontend component has a bug rendering categories
   → Check if data arrives in browser network tab but isn't rendered

Quick fix if categories are in config file not database:
  Return hardcoded INTRADAY_BOOST config from the API if DB is empty.
```

---

## FEATURE 1: TELEGRAM NOTIFICATIONS

### Status
Was implemented in Session 3 but needs verification.

### Check List
```
1. Is TELEGRAM_BOT_TOKEN set in .env?
2. Is TELEGRAM_CHAT_ID set in .env?
3. Is telegramService.cjs actually being CALLED when signals generate?
   → Add console.log at the call site to verify

4. If not configured, add this to Controller page:
   Telegram Config section:
   - Bot Token: [text input]
   - Chat ID: [text input]  
   - [Test Notification] button → sends "CTS V5 Test ✅" to the chat
   - [Save] button → saves to .env or database

5. Notification triggers (verify each one fires):
   □ New signal generated → "🎯 NEW: LT SHORT RETEST, Entry ₹4061, Score 85"
   □ T1 hit → "✅ T1 HIT: LT, +1R"
   □ Stop hit → "🛑 STOP: SUZLON, -1R"
   □ Market phase change → "🟢 9:45 AM — Active Trading Window"
   □ EOD summary → "📊 Today: 4W/2L, Net +4.2R"
```

---

## FEATURE 2: BROWSER SOUND NOTIFICATION

### What User Wants
When a new signal is generated, play a notification sound in the browser AND show a toast notification. The user may be in another tab.

### Implementation
```
Frontend: Add to the auto-polling code that checks for new signals

// In the polling function (runs every 30 seconds):
const prevSignalCount = signalsRef.current?.length || 0;
const newSignals = await fetchTodaysSignals();

if (newSignals.length > prevSignalCount) {
  const newOnes = newSignals.slice(prevSignalCount);
  
  // 1. Play sound
  const audio = new Audio('/notification.mp3');  // Add a short alert sound
  audio.play().catch(() => {}); // Ignore autoplay restrictions
  
  // 2. Show toast notification
  for (const signal of newOnes) {
    toast.success(
      `🎯 NEW: ${signal.symbol} ${signal.direction} ${signal.type}`,
      { duration: 10000 }  // Show for 10 seconds
    );
  }
  
  // 3. Browser notification (if tab is not focused)
  if (document.hidden && Notification.permission === 'granted') {
    new Notification('CTS V5 — New Signal', {
      body: `${newOnes[0].symbol} ${newOnes[0].direction} — Score: ${newOnes[0].score}`,
      icon: '/logo.png'
    });
  }
}

// On first load, request notification permission:
useEffect(() => {
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}, []);
```

### Sound File
```
Add a short notification sound (1-2 seconds).
Options:
1. Use a free stock alert sound — save as public/notification.mp3
2. Generate a simple beep using Web Audio API:

function playBeep() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 800; // Hz
  gain.gain.value = 0.3;
  osc.start();
  osc.stop(ctx.currentTime + 0.3); // 300ms beep
}

Use option 2 — no external file needed, works everywhere.
```

---

## FEATURE 3: BACKTEST UI REDESIGN

### Current Problems
- Modal is cluttered
- Shows 0 results
- Doesn't clearly show what mode it's in

### New Design

```
┌─────────────────────────────────────────────────────────────────┐
│  📊 Time Travel Backtest                                   [X]  │
│                                                                 │
│  Category: [INTRADAY_BOOST ▼]                                   │
│  Date Range: [2026-02-23] — [2026-03-01]                        │
│                                                                 │
│  Data Check:                                                    │
│  ✅ IB stocks found: 47 stocks across 5 trading days            │
│  ✅ 1-min candle data: Available for 4/5 days                   │
│  ⚠️ Missing data for: Feb 25 (holiday?)                         │
│                                                                 │
│  [▶ Run Backtest]                                               │
│                                                                 │
│  ═══════════════════════════════════════════════════════════     │
│                                                                 │
│  RESULTS — 37 signals found, 22 tradeable (score ≥ 25)          │
│                                                                 │
│  ┌──────────┬──────────┬──────────┬──────────┐                  │
│  │ All (22) │ Top 3/day│ Monkey   │ Score≥60 │                  │
│  ├──────────┼──────────┼──────────┼──────────┤                  │
│  │ WR: 68%  │ WR: 73%  │ WR: 58%  │ WR: 77%  │                  │
│  │ Net: +8R │ Net: +5R │ Net: +2R │ Net: +6R │                  │
│  │ 22 trades│ 15 trades│ avg 15   │ 10 trades│                  │
│  └──────────┴──────────┴──────────┴──────────┘                  │
│                                                                 │
│  TRADE LOG (click row to expand):                               │
│  Date     Symbol    Dir   Type    Entry   Result   R     Score  │
│  Feb 23   UPL       SHORT RETEST  ₹657    T1 ✓    +1.0  85     │
│  Feb 23   KPITTECH  SHORT RUNNER  ₹825    T2 ✓✓   +2.2  78     │
│  Feb 23   LTIM      SHORT RETEST  ₹4802   STOP ✗  -1.0  65     │
│  Feb 27   COLPAL    LONG  RETEST  ₹2263   T1 ✓    +1.0  72     │
│  ...                                                            │
│                                                                 │
│  [📥 Export CSV] [📊 View Chart]                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## PRIORITY ORDER — DO THIS EXACT SEQUENCE

```
PRIORITY 1 — Fix T1/T2 Storage (30 min)
  □ Check v5Signal schema for t1_price, t2_price columns
  □ If missing → add columns  
  □ Fix signal generation to always calculate T1 = entry ± 1R, T2 = entry ± 2R
  □ Verify: New signal has T1 and T2 in database
  □ Verify: Dashboard shows T2 values

PRIORITY 2 — Fix EOD Analysis (1 hour)
  □ Run debug function on LT signal
  □ Identify why BREAKEVEN returned (likely T1 is NULL)
  □ Fix evaluateOutcome to use historical candles after market close
  □ Fix evaluateOutcome to update signal status in database
  □ Verify: EOD Analysis shows LT = T1_HIT or T2_HIT (not BREAKEVEN)
  □ Verify: Dashboard signals update from WAITING to T1_HIT/STOP_HIT after EOD

PRIORITY 3 — Fix Backtest to Use V2.1 Logic (2 hours)
  □ Identify if intradayStrategyV2_1.cjs exports signal generation function
  □ If not → refactor to export processStock() or generateSignalForStock()
  □ Modify backtestReplayService.cjs to import and call that function
  □ Add deduplication (one signal per stock per day)
  □ Verify: Backtest for Feb 23 - Mar 01 shows ~60-70% WR (not 8%)
  □ Verify: Entry prices match between live and backtest for same stock

PRIORITY 4 — Fix Controller Page (30 min)
  □ Check API endpoint for categories
  □ Fix data source (seed if empty)
  □ Verify: Controller shows INTRADAY_BOOST with toggles

PRIORITY 5 — Telegram Notifications (45 min)
  □ Check if telegramService.cjs exists and is configured
  □ If not → create with bot token/chat ID from .env
  □ Wire to signal generation (send on new signal)
  □ Wire to EOD (send summary)
  □ Test: Send test message to Telegram

PRIORITY 6 — Browser Sound Notifications (30 min)
  □ Add Web Audio API beep function
  □ Add toast notification on new signal
  □ Add browser Notification API (when tab not focused)
  □ Request notification permission on first load

PRIORITY 7 — Backtest UI Redesign (1 hour)
  □ Add data availability check before running
  □ Add simulation mode tabs (All, Top 3, Monkey, Score filter)
  □ Clean up results display
  □ Add export CSV with correct data
```

---

## TESTING CHECKLIST — MUST PASS ALL

```
EOD ANALYSIS:
  □ LT shows T1_HIT or T2_HIT (NOT BREAKEVEN)
  □ OIL shows T2_HIT (NOT BREAKEVEN or STOP_HIT)
  □ At least 3-4 signals show non-BREAKEVEN outcomes
  □ Win rate is non-zero

SIGNAL TABLE:
  □ T2 column shows values for all signals (not "—")
  □ After EOD runs, statuses change from WAITING to actual outcomes

BACKTEST:
  □ Feb 23 - Mar 01 backtest shows 50-70% win rate
  □ Entry prices within 1% of live signal entries for same stocks
  □ No duplicate signals (one per stock per day)
  □ CSV export has correct data

CONTROLLER:
  □ Shows INTRADAY_BOOST category with working toggles

TELEGRAM:
  □ Test message received in Telegram bot

NOTIFICATIONS:
  □ Beep sound plays when simulating new signal
  □ Toast appears with signal details
```

---

## REMINDER: WHAT NOT TO DO

```
❌ Do NOT create a new signalEngine.cjs that reimplements V2.1 logic
❌ Do NOT use 30-minute candles for outcome evaluation  
❌ Do NOT skip the diagnostic step (debug first, then fix)
❌ Do NOT assume the fix worked — verify with actual data
❌ Do NOT modify intradayStrategyV2_1.cjs signal generation logic
   (only extract/export functions, don't change the logic itself)
❌ Do NOT leave T1/T2 as NULL in the database
❌ Do NOT return BREAKEVEN as a default when data is missing
   (return NO_DATA or UNKNOWN instead — be transparent)
```
