# BRUTAL RE-EXAMINATION: LONG_TERM_SWING_BO_DOWN

Total Permutation Rows: 399 (Setups: 133)

## TABLE 3: ENTRY METHOD COMPARISON (Swing Stop, 1:2 R:R)

| Entry Method | Sample | Win Rate | Expected Value |
|---|---|---|---|
| CHASE | 133 | 21.1% | -0.32R |
| NEXT_OPEN | 133 | 15.8% | -0.41R |
| RETEST | 132 | 6.1% | -0.62R |

## TABLE 2: OPTIMAL RISK/REWARD (Using Entry: CHASE)

### Stop Type: SWING

| R:R Ratio | Win Rate | Expected Value |
|---|---|---|
| 1:1 | 24.1% | -0.50R |
| 1:2 | 21.1% | -0.32R |
| 1:3 | 18.0% | -0.20R |
| 1:4 | 12.8% | -0.23R |
### Stop Type: ATR

| R:R Ratio | Win Rate | Expected Value |
|---|---|---|
| 1:1 | 35.3% | -0.12R |
| 1:2 | 20.3% | -0.07R |
| 1:3 | 7.5% | -0.25R |
| 1:4 | 1.5% | -0.41R |

## TABLE 4: OPTIMAL HOLDING PERIOD (Entry: CHASE)

| Day | Avg M2M Return |
|---|---|
| Day 1 | +0.04% |
| Day 3 | +0.73% |
| Day 5 | +0.23% |
| Day 10 | +0.15% |

## TABLE 1: FACTOR RANKINGS BY EDGE

(Using **CHASE** Entry, **ATR** Stop, **1:2** R/R. Baseline EV: **-0.07R**)

| Factor | Best Value | EV Edge | EV | Win Rate | Sample |
|---|---|---|---|---|---|
| STOCH_RSI | Positive | +0.61R | +0.25R | 30.8% | 65 |
| VOL_BUILDUP | Normal Vol | +0.51R | +0.07R | 25.0% | 96 |
| RSI2 | Neutral | +0.50R | +0.18R | 29.4% | 68 |
| MACD_HIST_SLOPE | RISING | +0.49R | +0.29R | 32.4% | 34 |
| TOUCH_COUNT | >=2 | +0.41R | +0.04R | 22.4% | 98 |
| BO_VOL_RATIO | Normal Vol | +0.38R | +0.09R | 25.3% | 79 |
| PS_GAP | Positive | +0.36R | +0.15R | 26.9% | 52 |
| D_STACK | BEAR_STACK | +0.22R | -0.04R | 17.6% | 74 |
| ACCUM | <2 | +0.11R | -0.05R | 21.9% | 114 |
| LEVEL_AGE | <10 Days | +0.05R | -0.06R | 21.0% | 105 |
| NR7 | FALSE | +0.00R | -0.04R | 21.1% | 128 |
| NR4 | FALSE | +0.00R | -0.01R | 21.8% | 119 |
| INSIDER | FALSE | +0.00R | -0.06R | 20.5% | 132 |
| INSIDER_NR7 | FALSE | +0.00R | -0.07R | 20.3% | 133 |
| VCP_SCORE | <2 | +0.00R | -0.06R | 20.5% | 127 |
| ATR_CONTRACT | Expanding | +0.00R | -0.10R | 18.9% | 127 |
| BO_N_DAY | <10 Days | +0.00R | -0.07R | 20.3% | 133 |
| RSI2_CUM | Positive | +0.00R | -0.07R | 20.3% | 133 |
| MACD_HIST | Negative | +0.00R | -0.09R | 18.5% | 119 |
| W_EMA20 | BELOW | +0.00R | -0.09R | 18.7% | 123 |

## TABLE 5: BEST "GOLDEN" COMBINATIONS

| Golden Combination Rules | Expected Value | Win Rate | Sample |
|---|---|---|---|
| MACD_HIST_SLOPE=RISING + PS_GAP=Positive | +0.53R | 40.0% | 15 |
| RSI2=Neutral + PS_GAP=Positive | +0.50R | 36.7% | 30 |
| RSI2=Neutral + MACD_HIST_SLOPE=RISING | +0.46R | 35.7% | 28 |
| STOCH_RSI=Positive + PS_GAP=Positive | +0.41R | 34.5% | 29 |
| MACD_HIST_SLOPE=RISING + TOUCH_COUNT=>=2 | +0.38R | 34.5% | 29 |
| STOCH_RSI=Positive + MACD_HIST_SLOPE=RISING | +0.37R | 33.3% | 30 |
| RSI2=Neutral + BO_VOL_RATIO=Normal Vol | +0.36R | 34.1% | 44 |
| STOCH_RSI=Positive + BO_VOL_RATIO=Normal Vol | +0.36R | 34.0% | 47 |
| STOCH_RSI=Positive + RSI2=Neutral | +0.36R | 34.0% | 53 |
| MACD_HIST_SLOPE=RISING + BO_VOL_RATIO=Normal Vol | +0.35R | 34.6% | 26 |
