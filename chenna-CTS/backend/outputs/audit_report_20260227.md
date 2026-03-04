# V5 Pipeline Audit Report — 2026-02-27

## Summary
- ✅ PASS: 17
- ❌ FAIL: 7
- ⚠️ PARTIAL: 5

## Detailed Results
```
✅ 1a: LONG_TERM_SWING_BO_DOWN: 2 stocks
✅ 1a: DOWNSIDE_LOM_INTRA: 6 stocks
✅ 1a: LONG_TERM_SWING_BO_UP: 3 stocks
✅ 1a: SHORT_TERM_SWING_BO_DOWN: 6 stocks
✅ 1a: MULTI_RESISTANCE_BO: 1 stocks
✅ 1a: UPSIDE_LOM_SWING: 9 stocks
✅ 1a: UPSIDE_LOM_INTRA: 7 stocks
✅ 1a: DOWNSIDE_LOM_SWING: 5 stocks
✅ 1a: INTRADAY_BOOST: 49 stocks (expected 40-50)
✅ 1a: SHORT_TERM_SWING_BO_UP: 8 stocks
✅ 1a: HIGH_POWERED_STOCKS: 49 stocks
✅ 1c: Sectors populated for all 10 checked IB stocks
❌ 2a: No upstox_tokens.json found at d:\chenna-trading-system-dashboard\chenna-CTS\backend\upstox_tokens.json
⚠️ 2b: LTF: No candles for 2026-02-27. Latest cache date: 2026-02-24. Total candles: 1588
❌ 2b-day: LTF: No daily cache file
⚠️ 2b: IRCTC: No candles for 2026-02-27. Latest cache date: 2026-02-24. Total candles: 1588
❌ 2b-day: IRCTC: No daily cache file
⚠️ 2b: FORTIS: No candles for 2026-02-27. Latest cache date: 2026-02-24. Total candles: 1588
❌ 2b-day: FORTIS: No daily cache file
❌ 3a: No V5 signals found for 2026-02-27
❌ 4a: CONFIRMED: 0 | PENDING: 0 | EXPIRED: 0 | EXECUTED: 0
⚠️ 5a: No OPEN positions found. Checking if Module 3 can open one...
❌ 5b: No confirmed signals available to open a position from
⚠️ 5d: Total CLOSED positions in DB: 0
✅ 6: dashboard/summary → ok:true | today.openPositions=0, pendingSignals=0
✅ 6: dashboard/positions → ok:true | 0 positions
✅ 6: dashboard/signals → ok:true | CONFIRMED=0, PENDING=0, EXPIRED=0, EXECUTED=0 (total=0)
✅ 6: alerts/today → ok:true | 42 alerts
✅ 6: alerts/active → ok:true | 42 alerts
```
