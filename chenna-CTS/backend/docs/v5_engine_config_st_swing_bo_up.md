# V5 Engine Configuration: SHORT_TERM_SWING_BO_UP

**Category:** `SHORT_TERM_SWING_BO_UP` (Daily Timeframe)
**Objective:** Capture short-term momentum continuation from established breakouts using patient wide-stop mechanics.
**Verified Win Rate (Filtered Data):** ~48.0% - 52.0%
**Verified Holding Period:** 1-10 Trading Days
**Risk Profile:** ₹1,000 Risk per trade, 2x ATR Stops, No Trailing.

---

## 1. Scanner Requirements (Pre-Qualification)
- **Timeframe:** Daily Data
- **Base Condition:** The stock's current Daily Close must be strictly higher than the maximum Daily Close of the preceding 10 trading days.
- **Deduplication:** Ignore signals on the same stock that occur within 7 calendar days of a previous valid signal.

## 2. Mathematical Filters (The "V5 Base")
Every scanned signal MUST pass these sequential checks at the end of the breakout day (Day 0):

1. **Stage 2 Alignment:**
   - 50-Day SMA > 200-Day SMA
   - Breakout Daily Close > 50-Day SMA
2. **Momentum (RSI):**
   - 14-Day RSI must be between **60 and 70** (inclusive) on the breakout day.
3. **Market Truth (NIFTY Buffer):**
   - NIFTY 50 Daily Close must be above the (NIFTY 20-Day EMA * 0.98).
   - *This permits trading even during mild 2% market corrections, but stops entries during crashes.*

## 3. The "Type A" Intraday Confirmation (Day +1 Morning)
We DO NOT enter blindly at the market open on Day +1. Morning gaps are statistically dangerous. Instead:

1. **Wait for 1-Hour Bar:** Wait until 10:15 AM (IST) on Day +1.
2. **Evaluate 1-Hour Close:** The 30m/1H candle close MUST be higher than the highest high of the prior 10 daily candles.
3. **Confirm Type A:** If the stock held the breakout level after the morning volatility settles, it is confirmed as a "Type A" breakout.

## 4. Execution & Sizing
- **Entry Method:** Market/Limit Order executed anytime after 10:15 AM confirmation on Day +1.
- **Initial Stop Loss:** `Entry Price - (2.0 * 14-Day ATR from Day 0)`.
  - *This is the "Breathing Room" mandate. No arbitrary 2% or 4% stops permitted. Volatile stocks get wider stops.*
- **Position Sizing:** `₹1,000 / (Entry Price - Stop Loss Price)` shares.
  - *This ensures capital outlay automatically shrinks for wild stocks.*

## 5. Trade Management (The Patient Protocol)
- **NO TRAILING STOPS.** Do not move the stop to breakeven. Do not trail below previous daily lows.
- *Rationale: Statistically, normal 3-5% swing pullbacks routinely triggered breakeven trailing stops, destroying 20% of the strategy's win rate. Breakouts require minimum 5 days to breathe and clear the launchpad.*

## 6. Exit Mechanics
A trade is closed based on only one of two conditions:
1. **Stop Loss Hit:** The stock's Daily Low penetrates the stationary 2x ATR Structure Stop at any point.
2. **Time Exit:** The stock is sold precisely at the market close on **Day +10**, regardless of profit or loss percentage.

## 7. Retest Breakout Component
- Pullback Retests (a breakout that pulls back for 1-10 days and holds the 20-Day SMA before breaking out again) were evaluated.
- *Finding:* When subjected to the stringent V5 Base Filters (Stage 2 + RSI + NIFTY), the frequency of valid signals dropped to nearly zero (0 trades in the 6-month simulation). 
- *Conclusion:* Retests are mathematically valid unmanaged, but practically useless inside the strict V5 risk framework. They are officially **EXCLUDED** from the `SHORT_TERM_SWING_BO_UP` V5 engine pipeline. We run **First Breakouts Only**.

## 8. Data-Driven Pre-Entry Confidence Score
When multiple signals fire on the same day, prioritize entries using this 100-point pre-entry scoring system.

*   **Factor 1: NIFTY Context (Max 12)**
    *   NIFTY < 0%: 12 pts
    *   NIFTY 0 to 1.5%: 6 pts
    *   NIFTY > 1.5%: 4 pts
*   **Factor 2: Signal Volume vs 20-Day Avg (Max 22)**
    *   Volume > 2.5×: 22 pts
    *   Volume 1.5 - 2.5×: 15 pts
    *   Volume < 1.5×: 0 pts
*   **Factor 3: Candle Quality (Max 22)**
    *   Close Top 33%: 22 pts
    *   Close Middle 33%: 10 pts
    *   Close Bottom 33%: 0 pts
*   **Factor 4: 1H MACD State (Max 17)**
    *   1H MACD Bullish (Momentum running): 17 pts
    *   1H MACD Flat/Crossing (Testing/Fresh): 5 pts 
*   **Factor 5: ADX(14) Level (Max 12)**
    *   ADX is a flat 12 proxy when unavailable.
*   **Factor 6: BB Squeeze (Max 15)**
    *   Narrow (< 90% avg): 15 pts
    *   Normal (90-110%): 8 pts
    *   Wide (> 110%): 0 pts

**Validated Tiers:**
- **High (70-100):** 42.9% Historical WR
- **Medium (40-69):** 30.0% Historical WR
- **Low (0-39):** 0.0% Historical WR

## 9. Post-Entry Health Check Dashboard
**Do not use the confidence score after entry.** Instead, rely on the Health Check to manage conviction during the 5-10 day hold.

**A. DAY+1 STATUS (Checked at end of Day 1)**
- 🟢 **STRONG HOLD**: Marubozu Green (90% WR), Doji (71.7% WR), Bullish Engulfing (70% WR)
- 🟡 **WATCH**: Normal Green (60% WR), Normal Red (51% WR)
- 🔴 **EXIT SIGNAL**: Bearish Engulfing (36.4% WR), Marubozu Red (33.3% WR)

**B. VOLUME HEALTH (Checked Daily, 5-Day window)**
- 🟢 **ACCUMULATION**: Green/Red volume ratio > 2.0× (88.2% WR)
- 🟡 **NEUTRAL**: Ratio 0.8× to 2.0×
- 🔴 **DISTRIBUTION**: Ratio < 0.8× (34.4% WR)

**C. COMBINED STATUS ACTION**
- 🟢🟢 = Maximum conviction, hold confidently to Day 10.
- 🟢🟡 or 🟡🟢 = Normal hold behavior.
- 🔴 (either indicator) = Consider early manual exit to protect capital.
- 🔴🔴 = EXIT IMMEDIATELY regardless of structure stop.

---
*Locked By: Kesava & AI Data Forensics Team | Date: 2026-02-25*
