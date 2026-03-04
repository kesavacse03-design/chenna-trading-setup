/**
 * Event Reconstruction Service
 * 
 * PURPOSE: Extract what ACTUALLY happened on a stock's addedDate
 * 
 * Philosophy:
 * - The DATE is ground truth
 * - The CATEGORY is a weak label/hint
 * - We reconstruct RAW BEHAVIORS, not indicator values
 * 
 * Used by:
 * - Pre-Labs validation (reject stocks with no meaningful event)
 * - Category signature learning (aggregate behaviors across stocks)
 * - Signal quality gate (verify event before allowing signal)
 */

const { PrismaClient } = require('@prisma/client');
const SupportResistanceCalculator = require('../strategy/supportResistance.cjs');

const prisma = new PrismaClient();

class EventReconstructor {

    /**
     * Reconstruct what happened on a specific date for a stock
     * 
     * @param {string} symbol - Stock symbol
     * @param {Date|string} eventDate - The addedDate (when stock was tagged)
     * @param {string} categoryHint - Optional: category for context
     * @returns {Object} Event reconstruction with behaviors and quality score
     */
    async reconstructEvent(symbol, eventDate, categoryHint = null) {
        const date = new Date(eventDate);
        const dateStr = date.toISOString().split('T')[0];

        console.log(`[EventReconstructor] Reconstructing ${symbol} on ${dateStr}`);

        try {
            // 1. Get candles around the event date
            const candles = await this.getCandlesAroundDate(symbol, date);

            if (!candles || candles.length < 20) {
                return {
                    symbol,
                    date: dateStr,
                    valid: false,
                    reason: 'insufficient_data',
                    behaviors: {},
                    eventScore: 0
                };
            }

            // 2. Find the event day candle
            const eventDayIndex = this.findEventDayIndex(candles, date);
            if (eventDayIndex < 0) {
                return {
                    symbol,
                    date: dateStr,
                    valid: false,
                    reason: 'event_day_not_found',
                    behaviors: {},
                    eventScore: 0
                };
            }

            // 3. Extract RAW BEHAVIORS (not indicators!)
            const behaviors = this.extractBehaviors(candles, eventDayIndex);

            // 4. Calculate event quality score
            const eventScore = this.calculateEventScore(behaviors, categoryHint);

            // 5. Determine if event is valid (something meaningful happened)
            const valid = eventScore >= 30; // Minimum threshold for "meaningful"

            return {
                symbol,
                date: dateStr,
                categoryHint,
                valid,
                reason: valid ? 'meaningful_event' : 'no_significant_activity',
                behaviors,
                eventScore,
                eventDayIndex,
                candleCount: candles.length
            };

        } catch (error) {
            console.error(`[EventReconstructor] Error for ${symbol}:`, error.message);
            return {
                symbol,
                date: dateStr,
                valid: false,
                reason: 'error',
                error: error.message,
                behaviors: {},
                eventScore: 0
            };
        }
    }

    /**
     * Get candles around the event date (before + during + after)
     * We need context: what led up to the event and what followed
     */
    async getCandlesAroundDate(symbol, eventDate, daysBefore = 30, daysAfter = 10) {
        try {
            const cached = await prisma.ohlcvCache.findFirst({
                where: { symbol, interval: 'day' },
                orderBy: { createdAt: 'desc' }
            });

            if (!cached || !cached.data) return null;

            let candles = cached.data;
            if (typeof candles === 'string') {
                candles = JSON.parse(candles);
            }

            // Normalize candle format
            candles = candles.map(c => {
                if (Array.isArray(c)) {
                    return {
                        timestamp: c[0],
                        open: parseFloat(c[1]) || 0,
                        high: parseFloat(c[2]) || 0,
                        low: parseFloat(c[3]) || 0,
                        close: parseFloat(c[4]) || 0,
                        volume: parseInt(c[5]) || 0
                    };
                }
                return {
                    timestamp: c.timestamp || c.date,
                    open: parseFloat(c.open) || 0,
                    high: parseFloat(c.high) || 0,
                    low: parseFloat(c.low) || 0,
                    close: parseFloat(c.close) || 0,
                    volume: parseInt(c.volume) || 0
                };
            }).filter(c => c.close > 0);

            // Sort by date
            candles.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            return candles;

        } catch (error) {
            console.error(`[EventReconstructor] Candle fetch error:`, error.message);
            return null;
        }
    }

    /**
     * Find the index of the event day candle
     */
    findEventDayIndex(candles, eventDate) {
        const eventDateStr = eventDate.toISOString().split('T')[0];

        for (let i = 0; i < candles.length; i++) {
            const candleDate = new Date(candles[i].timestamp).toISOString().split('T')[0];
            if (candleDate === eventDateStr) {
                return i;
            }
        }

        // If exact date not found, find closest date
        const eventTime = eventDate.getTime();
        let closestIdx = -1;
        let minDiff = Infinity;

        for (let i = 0; i < candles.length; i++) {
            const candleTime = new Date(candles[i].timestamp).getTime();
            const diff = Math.abs(candleTime - eventTime);
            if (diff < minDiff && diff < 3 * 24 * 60 * 60 * 1000) { // Within 3 days
                minDiff = diff;
                closestIdx = i;
            }
        }

        return closestIdx;
    }

    /**
     * Extract RAW BEHAVIORS from price action
     * These are structural observations, NOT indicator values
     */
    extractBehaviors(candles, eventDayIdx) {
        const eventCandle = candles[eventDayIdx];
        const priorCandles = candles.slice(Math.max(0, eventDayIdx - 20), eventDayIdx);
        const afterCandles = candles.slice(eventDayIdx + 1, Math.min(candles.length, eventDayIdx + 6));

        const behaviors = {};

        // === PRICE POSITION BEHAVIORS ===

        // Distance to recent high/low
        const recentHighs = priorCandles.map(c => c.high);
        const recentLows = priorCandles.map(c => c.low);
        const recentHigh = recentHighs.length > 0 ? Math.max(...recentHighs) : eventCandle.high;
        const recentLow = recentLows.length > 0 ? Math.min(...recentLows) : eventCandle.low;

        behaviors.distanceToRecentHigh = (recentHigh - eventCandle.close) / eventCandle.close * 100;
        behaviors.distanceToRecentLow = (eventCandle.close - recentLow) / eventCandle.close * 100;
        behaviors.nearRecentHigh = behaviors.distanceToRecentHigh < 2; // Within 2%
        behaviors.nearRecentLow = behaviors.distanceToRecentLow < 2;

        // === CANDLE STRUCTURE BEHAVIORS ===

        // Wick analysis (buying/selling pressure)
        const range = eventCandle.high - eventCandle.low;
        const body = Math.abs(eventCandle.close - eventCandle.open);
        const upperWick = eventCandle.high - Math.max(eventCandle.open, eventCandle.close);
        const lowerWick = Math.min(eventCandle.open, eventCandle.close) - eventCandle.low;

        behaviors.upperWickPct = range > 0 ? (upperWick / range) * 100 : 0;
        behaviors.lowerWickPct = range > 0 ? (lowerWick / range) * 100 : 0;
        behaviors.bodyPct = range > 0 ? (body / range) * 100 : 0;
        behaviors.wickDominance = behaviors.lowerWickPct > 30 ? 'lower' :
            (behaviors.upperWickPct > 30 ? 'upper' : 'neutral');
        behaviors.isBullishCandle = eventCandle.close > eventCandle.open;

        // === VOLUME BEHAVIORS ===

        const avgVolume = priorCandles.length > 0
            ? priorCandles.reduce((sum, c) => sum + c.volume, 0) / priorCandles.length
            : eventCandle.volume;

        behaviors.volumeVsAvg = avgVolume > 0 ? eventCandle.volume / avgVolume : 1;
        behaviors.volumeExpansion = behaviors.volumeVsAvg > 1.5;
        behaviors.volumeExhaustion = behaviors.volumeVsAvg < 0.7;

        // === STRUCTURAL BEHAVIORS ===

        // Support/Resistance interaction
        const srContext = SupportResistanceCalculator.generateContext(priorCandles);
        behaviors.nearSupport = srContext.nearSupport || false;
        behaviors.nearResistance = srContext.nearResistance || false;
        behaviors.resistanceTests = srContext.resistanceTests || 0;
        behaviors.supportTests = srContext.supportTests || 0;

        // === RANGE BEHAVIORS ===

        // How big was this day vs prior days?
        const priorRanges = priorCandles.map(c => c.high - c.low);
        const avgRange = priorRanges.length > 0
            ? priorRanges.reduce((a, b) => a + b, 0) / priorRanges.length
            : range;

        behaviors.rangeVsAvg = avgRange > 0 ? range / avgRange : 1;
        behaviors.bigDay = behaviors.rangeVsAvg > 1.5;
        behaviors.contractedDay = behaviors.rangeVsAvg < 0.5;

        // === BREAKOUT BEHAVIORS ===

        // Did price break prior range?
        const prior5High = priorCandles.slice(-5).length > 0
            ? Math.max(...priorCandles.slice(-5).map(c => c.high))
            : recentHigh;
        const prior5Low = priorCandles.slice(-5).length > 0
            ? Math.min(...priorCandles.slice(-5).map(c => c.low))
            : recentLow;

        behaviors.brokeAbovePrior5 = eventCandle.high > prior5High;
        behaviors.brokeBelowPrior5 = eventCandle.low < prior5Low;
        behaviors.breakoutAttempt = behaviors.brokeAbovePrior5 || behaviors.brokeBelowPrior5;

        // === FOLLOW-THROUGH BEHAVIORS (if we have after data) ===

        if (afterCandles.length > 0) {
            const nextDayClose = afterCandles[0].close;
            behaviors.nextDayFollowThrough = eventCandle.close > eventCandle.open
                ? nextDayClose > eventCandle.close  // Bullish follow-through
                : nextDayClose < eventCandle.close; // Bearish follow-through
            behaviors.nextDayRejection = !behaviors.nextDayFollowThrough;
        } else {
            behaviors.nextDayFollowThrough = null;
            behaviors.nextDayRejection = null;
        }

        return behaviors;
    }

    /**
     * Calculate event quality score (0-100)
     * Higher = more meaningful event happened
     */
    calculateEventScore(behaviors, categoryHint = null) {
        let score = 0;

        // === UNIVERSAL SCORING (applies to all categories) ===

        // Volume activity (+20 max)
        if (behaviors.volumeExpansion) score += 20;
        else if (behaviors.volumeVsAvg > 1.2) score += 10;
        else if (behaviors.volumeExhaustion) score += 5; // Low vol can still be meaningful

        // Range/movement (+15 max)
        if (behaviors.bigDay) score += 15;
        else if (behaviors.rangeVsAvg > 1.0) score += 8;
        else if (behaviors.contractedDay) score += 5; // Contraction is also meaningful

        // Structural interaction (+25 max)
        if (behaviors.nearResistance && behaviors.resistanceTests >= 2) score += 25;
        else if (behaviors.nearSupport && behaviors.supportTests >= 2) score += 25;
        else if (behaviors.nearResistance || behaviors.nearSupport) score += 15;
        else if (behaviors.resistanceTests >= 2 || behaviors.supportTests >= 2) score += 10;

        // Wick/rejection patterns (+15 max)
        if (behaviors.lowerWickPct > 40) score += 15; // Strong buying
        else if (behaviors.upperWickPct > 40) score += 15; // Strong selling
        else if (behaviors.lowerWickPct > 25 || behaviors.upperWickPct > 25) score += 8;

        // Breakout attempt (+15 max)
        if (behaviors.breakoutAttempt) score += 15;

        // Extreme positioning (+10 max)
        if (behaviors.nearRecentHigh || behaviors.nearRecentLow) score += 10;

        // Cap at 100
        return Math.min(100, score);
    }

    /**
     * Batch reconstruct events for multiple stocks
     */
    async reconstructBatch(stockDatePairs) {
        const results = [];

        for (const { symbol, date, categoryHint } of stockDatePairs) {
            const event = await this.reconstructEvent(symbol, date, categoryHint);
            results.push(event);
        }

        return results;
    }

    /**
     * Get statistics about event validity for a category
     */
    async getCategoryEventStats(categoryKey) {
        // Get all stocks in category with their dates
        const stockCategories = await prisma.stockCategory.findMany({
            where: { category: { key: categoryKey } },
            include: {
                stock: true,
                category: true
            }
        });

        const events = [];
        let valid = 0;
        let invalid = 0;

        for (const sc of stockCategories.slice(0, 50)) { // Limit for performance
            const event = await this.reconstructEvent(
                sc.stock.symbol,
                sc.addedDate,
                categoryKey
            );
            events.push(event);
            if (event.valid) valid++;
            else invalid++;
        }

        const avgScore = events.length > 0
            ? events.reduce((sum, e) => sum + e.eventScore, 0) / events.length
            : 0;

        return {
            categoryKey,
            stocksAnalyzed: events.length,
            validEvents: valid,
            invalidEvents: invalid,
            validRate: events.length > 0 ? (valid / events.length * 100).toFixed(1) + '%' : '0%',
            avgEventScore: avgScore.toFixed(1),
            events
        };
    }
}

module.exports = new EventReconstructor();
