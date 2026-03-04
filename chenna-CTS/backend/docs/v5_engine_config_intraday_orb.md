# CTS V5 Engine Configuration: INTRADAY ORB (INTRADAY_BOOST)

## Overview
Status: **LOCKED FOR MODULE 2 DEVELOPMENT**
Category: `INTRADAY_BOOST`
Archetype: High-Win Rate Intraday Income Engine (Retest + Momentum Runners)

## 1. Core Mechanics & Definitions

### The Opening Range (OR)
- **Definition:** The high and low of the very first 30-minute candle of the day (09:15 to 09:45).
- **Setup Window:** We only look for breakouts that occur *between* 09:45 and 12:00. Breakouts occurring after 12:00 are strictly ignored (0% historical edge).

### The Breakout (Trigger)
- **Condition:** A subsequent 30-minute candle closes entirely outside the Opening Range. (Close > OR High for LONG; Close < OR Low for SHORT).
- **Volume Filter:** Breakout candle volume must not exceed 2x the 20-day Average Daily Volume. (Mega volume is a retail exhaustion trap).
- **Directional Bias:** Shorts are mathematically superior to Longs in the `INTRADAY_BOOST` category.

### Early Warning System (Setup Forming)
- If the 30-minute candle *prior* to a breakout presses within `0.3%` of the OR boundary, the system will trigger a "SETUP FORMING" alert. (Historically, 100% of these 0.3% proximity instances resulted in a breakout on the very next candle, giving the user 30 minutes of prep time).

## 2. Two Distinct Entry Types

### A. The Retest-and-Hold Entry (Primary)
- **Mechanic:** The price breaks out, then pulls back to *touch/retest* the exact OR boundary. 
- **Execution:** The user places a limit order exactly at the OR boundary immediately after the breakout candle closes.
- **Validation:** 70% of retests occur on the *very next* 30-minute candle, affording the user ample time to set the limit order.
- **Stop Runs:** If the 30-minute retest candle pierces the Stop Loss before it closes, the trade is dead. (The limit order will get filled and stopped out in reality; 29% of apparent 'holds' are actually intra-candle stops).

### B. The Runner Entry (Momentum)
- **Mechanic:** The price breaks out and *never* returns to retest the OR boundary.
- **Execution:** The user enters via market order at the OPEN of the candle following the breakout.
- **Validation:** Historically, the momentum is so strong that entering at the subsequent open incurs an average slippage of only `0.015%`, and Short Runners still yield an 83% Win Rate despite the slippage.

## 3. Risk Management & Targeting

### The Breakout Candle Stop (Stop C)
- **Placement:** The hard Stop Loss is placed precisely at the extreme of the *Breakout Candle*.
  - For LONG: The Low of the Breakout Candle.
  - For SHORT: The High of the Breakout Candle.
- **Minimum Distance:** The stop must be a minimum of `0.5%` away from the Entry Price to prevent micro-whipsaws.

### Targets
- **T1 (Primary):** `1:1 R:R` based on the exact distance between Entry and the Breakout Candle Stop.
- **T2 (Secondary):** `1:2 R:R`.
- **EOD Drift:** If neither T1 nor Stop is hit by 15:15, the position is closed at market price (Drift).

## 4. The 100-Point Confidence Score (Validated)
To maximize ROI, signals are scored out of 100 based on 5 parameters exhibiting >10% win rate deltas.

**Factor 1: Master Alignment (Sector + NIFTY) [Max 45]**
- `Sector & NIFTY Aligned`: **45 pts** (+15 pts if Sector > 0.5% Mega Trend)
- `Sector Aligned, NIFTY Opposite`: **30 pts**
- `NIFTY Aligned, Sector Opposite`: **20 pts**
- *(Sector Alignment provides a massive 25.6% WR edge over trading against the sector).*

**Factor 2: Sector Mega Trend Magnitude [Max 15]**
- `Sector Index actively > 0.5% in Breakout Direction`: **15 pts**
- `Sector Index flat / opposing`: **0 pts**
- *(Going short while NIFTY Sector is down >0.5% hit an incredible 83.5% WR).*

**Factor 3: Previous Day Volatility [Max 15]**
- `Prev day range > 2.0%`: **15 pts** (72.3% WR)
- `Prev day range 1.0% - 2.0%`: **5 pts**
- `Prev day range < 1.0%`: **0 pts** (57.1% WR weakness)
- *(INVERSED FACTOR: Tight prior days do not yield momentum. Volatile prior days provide continuation fuel).*

**Factor 4: ORB Range Size [Max 10]**
- `ORB Candle Range > 1.0%`: **10 pts** (73.9% WR)
- `ORB Candle Range 0.5% - 1.0%`: **5 pts**
- `ORB Candle Range < 0.5%`: **0 pts** (47.4% WR weakness)
- *(INVERSED FACTOR: The 'Tight Coil' theory died purely on 1:1 R:R validated data across 626 actual setups. Large authoritative OR candles with heavy institutional footprint provide continuation. Tiny consolidations lead to traps).*

## 5. Validated Tier Thresholds
The new 100-point model creates perfectly monotonic execution tiers calibrated explicitly to a 1.0 R:R (1:1 Ratio) stop loss model based on 626 mathematically verified occurrences:

- **Tier 1 (95 - 100 points):** Elite Setup | **80.5% Win Rate** (Top 29% of Triggers)
- **Tier 2 (65 - 94 points):** Standard Setup | **76.2% Win Rate** (Middle 35% of Triggers)
- **Tier 3 (0 - 64 points):** Subpar / Avoid | **50.9% Win Rate** (Bottom 35% of Triggers)

*(Note: Target ~20% limit for Tier 1 entry extraction explicitly isolating the Macro-Sector aligned trends).*
