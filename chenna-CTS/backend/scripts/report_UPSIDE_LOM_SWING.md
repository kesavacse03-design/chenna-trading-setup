# BRUTAL RE-EXAMINATION: UPSIDE_LOM_SWING

Total Permutation Rows: 576 (Setups: 192)

## TABLE 3: ENTRY METHOD COMPARISON (Swing Stop, 1:2 R:R)

| Entry Method | Sample | Win Rate | Expected Value |
|---|---|---|---|
| CHASE | 192 | 17.7% | -0.34R |
| NEXT_OPEN | 191 | 17.8% | -0.32R |
| RETEST | 170 | 12.9% | -0.50R |

## TABLE 2: OPTIMAL RISK/REWARD (Using Entry: NEXT_OPEN)

### Stop Type: SWING

| R:R Ratio | Win Rate | Expected Value |
|---|---|---|
| 1:1 | 24.6% | -0.43R |
| 1:2 | 17.8% | -0.32R |
| 1:3 | 12.6% | -0.30R |
| 1:4 | 8.4% | -0.35R |
### Stop Type: ATR

| R:R Ratio | Win Rate | Expected Value |
|---|---|---|
| 1:1 | 27.6% | -0.07R |
| 1:2 | 6.3% | -0.22R |
| 1:3 | 1.0% | -0.31R |
| 1:4 | 0.5% | -0.32R |

## TABLE 4: OPTIMAL HOLDING PERIOD (Entry: NEXT_OPEN)

| Day | Avg M2M Return |
|---|---|
| Day 1 | -0.17% |
| Day 3 | -0.11% |
| Day 5 | +0.42% |
| Day 10 | -0.24% |

## TABLE 1: FACTOR RANKINGS BY EDGE

(Using **NEXT_OPEN** Entry, **ATR** Stop, **1:1** R/R. Baseline EV: **-0.07R**)

| Factor | Best Value | EV Edge | EV | Win Rate | Sample |
|---|---|---|---|---|---|
| D_STACK | BULL_STACK | +0.60R | +0.14R | 37.6% | 93 |
| W_EMA20 | ABOVE | +0.44R | +0.02R | 31.2% | 154 |
| VOL_BUILDUP | Normal Vol | +0.37R | 0.00R | 28.7% | 157 |
| VCP_SCORE | >=2 | +0.30R | +0.18R | 35.3% | 34 |
| MACD_HIST | Positive | +0.25R | -0.05R | 27.4% | 175 |
| ACCUM | <2 | +0.23R | -0.05R | 28.2% | 174 |
| TOUCH_COUNT | >=2 | +0.19R | 0.00R | 29.5% | 122 |
| NR7 | TRUE | +0.14R | +0.06R | 31.3% | 16 |
| BO_VOL_RATIO | Normal Vol | +0.13R | -0.04R | 26.1% | 157 |
| RSI2 | Neutral | +0.11R | -0.01R | 30.3% | 122 |
| LEVEL_AGE | >10 Days | +0.08R | 0.00R | 35.3% | 34 |
| BO_N_DAY | >10 Days | +0.07R | -0.03R | 24.7% | 73 |
| MACD_HIST_SLOPE | RISING | +0.05R | -0.05R | 29.7% | 111 |
| NR4 | TRUE | +0.05R | -0.03R | 27.8% | 36 |
| PS_GAP | Negative | +0.02R | -0.05R | 28.4% | 74 |
| INSIDER | FALSE | +0.00R | -0.05R | 28.0% | 189 |
| INSIDER_NR7 | FALSE | +0.00R | -0.07R | 27.6% | 192 |
| ATR_CONTRACT | Expanding | +0.00R | -0.04R | 28.6% | 182 |
| RSI2_CUM | Positive | +0.00R | -0.07R | 27.6% | 192 |
| STOCH_RSI | Positive | +0.00R | -0.04R | 28.0% | 182 |

## TABLE 5: BEST "GOLDEN" COMBINATIONS

| Golden Combination Rules | Expected Value | Win Rate | Sample |
|---|---|---|---|
| VCP_SCORE=>=2 + ACCUM=<2 | +0.27R | 36.7% | 30 |
| W_EMA20=ABOVE + VCP_SCORE=>=2 | +0.22R | 37.5% | 32 |
| D_STACK=BULL_STACK + VCP_SCORE=>=2 | +0.22R | 34.8% | 23 |
| D_STACK=BULL_STACK + MACD_HIST=Positive | +0.19R | 38.1% | 84 |
| VCP_SCORE=>=2 + TOUCH_COUNT=>=2 | +0.19R | 33.3% | 21 |
| VCP_SCORE=>=2 + MACD_HIST=Positive | +0.19R | 34.4% | 32 |
| D_STACK=BULL_STACK + VOL_BUILDUP=Normal Vol | +0.17R | 38.3% | 81 |
| VOL_BUILDUP=Normal Vol + VCP_SCORE=>=2 | +0.17R | 31.0% | 29 |
| D_STACK=BULL_STACK + TOUCH_COUNT=>=2 | +0.16R | 38.1% | 63 |
| D_STACK=BULL_STACK + ACCUM=<2 | +0.15R | 38.1% | 84 |
