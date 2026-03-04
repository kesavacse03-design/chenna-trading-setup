# 🧠 Smart Swing Backtest Report
> DAILY_CONTRACTION (Insider NR7)
> Generated: 2026-02-17

## 1. SMART vs DUMB Comparison

| Metric | 🧠 SMART | 🤖 DUMB (Fixed 1.5R) | Δ |
|--------|---------|---------------------|---|
| Total Trades | 7 | 7 | - |
| Win Rate | **42.9%** | 42.9% | 0.0% |
| Total P&L | **-1.3R** | +0.5R | -1.8R |
| Avg P&L/Trade | -0.18R | 0.07R | -0.25R |
| Best Trade | +1.00R (PHOENIXLTD) | - | - |
| Worst Trade | -1.00R (BDL) | - | - |
| Avg Hold Days | 2.0 | - | - |

## 2. Direction Analysis (Smart)

| Direction | Trades | Win Rate | P&L (R) |
|-----------|--------|----------|---------|
| LONG | 3 | 33.3% | -0.4R |
| SHORT | 4 | 50.0% | -0.8R |

## 3. Exit Reason Breakdown (Smart)

| Exit Reason | Count | Avg P&L (R) |
|-------------|-------|-------------|
| INITIAL_STOP_HIT | 3 | -1.00R |
| TRAILING_STOP_HIT | 3 | 0.72R |
| FAILED_BREAKOUT | 1 | -0.42R |

## 4. Trade-by-Trade Detail

### BDL (🔴 SHORT) — 2025-12-29

| Field | Value |
|-------|-------|
| Entry | ₹1454.6 |
| NR7 Range | ₹1454.7 – ₹1479.8 |
| Initial Risk | ₹32.6 (2.2%) |
| Quality Score | 3/5 |
| Exit | ₹1487.2 via **INITIAL_STOP_HIT** |
| P&L | **-1.00R** ❌ LOSS |
| Days Held | 1 |

```
Day 1: HIGH ₹1509.8 hit stop ₹1487.2 → EXIT
```

---

### HCLTECH (🔴 SHORT) — 2026-01-07

| Field | Value |
|-------|-------|
| Entry | ₹1646.7 |
| NR7 Range | ₹1647.1 – ₹1675.0 |
| Initial Risk | ₹36.7 (2.2%) |
| Quality Score | 3/5 |
| Exit | ₹1634.2 via **TRAILING_STOP_HIT** |
| P&L | **+0.67R** ✅ WIN |
| Days Held | 4 |

```
Day 1: Close ₹1647.7 | P&L: -0.03R | Stop: ₹1683.4 | Pos: 100%
Day 2: 🎯 Booked 50% at +1.0R (+0.50R locked)
Day 2: Stop → BREAKEVEN ₹1646.7
Day 2: Close ₹1616.3 | P&L: +0.83R | Stop: ₹1646.7 | Pos: 50%
Day 3: Trail stop → ₹1634.2 (prev high + buffer)
Day 3: Close ₹1607.6 | P&L: +1.07R | Stop: ₹1634.2 | Pos: 50%
Day 4: HIGH ₹1643.0 hit stop ₹1634.2 → EXIT
```

---

### NMDC (🔴 SHORT) — 2025-12-31

| Field | Value |
|-------|-------|
| Entry | ₹83.7 |
| NR7 Range | ₹83.8 – ₹85.0 |
| Initial Risk | ₹1.7 (2.1%) |
| Quality Score | 3/5 |
| Exit | ₹83.7 via **TRAILING_STOP_HIT** |
| P&L | **+0.50R** ✅ WIN |
| Days Held | 3 |

```
Day 1: Close ₹83.2 | P&L: +0.28R | Stop: ₹85.4 | Pos: 100%
Day 2: 🎯 Booked 50% at +1.0R (+0.50R locked)
Day 2: Stop → BREAKEVEN ₹83.7
Day 2: Close ₹83.4 | P&L: +0.14R | Stop: ₹83.7 | Pos: 50%
Day 3: HIGH ₹84.2 hit stop ₹83.7 → EXIT
```

---

### MUTHOOTFIN (🟢 LONG) — 2025-12-14

| Field | Value |
|-------|-------|
| Entry | ₹3856.4 |
| NR7 Range | ₹3818.8 – ₹3855.5 |
| Initial Risk | ₹56.7 (1.5%) |
| Quality Score | 3/5 |
| Exit | ₹3799.7 via **INITIAL_STOP_HIT** |
| P&L | **-1.00R** ❌ LOSS |
| Days Held | 1 |

```
Day 1: LOW ₹3751.1 hit stop ₹3799.7 → EXIT
```

---

### TRENT (🔴 SHORT) — 2025-12-10

| Field | Value |
|-------|-------|
| Entry | ₹4047.5 |
| NR7 Range | ₹4049.9 – ₹4092.8 |
| Initial Risk | ₹65.8 (1.6%) |
| Quality Score | 2/5 |
| Exit | ₹4113.3 via **INITIAL_STOP_HIT** |
| P&L | **-1.00R** ❌ LOSS |
| Days Held | 1 |

```
Day 1: HIGH ₹4138.0 hit stop ₹4113.3 → EXIT
```

---

### SBILIFE (🟢 LONG) — 2026-01-12

| Field | Value |
|-------|-------|
| Entry | ₹2082.4 |
| NR7 Range | ₹2063.3 – ₹2082.0 |
| Initial Risk | ₹29.4 (1.4%) |
| Quality Score | 4/5 |
| Exit | ₹2070.0 via **FAILED_BREAKOUT** |
| P&L | **-0.42R** ❌ LOSS |
| Days Held | 2 |

```
Day 1: Close ₹2098.0 | P&L: +0.53R | Stop: ₹2053.0 | Pos: 100%
Day 2: Close ₹2070.0 < NR7 Mid ₹2072.7 → DEEP FAILED BREAKOUT
```

---

### PHOENIXLTD (🟢 LONG) — 2026-01-12

| Field | Value |
|-------|-------|
| Entry | ₹1894.7 |
| NR7 Range | ₹1855.7 – ₹1889.5 |
| Initial Risk | ₹48.3 (2.5%) |
| Quality Score | 4/5 |
| Exit | ₹1894.7 via **TRAILING_STOP_HIT** |
| P&L | **+1.00R** ✅ WIN |
| Days Held | 2 |

```
Day 1: 🎯 Booked 50% at +1.0R (+0.50R locked)
Day 1: Stop → BREAKEVEN ₹1894.7
Day 1: 🎯 Booked 25% at +2.0R (+0.50R locked)
Day 1: Close ₹1885.1 | P&L: -0.20R | Stop: ₹1894.7 | Pos: 25%
Day 2: LOW ₹1884.5 hit stop ₹1894.7 → EXIT
```

---

