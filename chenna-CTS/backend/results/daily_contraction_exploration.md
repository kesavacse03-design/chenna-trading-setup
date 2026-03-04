# DAILY_CONTRACTION (NR7) Exploration Report
> Generated: 2026-02-17

## 1. Category Statistics

| Metric | Value |
|--------|-------|
| Total Entries in DB | 337 |
| Successfully Analyzed | 252 |
| Skipped (no data) | 7 |
| Skipped (not enough history) | 14 |
| Skipped (signal date not found) | 0 |
| Skipped (cache integrity fail) | 64 |

## 2. NR7 Verification

| Metric | Count | % of Analyzed |
|--------|-------|---------------|
| Verified TRUE NR7 | 134 | 53.2% |
| Insider NR7 | 56 | 22.2% |
| Average NR7 Range% | 1.34% | - |

## 3. Breakout Direction Stats

| Metric | Count | % |
|--------|-------|---|
| Broke UP (LONG trigger) | 107 | 43.7% |
| Broke DOWN (SHORT trigger) | 138 | 56.3% |
| No breakout in 5 days | 7 | 2.8% |
| Avg days to trigger | 2.3 | - |

## 4. Baseline Performance (1.5R Target, 10-Day Timeout)

| Metric | Value |
|--------|-------|
| Total Trades Triggered | 245 |
| Wins | 85 |
| Losses | 160 |
| **Win Rate** | **34.7%** |
| Total P&L (R-multiples) | -32.5R |
| Avg P&L per Trade | -0.13R |

### Exit Reason Breakdown
| Reason | Count | % |
|--------|-------|---|
| TARGET_1.5R | 81 | 33.1% |
| STOP | 151 | 61.6% |
| TIMEOUT_10 | 13 | 5.3% |

## 5. Quality Filter Analysis

| Quality Level | Trades | Win Rate | Avg P&L |
|---------------|--------|----------|---------|
| HIGH (3-4 pts) | 104 | 40.4% | -0.01R |
| MEDIUM (1-2 pts) | 139 | 30.2% | -0.23R |
| LOW (0 or below) | 2 | 50.0% | 0.25R |

## 6. Comparison Breakdown

### NR7 Status
| Group | Trades | Win Rate |
|-------|--------|----------|
| Verified NR7 | 132 | 36.4% |
| Not True NR7 | 113 | 32.7% |

### Insider Status
| Group | Trades | Win Rate |
|-------|--------|----------|
| Insider NR7 | 56 | 50.0% |
| Regular | 189 | 30.2% |

### Direction
| Direction | Trades | Win Rate |
|-----------|--------|----------|
| LONG | 107 | 23.4% |
| SHORT | 138 | 43.5% |

## 7. Top 5 Winners
| Symbol | Date | Quality | Direction | P&L | MFE% |
|--------|------|---------|-----------|-----|------|
| AMBER | 2026-02-16 | HIGH(3) | SHORT | 1.5R | 11.26% |
| LTIM | 2026-02-16 | HIGH(3) | LONG | 1.5R | 9.22% |
| AMBER | 2026-02-13 | MEDIUM(1) | SHORT | 1.5R | 11.26% |
| JSWSTEEL | 2026-02-12 | HIGH(3) | SHORT | 1.5R | 5.03% |
| CDSL | 2026-02-11 | MEDIUM(2) | SHORT | 1.5R | 4.31% |

## 8. Top 5 Losers
| Symbol | Date | Quality | Direction | P&L | Exit |
|--------|------|---------|-----------|-----|------|
| PATANJALI | 2025-10-20 | MEDIUM(2) | SHORT | -1R | STOP |
| HINDPETRO | 2025-10-20 | MEDIUM(2) | SHORT | -1R | STOP |
| WIPRO | 2025-10-20 | MEDIUM(1) | LONG | -1R | STOP |
| IOC | 2025-10-20 | MEDIUM(2) | LONG | -1R | STOP |
| KPITTECH | 2025-10-20 | HIGH(3) | LONG | -1R | STOP |

## 9. Key Takeaways
- **NR7 Accuracy**: 53% of TradeCode signals are TRUE NR7s
- **Insider Edge**: Insider NR7 WR = 50.0% vs Regular WR = 30.2%
- **Direction Preference**: SHORT breakouts more common (138 vs 107)
- **Quality Filter Impact**: HIGH quality WR = 40.4% vs LOW quality WR = 50.0%
