/**
 * Signal Engine — Shared Outcome Evaluation
 * 
 * This is the SINGLE source of truth for outcome evaluation (T1/T2/Stop/EOD).
 * Used by: backtestReplayService, eodReportService, eodSimulationService.
 * 
 * Signal GENERATION still lives in intradayStrategyV2_1.cjs (the proven V2.1 logic).
 * This file only handles OUTCOME TRACKING after a signal is generated.
 * 
 * RULES:
 * 1. Walk 1-min candles chronologically — first hit wins
 * 2. If both T1 and Stop hit in same candle → use candle open for ambiguity resolution
 * 3. After T1 hit → move stop to breakeven (entry price), continue tracking for T2
 * 4. After T2 hit → trade is DONE, book +2R
 * 5. If nothing hit by 3:20 PM IST → EOD close at last candle price
 * 6. ONE signal per stock per day — deduplication is caller's responsibility
 */

/**
 * Convert a timestamp to IST hours and minutes.
 * Handles ISO strings (UTC), offset strings (+05:30), and numeric timestamps.
 */
function getISTTime(timestamp) {
    let d;
    if (typeof timestamp === 'number') {
        d = new Date(timestamp);
    } else if (typeof timestamp === 'string') {
        // If it already has +05:30 offset, JS will parse correctly
        d = new Date(timestamp);
    } else {
        d = new Date(timestamp);
    }

    // Convert to IST (UTC + 5:30)
    const utcMs = d.getTime();
    const istMs = utcMs + (5.5 * 60 * 60 * 1000);
    const istDate = new Date(istMs);

    return {
        hours: istDate.getUTCHours(),
        minutes: istDate.getUTCMinutes(),
        totalMinutes: istDate.getUTCHours() * 60 + istDate.getUTCMinutes(),
        isoString: d.toISOString()
    };
}

/**
 * Filter candles to market hours (9:15 AM to 3:20 PM IST).
 * Handles multiple timestamp formats from Upstox.
 */
function filterMarketHours(candles) {
    return candles.filter(c => {
        const ist = getISTTime(c.timestamp);
        // Market hours: 9:15 AM (555 min) to 3:20 PM (920 min)
        return ist.totalMinutes >= 555 && ist.totalMinutes <= 920;
    });
}

/**
 * Evaluate the outcome of a signal using 1-minute candle data.
 * 
 * This is the SINGLE function for outcome tracking. All callers
 * (backtest, EOD analysis, EOD sim) must use this function.
 * 
 * CRITICAL: The function includes a FILL PHASE that skips candles until
 * price first reaches the entry level. This models a limit/stop-limit order:
 * the trade isn't "live" until the market price touches the entry price.
 * Without this, a stock opening at ₹503 would immediately trigger a stop
 * at ₹485 for an entry at ₹483 — even though the signal expects price to
 * come DOWN to entry first.
 * 
 * @param {Object} signal - Signal parameters:
 *   { entryPrice, stopPrice, t1Price, t2Price, direction, confirmedAt?, createdAt? }
 *   Direction defaults to 'LONG' if not provided.
 *   confirmedAt/createdAt: optional timestamp to skip candles before entry time.
 * 
 * @param {Array} candles - 1-minute OHLCV candles for the full trading day.
 *   Each: { timestamp, open, high, low, close, volume? }
 *   Must be sorted chronologically (oldest first).
 * 
 * @returns {Object} Outcome result:
 *   { outcome, exitPrice, rMultiple, exitTime, hitT1, hitT2, hitStop, risk, fillTime }
 */
function evaluateOutcome(signal, candles) {
    const entry = parseFloat(signal.entryPrice);
    const stop = parseFloat(signal.stopPrice);
    const t1 = signal.t1Price ? parseFloat(signal.t1Price) : null;
    const t2 = signal.t2Price ? parseFloat(signal.t2Price) : null;
    const isLong = (signal.direction || 'LONG').toUpperCase() === 'LONG';

    if (!candles || candles.length === 0) {
        return makeResult('NO_DATA', entry, null, 0, false, false, false, 0);
    }

    const risk = Math.abs(entry - stop);
    if (risk === 0) {
        return makeResult('INVALID', entry, null, 0, false, false, false, 0);
    }

    // Filter to market hours only (9:15 AM to 3:20 PM IST)
    const marketCandles = filterMarketHours(candles);
    if (marketCandles.length === 0) {
        return makeResult('NO_DATA', entry, null, 0, false, false, false, risk);
    }

    // ─── FILL PHASE: Skip candles until price reaches entry level ───
    // This models a limit order: the trade only activates when market 
    // price touches the entry price. Also skip candles before signal time
    // if confirmedAt/createdAt is available.
    let fillIndex = -1;
    const signalTime = signal.confirmedAt || signal.createdAt;
    const signalTimeMs = signalTime ? new Date(signalTime).getTime() : null;

    for (let i = 0; i < marketCandles.length; i++) {
        const c = marketCandles[i];
        const ist = getISTTime(c.timestamp);

        // EOD cutoff
        if (ist.hours > 15 || (ist.hours === 15 && ist.minutes >= 20)) break;

        // Skip candles before signal confirmation time (if available)
        if (signalTimeMs) {
            const candleMs = new Date(c.timestamp).getTime();
            if (candleMs < signalTimeMs) continue;
        }

        // Check if this candle's range touches the entry price
        if (isLong) {
            // For LONG entry: price must come DOWN to entry level (or open at/below entry)
            if (c.low <= entry || c.open <= entry) {
                fillIndex = i;
                break;
            }
        } else {
            // For SHORT entry: price must come UP to entry level (or open at/above entry)
            if (c.high >= entry || c.open >= entry) {
                fillIndex = i;
                break;
            }
        }
    }

    // Entry never filled → signal expired without being triggered
    if (fillIndex === -1) {
        return makeResult('NOT_FILLED', entry, null, 0, false, false, false, risk);
    }

    // Start tracking from the fill candle (but skip the fill candle itself 
    // for stop/target checks — the fill candle is the entry candle)
    const trackingCandles = marketCandles.slice(fillIndex + 1);
    const fillTime = marketCandles[fillIndex].timestamp;

    if (trackingCandles.length === 0) {
        // Filled on last candle → EOD close at entry
        return makeResult('EOD_CLOSE', entry, fillTime, 0, false, false, false, risk);
    }

    let t1Hit = false;
    let t1Time = null;
    let currentStop = stop;

    // ─── PHASE 1: Walk candles chronologically from entry onwards ───
    for (const c of trackingCandles) {
        const ist = getISTTime(c.timestamp);

        // EOD cutoff at 3:20 PM IST
        if (ist.hours > 15 || (ist.hours === 15 && ist.minutes >= 20)) break;

        if (isLong) {
            const hitStopNow = c.low <= currentStop;
            const hitT1Now = !t1Hit && t1 !== null && c.high >= t1;
            const hitT2Now = t1Hit && t2 !== null && c.high >= t2;

            // ── T2 check (after T1 was already hit) ──
            if (t1Hit) {
                const hitBreakevenStop = c.low <= entry;

                if (hitBreakevenStop && hitT2Now) {
                    if (c.open > t1) {
                        return makeResult('T2_HIT', t2, c.timestamp, 2, true, true, false, risk, fillTime);
                    } else {
                        return makeResult('T1_HIT', entry, c.timestamp, 1, true, false, false, risk, fillTime);
                    }
                }
                if (hitT2Now) {
                    return makeResult('T2_HIT', t2, c.timestamp, 2, true, true, false, risk, fillTime);
                }
                if (hitBreakevenStop) {
                    return makeResult('T1_HIT', entry, c.timestamp, 1, true, false, false, risk, fillTime);
                }
                continue;
            }

            // ── Pre-T1: check for stop and T1 ──
            if (hitStopNow && hitT1Now) {
                if (c.open > entry) {
                    t1Hit = true;
                    t1Time = c.timestamp;
                    currentStop = entry;
                } else {
                    return makeResult('STOP_HIT', stop, c.timestamp, -1, false, false, true, risk, fillTime);
                }
            } else if (hitStopNow) {
                return makeResult('STOP_HIT', stop, c.timestamp, -1, false, false, true, risk, fillTime);
            } else if (hitT1Now) {
                t1Hit = true;
                t1Time = c.timestamp;
                currentStop = entry;
            }

        } else {
            // ── SHORT ──
            const hitStopNow = c.high >= currentStop;
            const hitT1Now = !t1Hit && t1 !== null && c.low <= t1;
            const hitT2Now = t1Hit && t2 !== null && c.low <= t2;

            if (t1Hit) {
                const hitBreakevenStop = c.high >= entry;

                if (hitBreakevenStop && hitT2Now) {
                    if (c.open < t1) {
                        return makeResult('T2_HIT', t2, c.timestamp, 2, true, true, false, risk, fillTime);
                    } else {
                        return makeResult('T1_HIT', entry, c.timestamp, 1, true, false, false, risk, fillTime);
                    }
                }
                if (hitT2Now) {
                    return makeResult('T2_HIT', t2, c.timestamp, 2, true, true, false, risk, fillTime);
                }
                if (hitBreakevenStop) {
                    return makeResult('T1_HIT', entry, c.timestamp, 1, true, false, false, risk, fillTime);
                }
                continue;
            }

            if (hitStopNow && hitT1Now) {
                if (c.open < entry) {
                    t1Hit = true;
                    t1Time = c.timestamp;
                    currentStop = entry;
                } else {
                    return makeResult('STOP_HIT', stop, c.timestamp, -1, false, false, true, risk, fillTime);
                }
            } else if (hitStopNow) {
                return makeResult('STOP_HIT', stop, c.timestamp, -1, false, false, true, risk, fillTime);
            } else if (hitT1Now) {
                t1Hit = true;
                t1Time = c.timestamp;
                currentStop = entry;
            }
        }
    }

    // ─── PHASE 2: EOD Close ───
    if (t1Hit) {
        const pnl = isLong ? (t1 - entry) : (entry - t1);
        return makeResult('T1_HIT', t1, t1Time, Math.round((pnl / risk) * 100) / 100, true, false, false, risk, fillTime);
    }

    const lastCandle = trackingCandles[trackingCandles.length - 1];
    const eodPrice = lastCandle.close;
    const pnl = isLong ? (eodPrice - entry) : (entry - eodPrice);

    return makeResult(
        'EOD_CLOSE',
        Math.round(eodPrice * 100) / 100,
        lastCandle.timestamp,
        Math.round((pnl / risk) * 100) / 100,
        false, false, false, risk, fillTime
    );
}

/**
 * Helper to construct a consistent result object.
 */
function makeResult(outcome, exitPrice, exitTime, rMultiple, hitT1, hitT2, hitStop, risk, fillTime) {
    return {
        outcome,
        exitPrice,
        exitTime,
        rMultiple,
        hitT1,
        hitT2,
        hitStop,
        risk,
        fillTime: fillTime || null
    };
}

/**
 * Evaluate the outcome of a signal using 30-minute candle data as a fallback.
 * 
 * Used when 1-minute data is unavailable. Evaluation is coarser but prevents 
 * valid signals from being marked NO_DATA. Follows the same chronological logic
 * but resolves ambiguity using the candle open price relative to entry.
 * 
 * @param {Object} signal - Signal parameters
 * @param {Array} candles - 30-minute OHLCV candles
 */
function evaluateOutcome30m(signal, candles) {
    const entry = parseFloat(signal.entryPrice);
    const stop = parseFloat(signal.stopPrice);
    const t1 = signal.t1Price ? parseFloat(signal.t1Price) : null;
    const t2 = signal.t2Price ? parseFloat(signal.t2Price) : null;
    const isLong = (signal.direction || 'LONG').toUpperCase() === 'LONG';

    if (!candles || candles.length === 0) {
        return makeResult('NO_DATA', entry, null, 0, false, false, false, 0);
    }

    const risk = Math.abs(entry - stop);
    if (risk === 0) {
        return makeResult('INVALID', entry, null, 0, false, false, false, 0);
    }

    // Filter to market hours only (9:15 AM to 3:20 PM IST)
    const marketCandles = filterMarketHours(candles);
    if (marketCandles.length === 0) {
        return makeResult('NO_DATA', entry, null, 0, false, false, false, risk);
    }

    // ─── FILL PHASE ───
    let fillIndex = -1;
    const signalTime = signal.confirmedAt || signal.createdAt;
    const signalTimeMs = signalTime ? new Date(signalTime).getTime() : null;

    for (let i = 0; i < marketCandles.length; i++) {
        const c = marketCandles[i];

        if (signalTimeMs) {
            const candleMs = new Date(c.timestamp).getTime();
            if (candleMs < signalTimeMs) continue;
        }

        if (isLong) {
            if (c.low <= entry || c.open <= entry) {
                fillIndex = i;
                break;
            }
        } else {
            if (c.high >= entry || c.open >= entry) {
                fillIndex = i;
                break;
            }
        }
    }

    if (fillIndex === -1) {
        return makeResult('NOT_FILLED', entry, null, 0, false, false, false, risk);
    }

    // ─── TRACKING PHASE ───
    // Like 1-min evaluation, we MUST skip the fill candle for tracking.
    // If the fill candle is the breakout candle, its high/low is the stop loss!
    // Including it would immediately trigger a false STOP_HIT.
    const trackingCandles = marketCandles.slice(fillIndex + 1);
    const fillTime = marketCandles[fillIndex].timestamp;

    if (trackingCandles.length === 0) {
        return makeResult('EOD_CLOSE', entry, fillTime, 0, false, false, false, risk, fillTime);
    }

    let t1Hit = false;
    let t1Time = null;
    let currentStop = stop;

    for (let i = 0; i < trackingCandles.length; i++) {
        const c = trackingCandles[i];

        if (isLong) {
            // Check Stop and T1
            const hitT1ThisCandle = !t1Hit && (c.high >= t1);
            const hitStopThisCandle = c.low <= currentStop;

            if (hitT1ThisCandle && hitStopThisCandle) {
                // Ambiguity resolution using open price
                if (c.open <= entry) {
                    // Open was below entry -> likely hit stop first
                    return makeResult('STOP_HIT', currentStop, c.timestamp, -1.0, false, false, true, risk, fillTime);
                } else {
                    // Open was above entry -> likely hit T1 first
                    t1Hit = true;
                    t1Time = c.timestamp;
                    currentStop = entry; // move stop to breakeven
                }
            } else if (hitStopThisCandle) {
                if (t1Hit) {
                    return makeResult('T1_HIT', currentStop, c.timestamp, 1.0, true, false, true, risk, fillTime);
                } else {
                    return makeResult('STOP_HIT', currentStop, c.timestamp, -1.0, false, false, true, risk, fillTime);
                }
            } else if (hitT1ThisCandle) {
                t1Hit = true;
                t1Time = c.timestamp;
                currentStop = entry;
            }

            // Check T2 if T1 was hit
            if (t1Hit && t2 && c.high >= t2) {
                return makeResult('T2_HIT', t2, c.timestamp, 2.0, true, true, false, risk, fillTime);
            }

        } else {
            // SHORT
            const hitT1ThisCandle = !t1Hit && (c.low <= t1);
            const hitStopThisCandle = c.high >= currentStop;

            if (hitT1ThisCandle && hitStopThisCandle) {
                // Ambiguity resolution
                if (c.open >= entry) {
                    return makeResult('STOP_HIT', currentStop, c.timestamp, -1.0, false, false, true, risk, fillTime);
                } else {
                    t1Hit = true;
                    t1Time = c.timestamp;
                    currentStop = entry;
                }
            } else if (hitStopThisCandle) {
                if (t1Hit) {
                    return makeResult('T1_HIT', currentStop, c.timestamp, 1.0, true, false, true, risk, fillTime);
                } else {
                    return makeResult('STOP_HIT', currentStop, c.timestamp, -1.0, false, false, true, risk, fillTime);
                }
            } else if (hitT1ThisCandle) {
                t1Hit = true;
                t1Time = c.timestamp;
                currentStop = entry;
            }

            if (t1Hit && t2 && c.low <= t2) {
                return makeResult('T2_HIT', t2, c.timestamp, 2.0, true, true, false, risk, fillTime);
            }
        }
    }

    // ─── EOD Close ───
    if (t1Hit) {
        const lastCandle = trackingCandles[trackingCandles.length - 1];
        const pnl = isLong ? (t1 - entry) : (entry - t1);
        return makeResult('T1_HIT', t1, t1Time, Math.round((pnl / risk) * 100) / 100, true, false, false, risk, fillTime);
    }

    const lastCandle = trackingCandles[trackingCandles.length - 1];
    const eodPrice = lastCandle.close;
    const pnl = isLong ? (eodPrice - entry) : (entry - eodPrice);

    return makeResult(
        'EOD_CLOSE',
        Math.round(eodPrice * 100) / 100,
        lastCandle.timestamp,
        Math.round((pnl / risk) * 100) / 100,
        false, false, false, risk, fillTime
    );
}

module.exports = {
    evaluateOutcome,
    evaluateOutcome30m,
    filterMarketHours,
    getISTTime
};
