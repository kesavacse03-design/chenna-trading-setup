/**
 * Institutional Trap Detector
 * 
 * Detects 8 types of institutional manipulation patterns
 * Returns YES/NO flags for each trap type
 * 
 * CRITICAL: Only trade when ALL traps = NO
 */

const ComprehensiveTA = require('./comprehensiveTA.cjs');

class InstitutionalTrapDetector {

    /**
     * Scan all traps at once
     */
    async scanAll(candles, signal = {}) {
        if (!candles || candles.length < 20) {
            return { flags: {}, allClear: false, reason: 'Insufficient candle data' };
        }

        const flags = {
            volumeTrap: this.detectVolumeTrap(candles),
            bullTrap: this.detectBullTrap(candles),
            fakeBreakout: this.detectFakeBreakout(candles),
            stopHunt: this.detectStopHunt(candles),
            distributionPhase: this.detectDistribution(candles),
            exhaustionCandle: this.detectExhaustion(candles),
            liquiditySweep: this.detectLiquiditySweep(candles),
            newsFakeSpike: this.detectNewsFakeSpike(candles)
        };

        const detectedTraps = Object.entries(flags)
            .filter(([_, trap]) => trap.detected)
            .map(([name, _]) => name);

        const allClear = detectedTraps.length === 0;

        return {
            flags,
            allClear,
            detectedTraps,
            reason: allClear ? 'No traps detected' : `Traps detected: ${detectedTraps.join(', ')}`
        };
    }

    /**
     * 1. Volume Trap Detection
     * Fake volume spike without corresponding price move
     */
    detectVolumeTrap(candles) {
        const current = candles[candles.length - 1];
        const avgVolume = this.avgVolume(candles.slice(-20));

        if (avgVolume === 0) return { detected: false };

        const volRatio = current.volume / avgVolume;
        const priceChange = Math.abs((current.close - current.open) / current.open) * 100;

        // Trap: Volume spike > 3x but price change < 1%
        if (volRatio > 3.0 && priceChange < 1.0) {
            return {
                detected: true,
                reason: `Volume spike ${volRatio.toFixed(1)}x but price change only ${priceChange.toFixed(1)}% - likely institutional distribution`,
                severity: 0.9
            };
        }

        return { detected: false };
    }

    /**
     * 2. Bull Trap Detection
     * Price near major resistance - high rejection risk
     */
    detectBullTrap(candles) {
        const current = candles[candles.length - 1];
        const resistance = this.findResistance(candles.slice(-50));

        if (!resistance) return { detected: false };

        // Trap: Price within 2% of resistance
        const distanceToResistance = ((resistance - current.close) / current.close) * 100;

        if (distanceToResistance < 2.0 && distanceToResistance > 0) {
            return {
                detected: true,
                reason: `Price ${current.close.toFixed(2)} only ${distanceToResistance.toFixed(1)}% below resistance ${resistance.toFixed(2)} - high rejection risk`,
                severity: 0.8
            };
        }

        return { detected: false };
    }

    /**
     * 3. Fake Breakout Detection
     * Breakout without volume confirmation
     */
    detectFakeBreakout(candles) {
        if (candles.length < 3) return { detected: false };

        const current = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        const avgVolume = this.avgVolume(candles.slice(-20));

        // Check if price broke above previous high
        const brokeOut = current.high > prev.high;
        const volumeConfirmed = current.volume > avgVolume * 1.2;

        // Trap: Breakout without volume
        if (brokeOut && !volumeConfirmed) {
            return {
                detected: true,
                reason: `Price broke above ${prev.high.toFixed(2)} but volume ${(current.volume / avgVolume).toFixed(1)}x avg - lacks confirmation`,
                severity: 0.7
            };
        }

        return { detected: false };
    }

    /**
     * 4. Stop-Hunt Detection
     * Long lower wick = liquidity grab attempt
     */
    detectStopHunt(candles) {
        const current = candles[candles.length - 1];

        const body = Math.abs(current.close - current.open);
        const range = current.high - current.low;

        if (range === 0) return { detected: false };

        const lowerWick = Math.min(current.open, current.close) - current.low;

        // Trap: Lower wick > 50% of range AND small body
        if (lowerWick / range > 0.5 && body / range < 0.3) {
            return {
                detected: true,
                reason: `Long lower wick (${(lowerWick / range * 100).toFixed(0)}% of range) suggests stop-hunt attempt`,
                severity: 0.75
            };
        }

        return { detected: false };
    }

    /**
     * 5. Distribution Phase Detection
     * Volume declining while price stays flat/up
     */
    detectDistribution(candles) {
        if (candles.length < 10) return { detected: false };

        const recent5 = candles.slice(-5);
        const prior5 = candles.slice(-10, -5);

        const recentVolAvg = this.avgVolume(recent5);
        const priorVolAvg = this.avgVolume(prior5);

        if (priorVolAvg === 0) return { detected: false };

        const volDecline = recentVolAvg / priorVolAvg;
        const priceRange = Math.max(...recent5.map(c => c.high)) - Math.min(...recent5.map(c => c.low));
        const priceStable = priceRange < (recent5[0].close * 0.02); // < 2% range

        // Trap: Volume declining + price stable = distribution
        if (volDecline < 0.8 && priceStable) {
            return {
                detected: true,
                reason: `Volume declining to ${(volDecline * 100).toFixed(0)}% while price stable - distribution phase`,
                severity: 0.8
            };
        }

        return { detected: false };
    }

    /**
     * 6. Exhaustion Candle Detection
     * Long wick, small body = exhaustion
     */
    detectExhaustion(candles) {
        const current = candles[candles.length - 1];

        const body = Math.abs(current.close - current.open);
        const range = current.high - current.low;

        if (range === 0) return { detected: false };

        const upperWick = current.high - Math.max(current.open, current.close);

        // Trap: Small body (<30% range) + long upper wick
        if (body / range < 0.3 && upperWick / range > 0.5) {
            return {
                detected: true,
                reason: `Exhaustion candle: body ${(body / range * 100).toFixed(0)}%, upper wick ${(upperWick / range * 100).toFixed(0)}%`,
                severity: 0.85
            };
        }

        return { detected: false };
    }

    /**
     * 7. Liquidity Sweep Detection
     * Price swept prior low then reversed
     */
    detectLiquiditySweep(candles) {
        if (candles.length < 5) return { detected: false };

        const current = candles[candles.length - 1];
        const recent = candles.slice(-5, -1);
        const priorLow = Math.min(...recent.map(c => c.low));

        // Sweep: Current low went below prior low but closed above it
        const sweptBelow = current.low < priorLow;
        const closedAbove = current.close > priorLow;

        if (sweptBelow && closedAbove) {
            const sweepDistance = ((priorLow - current.low) / current.low) * 100;

            if (sweepDistance > 0.5) { // At least 0.5% sweep
                return {
                    detected: true,
                    reason: `Liquidity sweep: dropped ${sweepDistance.toFixed(1)}% below prior low then reversed`,
                    severity: 0.7
                };
            }
        }

        return { detected: false };
    }

    /**
     * 8. News Fake Spike Detection
     * Large move without fundamental reason (placeholder - needs news API)
     */
    detectNewsFakeSpike(candles) {
        if (candles.length < 2) return { detected: false };

        const current = candles[candles.length - 1];
        const prev = candles[candles.length - 2];

        const priceChange = Math.abs((current.close - prev.close) / prev.close) * 100;
        const volumeSpike = current.volume / this.avgVolume(candles.slice(-20, -1));

        // Placeholder: Detect sudden spike (>3%) without news
        // TODO: Integrate news API to check for announcements
        if (priceChange > 3.0 && volumeSpike > 2.5) {
            return {
                detected: true,
                reason: `Sudden ${priceChange.toFixed(1)}% move with ${volumeSpike.toFixed(1)}x volume - verify news`,
                severity: 0.6,
                note: 'Manual verification recommended'
            };
        }

        return { detected: false };
    }

    // ==================== HELPERS ====================

    avgVolume(candles) {
        if (candles.length === 0) return 0;
        return candles.reduce((sum, c) => sum + (c.volume || 0), 0) / candles.length;
    }

    findResistance(candles) {
        if (candles.length === 0) return null;
        const highs = candles.map(c => c.high);
        return Math.max(...highs);
    }

    findSupport(candles) {
        if (candles.length === 0) return null;
        const lows = candles.map(c => c.low);
        return Math.min(...lows);
    }
}

module.exports = InstitutionalTrapDetector;
