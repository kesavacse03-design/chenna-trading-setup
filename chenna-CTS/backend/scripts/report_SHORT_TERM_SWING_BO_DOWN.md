# BRUTAL RE-EXAMINATION: SHORT_TERM_SWING_BO_DOWN

Total Permutation Rows: 522 (Setups: 174)

## TABLE 3: ENTRY METHOD COMPARISON (Swing Stop, 1:2 R:R)

| Entry Method | Sample | Win Rate | Expected Value |
|---|---|---|---|
| CHASE | 174 | 19.0% | -0.34R |
| NEXT_OPEN | 174 | 12.1% | -0.47R |
| RETEST | 172 | 2.3% | -0.69R |

## TABLE 2: OPTIMAL RISK/REWARD (Using Entry: CHASE)

### Stop Type: SWING

| R:R Ratio | Win Rate | Expected Value |
|---|---|---|
| 1:1 | 23.6% | -0.49R |
| 1:2 | 19.0% | -0.34R |
| 1:3 | 13.2% | -0.33R |
| 1:4 | 8.6% | -0.38R |
### Stop Type: ATR

| R:R Ratio | Win Rate | Expected Value |
|---|---|---|
| 1:1 | 29.9% | -0.09R |
| 1:2 | 13.2% | -0.12R |
| 1:3 | 4.6% | -0.25R |
| 1:4 | 0.6% | -0.36R |

## TABLE 4: OPTIMAL HOLDING PERIOD (Entry: CHASE)

| Day | Avg M2M Return |
|---|---|
| Day 1 | +0.18% |
| Day 3 | +0.81% |
| Day 5 | +0.84% |
| Day 10 | +0.40% |

## TABLE 1: FACTOR RANKINGS BY EDGE

(Using **CHASE** Entry, **ATR** Stop, **1:1** R/R. Baseline EV: **-0.09R**)

| Factor | Best Value | EV Edge | EV | Win Rate | Sample |
|---|---|---|---|---|---|
| STOCH_RSI | Positive | +0.54R | +0.18R | 45.5% | 88 |
| TOUCH_COUNT | >=2 | +0.45R | 0.00R | 34.0% | 141 |
| RSI2 | Neutral | +0.40R | +0.09R | 42.7% | 96 |
| BO_VOL_RATIO | Normal Vol | +0.34R | +0.04R | 33.9% | 112 |
| MACD_HIST_SLOPE | RISING | +0.33R | +0.18R | 54.5% | 33 |
| VOL_BUILDUP | Normal Vol | +0.33R | -0.01R | 32.6% | 132 |
| W_EMA20 | ABOVE | +0.27R | +0.12R | 46.3% | 41 |
| INSIDER | FALSE | +0.27R | -0.04R | 33.1% | 145 |
| PS_GAP | Positive | +0.23R | +0.07R | 37.9% | 58 |
| ACCUM | >=2 | +0.20R | +0.09R | 47.8% | 23 |
| MACD_HIST | Positive | +0.19R | +0.08R | 24.0% | 25 |
| D_STACK | BULL_STACK | +0.16R | -0.02R | 40.4% | 52 |
| LEVEL_AGE | >10 Days | +0.08R | -0.03R | 35.0% | 60 |
| NR4 | FALSE | +0.06R | -0.07R | 32.1% | 137 |
| NR7 | FALSE | +0.06R | -0.08R | 30.9% | 152 |
| VCP_SCORE | <2 | +0.05R | -0.08R | 30.1% | 143 |
| INSIDER_NR7 | FALSE | +0.00R | -0.07R | 31.0% | 168 |
| ATR_CONTRACT | Expanding | +0.00R | -0.10R | 30.2% | 162 |
| BO_N_DAY | <10 Days | +0.00R | -0.09R | 29.9% | 174 |
| RSI2_CUM | Positive | +0.00R | -0.09R | 29.9% | 174 |

## TABLE 5: BEST "GOLDEN" COMBINATIONS

| Golden Combination Rules | Expected Value | Win Rate | Sample |
|---|---|---|---|
| RSI2=Neutral + MACD_HIST_SLOPE=RISING | +0.34R | 62.1% | 29 |
| RSI2=Neutral + BO_VOL_RATIO=Normal Vol | +0.33R | 50.8% | 61 |
| STOCH_RSI=Positive + MACD_HIST_SLOPE=RISING | +0.30R | 60.0% | 30 |
| STOCH_RSI=Positive + W_EMA20=ABOVE | +0.28R | 56.0% | 25 |
| STOCH_RSI=Positive + BO_VOL_RATIO=Normal Vol | +0.28R | 47.5% | 61 |
| STOCH_RSI=Positive + RSI2=Neutral | +0.25R | 49.3% | 71 |
| TOUCH_COUNT=>=2 + MACD_HIST_SLOPE=RISING | +0.25R | 57.1% | 28 |
| STOCH_RSI=Positive + INSIDER=FALSE | +0.24R | 50.0% | 72 |
| W_EMA20=ABOVE + INSIDER=FALSE | +0.23R | 51.4% | 35 |
| MACD_HIST_SLOPE=RISING + VOL_BUILDUP=Normal Vol | +0.22R | 55.6% | 27 |
