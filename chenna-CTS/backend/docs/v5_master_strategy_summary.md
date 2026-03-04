# V5 Master Strategy Summary

## Overview
The V5 Trading Engine is a data-driven, rules-based suite of Swing Trading strategies optimized for the Indian equities market. It executes a portfolio of 3 independent categories to balance trend following with mean reversion. Over a 6-month fully realistic backtest, this combined portfolio generated **112 trades**, yielding a **54.5% Win Rate** and **+16.7R** total Return.

With a typical account configuration risking ₹1,000 per trade, this system delivers an average of ~18 trades per month (+2.8R / month).

---

## 1. The Portfolio
The engine actively trades the following four strategies. `LONG_TERM_SWING_BO_DOWN` is officially **shelved** due to persistent negative expectancy. 

| Category | Style | Verified Trades | Freq | Win Rate | P&L (1R Risk) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **INTRADAY_BOOST** | Intraday Daily Income (ORB) | 172 (18 days) | ~9.5/day (take best 3-5) | 76.0% | +1.28R / trade |
| **ST_SWING_UP** | Short-Term Breakout | 25 (6mo) | ~4/mo | 48.0% | +₹3,658 (+3.6R) |
| **ST_SWING_DOWN** | Structural Mean-Reversion | 57 (6mo) | ~9/mo | 57.9% | +₹10,142 (+10.1R)|
| **LT_SWING_UP** | Long-Term Breakout | 30 (6mo) | ~5/mo | 63.3% | +₹2,966 (+2.9R)|

---

## 2. The Complete System Design

### A. Daily Income Engine: INTRADAY ORB (Retest + Runner)
- **Role:** High-frequency, high-win rate cash flow generation.
- **Frequency:** 3 to 5 Tier-1/Tier-2 trades per day.
- **Performance:** Tier 1 yields an ~83% Win Rate at +0.83R EV per trade.
- **Mechanics:** Relies on the "Early Warning" system to place limit orders for Breakout Retests, or absorbs minimal slippage for Momentum Runners. Targets solid 1:1 and 1:2 R:R using the pure Breakout Candle Extreme as the Stop Loss.

### B. Monthly Wealth Engine: LT_SWING_UP
- **Role:** Capturing significant multi-week trends for substantial portfolio growth.
- **Frequency:** 2 to 3 Tier-1 trades per month.
- **Performance:** Tier 1 yields an 81.8% Win Rate at +0.43R EV per trade.
- **Mechanics:** Buys primary Stage 2 breakouts and holds them strictly for 13 days, riding the momentum wave while using a wide 3x ATR stop to survive the chop.

### C. Supplementary Engine: ST_SWING_DOWN & ST_SWING_UP
- **Role:** Filling the gaps between major market moves (Mean Reversion & Quick Pops).
- **Frequency:** ~13 trades combined per month.
- **Mechanics:** ST_SWING_DOWN buys Double-Bottom structural exhaustion (Tier 1 hits 85.7% WR). ST_SWING_UP plays quick 10-day pops. Both are strictly managed to keep drawdown low in choppy environments.

---

## 2. Daily Workflow
The V5 architecture is composed of 5 tightly integrated Modules that manage the lifecycle of a trade.

**Module 1: Signal Generation (End of Day)**
- Scans the market immediately after the Close.
- Applies Category-specific primary filters (e.g., RSI 60-70, NIFTY > 20EMA).
- Computes Confidence Tiers (High/Med/Low) out of 100 points based on backtested weighting factors. (Note: Both UP categories include the validated 'BB Squeeze' factor).
- Generates "Pending" Signals in the database.

**Module 2: Entry Confirmation (Intraday or Daily)**
- **ST_SWING_UP & LT_SWING_UP:** Require Intraday 1-Hour Type A Confirmation the following morning. An order is executed at the Open of Day+2 if the stock sustains the breakout level on a 1H candle.
- **ST_SWING_DOWN:** Requires a Daily structural formation. Over 15 days, it waits for a perfectly aligned Double Bottom and a close above the 10-day SMA.

**Module 3 & 4: Position Management & Exits**
- **Sizing:** Precise fractional position sizing based on risk (`Qty = maxRisk / (Entry - StopLoss)`).
- **Stops:** Wide, static ATR-based structural stops to survive volatility without intra-trade trailing whipsaws. 
    - ST_UP: 2x ATR static stop, NO trailing.
    - ST_DOWN: 2x ATR.
    - LT_UP: 3x ATR.
- **Hard Time Exits (Swing):** Strict holding periods maximize Capital Velocity.
    - ST_UP: Day 10.
    - ST_DOWN: Day 5.
    - LT_UP: Day 13.
- **Intraday Exits:**
    - T1 (1:1 R:R): Book 70% of position
    - T2 (1:2 R:R): Book remaining 30%
    - EOD drift: Close at 15:15 if neither hit
    - Stop: Breakout candle extreme

## 3. The Power of ST_SWING_DOWN
The hidden gem of the V5 Engine. By avoiding standard "falling knives," this strategy demands **both** structural exhaustion (a Double Bottom) and momentum return (SMA10 Reclaim). When combined with an RSI depth of 20-30 and an entry within 7-10 days, this specific Tier 1 setup boasts an **85.7% Win Rate**, making it the primary profit engine of the entire portfolio.
