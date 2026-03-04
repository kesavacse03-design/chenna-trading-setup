# BRUTAL RE-EXAMINATION: DOWNSIDE_LOM_INTRA

Total Permutation Rows: 531 (Setups: 177)

## TABLE 3: ENTRY METHOD COMPARISON (Swing Stop, 1:2 R:R)

| Entry Method | Sample | Win Rate | Expected Value |
|---|---|---|---|
| CHASE | 177 | 16.4% | -0.42R |
| NEXT_OPEN | 175 | 11.4% | -0.50R |
| RETEST | 177 | 2.8% | -0.69R |

## TABLE 2: OPTIMAL RISK/REWARD (Using Entry: CHASE)

### Stop Type: SWING

| R:R Ratio | Win Rate | Expected Value |
|---|---|---|
| 1:1 | 20.9% | -0.54R |
| 1:2 | 16.4% | -0.42R |
| 1:3 | 14.7% | -0.31R |
| 1:4 | 10.2% | -0.34R |
### Stop Type: ATR

| R:R Ratio | Win Rate | Expected Value |
|---|---|---|
| 1:1 | 25.4% | -0.17R |
| 1:2 | 10.2% | -0.22R |
| 1:3 | 2.8% | -0.34R |
| 1:4 | 0.6% | -0.40R |

## TABLE 4: OPTIMAL HOLDING PERIOD (Entry: CHASE)

| Day | Avg M2M Return |
|---|---|
| Day 1 | +0.05% |
| Day 3 | -0.21% |
| Day 5 | -0.49% |
| Day 10 | +0.07% |

## TABLE 1: FACTOR RANKINGS BY EDGE

(Using **CHASE** Entry, **ATR** Stop, **1:1** R/R. Baseline EV: **-0.17R**)

| Factor | Best Value | EV Edge | EV | Win Rate | Sample |
|---|---|---|---|---|---|
| D_STACK | BULL_STACK | +0.40R | -0.04R | 32.1% | 53 |
| TOUCH_COUNT | >=2 | +0.25R | -0.09R | 29.8% | 121 |
| NR4 | FALSE | +0.22R | -0.14R | 27.6% | 152 |
| MACD_HIST | Negative | +0.21R | -0.11R | 29.8% | 131 |
| LEVEL_AGE | >10 Days | +0.21R | -0.02R | 34.0% | 50 |
| W_EMA20 | ABOVE | +0.12R | -0.08R | 25.0% | 48 |
| ACCUM | >=2 | +0.09R | -0.09R | 36.4% | 22 |
| PS_GAP | Positive | +0.08R | -0.12R | 30.8% | 52 |
| STOCH_RSI | Positive | +0.07R | -0.14R | 26.2% | 107 |
| VCP_SCORE | <2 | +0.06R | -0.16R | 26.4% | 159 |
| BO_VOL_RATIO | High Vol | +0.05R | -0.13R | 34.8% | 46 |
| MACD_HIST_SLOPE | FALLING | +0.03R | -0.16R | 23.3% | 146 |
| RSI2 | Neutral | +0.03R | -0.15R | 25.8% | 89 |
| VOL_BUILDUP | High Vol | +0.02R | -0.16R | 28.9% | 45 |
| NR7 | FALSE | +0.00R | -0.17R | 26.3% | 167 |
| INSIDER | FALSE | +0.00R | -0.16R | 25.7% | 175 |
| INSIDER_NR7 | FALSE | +0.00R | -0.17R | 25.4% | 177 |
| ATR_CONTRACT | Expanding | +0.00R | -0.17R | 25.4% | 173 |
| BO_N_DAY | <10 Days | +0.00R | -0.16R | 25.6% | 176 |
| RSI2_CUM | Positive | +0.00R | -0.17R | 25.4% | 177 |

## TABLE 5: BEST "GOLDEN" COMBINATIONS

| Golden Combination Rules | Expected Value | Win Rate | Sample |
|---|---|---|---|
| D_STACK=BULL_STACK + LEVEL_AGE=>10 Days | +0.27R | 54.5% | 22 |
| MACD_HIST=Negative + W_EMA20=ABOVE | +0.21R | 41.7% | 24 |
| LEVEL_AGE=>10 Days + W_EMA20=ABOVE | +0.18R | 47.1% | 17 |
| D_STACK=BULL_STACK + MACD_HIST=Negative | +0.08R | 38.9% | 36 |
| D_STACK=BULL_STACK + TOUCH_COUNT=>=2 | +0.05R | 40.5% | 37 |
| MACD_HIST=Negative + LEVEL_AGE=>10 Days | +0.02R | 36.6% | 41 |
| TOUCH_COUNT=>=2 + MACD_HIST=Negative | +0.01R | 35.6% | 90 |
| D_STACK=BULL_STACK + NR4=FALSE | +0.00R | 33.3% | 48 |
| D_STACK=BULL_STACK + W_EMA20=ABOVE | +0.00R | 30.8% | 39 |
| D_STACK=BULL_STACK + PS_GAP=Positive | +0.00R | 42.9% | 14 |
