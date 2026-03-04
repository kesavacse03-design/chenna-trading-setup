# CTS V5 — Session 4 ADDENDUM: AI Analysis via Agent (No External API)

> **Key Change:** Instead of calling Anthropic API (expensive), the AGENT ITSELF acts as the AI analyst during development. Once results are validated, we migrate to a cheap local model or budget API later.

---

## REVISED ARCHITECTURE: Agent-as-Analyst

### How It Works

```
DURING DEVELOPMENT (NOW):
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│ Signal Engine │────▶│ Agent (Claude)    │────▶│  JSON File   │
│ generates 7   │     │ analyzes signals  │     │  with picks  │
│ signals       │     │ ranks top 3       │     │  + reasons   │
└──────────────┘     │ explains failures  │     └──────────────┘
                     └──────────────────┘
                     You paste signal data
                     into chat, agent responds
                     with ranking + analysis

AFTER VALIDATION (LATER):
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│ Signal Engine │────▶│ Cheap LLM API    │────▶│  Live in App │
│ generates 7   │     │ (Ollama/Groq/    │     │  auto-ranked │
│ signals       │     │  Gemini Flash)   │     │  in dashboard│
└──────────────┘     └──────────────────┘     └──────────────┘
                     Automated, costs < ₹50/day
```

### What Agent Builds NOW

Instead of calling an external API, the agent builds the **data pipeline + UI framework** with a **manual JSON input mode**:

```
File: backend/services/aiAnalysisService.cjs

TWO MODES:

MODE 1: "MANUAL" (Development — Default)
  - Agent generates analysis offline (you paste signals into chat)
  - Agent returns JSON ranking
  - You paste JSON into CTS via a text input or save to file
  - Dashboard reads the JSON and displays rankings
  
  Flow:
  1. After signals generate → System exports signal summary as text
  2. You copy that text → Paste into Claude/Agent chat
  3. Agent analyzes → Returns JSON with picks + reasons
  4. You paste JSON into CTS "AI Analysis" input box
  5. Dashboard shows ranked signals with AI reasoning
  
MODE 2: "AUTO" (Production — Later)
  - Same JSON schema, but filled by API call to cheap model
  - Swap in Ollama (free, local), Groq (fast, cheap), or Gemini Flash
  - No code changes needed — just switch the provider in config
```

---

## IMPLEMENTATION: What Agent Should Build

### Step 1: Signal Export for Analysis

```
File: backend/services/signalExporter.cjs

Purpose: Generate a clean text summary of today's signals that can be
copy-pasted into any AI chat for analysis.

Function: exportSignalsForAnalysis(date)

Output format (clipboard-friendly):

═══════════════════════════════════════════════════════
CTS SIGNAL ANALYSIS REQUEST — March 02, 2026
═══════════════════════════════════════════════════════

MARKET CONTEXT:
  NIFTY: +1.41% (BULLISH)
  Bank NIFTY: +0.8%
  Top Sectors: PHARMA (+1.2%), PSU BANK (+1.1%), AUTO (+0.8%)
  Weak Sectors: MEDIA (-0.8%), FMCG (-0.2%)
  Day: Monday
  Previous Day: Market was closed (weekend)

TODAY'S SIGNALS (7 tradeable):

#1 OIL — SHORT RETEST
   Sector: ENERGY | Entry: ₹483.2 | Stop: ₹485.6 | T1: ₹480.8 | T2: ₹478.4
   Score: 85 | Volume: 2.1x | OR Range: 4.4% | Prev Day: ▲4.1%
   Distance to entry: +0.98%

#2 LT — SHORT RETEST
   Sector: INFRA | Entry: ₹4061 | Stop: ₹4125 | T1: ₹3997 | T2: ₹3933
   Score: 85 | Volume: 1.8x | OR Range: 1.5% | Prev Day: ▼1.2%
   Distance to entry: -0.86%

#3 JIOFIN — SHORT RETEST
   Sector: FINANCE | Entry: ₹246.6 | Stop: ₹247.7 | T1: ₹245.3 | T2: ₹244.0
   Score: 75 | Volume: 1.5x | OR Range: 2.1% | Prev Day: ▼0.5%
   Distance to entry: -0.93%

#4 CAMS — SHORT RUNNER
   Sector: FINANCE | Entry: ₹651.0 | Stop: ₹656.8 | T1: ₹645.3 | T2: ₹639.5
   Score: 70 | Volume: 1.4x | OR Range: 1.8% | Prev Day: ▼1.3%
   Distance to entry: -0.83%

#5 CONCOR — SHORT RUNNER
   Sector: INFRA | Entry: ₹479.6 | Stop: ₹483.6 | T1: ₹475.6 | T2: ₹471.6
   Score: 68 | Volume: 1.3x | OR Range: 1.2% | Prev Day: ▼0.8%
   Distance to entry: -0.82%

#6 SUZLON — LONG RETEST
   Sector: ENERGY | Entry: ₹41.3 | Stop: ₹41.0 | T1: ₹41.6 | T2: ₹41.9
   Score: 48 | Volume: 1.1x | OR Range: 3.13% | Prev Day: ▼4.04%
   Distance to entry: -2.52%

#7 SOLARINDS — LONG RETEST
   Sector: INDUSTRIAL | Entry: ₹13880 | Stop: ₹13844 | T1: ₹13949 | T2: ₹---
   Score: 38 | Volume: 0.9x | OR Range: 0.5% | Prev Day: ▲1.2%
   Distance to entry: +0.15%

═══════════════════════════════════════════════════════
ANALYZE: Rank top 3 picks. Explain why. Flag stocks to avoid.
═══════════════════════════════════════════════════════

API Endpoint: GET /api/v5/signals/export-for-analysis?date=2026-03-02

Also add a "Copy for AI Analysis" button in the dashboard UI
that copies this formatted text to clipboard.
```

### Step 2: AI Analysis JSON Schema

```
File: backend/schemas/aiAnalysis.schema.js

// This is the standard format for AI analysis results
// Whether filled manually or by API — same structure

const aiAnalysisSchema = {
  date: "2026-03-02",
  analyst: "manual",  // or "claude", "groq", "ollama", "gemini"
  timestamp: "2026-03-02T16:00:00+05:30",
  
  marketAssessment: {
    bias: "BEARISH_LEAN",  // STRONG_BULLISH, BULLISH, NEUTRAL, BEARISH, STRONG_BEARISH
    reasoning: "Despite NIFTY +1.41%, most IB signals are SHORT. Smart money selling into strength."
  },
  
  picks: [
    {
      rank: 1,
      symbol: "LT",
      confidence: "HIGH",
      reasoning: "Strong SHORT retest on infra heavyweight. OR range 1.5% is ideal. Score 85. LT's prev day was already down 1.2% — sellers have control. Sector (INFRA) not in today's strong sectors list. Clean setup."
    },
    {
      rank: 2,
      symbol: "OIL",
      confidence: "HIGH",
      reasoning: "SHORT retest on energy stock. Despite energy not being weakest sector, OIL had massive 4.1% up day yesterday — likely profit booking today. Score 85. High volume 2.1x confirms institutional selling. Entry price close to current (0.98%) — good fill probability."
    },
    {
      rank: 3,
      symbol: "CAMS",
      confidence: "MEDIUM",
      reasoning: "SHORT runner in finance. Finance sector mixed today. RUNNER type means momentum is strong — 83% WR on SHORT runners from our research. Score 70 is acceptable. Risk: runner entry may have slippage."
    }
  ],
  
  avoid: [
    {
      symbol: "SUZLON",
      reasoning: "LONG signal with score 48 (below 55 threshold). OR range 3.13% near skip limit. Prev day massive -4% drop suggests continuation downward, not reversal. LONG here is catching a falling knife."
    },
    {
      symbol: "SOLARINDS",
      reasoning: "Score 38 is very low. Volume 0.9x (below average — no institutional interest). Skip."
    }
  ],
  
  // POST-MARKET: Failure analysis (filled after EOD)
  failureAnalysis: [
    {
      symbol: "JIOFIN",
      outcome: "STOP_HIT",
      reasoning: "JIOFIN broke down from OR but reversed sharply. Finance sector was mixed — PSU banks strong but JIOFIN is non-bank finance. The bounce from day low around ₹244 showed strong buying. Lesson: Avoid shorting near strong support levels even with valid breakout."
    }
  ]
};
```

### Step 3: Manual Input UI

```
File: frontend component addition

Add to the Trading Dashboard or as a modal:

┌──────────────────────────────────────────────────────────────┐
│  🤖 AI Signal Analysis                                       │
│                                                              │
│  [📋 Copy Signals for Analysis]  ← copies formatted text     │
│                                                              │
│  Paste AI Response (JSON):                                   │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ { "picks": [...], "avoid": [...] }                       ││
│  │                                                          ││
│  └──────────────────────────────────────────────────────────┘│
│  [💾 Save Analysis]  [📊 Apply to Signals]                   │
│                                                              │
│  ─── OR ───                                                  │
│  Load from file: [Choose File]                               │
│                                                              │
│  ─── APPLIED RANKING ───                                     │
│  🥇 #1 LT (HIGH) — Strong SHORT retest on infra heavyweight │
│  🥈 #2 OIL (HIGH) — Profit booking after 4.1% up day        │
│  🥉 #3 CAMS (MED) — SHORT runner, 83% WR momentum           │
│                                                              │
│  ⛔ AVOID: SUZLON (score 48, falling knife)                  │
│  ⛔ AVOID: SOLARINDS (score 38, no volume)                   │
└──────────────────────────────────────────────────────────────┘
```

### Step 4: Integrate Rankings into Signal Table

```
When AI analysis is loaded, enhance the Live Signals table:

- Add a "🤖" column or badge next to ranked signals
- #1 pick gets gold badge 🥇
- #2 pick gets silver badge 🥈  
- #3 pick gets bronze badge 🥉
- Avoided signals get a ⚠️ warning icon
- AI reasoning shows as tooltip on hover

Signals table reorders: AI picks float to top, avoided sink to bottom.
```

### Step 5: Save and Retrieve Analysis History

```
Backend storage:

// Save analysis to database or JSON file
// POST /api/v5/ai-analysis
// Body: the aiAnalysis JSON object

// Retrieve for a date
// GET /api/v5/ai-analysis?date=2026-03-02

For now, store as JSON files:
  backend/data/ai-analysis/2026-03-02.json
  backend/data/ai-analysis/2026-03-03.json
  ...

Later, move to database table when migrating to auto-API mode.
```

### Step 6: Backtest Integration with AI Analysis

```
When running backtest for a date range:

If AI analysis exists for that date → use it
  Show: "AI Picks: 3 trades → 2W 1L → +1.0R"
  vs: "All Signals: 7 trades → 4W 2L → +4.2R"
  vs: "Top 3 Score: 3 trades → 2W 1L → +1.0R"
  vs: "Monkey Random: avg 1.2R"

If no AI analysis exists → gray out that mode
  Show: "AI analysis not available for Feb 27. 
         Run analysis in chat and paste results."
```

---

## FUTURE: Cheap Model Migration Path

```
When ready to automate, the provider swap is ONE config change:

File: backend/config/aiConfig.cjs

module.exports = {
  provider: 'manual',  // Change to: 'ollama' | 'groq' | 'gemini' | 'anthropic'
  
  // Ollama (FREE — runs locally)
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: 'llama3.1:8b',  // or mistral, phi-3
    // Cost: ₹0 (runs on your machine)
    // Quality: Good enough for ranking, may struggle with nuanced analysis
  },
  
  // Groq (VERY CHEAP — cloud)
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    model: 'llama-3.1-70b-versatile',
    // Cost: ~₹5-10 per day (at 20 calls/day)
    // Quality: Very good, fast inference
  },
  
  // Google Gemini Flash (CHEAP — cloud)
  gemini: {
    apiKey: process.env.GOOGLE_AI_KEY,
    model: 'gemini-2.0-flash',
    // Cost: ~₹5-15 per day
    // Quality: Good, fast
    // Free tier: 1500 requests/day (more than enough!)
  },
  
  // Anthropic (EXPENSIVE — for when we're making money 😄)
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-20250514',
    // Cost: ~₹100-200 per day
    // Quality: Best analysis, best reasoning
  }
};

// The aiAnalysisService.cjs reads this config and calls the right provider.
// The JSON schema stays IDENTICAL regardless of provider.
// Dashboard code doesn't change at all.
```

### Recommended Migration Path
```
Phase 1 (NOW): Manual — Agent analyzes, you paste JSON        Cost: ₹0
Phase 2 (WEEK 2): Gemini Flash free tier — 1500 req/day      Cost: ₹0
Phase 3 (MONTH 2): Groq or Gemini paid — better quality      Cost: ₹5-15/day
Phase 4 (PROFITABLE): Anthropic Claude — best reasoning       Cost: ₹100-200/day
```

---

## WORKFLOW: How You Use This Tomorrow Morning

```
PRE-MARKET (8:30 AM):
1. Open CTS Dashboard
2. Add IB stocks from TradeCode

MARKET OPEN (9:15 - 9:45 AM):
3. Auto-scanner runs, OR forms
4. Signals start appearing (9:45+)

AFTER FIRST SIGNALS (10:00 AM):
5. Click "📋 Copy Signals for Analysis" button
6. Paste into this Claude chat (or new chat with agent)
7. Ask: "Rank these signals. Pick top 3. Explain why."
8. Copy the JSON response
9. Paste into CTS "AI Analysis" input
10. Dashboard now shows ranked signals with 🥇🥈🥉

TRADE EXECUTION (10:00 - 14:30):
11. Focus on top 3 AI-ranked signals
12. Place limit orders within entry range
13. Monitor positions

POST-MARKET (15:30):
14. Click "📋 Copy Results for Analysis"
15. Paste into chat, ask: "Analyze losing trades. Why did they fail?"
16. Save failure analysis for learning

The whole AI analysis takes < 2 minutes per session.
Zero cost during development.
```

---

## SUMMARY: What Agent Builds for Issue 4

```
NEW FILES:
1. backend/services/signalExporter.cjs — Export signals as formatted text
2. backend/schemas/aiAnalysis.schema.js — Standard JSON schema
3. backend/services/aiAnalysisService.cjs — Save/load analysis (JSON file mode)
4. backend/data/stockSectorMap.cjs — Stock-to-sector mapping (100+ stocks)
5. backend/data/ai-analysis/ — Directory for daily analysis JSONs
6. frontend component: AIAnalysisPanel — Copy, paste, display rankings

MODIFIED:
7. Live Signals table — Show AI rank badges (🥇🥈🥉⚠️)
8. Backtest modal — Add "AI Picks" simulation mode
9. EOD Analysis — Show AI failure analysis notes
10. Dashboard API — Endpoint for signal export and analysis CRUD

NO EXTERNAL API CALLS. NO COST. AGENT-POWERED DURING DEV.
```
