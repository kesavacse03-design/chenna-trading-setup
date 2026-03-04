# CTS V5 — Agent Task Sheet: March 2, 2026 (Session 4 — Deep Fixes + AI Layer)

> **Context for Agent:** Session 3 was completed — auto-scanner, signal expiry, UI redesign, Telegram, Trade Journal, backtest modal all built. But critical bugs remain and a new AI-powered stock ranking feature is requested. Read `CTS_V5_Session_Summary_March2_DeepResearch.md` for full background.

> **CRITICAL BUG:** EOD Analysis shows trades as FAILURES that TradingView Pine Script shows as WINNERS. This destroys trust in the entire system. Fix this FIRST.

---

## ISSUE 1: EOD ANALYSIS vs TRADINGVIEW MISMATCH (CRITICAL BUG — Fix First)

### Problem Evidence

**TradingView Pine Script (ground truth) for March 2:**

| Stock  | Pine Result | CTS EOD Result | Match? |
|--------|------------|----------------|--------|
| JIOFIN | RETEST SHORT, Entry ₹246.6, Stop ₹247.7, T1 ₹245.3 → Shows STOP ✗ on chart (price reversed up) | Needs verification | ? |
| LT     | RETEST SHORT, Entry ₹4078.7 → T1 ✓ +1R (from earlier session screenshot) | EOD shows as failure? | ❌ |
| OIL    | RETEST SHORT, Entry ₹483.2 → T2 ✓✓ +2R then STOP ✗ (reversed) | EOD shows as failure? | ❌ |

The EOD Analysis modal (Screenshot 170843) shows a table with red (failure) results for stocks that TradingView confirmed as winners. This is the #1 trust-killer.

### Root Cause Investigation

The agent MUST do this step-by-step forensic audit BEFORE touching any code:

```
STEP 1: For each signal generated today (March 2), dump these values:

For LT (SHORT):
  - Signal entry price in DB: ?
  - Signal stop price in DB: ?
  - Signal T1 price in DB: ?
  - Signal T2 price in DB: ?
  - Pine Script entry: ₹4078.7
  - Pine Script stop: ₹4109.6
  - Pine Script T1: ₹4047.8
  
  DO THESE MATCH? If entry prices differ, that explains everything.

STEP 2: Fetch the actual 1-minute candle data for LT from the database
  for March 2, from 9:45 AM to 3:20 PM.
  
  Walk through candles manually:
  - At what time did LT cross below ₹4047.8 (T1 level)?
  - At what time did LT cross above ₹4109.6 (stop level)?
  - WHICH happened FIRST? → That determines win/loss.

STEP 3: Check what the EOD analysis code is actually doing:
  - Is it using the signal's entry/stop/T1 prices?
  - Or is it recalculating them (and getting different values)?
  - Is it checking candles in the RIGHT order (chronological)?
  - Is there a timezone bug (checking UTC candles vs IST times)?

STEP 4: Print the EXACT comparison:
  "LT: First crossed T1 (₹4047.8) at 10:23 AM → WIN"
  or
  "LT: First crossed Stop (₹4109.6) at 10:15 AM → LOSS"
```

### Most Likely Bugs

```
BUG A: Entry price mismatch
  The CTS backend calculates entry differently than Pine Script.
  Pine uses: OR_HIGH (for SHORT breakdown) = the exact 5-min candle
  CTS might use: A different candle interval, or cached stale data.
  
  FIX: The signal's stored entry/stop/T1/T2 must be the SAME values
  that feed into the EOD analysis. Never recalculate — use stored values.

BUG B: Candle data gap or timezone shift
  If the 1-minute candle timestamps are in UTC but the code thinks
  they're IST, everything shifts by 5.5 hours. A candle at "10:00 IST"
  would be read as "10:00 UTC" = 3:30 PM IST = after market close.
  
  FIX: All candle timestamps must be converted to IST before comparison.
  Use istUtils.cjs for all time operations.

BUG C: Stop checked before T1 on the SAME candle
  If a candle's range covers BOTH the stop and T1 level (big candle),
  the code might check stop first and mark it as loss, even though
  the T1 was also hit.
  
  FIX: For intra-candle ambiguity, use the candle's open price:
  - If direction is SHORT and candle opens BELOW entry:
    Price was moving in our favor → check T1 first
  - If direction is SHORT and candle opens ABOVE entry:
    Price was moving against us → check Stop first

BUG D: EOD analysis using wrong signal data
  Maybe the EOD analysis is not reading from the signals table at all.
  Maybe it's re-running the strategy and getting different results.
  
  FIX: EOD analysis must ONLY use data from the signals table.
  signal.entryPrice, signal.stopPrice, signal.t1Price, signal.t2Price.
  Never recalculate.
```

### Required Fix

```
File: backend/services/eodAnalysisService.cjs (or wherever EOD analysis runs)

The EOD analysis function should work like this:

async function analyzeSignalOutcome(signal) {
  // 1. Use STORED signal values — never recalculate
  const { entryPrice, stopPrice, t1Price, t2Price, direction, symbol } = signal;
  
  // 2. Get 1-minute candles AFTER signal time (in IST)
  const signalTimeIST = toIST(signal.signalTime);
  const candles = await get1MinCandles(symbol, signal.date);
  
  // Filter to candles AFTER signal time only
  const postSignalCandles = candles.filter(c => 
    toIST(c.timestamp) > signalTimeIST
  );
  
  // 3. Walk chronologically — first hit wins
  for (const candle of postSignalCandles) {
    const candleIST = toIST(candle.timestamp);
    
    // Skip if past 3:20 PM (EOD close)
    if (candleIST.hour >= 15 && candleIST.minute >= 20) break;
    
    if (direction === 'SHORT') {
      // For SHORT: T1 = price goes DOWN, Stop = price goes UP
      
      // Intra-candle ambiguity resolution
      if (candle.low <= t1Price && candle.high >= stopPrice) {
        // Both hit in same candle — use open to determine direction
        if (candle.open < entryPrice) {
          // Was moving in our favor → T1 hit first
          return { outcome: 'T1_HIT', exitPrice: t1Price, exitTime: candleIST, rMultiple: 1 };
        } else {
          return { outcome: 'STOP_HIT', exitPrice: stopPrice, exitTime: candleIST, rMultiple: -1 };
        }
      }
      
      // Normal checks
      if (candle.high >= stopPrice) {
        return { outcome: 'STOP_HIT', exitPrice: stopPrice, exitTime: candleIST, rMultiple: -1 };
      }
      if (candle.low <= t1Price) {
        // T1 hit — now check if T2 also hit in remaining candles
        // (After T1, move stop to entry = breakeven)
        return checkForT2(postSignalCandles, candleIST, t2Price, entryPrice, 'SHORT');
      }
    } else { // LONG
      if (candle.low <= stopPrice && candle.high >= t1Price) {
        if (candle.open > entryPrice) {
          return { outcome: 'T1_HIT', exitPrice: t1Price, exitTime: candleIST, rMultiple: 1 };
        } else {
          return { outcome: 'STOP_HIT', exitPrice: stopPrice, exitTime: candleIST, rMultiple: -1 };
        }
      }
      
      if (candle.low <= stopPrice) {
        return { outcome: 'STOP_HIT', exitPrice: stopPrice, exitTime: candleIST, rMultiple: -1 };
      }
      if (candle.high >= t1Price) {
        return checkForT2(postSignalCandles, candleIST, t2Price, entryPrice, 'LONG');
      }
    }
  }
  
  // If neither hit → EOD close
  const lastCandle = postSignalCandles[postSignalCandles.length - 1];
  const eodPrice = lastCandle?.close || entryPrice;
  const pnl = direction === 'SHORT' 
    ? entryPrice - eodPrice 
    : eodPrice - entryPrice;
  const risk = Math.abs(entryPrice - stopPrice);
  
  return { 
    outcome: 'EOD_CLOSE', 
    exitPrice: eodPrice, 
    exitTime: '15:20',
    rMultiple: parseFloat((pnl / risk).toFixed(2))
  };
}
```

### Verification
```
After fixing, run this exact validation:

For LT (March 2):
  Signal: SHORT RETEST, Entry ₹4061/₹4078.7, Stop ₹4125/₹4109.6, T1 ₹3997/₹4047.8
  TradingView shows: T1 ✓ +1R
  CTS EOD MUST show: T1 ✓ +1R (or very close)
  
  If they still don't match, print:
  "CTS entry: ₹xxxx, TV entry: ₹4078.7, DIFFERENCE: x%"
  The entry price difference is the root cause.

For OIL (March 2):
  TradingView shows: T2 ✓✓ then reversed to STOP
  This is complex — T2 was hit first (+2R), then price reversed.
  The final outcome depends on whether we BOOK at T2 or trail.
  Our strategy: Book at T2 → Result should be WIN (+2R)
  If system shows LOSS, it's because it continued tracking after T2.
```

---

## ISSUE 2: BACKTEST SHOWING 0 RESULTS

### Problem
The Time Travel Backtest modal (Screenshot 170819) shows:
- Win Rate: 0.0%, Loss Rate: 0.0%
- Trade count appears to be 0
- Date range was selected but no results generated

### Root Cause Investigation

```
STEP 1: Check if the backtest API endpoint is actually being called.
  Add console.log at the start of the backtest handler:
  
  console.log('Backtest called with:', req.body);
  // { category, startDate, endDate, mode }

STEP 2: Check if there are signals in the database for the date range.
  
  SELECT COUNT(*) FROM v5_signals 
  WHERE category = 'INTRADAY_BOOST' 
  AND DATE(created_at) BETWEEN '2026-02-27' AND '2026-03-02';
  
  If 0 → The system wasn't generating signals on those days.
  The backtest needs historical signals to replay.

STEP 3: If no historical signals exist, the backtest must GENERATE them.
  This means: for each historical date in the range, run the signal
  generation logic against the historical 1-minute data.
  
  This is the "Time Travel" mode — it pretends today is Feb 27,
  loads Feb 27's IB stocks, runs the scanner, generates signals,
  then evaluates outcomes.

STEP 4: Check if 1-minute historical data exists for the date range.
  
  SELECT DISTINCT DATE(from_date) as date, COUNT(*) as stocks
  FROM ohlcv_cache
  WHERE interval = '1minute'
  AND DATE(from_date) BETWEEN '2026-02-27' AND '2026-03-02'
  GROUP BY DATE(from_date);
  
  If 0 → No 1-minute data cached for those dates.
  Need to fetch from Upstox first (but check API limit).
```

### Fix: Two-Mode Backtest

```
The backtest modal should clearly offer TWO modes:

MODE 1: "Signal Replay" (uses existing signals from DB)
  - Fast — no API calls needed
  - Only works for dates where signals were already generated
  - Button: "Replay Signals"
  
MODE 2: "Time Travel" (re-runs strategy on historical data)
  - Slower — needs 1-minute candle data
  - Works for any date where we have IB stock list + candle data
  - May need to fetch candles from Upstox (check API limit first)
  - Button: "Run Time Travel"

The frontend should show:
  "Signal data available: Feb 27, Mar 02 (2 days)"
  "1-minute data available: Feb 24 - Mar 02 (5 days)"
  
  Based on availability, recommend which mode to use.
```

### Implementation

```
File: Modify backtestReplayService.cjs

// Check data availability first
async function checkBacktestData(category, startDate, endDate) {
  const signalDays = await prisma.$queryRaw`
    SELECT DISTINCT DATE(created_at) as date 
    FROM v5_signals 
    WHERE category = ${category}
    AND DATE(created_at) BETWEEN ${startDate} AND ${endDate}
  `;
  
  const candleDays = await prisma.$queryRaw`
    SELECT DISTINCT DATE(from_date) as date
    FROM ohlcv_cache
    WHERE interval = '1minute'
    AND DATE(from_date) BETWEEN ${startDate} AND ${endDate}
  `;
  
  return {
    signalDays: signalDays.map(d => d.date),
    candleDays: candleDays.map(d => d.date),
    canReplay: signalDays.length > 0,
    canTimeTravel: candleDays.length > 0,
    message: signalDays.length === 0 && candleDays.length === 0
      ? 'No data available for this range. Add IB stocks and run scanner first.'
      : `${signalDays.length} days with signals, ${candleDays.length} days with candle data`
  };
}

// API: Check before running
// GET /api/v5/backtest/check?category=INTRADAY_BOOST&start=2026-02-27&end=2026-03-02
```

---

## ISSUE 3: BACKTEST SIMULATION MODES (New Feature)

### What User Wants
Beyond just replaying all signals, the user wants to simulate different stock selection strategies:

```
MODE A: "Take All Signals" (current)
  → If all 7 tradeable signals were taken, what happens?
  
MODE B: "Pick Top 3 by Score" 
  → User picks only the 3 highest-scoring signals each day.
  → This simulates a trader with limited capital.
  
MODE C: "Random 3 Monkey Picks"
  → Randomly pick 3 signals (run 1000 simulations).
  → Shows: average outcome, best case, worst case.
  → Proves: Does the scoring system actually help vs random?

MODE D: "AI Recommended" (see Issue 4 below)
  → AI agent suggests the best 3-5 stocks based on context.
  → Backtest shows: Would AI picks have beaten random?
```

### Implementation

```
File: backend/services/backtestSimulationService.cjs

async function simulateBacktest(signals, mode, options = {}) {
  let selectedSignals;
  
  switch (mode) {
    case 'ALL':
      selectedSignals = signals;
      break;
      
    case 'TOP_N_BY_SCORE':
      const n = options.pickCount || 3;
      selectedSignals = signals
        .sort((a, b) => b.score - a.score)
        .slice(0, n);
      break;
      
    case 'MONKEY_RANDOM':
      const simulations = options.simCount || 1000;
      const pickCount = options.pickCount || 3;
      const allResults = [];
      
      for (let i = 0; i < simulations; i++) {
        const shuffled = [...signals].sort(() => Math.random() - 0.5);
        const picks = shuffled.slice(0, pickCount);
        const result = await evaluatePicks(picks);
        allResults.push(result);
      }
      
      return {
        mode: 'MONKEY_RANDOM',
        simulations,
        avgWinRate: average(allResults.map(r => r.winRate)),
        avgNetR: average(allResults.map(r => r.netR)),
        bestCase: max(allResults, r => r.netR),
        worstCase: min(allResults, r => r.netR),
        percentile95: percentile(allResults.map(r => r.netR), 95),
        percentile5: percentile(allResults.map(r => r.netR), 5),
      };
      
    case 'AI_RECOMMENDED':
      // See Issue 4 — uses Claude API to rank signals
      selectedSignals = await getAIRecommendedPicks(signals, options);
      break;
  }
  
  return evaluatePicks(selectedSignals);
}
```

### Frontend: Backtest Modal Redesign

```
┌─────────────────────────────────────────────────────────────────┐
│  📊 Backtest / Time Travel                                      │
│                                                                 │
│  Category: [INTRADAY_BOOST ▼]                                   │
│  Date Range: [2026-02-27] to [2026-03-02]                       │
│                                                                 │
│  Data Available:                                                │
│  ● Signals: 2 days (Feb 27, Mar 02)                             │
│  ● 1-Min Candles: 4 days (Feb 27, 28, Mar 01, 02)              │
│                                                                 │
│  Simulation Mode:                                               │
│  [🎯 All Signals] [🏆 Top 3 by Score] [🐒 Monkey Test]         │
│  [🤖 AI Recommended]                                            │
│                                                                 │
│  [▶ Run Backtest]                                               │
│                                                                 │
│  ─── RESULTS ────────────────────────────────────────────────   │
│                                                                 │
│  All Signals: 7 trades → 4W 2L 1EOD → +4.2R (57% WR)          │
│  Top 3 Score: 3 trades → 2W 1L → +1.0R (67% WR)               │
│  Monkey (1000x): avg 1.8R, 95th %ile +4.0R, 5th %ile -1.5R    │
│  AI Picks: 3 trades → 3W 0L → +4.0R (100% WR) ⭐              │
│                                                                 │
│  ─── TRADE DETAILS ──────────────────────────────────────────   │
│  [expandable table with each trade's journey]                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## ISSUE 4: AI STOCK RANKING — "TRADER MIND" (Revolutionary Feature)

### What User Wants

An AI agent that thinks like a 20-year experienced trader and says: "Out of these 7 signals, I would pick THESE 3 because..."

This is NOT just score-based ranking. The AI should consider:
- **News context**: War tensions → defense stocks UP, airline stocks DOWN
- **Earnings impact**: Bad results announced last night → stock gaps down
- **Sector momentum**: If pharma sector is hot today, pharma signals get a boost
- **Previous day behavior**: Quiet coil stocks (NR7) have 81% WR
- **Market sentiment**: Bullish NIFTY → favor LONG signals
- **Historical pattern**: "This stock has failed retest 3 times this month — skip it"

### Is This Possible? YES — Here's How

```
We use the Claude API (already available in artifacts) to analyze signals
with real market context. The AI doesn't predict the market — it FILTERS
signals using the same judgment an experienced trader would apply.

The key insight: Our mechanical system generates 7-10 signals per day.
A human trader picks 3-5 of those. The AI replaces that human judgment
with data-backed reasoning.
```

### Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Signal Generator │────▶│  AI Stock Ranker  │────▶│  Dashboard   │
│  (mechanical)     │     │  (Claude API)     │     │  (ranked)    │
│  7-10 signals     │     │  Picks top 3-5    │     │  with reason │
└──────────────────┘     └──────────────────┘     └──────────────┘
```

### Backend Implementation

```
File: backend/services/aiStockRanker.cjs

const fetch = require('node-fetch');

async function rankSignalsWithAI(signals, marketContext) {
  // 1. Build the context package for Claude
  const signalData = signals.map(s => ({
    symbol: s.symbol,
    direction: s.direction,
    type: s.type,  // RETEST or RUNNER
    entry: s.entryPrice,
    stop: s.stopPrice,
    t1: s.t1Price,
    t2: s.t2Price,
    score: s.score,
    riskPercent: s.riskPercent,
    orRange: s.orRangePercent,
    volumeRatio: s.volumeRatio,
    distToEntry: s.distancePercent,
    prevDayRange: s.prevDayRangePercent,
    prevDayDirection: s.prevDayGreen ? 'UP' : 'DOWN'
  }));
  
  // 2. Build market context
  const context = {
    niftyChange: marketContext.niftyChangePercent,
    marketSentiment: marketContext.sentiment, // BULLISH/BEARISH/NEUTRAL
    topSectors: marketContext.topSectors,     // [{name: "PHARMA", change: +1.2%}]
    weakSectors: marketContext.weakSectors,
    date: marketContext.date,
    dayOfWeek: marketContext.dayOfWeek,
    // If available: recent news headlines
    recentNews: marketContext.newsHeadlines || []
  };
  
  // 3. Call Claude API
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: `You are an expert Indian stock market intraday trader with 20 years of experience.
You specialize in Opening Range Breakout (ORB) strategies on F&O stocks.

Your job: Given today's signals and market context, RANK the signals from best to worst.
Pick the TOP 3 that have the highest probability of success.

Key principles you follow:
1. Trade WITH the sector — if pharma is strong and signal is pharma LONG, that's high conviction
2. Avoid signals AGAINST sector — pharma stock SHORT when pharma sector is +1.5% is risky
3. Prefer "quiet coil" setups — stocks that had <2% range yesterday break out harder
4. Prefer RETEST over RUNNER — retests have better defined risk (77% WR vs 75%)
5. SHORT signals have slight edge (83% WR on runners) — lean into them on bearish days
6. Low volume ratio (<1.2x) = weak breakout = skip
7. Wide OR range (>3%) = too much risk = skip
8. Score 70+ preferred, but context can override score
9. If NIFTY is bearish, favor SHORT signals. If bullish, favor LONG.
10. Monday morning: Be cautious, weekend gaps can trap

Respond ONLY in JSON format:
{
  "picks": [
    {
      "symbol": "LT",
      "rank": 1,
      "confidence": "HIGH",
      "reason": "Strong SHORT retest. NIFTY bearish sector (infra) weak today. Low prev day range = coil. Score 85."
    },
    ...
  ],
  "avoid": [
    {
      "symbol": "SUZLON",
      "reason": "LONG signal against bearish market. Low score 48. Wide OR range."
    }
  ],
  "marketNotes": "Bearish day, favor SHORT signals. Infra and energy sectors weak."
}`,
      messages: [{
        role: 'user',
        content: `Today's date: ${context.date} (${context.dayOfWeek})
Market: NIFTY ${context.niftyChange > 0 ? '+' : ''}${context.niftyChange}% (${context.sentiment})
Strong sectors: ${JSON.stringify(context.topSectors)}
Weak sectors: ${JSON.stringify(context.weakSectors)}
${context.recentNews.length > 0 ? 'Recent news: ' + context.recentNews.join('; ') : ''}

Today's signals (${signalData.length} total):
${JSON.stringify(signalData, null, 2)}

Rank these signals. Pick top 3 for trading. Explain why.`
      }]
    })
  });
  
  const data = await response.json();
  const aiText = data.content[0].text;
  
  // Parse JSON response
  try {
    const parsed = JSON.parse(aiText.replace(/```json|```/g, '').trim());
    return parsed;
  } catch (e) {
    console.error('AI response parse error:', e);
    return null;
  }
}
```

### Where To Get Sector Data

```
The system needs sector mapping for each stock. Currently the database
has empty sector columns. 

QUICK FIX: Create a static mapping file.

File: backend/data/stockSectorMap.cjs

module.exports = {
  // Banking
  'HDFCBANK': 'NIFTY_BANK', 'ICICIBANK': 'NIFTY_BANK', 'SBIN': 'NIFTY_BANK',
  'AXISBANK': 'NIFTY_BANK', 'KOTAKBANK': 'NIFTY_BANK', 'INDUSINDBK': 'NIFTY_BANK',
  'PNB': 'NIFTYPSUBANK', 'UNIONBANK': 'NIFTYPSUBANK', 'BANKBARODA': 'NIFTYPSUBANK',
  
  // IT
  'TCS': 'CNXIT', 'INFY': 'CNXIT', 'HCLTECH': 'CNXIT', 'WIPRO': 'CNXIT',
  'TECHM': 'CNXIT', 'LTI': 'CNXIT',
  
  // Pharma
  'SUNPHARMA': 'CNXPHARMA', 'DRREDDY': 'CNXPHARMA', 'DIVISLAB': 'CNXPHARMA',
  'MANKIND': 'CNXPHARMA', 'CIPLA': 'CNXPHARMA', 'LUPIN': 'CNXPHARMA',
  
  // Auto
  'TATAMOTORS': 'CNXAUTO', 'M&M': 'CNXAUTO', 'MARUTI': 'CNXAUTO',
  'BAJAJ-AUTO': 'CNXAUTO', 'TVSMOTOR': 'CNXAUTO', 'EICHERMOT': 'CNXAUTO',
  
  // Energy / Oil
  'RELIANCE': 'CNXENERGY', 'ONGC': 'CNXENERGY', 'IOC': 'CNXENERGY',
  'BPCL': 'CNXENERGY', 'OIL': 'CNXENERGY', 'HINDPETRO': 'CNXENERGY',
  'NTPC': 'CNXENERGY', 'POWERGRID': 'CNXENERGY', 'TATAPOWER': 'CNXENERGY',
  
  // Metal
  'TATASTEEL': 'CNXMETAL', 'JSWSTEEL': 'CNXMETAL', 'HINDALCO': 'CNXMETAL',
  'VEDL': 'CNXMETAL', 'NMDC': 'CNXMETAL', 'COALINDIA': 'CNXMETAL',
  
  // Infra
  'LT': 'CNXINFRA', 'ADANIPORTS': 'CNXINFRA', 'CONCOR': 'CNXINFRA',
  
  // FMCG
  'HINDUNILVR': 'CNXFMCG', 'ITC': 'CNXFMCG', 'NESTLEIND': 'CNXFMCG',
  'BRITANNIA': 'CNXFMCG', 'COLPAL': 'CNXFMCG', 'DABUR': 'CNXFMCG',
  
  // Finance (non-bank)
  'BAJFINANCE': 'CNXFINANCE', 'BAJAJFINSV': 'CNXFINANCE', 'SBILIFE': 'CNXFINANCE',
  'HDFCLIFE': 'CNXFINANCE', 'JIOFIN': 'CNXFINANCE',
  
  // Default
  '_DEFAULT': 'NIFTY'
};

// Usage: getSector('LT') → 'CNXINFRA'
// If not mapped → falls back to 'NIFTY'
```

### Where To Get News Context

```
For NOW (V1): Use web search tool within the AI call (Claude has web search).
  The AI can check "India stock market news today" before ranking.

For LATER (V2): Integrate a news API like:
  - Google News RSS for "NSE" / "BSE" / stock-specific news
  - MoneyControl / Economic Times RSS feeds
  - Or simply: User pastes key headlines into a text field before market open

For BACKTEST: Historical news context is harder. Options:
  - Skip news context for historical backtest (use only technical factors)
  - Or: Build a manual news log (user adds notes per day)
```

### AI Failure Analysis — "Why Did This Stock Fail?"

```
After market close, for each LOSING signal, the AI can analyze:

File: backend/services/aiFailureAnalysis.cjs

async function analyzeFailure(signal, outcome, candles, marketContext) {
  // Provide the AI with:
  // 1. The signal details
  // 2. The minute-by-minute price action after entry
  // 3. The market context at entry time
  // 4. What the rest of the sector did
  
  const response = await callClaude({
    system: 'You are a trading post-mortem analyst. Analyze why this trade failed.',
    user: `Signal: ${signal.symbol} ${signal.direction} ${signal.type}
Entry: ₹${signal.entryPrice}, Stop: ₹${signal.stopPrice}
Outcome: ${outcome.outcome} at ₹${outcome.exitPrice}

Price action after entry (1-min candles):
${formatCandles(candles.slice(0, 30))}

Market at entry time: NIFTY ${marketContext.niftyChange}%
Stock's sector: ${getSector(signal.symbol)} was ${marketContext.sectorChange}%

Why did this trade fail? Was it:
A) False breakout (no follow-through)
B) Against market/sector trend
C) Bad timing (late entry)
D) News-driven reversal
E) Random noise (acceptable loss within system edge)

Respond in 2-3 sentences.`
  });
  
  return response; // "LT SHORT failed because infra sector reversed mid-day..."
}
```

### Display in Dashboard

```
In the EOD Analysis or Trade Journal, each losing trade gets:

SUZLON LONG — STOP HIT (-1R)
🤖 AI Analysis: "Low-conviction setup. Score 48 was below threshold. 
LONG signal while NIFTY was mixed. Suzlon's OR range (3.13%) was near 
the 3% skip threshold. Recommend: Skip signals with score < 55 on 
uncertain market days."

This turns every loss into a learning opportunity.
```

---

## ISSUE 5: REMAINING UI/UX FIXES

### From Screenshots

```
1. EOD Analysis modal (Screenshot 170843):
   - Shows pink/red rows even for winning trades → FIX colors
   - Missing proper header with date and summary stats
   - Table should match signal table format (same columns)

2. Time Travel modal (Screenshot 170819):
   - Shows 0.0% win rate → backtest not running (see Issue 2)
   - Mode buttons (A Random, B Smart, etc.) → wire to actual simulation
   - Category selector → needs to work with available data

3. Market Status bar (Screenshot 170800):
   - "MARKET CLOSED" banner looks good
   - "Game Day" label is informal — change to "Session Day" or just show date
   - The sidebar overlaps content on smaller screens

4. Trade Journal (Screenshot 171433):
   - Nearly empty — only shows TORNTPOWER
   - Should auto-populate from closed signals/positions
   - Needs the expandable row design from Session 3 spec
```

---

## PRIORITY ORDER

```
1. 🔴 ISSUE 1: EOD vs TradingView mismatch (CRITICAL)          90 min
      Without trust in results, everything else is meaningless.
      
2. 🔴 ISSUE 2: Backtest returning 0 results                     60 min
      User needs to validate historical performance.
      
3. 🟡 ISSUE 3: Backtest simulation modes (Top N, Monkey)        90 min
      Proves the scoring system works.
      
4. 🟡 ISSUE 4: AI Stock Ranker                                  2 hours
      The "trader mind" feature — needs Anthropic API key.
      AI Failure Analysis is the cherry on top.
      
5. 🟢 ISSUE 5: UI fixes and polish                              1 hour
      Colors, layout, auto-populate journal.
```

---

## PREREQUISITE CHECK

Before starting Issue 4 (AI Ranker), the agent needs:

```
1. ANTHROPIC_API_KEY — Does the .env file have this?
   If not, user must provide one.
   
2. Stock-to-Sector mapping — Create the static map file.
   Cover at least the top 100 F&O stocks.
   
3. Market context data — Where does the system get:
   - NIFTY change %? (from Upstox API — already available)
   - Sector index changes? (need to fetch CNXIT, CNXPHARMA, etc.)
   - Can we add 5-6 sector indices to the Upstox watchlist?
```

---

## FILES TO CREATE/MODIFY

### New Files:
- `backend/services/aiStockRanker.cjs` — Claude API integration for signal ranking
- `backend/services/aiFailureAnalysis.cjs` — Post-mortem analysis of losing trades
- `backend/services/backtestSimulationService.cjs` — Multi-mode backtest simulation
- `backend/data/stockSectorMap.cjs` — Static stock-to-sector index mapping

### Modified Files:
- `backend/services/eodAnalysisService.cjs` — Fix outcome calculation (CRITICAL)
- `backend/services/backtestReplayService.cjs` — Fix zero results, add data check
- `frontend/TradingDashboard.tsx` — Backtest modal modes, AI ranking display
- `frontend/TradeJournal.tsx` — Auto-populate, AI failure notes
- `frontend/EODAnalysis component` — Fix colors, add AI analysis column

---

## TESTING CHECKLIST

- [ ] EOD Analysis: LT SHORT on Mar 02 shows T1 ✓ (matching TradingView)
- [ ] EOD Analysis: OIL SHORT on Mar 02 shows T2 ✓✓ (matching TradingView)  
- [ ] EOD Analysis: JIOFIN SHORT shows correct result (match TradingView)
- [ ] Backtest: Running Mar 02 returns non-zero results
- [ ] Backtest: "Take All" mode shows results
- [ ] Backtest: "Top 3 by Score" mode shows filtered results
- [ ] Backtest: "Monkey Test" runs 1000 sims, shows distribution
- [ ] AI Ranker: Given 7 signals, returns ranked top 3 with reasons
- [ ] AI Ranker: Considers sector alignment in ranking
- [ ] AI Failure: After market close, losing trades get AI explanation
- [ ] Trade Journal: Auto-populated with today's closed signals
- [ ] Colors: Winning trades = green, Losing = red, Open = yellow (EVERYWHERE)
