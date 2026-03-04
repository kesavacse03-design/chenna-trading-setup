/**
 * Intraday Watch Service — Real-Time IB Stock Phase Tracking
 *
 * Tracks all INTRADAY_BOOST stocks through 4 phases during market hours:
 *   Phase 1 — FORMING:      9:15–9:45, calculating OR High/Low
 *   Phase 2 — APPROACHING:  Price within 0.3% of OR boundary
 *   Phase 3 — BREAKOUT:     5-min candle closes outside OR
 *   Phase 4 — SIGNAL:       Retest confirmed, signal created
 *   WATCHING:               Post-OR, price inside range, no breakout yet
 *   NO_BREAKOUT:            After session, never broke out
 *
 * Called by signalScheduler.cjs every scan cycle.
 * API: GET /api/v5/watchlist/intraday
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { todayIST, dateToIST } = require('../utils/istUtils.cjs');

const APPROACH_THRESHOLD = 0.003; // 0.3% — price within this distance triggers APPROACHING

class IntradayWatchService {
    constructor() {
        // In-memory state for all IB stocks — keyed by symbol
        this.stocks = {};
        this.lastUpdate = null;
        this.orFormed = false;
    }

    /**
     * Main update loop — called every scan cycle by signalScheduler
     */
    async update() {
        const today = todayIST();
        const now = new Date();
        const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const h = istNow.getHours();
        const m = istNow.getMinutes();
        const t = h * 60 + m;

        // Only run during market hours (9:15 – 15:30)
        if (t < 9 * 60 + 15 || t > 15 * 60 + 30) {
            return { phase: 'MARKET_CLOSED', stocks: Object.values(this.stocks) };
        }

        // Step 1: Load IB stocks if not loaded today
        if (Object.keys(this.stocks).length === 0 || this._loadedDate !== today) {
            await this._loadStocks(today);
        }

        // Step 2: Get latest prices for all stocks
        let livePriceService = null;
        try { livePriceService = require('./livePriceService.cjs'); } catch (e) { }

        // Step 3: Update each stock's phase
        for (const sym of Object.keys(this.stocks)) {
            const stock = this.stocks[sym];

            // Get live price
            if (livePriceService) {
                const priceData = livePriceService.getPrice(sym);
                if (priceData && priceData.ltp) {
                    stock.currentPrice = priceData.ltp;
                    stock.lastPriceUpdate = new Date().toISOString();
                }
            }

            // Phase 1: OR still forming (before 9:45)
            if (t < 9 * 60 + 45) {
                stock.phase = 'FORMING';
                continue;
            }

            // Mark OR as formed
            if (!this.orFormed && t >= 9 * 60 + 45) {
                this.orFormed = true;
                // OR levels are calculated by confirmIntradaySignals — we load them
                await this._loadORLevels(today);
            }

            // If no OR data, can't track
            if (!stock.orHigh || !stock.orLow) {
                stock.phase = 'NO_DATA';
                continue;
            }

            // If signal already created for this stock today
            if (stock.signalId) {
                stock.phase = 'SIGNAL';
                continue;
            }

            // If breakout already detected
            if (stock.breakoutDetected) {
                // Check for retest (price came back to OR level)
                if (stock.breakoutDirection === 'LONG' && stock.currentPrice) {
                    if (stock.currentPrice <= stock.orHigh * 1.003 && stock.currentPrice >= stock.orHigh * 0.997) {
                        stock.phase = 'RETEST_ZONE';
                    }
                } else if (stock.breakoutDirection === 'SHORT' && stock.currentPrice) {
                    if (stock.currentPrice >= stock.orLow * 0.997 && stock.currentPrice <= stock.orLow * 1.003) {
                        stock.phase = 'RETEST_ZONE';
                    }
                }
                if (stock.phase !== 'RETEST_ZONE') stock.phase = 'BREAKOUT';
                continue;
            }

            // Check if price is approaching OR boundary
            if (stock.currentPrice) {
                const distToHigh = (stock.orHigh - stock.currentPrice) / stock.orHigh;
                const distToLow = (stock.currentPrice - stock.orLow) / stock.orLow;

                // Approaching LONG breakout (near OR high from below)
                if (distToHigh >= 0 && distToHigh <= APPROACH_THRESHOLD) {
                    stock.phase = 'APPROACHING';
                    stock.approachDirection = 'LONG';
                    stock.approachLevel = stock.orHigh;
                    stock.approachDistance = (distToHigh * 100).toFixed(2) + '%';
                    continue;
                }

                // Approaching SHORT breakout (near OR low from above)
                if (distToLow >= 0 && distToLow <= APPROACH_THRESHOLD) {
                    stock.phase = 'APPROACHING';
                    stock.approachDirection = 'SHORT';
                    stock.approachLevel = stock.orLow;
                    stock.approachDistance = (distToLow * 100).toFixed(2) + '%';
                    continue;
                }

                // Above OR High = already broken out LONG
                if (stock.currentPrice > stock.orHigh) {
                    stock.phase = 'BREAKOUT';
                    stock.breakoutDetected = true;
                    stock.breakoutDirection = 'LONG';
                    stock.breakoutPrice = stock.currentPrice;
                    stock.breakoutTime = new Date().toLocaleTimeString('en-IN', {
                        timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true
                    });
                    // Create alert
                    await this._createBreakoutAlert(sym, 'LONG', stock);
                    continue;
                }

                // Below OR Low = already broken out SHORT
                if (stock.currentPrice < stock.orLow) {
                    stock.phase = 'BREAKOUT';
                    stock.breakoutDetected = true;
                    stock.breakoutDirection = 'SHORT';
                    stock.breakoutPrice = stock.currentPrice;
                    stock.breakoutTime = new Date().toLocaleTimeString('en-IN', {
                        timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true
                    });
                    await this._createBreakoutAlert(sym, 'SHORT', stock);
                    continue;
                }

                // Inside OR range — just watching
                stock.phase = 'WATCHING';
            } else {
                stock.phase = 'NO_PRICE';
            }
        }

        this.lastUpdate = new Date().toISOString();
        return this.getStatus();
    }

    /**
     * Get current watchlist status for API
     */
    getStatus() {
        const stocks = Object.values(this.stocks);
        const byPhase = {
            FORMING: stocks.filter(s => s.phase === 'FORMING'),
            APPROACHING: stocks.filter(s => s.phase === 'APPROACHING'),
            BREAKOUT: stocks.filter(s => s.phase === 'BREAKOUT' || s.phase === 'RETEST_ZONE'),
            SIGNAL: stocks.filter(s => s.phase === 'SIGNAL'),
            WATCHING: stocks.filter(s => s.phase === 'WATCHING'),
            NO_BREAKOUT: stocks.filter(s => s.phase === 'NO_BREAKOUT' || s.phase === 'NO_DATA' || s.phase === 'NO_PRICE'),
        };

        return {
            lastUpdate: this.lastUpdate,
            total: stocks.length,
            summary: {
                forming: byPhase.FORMING.length,
                approaching: byPhase.APPROACHING.length,
                breakout: byPhase.BREAKOUT.length,
                signal: byPhase.SIGNAL.length,
                watching: byPhase.WATCHING.length,
                noBreakout: byPhase.NO_BREAKOUT.length,
            },
            // Approaching stocks first (most urgent), then breakouts, then signals
            stocks: [
                ...byPhase.APPROACHING.map(s => ({ ...s, urgency: 1 })),
                ...byPhase.BREAKOUT.map(s => ({ ...s, urgency: 2 })),
                ...byPhase.SIGNAL.map(s => ({ ...s, urgency: 3 })),
                ...byPhase.WATCHING.map(s => ({ ...s, urgency: 4 })),
                ...byPhase.FORMING.map(s => ({ ...s, urgency: 5 })),
                ...byPhase.NO_BREAKOUT.map(s => ({ ...s, urgency: 6 })),
            ]
        };
    }

    // ─── Private Methods ───────────────────────────────────────

    async _loadStocks(today) {
        try {
            const ibCats = await prisma.stockCategory.findMany({
                where: { category: { key: 'INTRADAY_BOOST' } },
                include: { stock: true }
            });

            // Only include stocks added for today
            const activeStocks = ibCats.filter(r => {
                if (!r.addedDate) return false;
                return dateToIST(r.addedDate) === today;
            }).map(r => r.stock);

            this.stocks = {};
            for (const stock of activeStocks) {
                this.stocks[stock.symbol] = {
                    symbol: stock.symbol,
                    instrumentKey: stock.instrumentKey || null,
                    sector: stock.sector || null,
                    phase: 'FORMING',
                    orHigh: null,
                    orLow: null,
                    orRangePct: null,
                    currentPrice: null,
                    lastPriceUpdate: null,
                    breakoutDetected: false,
                    breakoutDirection: null,
                    breakoutPrice: null,
                    breakoutTime: null,
                    approachDirection: null,
                    approachLevel: null,
                    approachDistance: null,
                    signalId: null,
                };
            }

            this._loadedDate = today;
            console.log(`[WatchService] Loaded ${activeStocks.length} IB stocks for ${today}`);
        } catch (e) {
            console.error('[WatchService] Failed to load stocks:', e.message);
        }
    }

    async _loadORLevels(today) {
        // Try to get OR levels from the latest intraday candle cache
        const fs = require('fs');
        const path = require('path');
        const CACHE_1M = path.join(__dirname, '../cache/1minute');

        for (const sym of Object.keys(this.stocks)) {
            try {
                // Load 1-min data for this stock
                const files = fs.readdirSync(CACHE_1M).filter(f => f.startsWith(sym + '_') && f.endsWith('_master.json'));
                if (files.length === 0) continue;

                const data = JSON.parse(fs.readFileSync(path.join(CACHE_1M, files[0]), 'utf8'));
                const todayCandles = data.filter(c => String(c.timestamp || c.date).split('T')[0] === today);

                if (todayCandles.length < 6) continue;

                // First 6 candles = OR (9:15 to 9:45, each 5 min aggregated from 1-min)
                // Aggregate 1-min candles into 5-min periods
                const sorted = todayCandles.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                const first30 = sorted.slice(0, 30); // First 30 1-min candles = first 30 minutes

                if (first30.length < 20) continue; // Need at least 20 1-min candles for OR

                let orh = -Infinity, orl = Infinity;
                for (const c of first30) {
                    if (parseFloat(c.high) > orh) orh = parseFloat(c.high);
                    if (parseFloat(c.low) < orl) orl = parseFloat(c.low);
                }

                this.stocks[sym].orHigh = orh;
                this.stocks[sym].orLow = orl;
                this.stocks[sym].orRangePct = ((orh - orl) / orl * 100).toFixed(2);
            } catch (e) {
                // Skip — OR will be loaded when confirmationService runs
            }
        }

        // Also check if confirmationService has created signals today
        await this._checkExistingSignals(today);
    }

    async _checkExistingSignals(today) {
        try {
            const { startOfDayUTC, endOfDayUTC } = require('../utils/istUtils.cjs');
            const start = startOfDayUTC(today);
            const end = endOfDayUTC(today);

            const signals = await prisma.v5Signal.findMany({
                where: {
                    category: 'INTRADAY_BOOST',
                    signalDate: { gte: start, lte: end }
                },
                select: { id: true, symbol: true, direction: true, entryPrice: true, status: true }
            });

            for (const sig of signals) {
                if (this.stocks[sig.symbol]) {
                    this.stocks[sig.symbol].signalId = sig.id;
                    this.stocks[sig.symbol].phase = 'SIGNAL';
                    this.stocks[sig.symbol].breakoutDirection = sig.direction;
                }
            }
        } catch (e) {
            console.error('[WatchService] Signal check failed:', e.message);
        }
    }

    async _createBreakoutAlert(symbol, direction, stock) {
        try {
            const alertService = require('./alertService.cjs');
            const level = direction === 'LONG' ? stock.orHigh : stock.orLow;
            await alertService.createAlert(symbol, 'BREAKOUT', 'INTRADAY_BOOST', direction, stock.currentPrice, {
                orHigh: stock.orHigh,
                orLow: stock.orLow,
                message: `Place LIMIT ORDER at ₹${level.toFixed(1)} for ${direction === 'LONG' ? 'RETEST LONG' : 'RETEST SHORT'} entry`
            });
        } catch (e) {
            console.error(`[WatchService] Alert creation failed for ${symbol}:`, e.message);
        }
    }
}

module.exports = new IntradayWatchService();
