# BRUTAL RE-EXAMINATION: LONG_TERM_SWING_BO_UP

Total Permutation Rows: 354 (Setups: 118)

## TABLE 3: ENTRY METHOD COMPARISON (Swing Stop, 1:2 R:R)

| Entry Method | Sample | Win Rate | Expected Value |
|---|---|---|---|
| CHASE | 118 | 16.1% | -0.27R |
| NEXT_OPEN | 117 | 12.8% | -0.33R |
| RETEST | 90 | 14.4% | -0.43R |

## TABLE 2: OPTIMAL RISK/REWARD (Using Entry: CHASE)

### Stop Type: SWING

| R:R Ratio | Win Rate | Expected Value |
|---|---|---|
| 1:1 | 28.0% | -0.31R |
| 1:2 | 16.1% | -0.27R |
| 1:3 | 11.0% | -0.26R |
| 1:4 | 6.8% | -0.32R |
### Stop Type: ATR

| R:R Ratio | Win Rate | Expected Value |
|---|---|---|
| 1:1 | 29.7% | -0.03R |
| 1:2 | 7.6% | -0.17R |
| 1:3 | 0.8% | -0.30R |
| 1:4 | 0.0% | -0.32R |

## TABLE 4: OPTIMAL HOLDING PERIOD (Entry: CHASE)

| Day | Avg M2M Return |
|---|---|
| Day 1 | -0.11% |
| Day 3 | -0.12% |
| Day 5 | +0.06% |
| Day 10 | +0.18% |

## TABLE 1: FACTOR RANKINGS BY EDGE

(Using **CHASE** Entry, **ATR** Stop, **1:1** R/R. Baseline EV: **-0.03R**)

| Factor | Best Value | EV Edge | EV | Win Rate | Sample |
|---|---|---|---|---|---|
| NR4 | FALSE | +0.38R | +0.03R | 31.7% | 101 |
| D_STACK | BULL_STACK | +0.36R | +0.09R | 34.6% | 78 |
| MACD_HIST | Positive | +0.28R | +0.02R | 29.3% | 99 |
| TOUCH_COUNT | >=2 | +0.23R | +0.05R | 32.5% | 80 |
| VOL_BUILDUP | Normal Vol | +0.20R | +0.04R | 29.6% | 81 |
| LEVEL_AGE | >10 Days | +0.13R | +0.07R | 44.4% | 27 |
| VCP_SCORE | >=2 | +0.10R | +0.06R | 31.3% | 16 |
| BO_VOL_RATIO | High Vol | +0.08R | +0.02R | 38.6% | 44 |
| MACD_HIST_SLOPE | FALLING | +0.08R | +0.03R | 30.6% | 36 |
| BO_N_DAY | >10 Days | +0.06R | 0.00R | 25.7% | 70 |
| ACCUM | <2 | +0.05R | -0.02R | 29.1% | 103 |
| PS_GAP | Positive | +0.03R | -0.01R | 31.6% | 76 |
| RSI2 | Neutral | +0.02R | +0.02R | 33.9% | 59 |
| NR7 | FALSE | +0.00R | -0.03R | 29.5% | 112 |
| INSIDER | FALSE | +0.00R | -0.01R | 30.2% | 116 |
| INSIDER_NR7 | FALSE | +0.00R | -0.03R | 29.7% | 118 |
| ATR_CONTRACT | Expanding | +0.00R | -0.02R | 29.6% | 115 |
| RSI2_CUM | Positive | +0.00R | -0.03R | 29.7% | 118 |
| STOCH_RSI | Positive | +0.00R | +0.01R | 30.6% | 111 |
| W_EMA20 | ABOVE | +0.00R | +0.02R | 30.8% | 107 |

## TABLE 5: BEST "GOLDEN" COMBINATIONS

| Golden Combination Rules | Expected Value | Win Rate | Sample |
|---|---|---|---|
| D_STACK=BULL_STACK + BO_VOL_RATIO=High Vol | +0.36R | 59.1% | 22 |
| VOL_BUILDUP=Normal Vol + BO_VOL_RATIO=High Vol | +0.31R | 53.8% | 13 |
| MACD_HIST=Positive + LEVEL_AGE=>10 Days | +0.27R | 53.3% | 15 |
| VOL_BUILDUP=Normal Vol + VCP_SCORE=>=2 | +0.21R | 35.7% | 14 |
| LEVEL_AGE=>10 Days + BO_VOL_RATIO=High Vol | +0.20R | 53.3% | 15 |
| VOL_BUILDUP=Normal Vol + LEVEL_AGE=>10 Days | +0.17R | 50.0% | 18 |
| MACD_HIST=Positive + BO_VOL_RATIO=High Vol | +0.17R | 44.4% | 36 |
| TOUCH_COUNT=>=2 + BO_VOL_RATIO=High Vol | +0.15R | 50.0% | 26 |
| TOUCH_COUNT=>=2 + VCP_SCORE=>=2 | +0.14R | 35.7% | 14 |
| NR4=FALSE + D_STACK=BULL_STACK | +0.14R | 36.9% | 65 |
