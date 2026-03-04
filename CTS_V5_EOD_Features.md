# CTS V5 — End-of-Day Features & Tweaks

---

## TWEAK 1: Market Hours Awareness (CRITICAL)

```
The dashboard must behave differently based on market state:

PRE-MARKET (before 9:15):
  - Live Signals: empty, show "Market opens at 9:15"
  - Alerts: empty
  - Enter buttons: disabled
  - Status bar: "🟡 Pre-Market"

MARKET OPEN - OR FORMING (9:15-9:45):
  - Live Signals: empty (no breakouts yet)
  - Alerts: show SETUP_FORMING as they come
  - Enter buttons: disabled
  - Status: "⏳ Opening Range forming..."

MARKET OPEN - ACTIVE TRADING (9:45-12:00):
  - Live Signals: show confirmed signals
  - Status badges: LIVE/PARTIAL/WAITING/GONE
  - Enter buttons: ENABLED for LIVE/PARTIAL/WAITING
  - Status: "🟢 Active Trading Window"

MARKET OPEN - MONITORING ONLY (12:00-15:15):
  - Live Signals: still visible (tracking open positions)
  - Enter buttons: DISABLED for new entries
  - Show label: "⏰ Entry window closed (after 12:00)"
  - Status: "🟡 Monitoring — no new entries"

MARKET CLOSED (after 15:30):
  - ALL signal statuses → "CLOSED"
  - ALL Enter buttons → disabled / hidden
  - Show: "Market Closed — Review Mode"
  - Enable: "📊 Run EOD Analysis" button
  - Status: "🔴 Market Closed"

Implementation:
  In frontend, create a helper:
  
  function getMarketPhase() {
    const now = new Date();
    const h = now.getHours(), m = now.getMinutes();
    const t = h * 60 + m; // minutes since midnight
    
    if (t < 9*60+15) return 'PRE_MARKET';
    if (t < 9*60+45) return 'OR_FORMING';
    if (t < 12*60) return 'ACTIVE_TRADING';
    if (t < 15*60+30) return 'MONITORING';
    return 'CLOSED';
  }
  
  Use this to control:
  - Enter button enabled/disabled
  - Status badge display
  - Header message
```

## TWEAK 2: Fix "Prices: 2756 stocks" Display

```
Current: Shows total instruments in Upstox master list
Should show: Only stocks we're actively tracking

In health bar, change:
  FROM: "Prices: 2756 stocks"
  TO:   "Tracking: 49 IB stocks | 2 open positions"
  
Only fetch live prices for:
  1. Stocks in today's INTRADAY_BOOST category
  2. Stocks with OPEN positions
  3. Nothing else

This also saves API calls.
```

## FEATURE 1: EOD Simulation — "What If I Took All Signals?"

```
After market close (3:30 PM), add a button:
  "📊 Run EOD Analysis"

This runs a simulation for today:
  For EVERY confirmed signal from today:
    - Get the actual price data from 30m candles
    - Check: did price hit T1 before hitting Stop?
    - Check: did price hit T2?
    - Calculate theoretical P&L at 1:1 R:R

Display results in a table:

  ┌─────────────────────────────────────────────────────────┐
  │ 📊 EOD Analysis — Feb 27, 2026 (Thursday/Expiry)       │
  │                                                         │
  │ Total Signals: 11                                       │
  │ Confirmed: 8  |  Expired: 3                            │
  │                                                         │
  │ SIMULATED RESULTS (if all trades taken):               │
  │ ─────────────────────────────────────────               │
  │ Stock     Dir    Entry    T1 Hit?  Stop Hit?  Result   │
  │ COLPAL    SHORT  2263.6   ✓ 2248   —          WIN +1R  │
  │ TMPV      SHORT  388.9    ✓ 386.9  ✓ 390.4   LOSS-1R  │
  │ TATACONS  SHORT  1142.7   —        ✓ 1146.0   LOSS-1R  │
  │ NHPC      SHORT  75.5     ✓ 75.2   —          WIN +1R  │
  │ PREMIERENE LONG  734.5    ✓ 744.5  —          WIN +1R  │
  │ INFY      SHORT  1384.3   —        ✓ 1389.0   LOSS-1R  │
  │ BPCL      SHORT  383.8    ✓ 380.0  —          WIN +1R  │
  │ VOLTAS    LONG   1555.5   ✓ 1571.5 —          WIN +1R  │
  │ ─────────────────────────────────────────               │
  │ TOTAL: 5W / 3L = 62.5% WR | Net: +2R                  │
  │                                                         │
  │ TOP 3 ONLY (by score):                                 │
  │ COLPAL(70) WIN + TMPV(70) LOSS + TATACONS(60) LOSS    │
  │ = 1W / 2L = 33% WR | Net: -1R                         │
  │                                                         │
  │ This proves: taking ALL signals beat taking TOP 3 today │
  └─────────────────────────────────────────────────────────┘

Store this in a new table: V5DailyReport
  date, totalSignals, confirmed, wins, losses, 
  netR, winRate, topNWins, topNLosses, topNNetR

Over time, this builds a track record:
  "Last 20 days: 64% WR on all signals, 71% on Top 3"
```

## FEATURE 2: Upstox Margin/Leverage Display

```
Upstox provides different intraday margins for different stocks.
  - Some stocks: 5x leverage (MIS order type)
  - Some: 3x
  - Some: 1x (no leverage)

API endpoint to check:
  GET /v2/margin/config/margins
  
  Or check the margin for a specific order:
  POST /v2/order/margin
  {
    instrument_token: "NSE_EQ|INE...",
    quantity: 100,
    order_type: "MIS",   // Intraday
    side: "BUY"
  }
  
  Response includes: required_margin, leverage_multiplier

In the Live Signals table, add a column:
  "Margin" showing the leverage available
  
  Symbol  | Dir  | Entry | Margin | Required | ...
  COLPAL  | SHORT| 2263  | 5x     | ₹4,526   |
  TMPV    | SHORT| 388   | 3x     | ₹12,960  |
  
  This shows: with 5x leverage on COLPAL, 
  ₹15,000 can control ₹75,000 worth of shares
  = 33 shares instead of 6 shares
  
  In the Enter Trade modal:
    Show: "Margin: 5x | You need: ₹4,526 for 33 shares"
    Instead of: "Position: ₹75,000" (which scares the user)

Note: This requires one API call per stock to check margin.
For 9 confirmed signals = 9 API calls. 
Do this ONCE when signals are generated, cache the result.
```

## REGARDING AI PREDICTOR

```
HONEST ASSESSMENT:
  - GPT/Claude cannot predict stock prices better than our 
    sector alignment model (80.5% WR on Tier 1)
  - AI prediction models for intraday trading are unreliable
  - Even Renaissance Technologies' models need millions of 
    data points and custom hardware

WHERE AI CAN ACTUALLY HELP (future):
  1. After 6 months of trade data:
     "Which day-of-week + sector + OR range combinations 
      produce the best results for YOUR trading?"
     
  2. News sentiment analysis:
     "COLPAL has negative news today — skip this signal"
     (but this needs news API integration)
  
  3. Pattern recognition in YOUR trade journal:
     "You tend to lose on RUNNER entries after 11 AM — 
      consider only taking RETEST entries late morning"

  4. Post-trade analysis:
     Feed trade screenshots to Claude and ask:
     "What could I have done differently?"

RECOMMENDATION: Don't build AI predictor now.
  Focus on:
  - Getting 3 months of real trade data
  - Building the EOD analysis feature
  - Tracking actual vs theoretical performance
  - THEN feed that data to AI for pattern analysis
```

## MIGRATION REMINDER

```
To move CTS to another computer:
  1. pg_dump database from Docker
  2. Copy project folder (with cache/ and .env)
  3. On new machine: Docker + Node.js + npm install
  4. Restore database, run prisma generate
  5. Re-login to Upstox (tokens are device-specific)
  
Full guide in: CTS_V5_BugFixes_and_Migration.md
```
