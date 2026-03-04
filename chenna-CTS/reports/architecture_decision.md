# Architecture Decision: Pine Script Engine

The user explicitly requested why we should use ONE combined script for the Pine Script strategy.

## 1. Shared Foundation
ORB and LEG entries share ~80% of the core logic:
- Dynamic Opening Range detection (waiting for opposite candle)
- Gap verification
- EMA calculation and distance calculations
- Plotting support lines, VWAP, SL lines.

## 2. Maintenance Burden
If we split them, any bug fix or adjustment to the OR logic would have to be deployed and updated in two scripts, increasing tech debt and risking drift.

## 3. Operational Flow
Having a "Mode Selector" (Auto / ORB Only / LEG Only) mirrors how Prashant trades. The "Auto" mode acts natively: if an ORB breaks dynamically, it takes it. If the OR is too wide, it skips ORB but dynamically continues to look for a LEG setup.

**Verdict:** Keep exactly ONE combined script with mode configuration flags.
