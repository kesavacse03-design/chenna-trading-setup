# V5 Engine Configuration: SHORT_TERM_SWING_BO_DOWN

## 1. Description & Thesis
**Category:** `SHORT_TERM_SWING_BO_DOWN` (Short-Term Breakdown Reversion)
**Thesis:** A mean-reversion strategy that capitalizes on extreme downward overextension. Instead of buying the initial "falling knife" signal or single candlestick bounces, the strategy waits for structural exhaustion confirmed by a Double Bottom pattern combined with an SMA10 reclaim. 

## 2. Signal Generation (Module 1)
To generate a generic signal (pre-confirmation), a stock must meet the following criteria on the `Signal Date`:
- **Scanner Baseline:** Stock is identified in the `SHORT_TERM_SWING_BO_DOWN` scanner category.
- **RSI Depth Check:** The 14-day RSI must have been < 40 on the signal day.
- **NIFTY Health Check:** NIFTY 50 Close > (NIFTY 20 EMA * 0.96) — avoids buying during extreme macro crashes. 

## 3. Entry Confirmation (Module 2)
A signal remains valid for up to 15 trading days. The engine waits for **BOTH** of the following structural confirmations to trigger an entry:
1. **Double Bottom Formation:**
   - The stock makes a `Low_1` after the signal.
   - It bounces at least 2% from `Low_1` to create an interim high.
   - It pulls back to test `Low_1` (creating `Low_2`). `Low_2` must not break below `Low_1` by more than 1%.
   - The stock closes above the interim high, confirming the structural double bottom.
2. **SMA10 Reclaim:**
   - The stock must close above its 10-day Simple Moving Average (SMA10).

**RSI Prerequisite:** At some point between the signal and the entry confirmation, the 14-day RSI must have dipped below 30.
**Entry Execution:** Buy at the Open of the day following the dual confirmation.

## 4. Confidence Score (Tiering System)
Signals are scored out of 100 based on 5 parameters evaluated on the `Entry Date`.

| Factor | Parameter | Weight | Condition | Points |
| :--- | :--- | :--- | :--- | :--- |
| **1. DB Tightness** | `|Low_1 - Low_2| / Low_1` | 30 | < 0.5% | +30 |
| | | | > 1.5% | +15 |
| | | | 0.5% - 1.5% | +0 |
| **2. Setup Duration** | Days from signal to entry | 25 | 7 to 10 days | +25 |
| | | | <= 6 days | +10 |
| | | | > 10 days | +0 |
| **3. RSI Depth** | Lowest 14D RSI during setup | 20 | 20.0 to 30.0 | +20 |
| | | | > 30.0 | +5 |
| | | | < 20.0 | +0 |
| **4. Volume Ratio** | Setup Avg Vol / Prior 20D Avg Vol | 15 | 1.0x to 1.5x | +15 |
| | | | < 1.0x | +10 |
| | | | > 1.5x | +0 |
| **5. NIFTY Context** | NIFTY % Dist to 20 EMA | 10 | -1% to +1% | +10 |
| | | | > 1% (Hot) | +5 |
| | | | < -1% (Cool) | +0 |

**Tier Thresholds:**
- **TIER_1 (High Conviction):** 70 to 100 Points (Historical WR: ~85.7%)
- **TIER_2 (Standard):** 40 to 69 Points (Historical WR: ~66.7%)
- **TIER_3 (Low Conviction):** 0 to 39 Points (Historical WR: ~29.4%)

## 5. Risk Management & Exits (Modules 3 & 4)
- **Position Sizing:** `qty = floor(1000 / (Entry Price - Stop Loss))`
- **Initial Stop Loss:** `Entry Price - (2.0 * ATR14)` — hard stop.
- **Trailing Stop:** No intra-trade trailing stop. The 2x ATR stop remains static to provide breathing room.
- **Time Exit:** Sell at the Close on **Day 5** after entry. (Mean-reversion moves play out fast; holding longer degrades R:R).
