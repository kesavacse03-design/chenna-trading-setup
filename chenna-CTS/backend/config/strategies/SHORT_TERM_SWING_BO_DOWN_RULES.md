# SHORT_TERM_SWING_BO_DOWN Trading Rules

## Strategy Overview
- **Name**: SHORT_TERM_SWING_BO_DOWN V1
- **Category**: SHORT_TERM_SWING_BO_DOWN
- **Expected Success**: 75% (baseline), 85%+ (optimized)
- **Avg Return**: +1.26% per trade
- **Avg Hold Time**: 2.3 days

---

## 1. Entry Rules

### 1.1 Signal Detection
```
✅ Stock appears in SHORT_TERM_SWING_BO_DOWN category
✅ Day of week: Thursday or Friday ONLY
✅ Entry price: At market close on signal day
```

### 1.2 Price Tier Filters
| Tier | Price Range | Candle Pattern | Expected Success |
|------|-------------|----------------|------------------|
| **Tier 1** | < ₹200 | ANY (green/red) | 92.9% |
| **Tier 2** | ₹200-1000 | RED only | 68.9% |
| **Tier 3** | > ₹1000 | RED only | 65% |

### 1.3 Seasonality Filter
| Period | Action | Position Size |
|--------|--------|---------------|
| **August-September** | Trade aggressively | 1.25x base |
| Jul, Oct, Dec-Jun | Trade normally | 1.0x base |
| **November** | ❌ NO TRADING | 0x (skip entirely) |

---

## 2. Exit Rules

### 2.1 Target & Stop
```
Target: +2.0% from entry
Stop: -1.5% from entry
Max Hold: 3 trading days
```

### 2.2 Exit Priority
1. **Target hit** → Exit immediately at target price
2. **Stop hit** → Exit immediately at stop price
3. **Day 3 close** → Exit at market close (force exit)
4. **Emergency** → Exit if VIX spikes >22 or gap down >3%

---

## 3. Risk Management

### 3.1 Position Limits
```
Max open positions: 5
Max per-trade capital: 10% of portfolio
Max daily exposure: 30% of portfolio
```

### 3.2 Drawdown Protocol
```
Max monthly drawdown: -8%
Action: Stop trading for remainder of month
Resume: First trading day of next month
```

### 3.3 Position Sizing by Tier
| Tier | Base Position | Multiplier |
|------|---------------|------------|
| Tier 1 (Low-price) | ₹50,000 | 1.5x → ₹75,000 |
| Tier 2 (Mid-price) | ₹50,000 | 1.0x → ₹50,000 |
| Tier 3 (High-price) | ₹50,000 | 0.75x → ₹37,500 |

---

## 4. Avoid Criteria (NO TRADE)

```
❌ November (entire month)
❌ VIX > 22
❌ Gap open > 3% (up or down)
❌ Monday, Tuesday, Wednesday signals
❌ Green candle + Mid/High price
```

---

## 5. Pre-Trade Checklist

```
□ Is it Thursday or Friday?
□ Is month NOT November?
□ Is VIX < 22?
□ Is stock in category today?
□ Check price tier and candle color
□ Calculate position size
□ Place order at market close
□ Set target (+2%) and stop (-1.5%) alerts
```

---

## 6. Expected Performance

| Scenario | Trades/Month | Success Rate | Monthly Return |
|----------|--------------|--------------|----------------|
| August (Prime) | 8-10 | 84% | +4-5% |
| Normal Months | 4-6 | 70% | +2-3% |
| November | 0 | SKIP | 0% (protected) |

**Annual target**: 25-35% returns with strict rules

---

## Version History
- V1.0.0 (2026-01-08): Initial rules from Phase 1-5 analysis
