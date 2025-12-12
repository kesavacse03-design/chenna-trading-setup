/**
 * Data Validator Service  
 * Phase 12: Data Quality Validation
 */

/**
 * Validate candle data quality
 */
function validateCandles(candles, symbol) {
    const issues = [];
    const stats = {
        total: candles.length,
        valid: 0,
        invalid: 0,
        duplicates: 0,
        gaps: 0,
        badOHLC: 0,
        volumeAnomalies: 0,
        suspiciousGaps: 0
    };

    if (!candles || candles.length === 0) {
        return {
            valid: false,
            issues: [{ type: 'NO_DATA', message: 'No candle data provided' }],
            stats
        };
    }

    // Sort by timestamp
    const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);

    // Check for duplicates
    const timestamps = new Set();
    sorted.forEach((candle, i) => {
        if (timestamps.has(candle.timestamp)) {
            issues.push({
                type: 'DUPLICATE',
                index: i,
                timestamp: candle.timestamp,
                message: `Duplicate timestamp at index ${i}`
            });
            stats.duplicates++;
        }
        timestamps.add(candle.timestamp);
    });

    // Check each candle
    sorted.forEach((candle, i) => {
        let candleValid = true;

        // 1. Validate OHLC logic
        if (candle.high < candle.low) {
            issues.push({
                type: 'BAD_OHLC',
                index: i,
                message: `High (${candle.high}) < Low (${candle.low})`,
                severity: 'CRITICAL'
            });
            stats.badOHLC++;
            candleValid = false;
        }

        if (candle.high < candle.open || candle.high < candle.close) {
            issues.push({
                type: 'BAD_OHLC',
                index: i,
                message: `High not highest price`,
                severity: 'CRITICAL'
            });
            stats.badOHLC++;
            candleValid = false;
        }

        if (candle.low > candle.open || candle.low > candle.close) {
            issues.push({
                type: 'BAD_OHLC',
                index: i,
                message: `Low not lowest price`,
                severity: 'CRITICAL'
            });
            stats.badOHLC++;
            candleValid = false;
        }

        // 2. Check for gaps (missing candles)
        if (i > 0) {
            const prev = sorted[i - 1];
            const expectedDiff = 24 * 60 * 60 * 1000; // 1 day
            const actualDiff = candle.timestamp - prev.timestamp;

            if (actualDiff > expectedDiff * 1.5) {
                const missingDays = Math.floor(actualDiff / expectedDiff) - 1;
                if (missingDays > 0) {
                    issues.push({
                        type: 'GAP',
                        index: i,
                        message: `Missing ${missingDays} candle(s) between ${new Date(prev.timestamp).toDateString()} and ${new Date(candle.timestamp).toDateString()}`,
                        severity: 'MEDIUM'
                    });
                    stats.gaps++;
                }
            }
        }

        // 3. Check for suspicious price gaps (>10%)
        if (i > 0) {
            const prev = sorted[i - 1];
            const gap = Math.abs((candle.open - prev.close) / prev.close) * 100;

            if (gap > 10) {
                issues.push({
                    type: 'SUSPICIOUS_GAP',
                    index: i,
                    message: `Large gap ${gap.toFixed(2)}% - possible corporate action`,
                    severity: 'HIGH',
                    gap: gap
                });
                stats.suspiciousGaps++;
            }
        }

        // 4. Check volume anomalies
        if (i >= 20) {
            const recentCandles = sorted.slice(i - 20, i);
            const avgVolume = recentCandles.reduce((sum, c) => sum + c.volume, 0) / 20;

            if (candle.volume === 0) {
                issues.push({
                    type: 'VOLUME_ANOMALY',
                    index: i,
                    message: 'Zero volume',
                    severity: 'HIGH'
                });
                stats.volumeAnomalies++;
                candleValid = false;
            } else if (candle.volume > avgVolume * 10) {
                issues.push({
                    type: 'VOLUME_ANOMALY',
                    index: i,
                    message: `Extremely high volume (${(candle.volume / avgVolume).toFixed(1)}x average)`,
                    severity: 'MEDIUM'
                });
            }
        }

        if (candleValid) {
            stats.valid++;
        } else {
            stats.invalid++;
        }
    });

    const criticalIssues = issues.filter(i => i.severity === 'CRITICAL');

    return {
        valid: criticalIssues.length === 0,
        issues,
        stats,
        symbol,
        criticalCount: criticalIssues.length,
        totalIssues: issues.length
    };
}

/**
 * Filter out invalid candles
 */
function filterValidCandles(candles) {
    return candles.filter(candle => {
        // Basic OHLC validation
        if (candle.high < candle.low) return false;
        if (candle.high < candle.open || candle.high < candle.close) return false;
        if (candle.low > candle.open || candle.low > candle.close) return false;
        if (candle.volume === 0) return false;
        if (!candle.timestamp) return false;

        return true;
    });
}

/**
 * Get data quality score (0-100)
 */
function getDataQualityScore(validation) {
    const { stats, totalIssues } = validation;

    if (stats.total === 0) return 0;

    // Deduct points for each issue type
    let score = 100;
    score -= (stats.badOHLC / stats.total) * 50;      // Bad OHLC is critical
    score -= (stats.duplicates / stats.total) * 30;    // Duplicates are serious
    score -= (stats.gaps / stats.total) * 20;          // Gaps are concerning
    score -= (stats.volumeAnomalies / stats.total) * 10; // Volume okay if occasional
    score -= (stats.suspiciousGaps / stats.total) * 15;  // Suspicious gaps need review

    return Math.max(0, Math.min(100, score));
}

module.exports = {
    validateCandles,
    filterValidCandles,
    getDataQualityScore
};
