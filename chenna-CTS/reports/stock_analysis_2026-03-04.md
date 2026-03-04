# Stock Analysis Report - 2026-03-04 (Data from 2026-03-02)

## Market Context (March 4, 2026)
* NIFTY 50 today: Unavailable (Used latest available IB proxy data)
* VIX: Normal / Stable
* Sectors: Mixed
*(Note: As LiveSnapshot and R-Factor data for March 4 were not populated in the DB yet, used top 5 volumetric surge proxy from March 2 latest caching)*

## Top 5 INTRADAY_BOOST Stocks
### Strategy Tester V6 Run: 2026-03-02 | INTRADAY_BOOST | dynamic | TF: 3m

#### Stock: `TMPV`
- Gap at open: ~4.15%
- First candle (3-min): 09:15 O: 358 H: 373.95 L: 355.5 C: 371.5 | Color: GREEN
- OR detected: Locked at candle idx 2 (Time: 09:21)
- OR High: 378.40 | OR Low: 355.50
- OR Width: 6.44%
- ORB signal: none

#### Stock: `MANAPPURAM`
- Gap at open: ~0.21%
- First candle (3-min): 09:15 O: 280 H: 282.45 L: 278.55 C: 281.5 | Color: GREEN
- OR detected: Locked at candle idx 2 (Time: 09:21)
- OR High: 283.85 | OR Low: 278.55
- OR Width: 1.90%
- ORB signal: LONG at 09:36
- Breakout candle: O:283.55 H:284.7 L:282.95 C:284.25
- EMA 10 at breakout: NA
- SL (retracement): 281.45
- SL %: 0.99%
- T1 (1:1): 287.05
- T2 (1:2): 289.85
- Current price setup assumed entry at 284.25
- Would T1 have hit? yes before 11:30
- RESULT: **LOSS SL** at 11:30

#### Stock: `SUNPHARMA`
- Gap at open: ~1.80%
- First candle (3-min): 09:15 O: 1712 H: 1758.4 L: 1712 C: 1738.9 | Color: GREEN
- OR detected: Locked at candle idx 1 (Time: 09:18)
- OR High: 1758.40 | OR Low: 1712.00
- OR Width: 2.71%
- ORB signal: none

#### Stock: `HINDUNILVR`
- Gap at open: ~1.32%
- First candle (3-min): 09:15 O: 2303 H: 2354 L: 2295 C: 2316.8 | Color: GREEN
- OR detected: Locked at candle idx 2 (Time: 09:21)
- OR High: 2354.00 | OR Low: 2295.00
- OR Width: 2.57%
- ORB signal: none

#### Stock: `GODREJPROP`
- Gap at open: ~2.09%
- First candle (3-min): 09:15 O: 1665.7 H: 1708.6 L: 1665.7 C: 1684.3 | Color: GREEN
- OR detected: Locked at candle idx 2 (Time: 09:21)
- OR High: 1708.60 | OR Low: 1665.70
- OR Width: 2.58%
- ORB signal: LONG at 09:42
- Breakout candle: O:1709.1 H:1711.9 L:1708 C:1709.9
- EMA 10 at breakout: 1692.00
- Distance from EMA: 1.06%
- SL (retracement): 1675.00
- SL %: 2.04%
- T1 (1:1): 1744.80
- T2 (1:2): 1779.70
- Current price setup assumed entry at 1709.90
- Would T1 have hit? no before 15:30
- RESULT: **STILL OPEN (EOD)** at 15:30

---

## Top 5 HIGH_POWERED_STOCKS
### Strategy Tester V6 Run: 2026-03-02 | HIGH_POWERED_STOCKS | dynamic | TF: 3m

#### Stock: `TMPV`
- Gap at open: ~4.15%
- First candle (3-min): 09:15 O: 358 H: 373.95 L: 355.5 C: 371.5 | Color: GREEN
- OR detected: Locked at candle idx 2 (Time: 09:21)
- OR High: 378.40 | OR Low: 355.50
- OR Width: 6.44%
- ORB signal: none

---
## Deep Analysis (What-If Scenarios)

### WHAT IF...
- **NIFTY was down 2%+ today:** We would favor short trades. INTRADAY_BOOST long signals would have lower confidence and strict 1:1 targets.
- **OR width was >2.5%:** If OR width is too large (like TMPV at 2.58%), we skip pure ORB and wait for a LEG setup closer to EMA.
- **Breakout was only 40% body:** We would skip it. The rules demand a decisive close with 50%+ of the body outside the opening range to confirm momentum.
- **EMA was far at breakout:** Risk of mean reversion is high. We wait for a pullback or look for LEG setup.
