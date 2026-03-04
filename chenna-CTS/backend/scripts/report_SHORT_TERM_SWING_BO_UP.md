# BRUTAL RE-EXAMINATION: SHORT_TERM_SWING_BO_UP

Total Permutation Rows: 789 (Setups: 263)

## TABLE 3: ENTRY METHOD COMPARISON (Swing Stop, 1:2 R:R)

| Entry Method | Sample | Win Rate | Expected Value |
|---|---|---|---|
| CHASE | 263 | 18.6% | -0.24R |
| NEXT_OPEN | 261 | 14.2% | -0.32R |
| RETEST | 195 | 14.9% | -0.44R |

## TABLE 2: OPTIMAL RISK/REWARD (Using Entry: CHASE)

### Stop Type: SWING

| R:R Ratio | Win Rate | Expected Value |
|---|---|---|
| 1:1 | 29.3% | -0.32R |
| 1:2 | 18.6% | -0.24R |
| 1:3 | 11.0% | -0.28R |
| 1:4 | 5.7% | -0.38R |
### Stop Type: ATR

| R:R Ratio | Win Rate | Expected Value |
|---|---|---|
| 1:1 | 30.8% | -0.01R |
| 1:2 | 10.3% | -0.11R |
| 1:3 | 2.3% | -0.25R |
| 1:4 | 0.4% | -0.30R |

## TABLE 4: OPTIMAL HOLDING PERIOD (Entry: CHASE)

| Day | Avg M2M Return |
|---|---|
| Day 1 | +0.02% |
| Day 3 | -0.05% |
| Day 5 | +0.90% |
| Day 10 | +1.36% |

## TABLE 1: FACTOR RANKINGS BY EDGE

(Using **CHASE** Entry, **ATR** Stop, **1:1** R/R. Baseline EV: **-0.01R**)

| Factor | Best Value | EV Edge | EV | Win Rate | Sample |
|---|---|---|---|---|---|
| MACD_HIST | Positive | +0.41R | +0.03R | 32.1% | 234 |
| D_STACK | BULL_STACK | +0.33R | +0.19R | 37.9% | 95 |
| VOL_BUILDUP | Normal Vol | +0.28R | +0.05R | 33.5% | 200 |
| NR7 | TRUE | +0.15R | +0.13R | 37.5% | 16 |
| RSI2 | Neutral | +0.12R | +0.04R | 32.6% | 141 |
| MACD_HIST_SLOPE | FALLING | +0.11R | +0.08R | 28.9% | 38 |
| BO_VOL_RATIO | Normal Vol | +0.10R | +0.02R | 30.3% | 178 |
| VCP_SCORE | >=2 | +0.09R | +0.07R | 31.1% | 45 |
| W_EMA20 | ABOVE | +0.08R | +0.02R | 30.8% | 172 |
| BO_N_DAY | >10 Days | +0.06R | +0.01R | 31.3% | 150 |
| LEVEL_AGE | >10 Days | +0.05R | +0.02R | 37.1% | 105 |
| ACCUM | <2 | +0.03R | -0.01R | 31.0% | 239 |
| TOUCH_COUNT | >=2 | +0.02R | -0.01R | 31.6% | 231 |
| PS_GAP | Negative | +0.02R | 0.00R | 30.2% | 86 |
| NR4 | FALSE | +0.02R | -0.01R | 31.3% | 224 |
| INSIDER | FALSE | +0.00R | -0.01R | 30.8% | 263 |
| INSIDER_NR7 | FALSE | +0.00R | -0.01R | 30.8% | 263 |
| ATR_CONTRACT | Expanding | +0.00R | +0.02R | 31.7% | 249 |
| RSI2_CUM | Positive | +0.00R | -0.01R | 30.8% | 263 |
| STOCH_RSI | Positive | +0.00R | -0.01R | 30.8% | 263 |

## TABLE 5: BEST "GOLDEN" COMBINATIONS

| Golden Combination Rules | Expected Value | Win Rate | Sample |
|---|---|---|---|
| D_STACK=BULL_STACK + MACD_HIST_SLOPE=FALLING | +0.38R | 42.9% | 21 |
| D_STACK=BULL_STACK + VCP_SCORE=>=2 | +0.29R | 38.1% | 21 |
| NR7=TRUE + VCP_SCORE=>=2 | +0.27R | 45.5% | 11 |
| MACD_HIST=Positive + D_STACK=BULL_STACK | +0.25R | 39.2% | 79 |
| D_STACK=BULL_STACK + RSI2=Neutral | +0.23R | 40.4% | 57 |
| VOL_BUILDUP=Normal Vol + NR7=TRUE | +0.21R | 42.9% | 14 |
| D_STACK=BULL_STACK + VOL_BUILDUP=Normal Vol | +0.21R | 38.5% | 78 |
| MACD_HIST=Positive + MACD_HIST_SLOPE=FALLING | +0.17R | 31.4% | 35 |
| D_STACK=BULL_STACK + BO_VOL_RATIO=Normal Vol | +0.14R | 33.3% | 72 |
| MACD_HIST=Positive + NR7=TRUE | +0.13R | 37.5% | 16 |
