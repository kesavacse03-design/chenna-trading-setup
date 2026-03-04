const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { todayIST, dateToIST, startOfDayUTC, endOfDayUTC, formatISTTime } = require('../utils/istUtils.cjs');

class DashboardService {

    // Helper to calculate date ranges (IST-aware)
    getDateRanges() {
        const todayStr = todayIST();
        const today = startOfDayUTC(todayStr);

        const todayDate = new Date(todayStr + 'T00:00:00Z');
        const startOfWeek = new Date(todayDate);
        startOfWeek.setDate(todayDate.getDate() - todayDate.getDay()); // Sunday as start

        const startOfMonth = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);

        return { today, todayStr, startOfWeek, startOfMonth };
    }

    async getSummary() {
        const { today, todayStr, startOfWeek, startOfMonth } = this.getDateRanges();

        const allClosed = await prisma.v5Position.findMany({
            where: { status: 'CLOSED' },
            include: { signal: true }
        });

        const openCount = await prisma.v5Position.count({ where: { status: 'OPEN' } });

        const pendingSignals = await prisma.v5Signal.count({
            where: {
                status: 'PENDING_CONFIRMATION',
                signalDate: {
                    gte: startOfDayUTC(todayStr),
                    lt: endOfDayUTC(todayStr)
                }
            }
        });

        // Setup Aggregation Buckets
        const aggs = {
            today: { totalTrades: 0, wins: 0, losses: 0, pnl: 0, pnlR: 0, openPositions: openCount, pendingSignals },
            thisWeek: { totalTrades: 0, wins: 0, losses: 0, pnl: 0, pnlR: 0, winRate: 0 },
            thisMonth: { totalTrades: 0, wins: 0, losses: 0, pnl: 0, pnlR: 0, winRate: 0 },
            byCategory: {}
        };

        for (const pos of allClosed) {
            const exitDate = new Date(pos.exitDate);
            const pnl = parseFloat(pos.realizedPnL) || 0;
            const rMult = parseFloat(pos.rMultiple) || 0;
            const isWin = pnl > 0;
            const isLoss = pnl < 0;

            // Today Bucket
            if (exitDate >= today) {
                aggs.today.totalTrades++;
                if (isWin) aggs.today.wins++;
                if (isLoss) aggs.today.losses++;
                aggs.today.pnl += pnl;
                aggs.today.pnlR += rMult;
            }

            // Week Bucket
            if (exitDate >= startOfWeek) {
                aggs.thisWeek.totalTrades++;
                if (isWin) aggs.thisWeek.wins++;
                if (isLoss) aggs.thisWeek.losses++;
                aggs.thisWeek.pnl += pnl;
                aggs.thisWeek.pnlR += rMult;
            }

            // Month Bucket
            if (exitDate >= startOfMonth) {
                aggs.thisMonth.totalTrades++;
                if (isWin) aggs.thisMonth.wins++;
                if (isLoss) aggs.thisMonth.losses++;
                aggs.thisMonth.pnl += pnl;
                aggs.thisMonth.pnlR += rMult;
            }

            // Category Bucket
            const cat = pos.signal?.category || 'UNKNOWN';
            if (!aggs.byCategory[cat]) {
                aggs.byCategory[cat] = { trades: 0, wins: 0, pnl: 0, wr: 0 };
            }
            aggs.byCategory[cat].trades++;
            if (isWin) aggs.byCategory[cat].wins++;
            aggs.byCategory[cat].pnl += pnl;
        }

        // Calculate Win Rates safely
        aggs.thisWeek.winRate = aggs.thisWeek.totalTrades > 0 ? (aggs.thisWeek.wins / aggs.thisWeek.totalTrades) * 100 : 0;
        aggs.thisMonth.winRate = aggs.thisMonth.totalTrades > 0 ? (aggs.thisMonth.wins / aggs.thisMonth.totalTrades) * 100 : 0;

        for (const cat in aggs.byCategory) {
            const c = aggs.byCategory[cat];
            c.wr = c.trades > 0 ? (c.wins / c.trades) * 100 : 0;
        }

        return aggs;
    }

    async getPositions() {
        const positions = await prisma.v5Position.findMany({
            where: { status: 'OPEN' },
            include: { signal: true },
            orderBy: { createdAt: 'desc' }
        });

        // Safety net: filter out stale intraday positions from previous days
        const todayStr = todayIST();
        const filtered = positions.filter(pos => {
            const isIntraday = pos.signal?.category === 'INTRADAY_BOOST' ||
                pos.signal?.category?.includes('INTRADAY');
            if (isIntraday) {
                // Only show intraday positions from today
                const entryDateStr = dateToIST(pos.entryDate);
                return entryDateStr === todayStr;
            }
            return true; // Show all swing positions
        });

        // Enrich positions with live prices and flatten signal data
        let livePriceService = null;
        try { livePriceService = require('./livePriceService.cjs'); } catch (e) { }

        return filtered.map(pos => {
            const entry = parseFloat(pos.entryPrice) || 0;
            const stop = parseFloat(pos.stopPrice) || 0;
            const t1 = pos.t1Price ? parseFloat(pos.t1Price) : 0;
            const t2 = pos.t2Price ? parseFloat(pos.t2Price) : 0;
            const qty = pos.quantity || 0;

            // Live price
            let currentPrice = null;
            let unrealizedPnl = null;
            let unrealizedPnlPct = null;
            let rMultiple = null;
            if (livePriceService) {
                const priceData = livePriceService.getPrice(pos.symbol);
                if (priceData && priceData.ltp) {
                    currentPrice = priceData.ltp;
                    const diff = pos.direction === 'LONG' ? (currentPrice - entry) : (entry - currentPrice);
                    unrealizedPnl = diff * qty;
                    unrealizedPnlPct = entry > 0 ? (diff / entry) * 100 : 0;
                    const risk = Math.abs(entry - stop);
                    rMultiple = risk > 0 ? diff / risk : 0;
                }
            }

            // Days held
            const entryDate = new Date(pos.entryDate);
            const now = new Date();
            const daysHeld = Math.max(0, Math.floor((now - entryDate) / 86400000));

            return {
                id: pos.id,
                signalId: pos.signalId,
                symbol: pos.symbol,
                direction: pos.direction,
                categoryKey: pos.signal?.category || 'UNKNOWN',
                entryType: pos.signal?.entryType || 'RETEST',
                entryPrice: entry,
                stopPrice: stop,
                targetPrice: t1,
                t1Price: t1,
                t2Price: t2,
                quantity: qty,
                status: pos.status,
                createdAt: pos.createdAt,
                daysHeld: daysHeld,
                currentPrice: currentPrice,
                currentPnL: unrealizedPnl || 0,
                currentPnLPercent: unrealizedPnlPct || 0,
                rMultiple: rMultiple ? parseFloat(rMultiple.toFixed(2)) : 0,
                positionValue: entry * qty,
                daysRemaining: Math.max(0, (pos.signal?.category === 'INTRADAY_BOOST' ? 0 : 5) - daysHeld),
            };
        });
    }

    async getTodaySignals(requestedDate = null) {
        const todayStr = todayIST();
        const queryDate = requestedDate || todayStr;
        const isHistorical = queryDate !== todayStr;
        const queryStart = startOfDayUTC(queryDate);
        const queryEnd = endOfDayUTC(queryDate);

        // Step 0: Auto-archive previous days' INTRADAY_BOOST signals (only when viewing today)
        if (!isHistorical) {
            try {
                const archived = await prisma.v5Signal.updateMany({
                    where: {
                        category: 'INTRADAY_BOOST',
                        signalDate: { lt: queryStart },
                        status: { in: ['CONFIRMED', 'EXPIRED'] }
                    },
                    data: { status: 'CLOSED' }
                });
                if (archived.count > 0) {
                    console.log(`[DashboardService] Auto-archived ${archived.count} old INTRADAY_BOOST signals`);
                }
            } catch (e) {
                console.error('[DashboardService] Auto-archive failed:', e.message);
            }
        }

        // Fetch signals for the requested date
        const [dateSignals, activeSwingSignals] = await Promise.all([
            prisma.v5Signal.findMany({
                where: {
                    signalDate: { gte: queryStart, lte: queryEnd }
                },
                orderBy: { confidenceScore: 'desc' }
            }),
            // Only include pending swing signals when viewing today
            isHistorical ? Promise.resolve([]) : prisma.v5Signal.findMany({
                where: {
                    status: 'PENDING_CONFIRMATION',
                    signalDate: { lt: queryStart },
                    category: { not: 'INTRADAY_BOOST' }
                },
                orderBy: { confidenceScore: 'desc' }
            })
        ]);

        // Merge, dedup by id
        const seenIds = new Set();
        const signals = [];
        for (const s of [...dateSignals, ...activeSwingSignals]) {
            if (!seenIds.has(s.id)) {
                seenIds.add(s.id);
                signals.push(s);
            }
        }

        // Enrich each signal with live price data + lifecycle age
        let livePriceService = null;
        try { livePriceService = require('./livePriceService.cjs'); } catch (e) { }

        let getSignalAge = null;
        try { getSignalAge = require('./signalLifecycleService.cjs').getSignalAge; } catch (e) { }

        const now = new Date();
        const enriched = signals.map(s => {
            const raw = { ...s };

            // Signal age from confirmedAt
            let signalTimeIST = null;
            let ageMinutes = null;
            if (s.confirmedAt) {
                const cAt = new Date(s.confirmedAt);
                signalTimeIST = cAt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
                ageMinutes = Math.floor((now - cAt) / 60000);
            }

            // Live price
            let ltp = null;
            let distancePct = null;
            let opportunityStatus = 'UNKNOWN';
            if (livePriceService && !isHistorical) {
                const priceData = livePriceService.getPrice(s.symbol);
                if (priceData && priceData.ltp) {
                    ltp = priceData.ltp;
                    const entry = parseFloat(s.entryPrice || s.signalClose) || 0;
                    if (entry > 0) {
                        const dir = s.direction || s.macd1hState || 'LONG';
                        distancePct = ((ltp - entry) / entry) * 100;

                        // Opportunity status logic
                        const terminalStatuses = ['EXPIRED', 'GONE', 'T1_HIT', 'T2_HIT', 'STOPPED'];

                        if (terminalStatuses.includes(s.status)) {
                            opportunityStatus = s.status;
                        } else {
                            const threshold = (s.entryType || 'RETEST') === 'RUNNER' ? 1.0 : 0.3;
                            const chaseThreshold = 1.0;

                            if (dir === 'LONG') {
                                if (ltp < entry) opportunityStatus = 'WAITING';
                                else if (distancePct <= threshold) opportunityStatus = 'LIVE';
                                else if (distancePct <= chaseThreshold) opportunityStatus = 'PARTIAL';
                                else opportunityStatus = 'GONE';
                            } else { // SHORT
                                if (ltp > entry) opportunityStatus = 'WAITING';
                                else if (Math.abs(distancePct) <= threshold) opportunityStatus = 'LIVE';
                                else if (Math.abs(distancePct) <= chaseThreshold) opportunityStatus = 'PARTIAL';
                                else opportunityStatus = 'GONE';
                            }
                        }
                    }
                }
            }

            // Fallback if no live price, but it has a terminal status
            if (opportunityStatus === 'UNKNOWN' && ['EXPIRED', 'GONE', 'T1_HIT', 'T2_HIT', 'STOPPED'].includes(s.status)) {
                opportunityStatus = s.status;
            } else if (opportunityStatus === 'UNKNOWN') {
                opportunityStatus = 'WAITING'; // base fallback for fresh signals
            }

            raw.signalTime = signalTimeIST;
            raw.ageMinutes = ageMinutes;
            raw.ltp = ltp;
            raw.distancePct = distancePct !== null ? parseFloat(distancePct.toFixed(2)) : null;
            raw.opportunityStatus = opportunityStatus;

            // Lifecycle age for swing signals
            if (getSignalAge && s.category !== 'INTRADAY_BOOST') {
                raw.lifecycle = getSignalAge(s.signalDate, s.category);
            }

            return raw;
        });

        // For today: only show actionable signals (trader cares about what to trade NOW)
        // For historical: show outcomes (T1_HIT, T2_HIT, STOPPED) so user can verify past performance
        const actionableStatuses = ['CONFIRMED', 'WAITING', 'PARTIAL', 'LIVE', 'PENDING_CONFIRMATION', 'PENDING'];
        const outcomeStatuses = ['T1_HIT', 'T2_HIT', 'STOPPED', 'EXPIRED', 'GONE'];
        const showStatuses = isHistorical
            ? [...actionableStatuses, ...outcomeStatuses]
            : actionableStatuses;

        const grouped = {
            PENDING: enriched.filter(s => s.status === 'PENDING_CONFIRMATION' || s.status === 'PENDING'),
            CONFIRMED: enriched.filter(s => showStatuses.includes(s.status)),
            EXPIRED: enriched.filter(s => false),
            EXECUTED: enriched.filter(s => s.status === 'EXECUTED')
        };
        return grouped;
    }

    async getHistory(days) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - parseInt(days));

        return await prisma.v5Position.findMany({
            where: {
                status: 'CLOSED',
                exitDate: { gte: cutoff }
            },
            include: { signal: true },
            orderBy: { exitDate: 'desc' }
        });
    }
}

module.exports = new DashboardService();
