# Research Backtest & Shadow Learner - Implementation Principles

## Senior Trader Wisdom (CRITICAL)

> **"You cannot predict which trades will fail BEFORE they fail."**
> **"Pure data, pure execution. You cannot force accuracy."**

## The Mistake to NEVER Repeat

❌ **DO NOT** apply automatic filters in Pass 2 hoping to improve results:
- Applied generic filters (price confirmation, candle strength, weak bounce)
- Results got WORSE: Win Rate 46.7% → 31.6%
- Reason: Filters catch both winners AND losers equally

Any filter applied BEFORE a trade completes is EITHER:
1. **Random** (filters good and bad trades equally) - useless
2. **Overfitting** (uses future knowledge we don't have in live trading) - cheating

## The Correct Implementation

### Backend (`RealisticTradingSimulator.cjs`)
- `refinementConfig` is **ALWAYS NULL**
- Both Pass 1 and Pass 2 run **IDENTICAL** logic
- No automatic filtering whatsoever

### Frontend (`ResearchBacktestModal.tsx`)
- Single API call (no redundant Pass 2)
- Calculate **THEORETICAL** improvement from Shadow's `failurePatterns`
- Example: "If 11 early-entry losses were avoided, win rate would be 58%"
- Progress bar: BACKTEST → ANALYZE → DONE (3 steps)

## The Flow That Works

```
BACKTEST → ANALYZE → DONE
    ↓         ↓          ↓
 Pure      Shadow      User sees:
 Execution  Observes   - Current results
            Results    - Theoretical improvement
                       - Suggestions to implement
```

## How to See REAL Improvement

1. Run Research Backtest → Get current results + suggestions
2. Review Shadow suggestions (e.g., "13 trades stopped within 2 days")
3. **MANUALLY** update strategy logic based on insights
4. Promote to V1.b1
5. Run fresh backtest → See ACTUAL improvement

## Key Files

| File | Purpose |
|------|---------|
| `RealisticTradingSimulator.cjs` | Core backtest logic |
| `ResearchBacktestModal.tsx` | Frontend UI for research backtest |
| `ShadowReportPanel.tsx` | Display Shadow analysis results |

## Shadow Learner Role

The Shadow Learner is like a **junior analyst** who:
- Reviews your past trades
- Identifies failure patterns
- Calculates what-if scenarios
- Suggests improvements

**The decision to implement is ALWAYS the user's.**

---
*Last Updated: 2025-12-17*
*Context: Fixed Shadow Backtest after auto-filtering made results worse*
