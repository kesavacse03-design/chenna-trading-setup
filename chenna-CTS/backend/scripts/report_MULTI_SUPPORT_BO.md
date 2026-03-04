# BRUTAL RE-EXAMINATION: MULTI_SUPPORT_BO

Total Permutation Rows: 114 (Setups: 38)

## TABLE 3: ENTRY METHOD COMPARISON (Swing Stop, 1:2 R:R)

| Entry Method | Sample | Win Rate | Expected Value |
|---|---|---|---|
| CHASE | 38 | 15.8% | -0.47R |
| NEXT_OPEN | 38 | 15.8% | -0.47R |
| RETEST | 31 | 6.5% | -0.77R |

## TABLE 2: OPTIMAL RISK/REWARD (Using Entry: CHASE)

### Stop Type: SWING

| R:R Ratio | Win Rate | Expected Value |
|---|---|---|
| 1:1 | 15.8% | -0.63R |
| 1:2 | 15.8% | -0.47R |
| 1:3 | 15.8% | -0.32R |
| 1:4 | 13.2% | -0.26R |
### Stop Type: ATR

| R:R Ratio | Win Rate | Expected Value |
|---|---|---|
| 1:1 | 26.3% | -0.32R |
| 1:2 | 15.8% | -0.26R |
| 1:3 | 5.3% | -0.42R |
| 1:4 | 0.0% | -0.58R |

## TABLE 4: OPTIMAL HOLDING PERIOD (Entry: CHASE)

| Day | Avg M2M Return |
|---|---|
| Day 1 | +0.35% |
| Day 3 | +0.10% |
| Day 5 | -0.83% |
| Day 10 | -0.05% |

## TABLE 1: FACTOR RANKINGS BY EDGE

(Using **CHASE** Entry, **SWING** Stop, **1:4** R/R. Baseline EV: **-0.26R**)

| Factor | Best Value | EV Edge | EV | Win Rate | Sample |
|---|---|---|---|---|---|
| W_EMA20 | BELOW | +0.63R | 0.00R | 18.2% | 22 |
| MACD_HIST | Positive | +0.26R | -0.12R | 17.6% | 17 |
| NR7 | FALSE | +0.00R | -0.20R | 14.3% | 35 |
| NR4 | FALSE | +0.00R | -0.10R | 16.1% | 31 |
| INSIDER | FALSE | +0.00R | -0.24R | 13.5% | 37 |
| INSIDER_NR7 | FALSE | +0.00R | -0.26R | 13.2% | 38 |
| VCP_SCORE | <2 | +0.00R | -0.15R | 15.2% | 33 |
| ATR_CONTRACT | Expanding | +0.00R | -0.35R | 11.8% | 34 |
| BO_N_DAY | <10 Days | +0.00R | -0.24R | 14.7% | 34 |
| TOUCH_COUNT | >=2 | +0.00R | -0.24R | 13.5% | 37 |
| LEVEL_AGE | <10 Days | +0.00R | -0.18R | 14.3% | 28 |
| RSI2 | Neutral | +0.00R | -0.38R | 12.5% | 24 |
| RSI2_CUM | Positive | +0.00R | -0.26R | 13.2% | 38 |
| STOCH_RSI | Positive | +0.00R | -0.31R | 13.8% | 29 |
| MACD_HIST_SLOPE | FALLING | +0.00R | -0.04R | 16.7% | 24 |
| VOL_BUILDUP | Normal Vol | +0.00R | -0.15R | 15.2% | 33 |
| ACCUM | <2 | +0.00R | -0.15R | 15.2% | 33 |
| BO_VOL_RATIO | Normal Vol | +0.00R | -0.18R | 15.2% | 33 |
| PS_GAP | Positive | +0.00R | -0.29R | 12.5% | 24 |

## TABLE 5: BEST "GOLDEN" COMBINATIONS

| Golden Combination Rules | Expected Value | Win Rate | Sample |
|---|---|---|---|
| MACD_HIST=Positive + NR4=FALSE | +0.25R | 25.0% | 12 |
| W_EMA20=BELOW + NR4=FALSE | +0.16R | 21.1% | 19 |
| W_EMA20=BELOW + VCP_SCORE=<2 | +0.10R | 20.0% | 20 |
| W_EMA20=BELOW + ATR_CONTRACT=Expanding | +0.10R | 20.0% | 20 |
| MACD_HIST=Positive + VCP_SCORE=<2 | +0.07R | 21.4% | 14 |
| W_EMA20=BELOW + NR7=FALSE | +0.05R | 19.0% | 21 |
| W_EMA20=BELOW + INSIDER=FALSE | +0.00R | 18.2% | 22 |
| W_EMA20=BELOW + INSIDER_NR7=FALSE | +0.00R | 18.2% | 22 |
| MACD_HIST=Positive + NR7=FALSE | +0.00R | 20.0% | 15 |
| MACD_HIST=Positive + INSIDER=FALSE | +-0.06R | 18.8% | 16 |
