# BRUTAL RE-EXAMINATION: DOWNSIDE_LOM_SWING

Total Permutation Rows: 333 (Setups: 111)

## TABLE 3: ENTRY METHOD COMPARISON (Swing Stop, 1:2 R:R)

| Entry Method | Sample | Win Rate | Expected Value |
|---|---|---|---|
| CHASE | 111 | 24.3% | -0.18R |
| NEXT_OPEN | 111 | 21.6% | -0.18R |
| RETEST | 84 | 13.1% | -0.55R |

## TABLE 2: OPTIMAL RISK/REWARD (Using Entry: CHASE)

### Stop Type: SWING

| R:R Ratio | Win Rate | Expected Value |
|---|---|---|
| 1:1 | 31.5% | -0.35R |
| 1:2 | 24.3% | -0.18R |
| 1:3 | 14.4% | -0.23R |
| 1:4 | 11.7% | -0.20R |
### Stop Type: ATR

| R:R Ratio | Win Rate | Expected Value |
|---|---|---|
| 1:1 | 33.3% | -0.14R |
| 1:2 | 13.5% | -0.20R |
| 1:3 | 3.6% | -0.36R |
| 1:4 | 2.7% | -0.36R |

## TABLE 4: OPTIMAL HOLDING PERIOD (Entry: CHASE)

| Day | Avg M2M Return |
|---|---|
| Day 1 | +0.40% |
| Day 3 | +0.14% |
| Day 5 | -0.93% |
| Day 10 | -1.34% |

## TABLE 1: FACTOR RANKINGS BY EDGE

(Using **CHASE** Entry, **ATR** Stop, **1:1** R/R. Baseline EV: **-0.14R**)

| Factor | Best Value | EV Edge | EV | Win Rate | Sample |
|---|---|---|---|---|---|
| STOCH_RSI | Negative | +0.49R | +0.16R | 48.9% | 45 |
| BO_N_DAY | >10 Days | +0.49R | +0.17R | 51.2% | 41 |
| RSI2 | Oversold <10 | +0.47R | +0.13R | 44.7% | 47 |
| ACCUM | <2 | +0.21R | -0.09R | 34.1% | 88 |
| TOUCH_COUNT | <2 | +0.20R | -0.02R | 39.6% | 48 |
| MACD_HIST_SLOPE | FALLING | +0.19R | -0.07R | 35.6% | 73 |
| D_STACK | MIXED | +0.18R | -0.04R | 39.3% | 28 |
| BO_VOL_RATIO | High Vol | +0.13R | -0.05R | 44.7% | 38 |
| VOL_BUILDUP | High Vol | +0.08R | -0.08R | 38.9% | 36 |
| W_EMA20 | BELOW | +0.08R | -0.13R | 33.3% | 96 |
| PS_GAP | Positive | +0.07R | -0.09R | 32.4% | 34 |
| NR7 | FALSE | +0.00R | -0.12R | 34.3% | 105 |
| NR4 | FALSE | +0.00R | -0.14R | 33.3% | 99 |
| INSIDER | FALSE | +0.00R | -0.14R | 33.6% | 110 |
| INSIDER_NR7 | FALSE | +0.00R | -0.14R | 33.3% | 111 |
| VCP_SCORE | <2 | +0.00R | -0.14R | 33.7% | 101 |
| ATR_CONTRACT | Expanding | +0.00R | -0.15R | 33.3% | 108 |
| LEVEL_AGE | <10 Days | +0.00R | -0.07R | 36.7% | 98 |
| RSI2_CUM | Positive | +0.00R | -0.14R | 33.3% | 111 |
| MACD_HIST | Negative | +0.00R | -0.16R | 31.6% | 98 |

## TABLE 5: BEST "GOLDEN" COMBINATIONS

| Golden Combination Rules | Expected Value | Win Rate | Sample |
|---|---|---|---|
| BO_N_DAY=>10 Days + D_STACK=MIXED | +0.73R | 81.8% | 11 |
| STOCH_RSI=Negative + D_STACK=MIXED | +0.54R | 76.9% | 13 |
| RSI2=Oversold <10 + D_STACK=MIXED | +0.36R | 64.3% | 14 |
| STOCH_RSI=Negative + BO_N_DAY=>10 Days | +0.35R | 61.3% | 31 |
| BO_N_DAY=>10 Days + TOUCH_COUNT=<2 | +0.30R | 60.0% | 20 |
| BO_N_DAY=>10 Days + RSI2=Oversold <10 | +0.27R | 54.5% | 33 |
| STOCH_RSI=Negative + TOUCH_COUNT=<2 | +0.26R | 60.9% | 23 |
| BO_N_DAY=>10 Days + BO_VOL_RATIO=High Vol | +0.25R | 62.5% | 16 |
| RSI2=Oversold <10 + TOUCH_COUNT=<2 | +0.23R | 53.8% | 26 |
| STOCH_RSI=Negative + RSI2=Oversold <10 | +0.22R | 51.4% | 37 |
