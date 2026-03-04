# V5 Engine Configuration: LONG_TERM_SWING_BO_UP

## 1. Description & Thesis
**Category:** `LONG_TERM_SWING_BO_UP` (Long-Term Breakout)
**Thesis:** A trend-following strategy designed to capture major momentum breakouts from long-term consolidation bases. It requires a healthy weekly trend and massive volume signature, but incorporates a wider stop (3x ATR) to survive the natural volatility that occurs around multi-month breakout levels.

## 2. Signal Generation (Module 1)
To generate a generic signal (pre-confirmation), a stock must meet the following criteria on the `Signal Date`:
- **Scanner Baseline:** Stock is identified in the `LONG_TERM_SWING_BO_UP` scanner category.
- **RSI Check:** The 14-day RSI must be strictly between **60.0 and 70.0** on the signal day.
- **NIFTY Health Check:** NIFTY 50 Close > (NIFTY 20 EMA * 0.98).
- **Weekly Trend Check:** Evaluated over the prior 30 weeks, the weekly EMA10 must be strictly greater than the weekly EMA30 (`EMA10 > EMA30`).

## 3. Entry Confirmation (Module 2)
The signal is validated using Intraday confirmation on the morning after the signal date (`Day + 1`).
- **Breakout Level Definition:** The highest close of the prior 50 trading days leading up to (and not including) the signal date.
- **Type A Confirmation:** The stock must close *above* the Breakout Level on a 1-Hour candle boundary (10:15, 11:15, 12:15, 13:15, 14:15, 15:15) on `Day + 1`.
- **Entry Execution:** If confirmed, buy at the Open of the following morning (`Day + 2`).

## 4. Confidence Score (Tiering System)
Signals are scored out of 100 based on 5 parameters evaluated on the `Signal Date`.

| Factor | Parameter | Weight | Condition | Points |
| :--- | :--- | :--- | :--- | :--- |
| **1. Dist from 52wk High** | `% below 52wk High` | 20 | 2% to 10% (Near ATH) | +20 |
| | | | < 2% (ATH BO) | +12 |
| | | | > 10% (Deep Base) | +0 |
| **2. Volume Ratio** | `Signal Vol / Prior 20D Avg Vol` | 20 | > 2.5x (Massive) | +20 |
| | | | 1.5x to 2.5x (Strong) | +14 |
| | | | < 1.5x (Weak) | +4 |
| **3. BB Squeeze** | `BB Width vs 20-Day Avg` | 20 | < 90% (Narrow) | +20 |
| | | | 90% - 110% (Normal) | +10 |
| | | | > 110% (Wide) | +0 |
| **4. Weekly Trend Gap** | `(EMA10 - EMA30) / EMA30` | 15 | < 5% (Narrow) | +15 |
| | | | > 15% (Wide) | +10 |
| | | | 5% - 15% (Medium) | +0 |
| **5. NIFTY Context** | `NIFTY % Dist to 20 EMA` | 13 | < 0% (Cool) | +13 |
| | | | 0% to 1.5% (Warm) | +6 |
| | | | > 1.5% (Hot) | +4 |
| **6. Candle Position** | `Close vs High/Low Range` | 12 | < 60% (Low Close) | +12 |
| | | | > 80% (High Close) | +8 |
| | | | 60% - 80% (Med Close) | +4 |

**Tier Thresholds:**
- **TIER_1 (High Conviction):** 70 to 100 Points (Historical WR: ~100.0%)
- **TIER_2 (Standard):** 40 to 69 Points (Historical WR: ~61.9%)
- **TIER_3 (Low Conviction):** 0 to 39 Points (Historical WR: ~25.0%)

## 5. Risk Management & Exits (Modules 3 & 4)
- **Position Sizing:** `qty = floor(1000 / (Entry Price - Stop Loss))`
- **Initial Stop Loss:** `Entry Price - (3.0 * ATR14)` — a wider stop to survive breakout volatility.
- **Trailing Stop:** No intra-trade trailing stop. The 3x ATR stop remains static to provide maximum breathing room.
- **Time Exit:** Sell at the Close on **Day 13** after entry. (Longer duration allows the trend to mature).
