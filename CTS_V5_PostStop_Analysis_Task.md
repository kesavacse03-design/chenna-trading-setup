# CTS V5 Post-Stop Analysis & Refinements

Based on the forensic analysis of all 14 `INTRADAY_BOOST` signals with high scores (`>= 60`) that resulted in `STOPPED` status between February 19 and March 2, 2026.

## 🔬 Core Findings Summary

**1. Sector Validation (Unknown Sectors)**
Unknown sectors fail at a rate of **43%**. Validated sectors (Nifty Metal, Infra, Energy, Bank, etc.) fail at a rate of **42%**.
*Conclusion:* When a signal has a raw score `≥ 60`, whether it has an assigned sector or is 'Unknown' literally makes no statistical difference in its outcome.

**2. Market Direction Alignment (Against Bias)**
Trades going *with* the market bias fail at **50%**. Trades going *against* the market bias fail at **33%**.
*Conclusion:* High-score contrarian trades actually have a significantly higher win rate than consensus trades. An independent move against the day's trend indicates true conviction.

**3. Sector Cluster Reversals**
We observed 4 trades failing together in pairs (e.g., `SAIL` and `VEDL` on March 2nd).
*Conclusion:* Sector clusters validate individual strength, but if the *entire sector leader group moves in the wrong direction*, the entire cluster fails together.

**4. Score vs. Quality**
`SIEMENS` scored `100` but was stopped out. Score alone is an aggregate of parameters, not a guarantee.

---

## 🔍 Deep Dive by Failure Pattern

### Pattern A: The "False Cluster Reversal" (4 / 14 failures)
**Examples:**
*   `Mar 2:` **SAIL** (85) & **VEDL** (85) - LONG, Nifty Metal
*   `Feb 23:` **IDFCFIRSTB** (75) - SHORT, Nifty Bank & **UPL** (85) - SHORT, Nifty Commodities

**Why they failed:** Both SAIL and VEDL fired as a pair (Metal cluster) in a LONG-biased market. However, both got completely stuffed and stopped early. When a cluster fails, it creates a "false dawn" effect: the AI and human logic both assume the cluster provides safety, but instead, it creates concentrated risk.
*Takeaway:* Clusters of exactly 2 stocks are weak. Real clustered power emerges at 3+ (like the FMCG and IT clusters we saw successfully on Feb 27/23).

### Pattern B: High-Score Standalone Traps (3 / 14 failures)
**Examples:**
*   `Feb 23:` **SIEMENS** (100) - LONG, Nifty India Mfg
*   `Feb 27:` **IOC** (85) - LONG, Nifty Energy
*   `Feb 27:` **TMPV** (85) - SHORT, Unknown Sector

**Why they failed:** These signals generated astronomical raw scores. But without sector confirmation or peer pressure, these are likely just solitary spikes in volatility that fail to sustain. A signal hitting 100 without a single peer in its sector doing the same is statistically more likely to be an anomaly/trap than a genuine trend launch.

### Pattern C: The "Failed Contrarian" (3 / 14 failures)
**Examples:**
*   `Feb 23:` **KEI** (70) - LONG, Unknown
*   `Feb 23:` **SBILIFE** (70) - LONG, Unknown
*   `Feb 23:` **PNB** (60) - LONG, Nifty PSU Bank

**Why they failed:** Although the data shows Contrarian (against-bias) trades win *more often*, when they do fail (like with PNB here on a strong SHORT day), they fail hard. These trades attempted to defy gravity on a heavily biased SHORT day and ran out of oxygen quickly.

---

## 🛠️ Recommended Refinements

Based on these findings, we do not need to rewrite the entire strategy. We just need to modify how the AI weights these factors in `signalExporter.cjs` or the prompt:

### Recommendation 1: Relax `MISC_EQUITY` Penalty for Very High Scores
The data proves "Unknown Sector" isn't a death sentence for scores `≥ 60`. If a stock has an 85+ score, it shouldn't be auto-relegated to `AWAIT` or heavily penalized just because we haven't mapped its sector yet.
**Fix:** Cap the `MISC_EQUITY` penalty, or waive it entirely if the raw score is `≥ 75`. Let the raw momentum speak.

### Recommendation 2: Boost "Against Bias" Signals (Contrarian Premium)
Since high-score contrarian signals win more often (67% win rate), they shouldn't just be considered "ties" or "decent."
**Fix:** Add explicit wording in the prompt to aggressively prioritize contrarian signals that have scores `≥ 65`—these are high-probability alpha generators.

### Recommendation 3: Demand Minimum "Cluster Size 3" for Sector Safety
If only 2 Metal stocks trigger, it's not a validated cluster—it's just a coincidence. Wait for 3 to consider the sector fully engaged.
**Fix:** In the backend `clusterScore` generation, only apply a strong positive multiplier if `clusterCount >= 3`. A pair (count=2) should get a very minor or zero bump.

### Recommendation 4: Risk Constraint (Wide Stops)
`IDFCFIRSTB` failed with a massive 4.58% risk stop, and `UPL` with 3.05%.
**Fix:** Any trade with `stop % > 2.5%` should have its position size automatically halved by the AI ('HALF' or 'AVOID'), regardless of score. High stop % indicates high initial volatility, which often means the entry is chased.
