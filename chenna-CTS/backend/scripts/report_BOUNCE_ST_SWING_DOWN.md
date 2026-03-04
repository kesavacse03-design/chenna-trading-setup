# BRUTAL RE-EXAMINATION: BOUNCE_ST_SWING_DOWN

## MACRO STATISTICS
- Total Breakdown Setups: 174
- Valid SMA10 Reclaims (Bounces): 95 (54.6% reclaim rate)
- Avg Days to Reclaim: 3.7 days

## OVERALL PERFORMANCE (Baseline)
| R:R Ratio | Win Rate | Expected Value |
|---|---|---|
| 1:1 | 26.3% | -0.47R |
| 1:2 | 7.4% | -0.78R |
| 1:3 | 2.1% | -0.92R |

## FACTOR RANKINGS BY EDGE (1:2 R:R)

| Factor | Best Value | EV Edge | EV | Win Rate | Sample |
|---|---|---|---|---|---|
| PS_GAP | Negative | +0.27R | -0.57R | 14.3% | 21 |
| INSIDER | false | +0.26R | -0.74R | 8.6% | 81 |
| MACD_HIST | Positive | +0.17R | -0.65R | 11.5% | 26 |
| RSI2 | Neutral | +0.15R | -0.74R | 8.8% | 68 |
| D_STACK | MIXED | +0.15R | -0.68R | 10.5% | 19 |
| ACCUM | <2 | +0.12R | -0.75R | 8.3% | 72 |
| BO_VOL_RATIO | Normal Vol | +0.10R | -0.76R | 8.1% | 74 |
| NR4 | true | +0.10R | -0.70R | 10.0% | 20 |
| TOUCH_COUNT | <2 | +0.06R | -0.73R | 9.1% | 11 |
| W_EMA20 | BELOW | +0.03R | -0.76R | 7.8% | 51 |
| VOL_BUILDUP | High Vol | +0.01R | -0.77R | 7.7% | 13 |
| LEVEL_AGE | >10 Days | +0.00R | -0.78R | 7.4% | 27 |
| NR7 | false | +0.00R | -0.79R | 7.0% | 86 |
| INSIDER_NR7 | false | +0.00R | -0.77R | 7.7% | 91 |
| VCP_SCORE | <2 | +0.00R | -0.76R | 7.9% | 89 |
| ATR_CONTRACT | Expanding | +0.00R | -0.80R | 6.7% | 89 |
| BO_N_DAY | <10 Days | +0.00R | -0.76R | 8.0% | 88 |
| RSI2_CUM | Positive | +0.00R | -0.78R | 7.4% | 95 |
| STOCH_RSI | Positive | +0.00R | -0.78R | 7.4% | 95 |
| MACD_HIST_SLOPE | RISING | +0.00R | -0.81R | 6.5% | 93 |

## BEST ON-ENTRY COMBINATIONS (1:2 R:R)

| Golden Combination Rules | Expected Value | Win Rate | Sample |
|---|---|---|---|
| PS_GAP=Negative + BO_VOL_RATIO=Normal Vol | +-0.40R | 20.0% | 15 |
| RSI2=Neutral + NR4=true | +-0.40R | 20.0% | 10 |
| PS_GAP=Negative + RSI2=Neutral | +-0.47R | 17.6% | 17 |
| MACD_HIST=Positive + RSI2=Neutral | +-0.47R | 17.6% | 17 |
| PS_GAP=Negative + ACCUM=<2 | +-0.50R | 16.7% | 18 |
| MACD_HIST=Positive + BO_VOL_RATIO=Normal Vol | +-0.50R | 16.7% | 18 |
| PS_GAP=Negative + INSIDER=false | +-0.53R | 15.8% | 19 |
| INSIDER=false + NR4=true | +-0.54R | 15.4% | 13 |
| INSIDER=false + D_STACK=MIXED | +-0.60R | 13.3% | 15 |
| BO_VOL_RATIO=Normal Vol + NR4=true | +-0.60R | 13.3% | 15 |
| ACCUM=<2 + NR4=true | +-0.63R | 12.5% | 16 |
| RSI2=Neutral + ACCUM=<2 | +-0.63R | 12.2% | 49 |
| MACD_HIST=Positive + ACCUM=<2 | +-0.64R | 12.0% | 25 |
| INSIDER=false + MACD_HIST=Positive | +-0.65R | 11.5% | 26 |
| D_STACK=MIXED + BO_VOL_RATIO=Normal Vol | +-0.67R | 11.1% | 18 |
