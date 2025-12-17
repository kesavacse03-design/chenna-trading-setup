# 🔬 RESEARCH BACKTEST + SHADOW LEARNER — MASTER SPECIFICATION

## Status: VISION DOCUMENT (Not yet fully implemented)

This document represents the **target architecture** for the Shadow Learner system.
Current implementation is simpler; this is where we're heading.

---

## 🧠 OVERALL PRINCIPLE (NON-NEGOTIABLE)

* Do **NOT** modify any logic in the first pass
* Do **NOT** give generic advice
* Do **NOT** assume improvements
* Every improvement must be **earned, tested, and measured**

The system must **prove** learning, not claim it.

---

## 🧩 THE THREE LAYERS

### LAYER 1 — STRUCTURAL FAILURE DETECTION (OBSERVATION ONLY)
- Run pure backtest with Labs logic
- **NO changes, NO optimization, NO filtering**
- Classify every failure by **structural cause**
- Output: Tagged failures with precise reasons

### LAYER 2 — FAILURE → RULE GAP MAPPING (REASONING)
- Analyze failures in aggregate
- Map repeated patterns to **specific rule gaps**
- Form **hypotheses** (not solutions)
- Output: Proposed rule changes (one at a time)

### LAYER 3 — CONTROLLED SHADOW RE-TEST (PROOF)
- Create shadow variant (e.g., TT-v1 → TT-v1.shadow.A)
- Apply **ONE rule change at a time**
- Re-run same backtest period
- Measure real deltas
- Keep only if **statistically meaningful**

---

## 🧬 FAILURE TAXONOMY — DOWNSIDE LOM SWING

### LAYER A — STRUCTURAL CONTEXT FAILURES

| Tag | Description |
|-----|-------------|
| `FAIL_CONTEXT_HTF_TREND` | Trade against dominant higher-timeframe trend |
| `FAIL_CONTEXT_PREMATURE_EXHAUSTION` | Entry on first push, no compression/slowdown |
| `FAIL_CONTEXT_VOLATILITY_EXPANSION` | Entry during range expansion / ATR expanding |

### LAYER B — PRICE ACTION FAILURES

| Tag | Description |
|-----|-------------|
| `FAIL_PRICE_NO_ACCEPTANCE` | Wick present but next candle closed below wick midpoint |
| `FAIL_PRICE_MOMENTUM_WICK` | Wick inside large momentum candle (profit-taking, not absorption) |
| `FAIL_PRICE_NO_BASE` | V-bounce without sideways absorption base |

### LAYER C — VOLUME & PARTICIPATION FAILURES

| Tag | Description |
|-----|-------------|
| `FAIL_VOLUME_NO_ABSORPTION` | Wick present but volume flat/declining |
| `FAIL_VOLUME_DISTRIBUTION_TRAP` | High volume at lows but no follow-through |

### LAYER D — TIMING & ENTRY FAILURES

| Tag | Description |
|-----|-------------|
| `FAIL_ENTRY_NO_CONFIRM_CLOSE` | Entry taken intra-candle, close invalidated signal |
| `FAIL_ENTRY_NO_RETEST` | Entry on first bounce, no retest of low |
| `FAIL_ENTRY_LATE` | Entry after 40-60% bounce already done |

### LAYER E — TRADE MANAGEMENT FAILURES

| Tag | Description |
|-----|-------------|
| `FAIL_MANAGEMENT_TIGHT_STOP` | Stop hit inside normal swing volatility |
| `FAIL_MANAGEMENT_EARLY_TRAIL` | Trailing stop before structure resolved |
| `FAIL_MANAGEMENT_BAD_PARTIAL` | Partial exit inside congestion, not at structure |

### LAYER F — SIGNAL QUALITY FAILURES

| Tag | Description |
|-----|-------------|
| `FAIL_SIGNAL_OVERTRADING` | Multiple entries during same down leg |
| `FAIL_SIGNAL_LOW_QUALITY` | Signal met minimum but lacked confluence |

---

## 🎯 OUTPUT REQUIREMENTS

### 1️⃣ Original Backtest (Baseline)
- Metrics from untouched logic
- Realistic, time-forward results

### 2️⃣ Shadow-Refined Backtest
- Metrics after **tested** improvements only

### 3️⃣ Before vs After Comparison
- Clear numeric deltas
- Highlight what actually changed

### 4️⃣ Human-Readable Explanation
- What mistake was happening
- What rule fixed it
- Why this matches market behavior

### 5️⃣ Promotion Decision
- User must manually accept — no auto-overwrite

---

## 🚫 HARD RULES

* Shadow Learner must **never auto-modify live logic**
* Labs Backtest is **research only**
* If Shadow Learner cannot prove improvement, it must stay silent
* No forced optimism. No fake learning.

---

## 📊 CATEGORY DNA: DOWNSIDE LOM SWING

Downside LOM Swing trades work only when:
* Downside pressure is **exhausting**, not expanding
* Smart money is **absorbing**, not distributing
* The move is **late-stage**, not early-stage
* The trade is a **reaction**, not anticipation

Every failure happens when **one of these truths is violated**.

---

## 🔄 IMPLEMENTATION STATUS

| Layer | Status |
|-------|--------|
| Layer 1 (Observation) | ✅ Basic implementation exists |
| Layer 2 (Rule Mapping) | 🔄 Partial - needs structural tags |
| Layer 3 (Shadow Re-test) | ❌ Not yet implemented |
| Failure Taxonomy | ❌ Not yet implemented |
| One-at-a-time rule testing | ❌ Not yet implemented |

---

*Last Updated: 2025-12-17*
*Source: User specification for production-grade Shadow Learner*
