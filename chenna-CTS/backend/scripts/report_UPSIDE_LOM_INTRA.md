# BRUTAL RE-EXAMINATION: UPSIDE_LOM_INTRA

Total Permutation Rows: 675 (Setups: 225)

## TABLE 3: ENTRY METHOD COMPARISON (Swing Stop, 1:2 R:R)

| Entry Method | Sample | Win Rate | Expected Value |
|---|---|---|---|
| CHASE | 225 | 13.3% | -0.55R |
| NEXT_OPEN | 219 | 12.3% | -0.54R |
| RETEST | 223 | 2.2% | -0.78R |

## TABLE 2: OPTIMAL RISK/REWARD (Using Entry: NEXT_OPEN)

### Stop Type: SWING

| R:R Ratio | Win Rate | Expected Value |
|---|---|---|
| 1:1 | 17.8% | -0.61R |
| 1:2 | 12.3% | -0.54R |
| 1:3 | 9.1% | -0.52R |
| 1:4 | 7.3% | -0.50R |
### Stop Type: ATR

| R:R Ratio | Win Rate | Expected Value |
|---|---|---|
| 1:1 | 24.0% | -0.12R |
| 1:2 | 6.2% | -0.23R |
| 1:3 | 3.6% | -0.25R |
| 1:4 | 0.9% | -0.32R |

## TABLE 4: OPTIMAL HOLDING PERIOD (Entry: NEXT_OPEN)

| Day | Avg M2M Return |
|---|---|
| Day 1 | +0.40% |
| Day 3 | -0.02% |
| Day 5 | -0.81% |
| Day 10 | -1.25% |

## TABLE 1: FACTOR RANKINGS BY EDGE

(Using **NEXT_OPEN** Entry, **ATR** Stop, **1:1** R/R. Baseline EV: **-0.12R**)

| Factor | Best Value | EV Edge | EV | Win Rate | Sample |
|---|---|---|---|---|---|
| NR7 | FALSE | +0.46R | -0.07R | 26.0% | 200 |
| BO_VOL_RATIO | High Vol | +0.40R | +0.17R | 40.6% | 64 |
| MACD_HIST_SLOPE | FALLING | +0.26R | +0.11R | 37.0% | 27 |
| VCP_SCORE | <2 | +0.24R | -0.08R | 26.2% | 191 |
| TOUCH_COUNT | <2 | +0.20R | +0.03R | 33.9% | 59 |
| MACD_HIST | Positive | +0.20R | -0.09R | 24.4% | 201 |
| VOL_BUILDUP | High Vol | +0.19R | +0.01R | 32.9% | 70 |
| PS_GAP | Positive | +0.13R | -0.07R | 24.1% | 137 |
| NR4 | FALSE | +0.11R | -0.09R | 25.0% | 176 |
| RSI2 | Overbought >90 | +0.11R | -0.07R | 25.0% | 112 |
| D_STACK | BEAR_STACK | +0.10R | -0.07R | 27.0% | 89 |
| LEVEL_AGE | <10 Days | +0.06R | -0.10R | 25.2% | 163 |
| ACCUM | >=2 | +0.06R | -0.06R | 18.8% | 16 |
| W_EMA20 | BELOW | +0.03R | -0.10R | 24.4% | 82 |
| INSIDER | FALSE | +0.00R | -0.12R | 23.4% | 222 |
| INSIDER_NR7 | FALSE | +0.00R | -0.11R | 24.1% | 224 |
| ATR_CONTRACT | Expanding | +0.00R | -0.12R | 24.0% | 217 |
| BO_N_DAY | <10 Days | +0.00R | -0.12R | 23.7% | 224 |
| RSI2_CUM | Positive | +0.00R | -0.12R | 24.0% | 225 |
| STOCH_RSI | Positive | +0.00R | -0.13R | 23.3% | 223 |

## TABLE 5: BEST "GOLDEN" COMBINATIONS

| Golden Combination Rules | Expected Value | Win Rate | Sample |
|---|---|---|---|
| BO_VOL_RATIO=High Vol + TOUCH_COUNT=<2 | +0.29R | 50.0% | 14 |
| BO_VOL_RATIO=High Vol + MACD_HIST=Positive | +0.20R | 41.1% | 56 |
| BO_VOL_RATIO=High Vol + VOL_BUILDUP=High Vol | +0.16R | 37.2% | 43 |
| NR7=FALSE + BO_VOL_RATIO=High Vol | +0.16R | 40.3% | 62 |
| BO_VOL_RATIO=High Vol + VCP_SCORE=<2 | +0.15R | 39.0% | 59 |
| MACD_HIST_SLOPE=FALLING + VCP_SCORE=<2 | +0.15R | 45.0% | 20 |
| TOUCH_COUNT=<2 + PS_GAP=Positive | +0.14R | 36.1% | 36 |
| NR7=FALSE + MACD_HIST_SLOPE=FALLING | +0.12R | 38.5% | 26 |
| TOUCH_COUNT=<2 + MACD_HIST=Positive | +0.10R | 36.0% | 50 |
| TOUCH_COUNT=<2 + VOL_BUILDUP=High Vol | +0.10R | 35.0% | 20 |
