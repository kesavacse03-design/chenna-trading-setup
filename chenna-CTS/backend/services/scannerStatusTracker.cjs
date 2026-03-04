/**
 * Scanner Status Tracker
 * 
 * Maintains an in-memory map of all INTRADAY_BOOST stocks and their current
 * scanning status. Updated by the signal scheduler each scan cycle.
 * 
 * Reads the scan_logs and cache data to determine each stock's real-time status.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');
const { todayIST, dateToIST, currentISTTime } = require('../utils/istUtils.cjs');

const CACHE_DIR_30M = path.join(__dirname, '../cache/30minute');

class ScannerStatusTracker {
    constructor() {
        this.stocks = new Map(); // symbol → status object
        this.lastUpdated = null;
    }

    /**
     * Update all stock statuses. Called each scan cycle.
     */
    async updateAll() {
        const today = todayIST();

        // 1. Get today's IB stocks
        const ibCats = await prisma.stockCategory.findMany({
            where: { category: { key: 'INTRADAY_BOOST' } },
            include: { stock: true }
        });

        const todayStocks = ibCats.filter(r => {
            if (!r.addedDate) return false;
            return dateToIST(r.addedDate) === today;
        }).map(r => r.stock);

        // 2. Get existing signals for today
        const existingSignals = await prisma.v5Signal.findMany({
            where: {
                category: 'INTRADAY_BOOST',
                signalDate: { gte: new Date(today + 'T00:00:00Z') }
            }
        });
        const signalMap = {};
        for (const sig of existingSignals) signalMap[sig.symbol] = sig;

        // 3. Read latest scan log
        const logPath = path.join(__dirname, `../scan_logs/${today}.json`);
        let latestLog = {};
        if (fs.existsSync(logPath)) {
            try {
                const allScans = JSON.parse(fs.readFileSync(logPath, 'utf8'));
                if (allScans.length > 0) {
                    const latest = allScans[allScans.length - 1];
                    for (const entry of (latest.results || [])) {
                        latestLog[entry.symbol] = entry;
                    }
                }
            } catch (e) { }
        }

        // 4. Determine status for each stock
        this.stocks.clear();

        for (const stock of todayStocks) {
            const sym = stock.symbol;
            const signal = signalMap[sym];
            const logEntry = latestLog[sym];

            let status = 'UNKNOWN';
            let statusMessage = '';
            let orHigh = null, orLow = null, orRangePct = null;
            let currentPrice = null;
            let breakoutPercent = null;

            // Read 30m cache for OR data
            const cleanKey = sym.replace(/[^a-zA-Z0-9_-]/g, '_');
            const cachePath = path.join(CACHE_DIR_30M, `${cleanKey}_master.json`);
            if (fs.existsSync(cachePath)) {
                try {
                    const raw = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
                    const todayCandles = raw.filter(c => {
                        const d = String(c.timestamp || c.date).split('T')[0];
                        return d === today;
                    });

                    if (todayCandles.length >= 1) {
                        const c1 = todayCandles[0];
                        orHigh = parseFloat(c1.high);
                        orLow = parseFloat(c1.low);
                        const orRange = orHigh - orLow;
                        orRangePct = orRange > 0 ? ((orRange / parseFloat(c1.open)) * 100).toFixed(2) : '0';

                        // Get latest candle price
                        const latest = todayCandles[todayCandles.length - 1];
                        currentPrice = parseFloat(latest.close);
                    }
                } catch (e) { }
            }

            // Determine status based on available data
            if (signal) {
                if (signal.status === 'CONFIRMED') {
                    status = 'SIGNAL_GENERATED';
                    statusMessage = `${signal.direction} ${signal.entryType || 'RETEST'} @ ₹${parseFloat(signal.entryPrice).toFixed(2)}`;
                } else if (signal.status === 'EXPIRED') {
                    status = 'BREAKOUT_FAILED';
                    statusMessage = 'Signal expired — breakout reversed';
                } else {
                    status = 'SIGNAL_GENERATED';
                    statusMessage = `${signal.direction} — ${signal.status}`;
                }
            } else if (logEntry) {
                if (logEntry.reason?.includes('DUPLICATE')) {
                    status = 'SIGNAL_GENERATED';
                    statusMessage = 'Already has signal today';
                } else if (logEntry.reason?.includes('NO_BREAKOUT')) {
                    // Check if price is close to OR boundary
                    if (currentPrice && orHigh && orLow) {
                        const distToHigh = ((orHigh - currentPrice) / orHigh) * 100;
                        const distToLow = ((currentPrice - orLow) / orLow) * 100;
                        const minDist = Math.min(Math.abs(distToHigh), Math.abs(distToLow));

                        if (minDist < 0.5) {
                            status = 'APPROACHING_BREAKOUT';
                            const side = distToHigh < distToLow ? 'LONG' : 'SHORT';
                            breakoutPercent = Math.round((1 - minDist / 1) * 100);
                            statusMessage = `Testing OR ${side === 'LONG' ? 'High' : 'Low'} — ${minDist.toFixed(2)}% away`;
                        } else {
                            status = 'SIDEWAYS';
                            statusMessage = 'Trading inside OR range, no momentum';
                        }
                    } else {
                        status = 'SIDEWAYS';
                        statusMessage = logEntry.reason;
                    }
                } else if (logEntry.reason?.includes('NO_30M_DATA')) {
                    status = 'OR_FORMING';
                    statusMessage = 'Waiting for 30-minute candle data';
                } else if (logEntry.reason?.includes('INSUFFICIENT_CANDLES')) {
                    status = 'OR_FORMING';
                    statusMessage = 'OR still forming (need more candles)';
                } else if (logEntry.reason?.includes('ZERO_OR_RANGE')) {
                    status = 'LOW_VOLUME';
                    statusMessage = 'Opening range has zero range — no volatility';
                } else {
                    status = 'UNKNOWN';
                    statusMessage = logEntry.reason || 'No data available';
                }
            } else {
                // No signal and no log entry — stock hasn't been scanned yet
                status = 'OR_FORMING';
                statusMessage = 'Awaiting first scan cycle';
            }

            this.stocks.set(sym, {
                symbol: sym,
                name: stock.name,
                sector: stock.sector || null,
                status,
                statusMessage,
                orHigh,
                orLow,
                orRangePct: orRangePct ? parseFloat(orRangePct) : null,
                currentPrice,
                breakoutPercent,
                signalGenerated: !!signal,
                signalId: signal?.id || null,
                lastUpdated: currentISTTime()
            });
        }

        this.lastUpdated = currentISTTime();
    }

    /**
     * Get all stocks grouped by status.
     */
    getGrouped() {
        const groups = {
            APPROACHING_BREAKOUT: [],
            OR_FORMING: [],
            SIGNAL_GENERATED: [],
            SIDEWAYS: [],
            BREAKOUT_FAILED: [],
            LOW_VOLUME: [],
            UNKNOWN: []
        };

        const summary = {};
        for (const key of Object.keys(groups)) summary[key] = 0;

        for (const [, stock] of this.stocks) {
            const group = groups[stock.status] || groups.UNKNOWN;
            group.push(stock);
            summary[stock.status] = (summary[stock.status] || 0) + 1;
        }

        // Sort: approaching breakout by breakoutPercent desc, others alphabetically
        groups.APPROACHING_BREAKOUT.sort((a, b) => (b.breakoutPercent || 0) - (a.breakoutPercent || 0));

        return {
            lastUpdated: this.lastUpdated,
            totalStocks: this.stocks.size,
            summary,
            groups
        };
    }
}

// Singleton
const tracker = new ScannerStatusTracker();

module.exports = tracker;
