# Category Analysis Results: CTS V5

This document tracks the outcome of deep category studies to determine which trading strategies and filters yield the highest performance over historical backtested data.

## Category: HIGH_POWERED_STOCKS

### 1. Overlap Analysis with INTRADAY_BOOST
* **Study Period**: Last 30 Days (Tested 10 Active Trading Days based on Cache)
* **Total HPS Stocks Scanned**: 502
* **Total IB Stocks Scanned**: 531
* **Same-Day Overlap**: 269 matches
* **Overlap Percentage**: 53.59%
* **Conclusion**: More than half of all `HIGH_POWERED_STOCKS` are also caught by the `INTRADAY_BOOST` scanner on the exact same day.

### 2. ORB Backtest Performance on HPS
A strict 30-minute ORB (Opening Range Breakout) backtest was simulated exclusively on `HIGH_POWERED_STOCKS` using exact ORB logic without the Master Alignment (Sector/Nifty) score filters.

* **Total Scanned Stocks**: 502
* **Total Breakout Triggers**: 137 (Long: 51, Short: 86)
* **Target 1 Hits (1:1 RR)**: 59 / 137 **(43.07%)**
* **Target 2 Hits (1:2 RR)**: 28 / 137 **(20.44%)**
* **Stop Loss Hits**: 67 / 137 **(48.91%)**
* **EOD Exits (Flat/Time out)**: 42 / 137 **(30.66%)**

### 3. Decision Recommendation
**Recommendation: Use HPS as a Secondary Filter/Tie-Breaker for IB.**

**Reasoning:**
1. **Low Win-Rate on Raw HPS:** The pure ORB win-rate on HPS is poor (43% T1, 20% T2), meaning the category alone does not contain enough intraday momentum edge to trade blindly.
2. **High Overlap:** Due to the 53.6% overlap with `INTRADAY_BOOST`, `HIGH_POWERED_STOCKS` is largely redundant. 
3. **Action Items:**
    * Do not create a separate autonomous strategy for `HIGH_POWERED_STOCKS`.
    * Instead, update the `INTRADAY_BOOST` scoring algorithm. If a stock triggers an IB signal *and* is simultaneously found in the HPS category for that day, boost its `confidenceScore` by +15 points.
    * This treats HPS as a "Trend Strength Indicator" rather than a standalone entry condition.

---

## Category: MULTI_RESISTANCE_BO & MULTI_SUPPORT_BO

### 1. Multi-Timeframe Analysis
These categories identify stocks breaking a 2-day high (Resistance) or 2-day low (Support). An analysis was run on the cached daily data to verify genuine closing breakouts and measure the price action over the following 10 days.

* **MULTI_RESISTANCE_BO (Genuine Breakouts)**: 21 setups
  * **Held above breakout at Day 1**: 76.2%
  * **Held above breakout at Day 3**: 52.4%
  * **Held above breakout at Day 5**: 57.1%
  * **Average Max Favorable Excursion (MFE)**: 2.67%
  * **Average Max Adverse Excursion (MAE)**: 3.85%
  * **1:1 RR Win Rate (Target = Stop distance)**: **33.3%**

* **MULTI_SUPPORT_BO (Genuine Breakdowns)**: 36 setups
  * **Held below breakdown at Day 1**: 69.4%
  * **Held below breakdown at Day 3**: 58.3%
  * **Held below breakdown at Day 5**: 50.0%
  * **Average Max Favorable Excursion (MFE)**: 4.10%
  * **Average Max Adverse Excursion (MAE)**: 4.56%
  * **1:1 RR Win Rate (Target = Stop distance)**: **33.3%**

### 2. Decision Recommendation
**Recommendation: Do not deploy as standalone swing strategies.**

**Reasoning:**
1. **Atrocious Win Rate:** A 33.3% win rate at a 1:1 Risk/Reward ratio is structurally unprofitable. This indicates that 2-day highs/lows are frequently acting as liquidity sweeps (false traps) rather than genuine continuation momentum.
2. **Negative Skew:** For RE_BO, the average adverse move (3.85%) is worse than the average favorable move (2.67%), meaning the drawdowns exceed the upside potential on average over a 10-day hold.
3. If they are traded, they must be combined with extreme filtering (like Weekly Uptrend combined with strong Nifty alignment) or used purely as intraday quick-hit setups rather than multi-day swing holds.

---

## Category: LOM_INTRA (Loss of Momentum Intraday)

### 1. Reversal Setup Analysis (15-Minute RSI Divergence)
These categories scan for intraday exhaustion (overbought/oversold momentum fading). We applied a 15-minute timeframe RSI divergence check to confirm reversals.

* **UPSIDE_LOM_INTRA (Bearish Reversal attempts)**
  * **Total Scanned**: 339
  * **False Signal Rate (No 15m Divergence formed)**: 38.9%
  * **Valid Divergences Tracked**: 207
  * **Stop Out Rate**: 92.3%
  * **Target 1 Hits (1:1)**: 12.6%

* **DOWNSIDE_LOM_INTRA (Bullish Reversal attempts)**
  * **Total Scanned**: 191
  * **False Signal Rate (No 15m Divergence formed)**: 47.6%
  * **Valid Divergences Tracked**: 100
  * **Stop Out Rate**: 92.0%
  * **Target 1 Hits (1:1)**: 12.0%

### 2. Decision Recommendation
**Recommendation: Completely scrap LOM_INTRA strategies.**

**Reasoning:**
1. **Massive Failure Rate:** A 92% stop-out rate proves that attempting to fade strong intraday momentum using 15-minute divergence is structurally flawed in this systematic approach. The "Loss of momentum" flagged by the scanner usually just results in a minor consolidation before trend continuation, hunting the reversal stops.
2. **High Scanner Noise:** Nearly 40-50% of scanner results don't even manage to form a localized 15-minute divergence structure.
3. Trying to pick intraday tops and bottoms against an established trend generates severe systemic losses.

---

## Category: LOM_SWING (Loss of Momentum Swing)

### 1. Multi-Day Reversal Analysis (1-Hour RSI Divergence)
These categories scan for swing exhaustion. We synthesized 1-hour candles from 30-minute data to identify genuine 1-hour RSI divergences, tracking the outcome over the next 10 daily sessions.

* **UPSIDE_LOM_SWING (Bearish Reversal Attempts)**
  * **Total Scanned**: 297
  * **1-Hour Divergences Triggered**: 21 (7.1% Trigger Rate)
  * **1:1 RR Win Rate**: 57.1%
  * **Avg MFE (10-Day)**: 2.75%
  * **Avg MAE (10-Day)**: 4.18%
  
* **DOWNSIDE_LOM_SWING (Bullish Reversal Attempts)**
  * **Total Scanned**: 117
  * **1-Hour Divergences Triggered**: 4 (3.4% Trigger Rate)
  * **1:1 RR Win Rate**: 0.0%
  * **Avg MFE (10-Day)**: 0.51%
  * **Avg MAE (10-Day)**: 8.40%

### 2. Decision Recommendation
**Recommendation: Do not deploy as standalone mean reversion strategies.**

**Reasoning:**
1. **Extremely Low Trigger Rate:** Barely 3-7% of scanned stocks actually exhibit a valid 1-hour RSI divergence on the breakout day.
2. **Broken Mechanics (Downside):** `DOWNSIDE_LOM_SWING` is entirely broken (0% win rate).
3. **Negative Skew (Upside):** `UPSIDE_LOM_SWING` has a technically positive 1:1 win rate (57%), but the adverse excursions (MAE 4.18%) widely exceed the favorable excursions (MFE 2.75%).

---

## DEEP RESEARCH: Combinatorial Factor Analysis (V5.1)

Based on the Deep Research Framework, we abandoned single-variable testing and processed **3,630** stock-day events through a matrix of **50+ technical and contextual factors** to identify high-edge combinations. The baseline win-rate for all unfiltered breakouts was **26.9%**.

### 1. Top Single-Factor Edges
When tested in isolation, these overarching criteria provided the largest statistical edge over the baseline:
* **PS_PRICE (100-300 range)**: +13.0% edge (39.9% WR)
* **D_STACK (BULL_STACK - 20>50>200 EMA)**: +5.5% edge (32.4% WR)
* **W_EMA20 (Above Weekly 20 EMA)**: +4.3% edge (31.2% WR)
* **D_RSI_ZONE (HEALTHY 50-70 zone)**: +3.0% edge (29.9% WR)

### 2. Top "Golden" Combinations (Multi-Factor Confluence)
By testing all 2-factor and 3-factor permutations of the highest-edge indicators, we discovered specific confluences that radically outperform the baseline. 

**WIN RATE: 57.1% (Massive Edge)**
* **Rules**: `D_STACK=BULL_STACK` + `PS_GAP=>1%` + `PS_2DAYH=TRUE`
* **Translation**: The stock must be in full Daily Bullish EMA Stack (20>50>200), must gap up more than 1% on the day, and must break a legitimate 2-day high on the close.
* **Why it works**: This aligns long-term directional moving average momentum with immediate intraday gap strength and structural breakout confirmation.

**WIN RATE: 51.4% (Strong Edge)**
* **Rules**: `D_STACK=BULL_STACK` + `PS_GAP=>1%` + `D_TREND=UPTREND`
* **Translation**: Full Daily Bullish EMA Stack, gap up >1%, and a daily chart showing a structural Higher-High / Higher-Low sequence.

**WIN RATE: 49.2% (Solid Edge)**
* **Rules**: `W_EMA20=ABOVE` + `PS_GAP=>1%` + `PS_2DAYH=TRUE`
* **Translation**: Weekly timeframe bullishness (Above 20 EMA), closing above the 2-day high, initialized by a gap up over 1%.

### 3. Paradigm Shift Conclusion
The categories like `MULTI_RESISTANCE_BO` are not fundamentally broken; they are simply **unfiltered**. Our initial test of 33% WR on `MULTI_RESISTANCE_BO` perfectly aligns with the raw baseline. 

However, by requiring the stock to be in a `BULL_STACK` and exhibit `>1% GAP` strength, the win rate for these 2-day high breakouts skyrockets to **57.1%**. 

**Actionable Next Step for CTS V5:**
Instead of trading raw scanner outputs, the system must deploy these specific 3-factor algorithms as **hard filters** before confirming a signal.
