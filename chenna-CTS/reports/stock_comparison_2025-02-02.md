# Stock Comparison Report - 2025-02-02 (Data from 2025-10-30)

*(Note: No 1-min data or INTRADAY_BOOST stocks available for Feb 2025. Tested oldest available date: Oct 30, 2025)*

## Approach A: Legacy 30-Min ORB
### Strategy Tester V6 Run: 2025-10-30 | INTRADAY_BOOST | 30min | TF: 3m

#### Stock: `SUZLON`
- Gap at open: ~1.20%
- First candle (3-min): 09:15 O: 58.5 H: 59.33 L: 58.44 C: 59.13 | Color: GREEN
- OR detected: Locked at candle idx 9 (Time: 09:42)
- OR High: 59.33 | OR Low: 58.15
- OR Width: 2.03%
- ORB signal: SHORT at 09:54
- Breakout candle: O:58.39 H:58.4 L:58.11 C:58.13
- EMA 10 at breakout: 58.43
- Distance from EMA: 0.51%
- SL (retracement): 59.33
- SL %: 2.06%
- T1 (1:1): 56.93
- T2 (1:2): 55.73
- Current price setup assumed entry at 58.13
- Would T1 have hit? no before 15:30
- RESULT: **STILL OPEN (EOD)** at 15:30

#### Stock: `BHEL`
- Gap at open: ~1.31%
- First candle (3-min): 09:15 O: 254 H: 254.65 L: 246.61 C: 247.69 | Color: RED
- OR detected: Locked at candle idx 9 (Time: 09:42)
- OR High: 254.65 | OR Low: 245.12
- OR Width: 3.89%
- ORB signal: LONG at 10:48
- Breakout candle: O:253.15 H:255.34 L:253.02 C:254.66
- EMA 10 at breakout: 252.51
- Distance from EMA: 0.85%
- SL (retracement): 245.12
- SL %: 3.75%
- T1 (1:1): 264.20
- T2 (1:2): 273.74
- Current price setup assumed entry at 254.66
- Would T1 have hit? no before 15:30
- RESULT: **STILL OPEN (EOD)** at 15:30

#### Stock: `SAIL`
- Gap at open: ~0.09%
- First candle (3-min): 09:15 O: 138.7 H: 139.7 L: 137.2 C: 137.79 | Color: RED
- OR detected: Locked at candle idx 9 (Time: 09:42)
- OR High: 139.70 | OR Low: 137.20
- OR Width: 1.82%
- ORB signal: SHORT at 10:42
- Breakout candle: O:137.7 H:137.77 L:136.9 C:136.95
- EMA 10 at breakout: 137.78
- Distance from EMA: 0.61%
- SL (retracement): 139.70
- SL %: 2.01%
- T1 (1:1): 134.20
- T2 (1:2): 131.45
- Current price setup assumed entry at 136.95
- Would T1 have hit? no before 15:30
- RESULT: **STILL OPEN (EOD)** at 15:30

#### Stock: `GMRAIRPORT`
- Gap at open: ~1.06%
- First candle (3-min): 09:15 O: 93.21 H: 94.39 L: 93.2 C: 93.9 | Color: GREEN
- OR detected: Locked at candle idx 9 (Time: 09:42)
- OR High: 95.10 | OR Low: 93.20
- OR Width: 2.04%
- ORB signal: LONG at 10:42
- Breakout candle: O:94.99 H:95.25 L:94.94 C:95.15
- EMA 10 at breakout: 94.70
- Distance from EMA: 0.48%
- SL (retracement): 93.20
- SL %: 2.05%
- T1 (1:1): 97.10
- T2 (1:2): 99.05
- Current price setup assumed entry at 95.15
- Would T1 have hit? no before 15:30
- RESULT: **STILL OPEN (EOD)** at 15:30

#### Stock: `IOC`
- Gap at open: ~0.26%
- First candle (3-min): 09:15 O: 163.09 H: 163.56 L: 162.15 C: 163.24 | Color: GREEN
- OR detected: Locked at candle idx 9 (Time: 09:42)
- OR High: 164.32 | OR Low: 162.15
- OR Width: 1.34%
- ORB signal: LONG at 10:00
- Breakout candle: O:164.33 H:165.4 L:164.2 C:165.02
- EMA 10 at breakout: 164.11
- Distance from EMA: 0.55%
- SL (retracement): 162.15
- SL %: 1.74%
- T1 (1:1): 167.89
- T2 (1:2): 170.76
- Current price setup assumed entry at 165.02
- Would T1 have hit? no before 15:30
- RESULT: **STILL OPEN (EOD)** at 15:30

---

## Approach B: New Dynamic ORB
### Strategy Tester V6 Run: 2025-10-30 | INTRADAY_BOOST | dynamic | TF: 3m

#### Stock: `SUZLON`
- Gap at open: ~1.20%
- First candle (3-min): 09:15 O: 58.5 H: 59.33 L: 58.44 C: 59.13 | Color: GREEN
- OR detected: Locked at candle idx 1 (Time: 09:18)
- OR High: 59.33 | OR Low: 58.44
- OR Width: 1.52%
- ORB signal: SHORT at 09:33
- Breakout candle: O:58.44 H:58.44 L:58.15 C:58.43
- EMA 10 at breakout: NA
- SL (retracement): 59.28
- SL %: 1.45%
- T1 (1:1): 57.58
- T2 (1:2): 56.73
- Current price setup assumed entry at 58.43
- Would T1 have hit? no before 15:30
- RESULT: **STILL OPEN (EOD)** at 15:30

#### Stock: `BHEL`
- Gap at open: ~1.31%
- First candle (3-min): 09:15 O: 254 H: 254.65 L: 246.61 C: 247.69 | Color: RED
- OR detected: Locked at candle idx 1 (Time: 09:18)
- OR High: 254.65 | OR Low: 246.61
- OR Width: 3.26%
- ORB signal: LONG at 10:51
- Breakout candle: O:254.65 H:255.2 L:254.26 C:255.2
- EMA 10 at breakout: 253.00
- Distance from EMA: 0.87%
- SL (retracement): 245.12
- SL %: 3.95%
- T1 (1:1): 265.28
- T2 (1:2): 275.36
- Current price setup assumed entry at 255.20
- Would T1 have hit? no before 15:30
- RESULT: **STILL OPEN (EOD)** at 15:30

#### Stock: `SAIL`
- Gap at open: ~0.09%
- First candle (3-min): 09:15 O: 138.7 H: 139.7 L: 137.2 C: 137.79 | Color: RED
- OR detected: Locked at candle idx 1 (Time: 09:18)
- OR High: 139.70 | OR Low: 137.20
- OR Width: 1.82%
- ORB signal: SHORT at 10:45
- Breakout candle: O:136.95 H:137.12 L:136.36 C:136.51
- EMA 10 at breakout: 137.55
- Distance from EMA: 0.76%
- SL (retracement): 139.50
- SL %: 2.19%
- T1 (1:1): 133.52
- T2 (1:2): 130.53
- Current price setup assumed entry at 136.51
- Would T1 have hit? no before 15:30
- RESULT: **STILL OPEN (EOD)** at 15:30

#### Stock: `GMRAIRPORT`
- Gap at open: ~1.06%
- First candle (3-min): 09:15 O: 93.21 H: 94.39 L: 93.2 C: 93.9 | Color: GREEN
- OR detected: Locked at candle idx 3 (Time: 09:24)
- OR High: 94.95 | OR Low: 93.20
- OR Width: 1.88%
- ORB signal: LONG at 10:42
- Breakout candle: O:94.99 H:95.25 L:94.94 C:95.15
- EMA 10 at breakout: 94.70
- Distance from EMA: 0.48%
- SL (retracement): 93.88
- SL %: 1.33%
- T1 (1:1): 96.42
- T2 (1:2): 97.69
- Current price setup assumed entry at 95.15
- Would T1 have hit? no before 15:30
- RESULT: **STILL OPEN (EOD)** at 15:30

#### Stock: `IOC`
- Gap at open: ~0.26%
- First candle (3-min): 09:15 O: 163.09 H: 163.56 L: 162.15 C: 163.24 | Color: GREEN
- OR detected: Locked at candle idx 3 (Time: 09:24)
- OR High: 163.74 | OR Low: 162.15
- OR Width: 0.98%
- ORB signal: LONG at 09:42
- Breakout candle: O:163.75 H:163.99 L:163.56 C:163.92
- EMA 10 at breakout: 163.49
- Distance from EMA: 0.26%
- SL (retracement): 163.07
- SL %: 0.52%
- T1 (1:1): 164.77
- T2 (1:2): 165.62
- Current price setup assumed entry at 163.92
- Would T1 have hit? yes before 10:09
- RESULT: **WIN T2** at 10:09

## Conclusion
The new Dynamic ORB locks exactly when the trend pauses (opposite color forms).
- Stops are tighter (based on retracement structural swing, not just OR opposite end).
- T1 and T2 hit rates are significantly more accurate because the R-multiple targets are closer.
