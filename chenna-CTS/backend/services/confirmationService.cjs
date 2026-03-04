const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');
const alertService = require('./alertService.cjs');
const { dateToIST, todayIST, importDateIST } = require('../utils/istUtils.cjs');

const CACHE_DIR_30M = path.join(__dirname, '../cache/30minute');
const CACHE_DIR_DAY = path.join(__dirname, '../cache/day');

function load5mCache(symbol, targetDateStr) {
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const p1m = path.join(__dirname, '../cache/1minute', `${cleanKey}_master.json`);

    let isFallback = false;
    let candles5m = [];

    if (fs.existsSync(p1m)) {
        try {
            const raw1 = JSON.parse(fs.readFileSync(p1m, 'utf8'));
            const dayCandles = raw1.filter(c => String(c.timestamp || c.date).split('T')[0] === targetDateStr)
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            if (dayCandles.length > 0) {
                // Aggregate into 5-min buckets
                for (let ms = new Date(`${targetDateStr}T09:15:00+05:30`).getTime();
                    ms <= new Date(`${targetDateStr}T15:25:00+05:30`).getTime();
                    ms += 5 * 60 * 1000) {

                    const bucket = dayCandles.filter(c => {
                        const t = new Date(c.timestamp).getTime();
                        return t >= ms && t < ms + (5 * 60 * 1000);
                    });

                    if (bucket.length > 0) {
                        let bH = -Infinity, bL = Infinity, v = 0;
                        bucket.forEach(c => {
                            if (parseFloat(c.high) > bH) bH = parseFloat(c.high);
                            if (parseFloat(c.low) < bL) bL = parseFloat(c.low);
                            v += parseFloat(c.volume || 0);
                        });
                        // Create IST time string manually
                        const localD = new Date(ms + (5.5 * 60 * 60 * 1000));
                        const timeStrIST = String(localD.getUTCHours()).padStart(2, '0') + ':' + String(localD.getUTCMinutes()).padStart(2, '0');
                        candles5m.push({
                            timestamp: new Date(ms).toISOString(),
                            timeStr: timeStrIST,
                            open: parseFloat(bucket[0].open),
                            high: bH,
                            low: bL,
                            close: parseFloat(bucket[bucket.length - 1].close),
                            volume: v
                        });
                    }
                }
            }
        } catch (e) { }
    }

    if (candles5m.length >= 6) {
        return { isFallback: false, candles: candles5m };
    }

    // Fallback to 30m
    const p30 = path.join(__dirname, '../cache/30minute', `${cleanKey}_master.json`);
    if (fs.existsSync(p30)) {
        try {
            const raw30 = JSON.parse(fs.readFileSync(p30, 'utf8'));
            const c30 = raw30.filter(c => String(c.timestamp || c.date).split('T')[0] === targetDateStr)
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            if (c30.length > 0) {
                return {
                    isFallback: true, candles: c30.map(c => {
                        const localD = new Date(new Date(c.timestamp || c.date).getTime() + (5.5 * 60 * 60 * 1000));
                        const timeStrIST = String(localD.getUTCHours()).padStart(2, '0') + ':' + String(localD.getUTCMinutes()).padStart(2, '0');
                        return { ...c, timeStr: timeStrIST };
                    })
                };
            }
        } catch (e) { }
    }

    return null;
}

function load30mCache(symbol) {
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const p = path.join(CACHE_DIR_30M, `${cleanKey}_master.json`);
    if (!fs.existsSync(p)) return null;
    try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        const byDay = {};
        for (const c of raw) {
            const parts = String(c.timestamp || c.date).split('T');
            const d = parts[0];
            const t = parts[1].substring(0, 8);
            if (!byDay[d]) byDay[d] = [];
            byDay[d].push({ ...c, timeStr: t });
        }
        return byDay;
    } catch (e) { return null; }
}

function loadDayCache(symbol) {
    const cleanKey = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const p = path.join(CACHE_DIR_DAY, `${cleanKey}_master.json`);
    if (!fs.existsSync(p)) return null;
    try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        return raw.map(c => ({
            date: String(c.timestamp || c.date).split('T')[0],
            close: parseFloat(c.close),
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            volume: parseFloat(c.volume)
        })).sort((a, b) => a.date.localeCompare(b.date));
    } catch (e) { return null; }
}

function calcEMA(data, startIdx, period) {
    if (startIdx < period - 1) return null;
    let sum = 0;
    let seedIdx = Math.max(0, startIdx - period * 3);
    if (seedIdx + period - 1 <= startIdx) {
        for (let i = seedIdx; i < seedIdx + period; i++) sum += data[i].close;
        let ema = sum / period;
        const m = 2 / (period + 1);
        for (let i = seedIdx + period; i <= startIdx; i++) {
            ema = (data[i].close - ema) * m + ema;
        }
        return ema;
    }
    return null;
}

function calcSMA(data, startIdx, period) {
    if (startIdx < period - 1) return null;
    let sum = 0;
    for (let i = startIdx - period + 1; i <= startIdx; i++) sum += data[i].close;
    return sum / period;
}

function calculateADV20(dayData, targetDateIdx) {
    if (targetDateIdx < 20) return null;
    let sumVol = 0;
    for (let i = targetDateIdx - 20; i < targetDateIdx; i++) sumVol += dayData[i].volume || 0;
    return sumVol / 20;
}

class ConfirmationService {

    // -------------------------------------------------------------
    // SWING UP (Short & Long Term)
    // -------------------------------------------------------------
    async confirmSwingUpSignals(targetDateStr) {
        console.log(`[ConfirmationService] Confirming UP signals for ${targetDateStr}...`);

        const pendingSignals = await prisma.v5Signal.findMany({
            where: {
                status: 'PENDING_CONFIRMATION',
                category: { in: ['SHORT_TERM_SWING_BO_UP', 'LONG_TERM_SWING_BO_UP'] }
            }
        });

        console.log(`[ConfirmationService] Found ${pendingSignals.length} PENDING UP signals to evaluate.`);
        let confirmedCount = 0;
        let expiredCount = 0;

        for (const sig of pendingSignals) {
            // Signal Date is "Day 0". targetDateStr is technically "Day 1".
            // Since we need the full 1H setup, we require exactly the targetDateStr's morning data.
            const data30 = load30mCache(sig.symbol);
            if (!data30 || !data30[targetDateStr]) continue;

            const candles = data30[targetDateStr];
            if (candles.length < 2) continue; // Need at least 9:15 and 9:45

            const c1 = candles[0]; // 09:15-09:45
            const c2 = candles[1]; // 09:45-10:15

            // Build synthetic 1H candle (9:15 to 10:15)
            const h1Close = parseFloat(c2.close);
            const boLevel = parseFloat(sig.breakoutLevel);

            // Re-evaluating NIFTY context specifically on the Entry Date (as requested in implementation doc)
            const niftyDay = loadDayCache('NIFTY_50') || loadDayCache('NIFTY 50');
            let isMacroSafe = false;

            if (niftyDay) {
                const nIdx = niftyDay.findIndex(c => c.date === targetDateStr);
                if (nIdx >= 0) {
                    const nEma20 = calcEMA(niftyDay, nIdx, 20);
                    if (nEma20) {
                        const nC = niftyDay[nIdx].close;
                        // For Entry, Nifty must be above its 20EMA or NOT MORE THAN 1.5% below it.
                        if (nC > (nEma20 * 0.985)) isMacroSafe = true;
                    }
                }
            } else {
                // If no Nifty cache, assume safe for standalone testing
                isMacroSafe = true;
            }

            if (h1Close > boLevel && isMacroSafe) {
                // Confirm!
                await prisma.v5Signal.update({
                    where: { id: sig.id },
                    data: {
                        status: 'CONFIRMED',
                        confirmedAt: new Date(targetDateStr + "T04:45:00Z"), // 10:15 IST
                    }
                });

                try {
                    const ts = require('./telegramService.cjs');
                    ts.alertNewSignal({ ...sig, status: 'CONFIRMED' });
                } catch (e) { }

                confirmedCount++;
                console.log(`[ConfirmationService] ${sig.symbol} [${sig.category}] - CONFIRMED UP (1H: ${h1Close} > BO: ${boLevel})`);
            } else {
                // Expire! (Fails Day 1 morning hold or NIFTY dragged)
                await prisma.v5Signal.update({
                    where: { id: sig.id },
                    data: {
                        status: 'EXPIRED',
                        expiredAt: new Date(targetDateStr + "T00:00:00Z"),
                        meta: { ...((sig.meta && typeof sig.meta === 'object' ? sig.meta : {})), expireReason: isMacroSafe ? "Failed 1H hold" : "NIFTY > 1.5% below EMA20" }
                    }
                });
                expiredCount++;
                console.log(`[ConfirmationService] ${sig.symbol} [${sig.category}] - EXPIRED (1H: ${h1Close}, BO: ${boLevel}, MacroSafe: ${isMacroSafe})`);
            }
        }
        return { attempted: pendingSignals.length, confirmed: confirmedCount, expired: expiredCount };
    }

    // -------------------------------------------------------------
    // SWING DOWN (Two-Phase System: Flush & Bounce)
    // -------------------------------------------------------------
    async confirmSwingDownSignals(targetDateStr) {
        console.log(`[ConfirmationService] Confirming DOWN signals for ${targetDateStr}...`);

        const pendingSignals = await prisma.v5Signal.findMany({
            where: {
                status: 'PENDING_CONFIRMATION',
                category: 'SHORT_TERM_SWING_BO_DOWN'
            }
        });

        console.log(`[ConfirmationService] Found ${pendingSignals.length} PENDING DOWN signals to evaluate.`);
        let confirmedCount = 0;
        let expiredCount = 0;

        for (const sig of pendingSignals) {
            const dataDay = loadDayCache(sig.symbol);
            if (!dataDay) continue;

            const sigDateStr = sig.signalDate.toISOString().split('T')[0];
            const sigIdx = dataDay.findIndex(c => c.date === sigDateStr);
            const targetIdx = dataDay.findIndex(c => c.date === targetDateStr);
            if (sigIdx === -1 || targetIdx === -1 || targetIdx < sigIdx) continue;

            const daysPassed = targetIdx - sigIdx;

            const sigMeta = (sig.meta && typeof sig.meta === 'object') ? sig.meta : {};

            // ==========================================
            // PHASE 1: "SHORT THE FLUSH" (Strategy A)
            // ==========================================
            if (!sigMeta.phase1Evaluated) {
                // We evaluate this on the VERY FIRST day the confirmation service sees it (usually Day 1)
                const { calcAllRound2Factors } = require('./factorCalculator.cjs');
                const factors = calcAllRound2Factors(sig.symbol, sigDateStr, 'SHORT');

                if (factors && factors.W_EMA20 === 'ABOVE' && factors.D_STACK === 'BULL_STACK') {
                    // Valid Stop-Hunt Setup: We short the trapped longs
                    const entryPrice = dataDay[targetIdx].open || dataDay[targetIdx - 1].close;
                    const atr = parseFloat(sig.atr14);
                    const stopPrice = entryPrice + (atr * 1.5);
                    const risk = stopPrice - entryPrice;

                    // Create the executing Phase 1 SHORT trade
                    await prisma.v5Signal.create({
                        data: {
                            symbol: sig.symbol,
                            instrumentKey: sig.instrumentKey || 'UNKNOWN',
                            category: 'SHORT_TERM_SWING_BO_DOWN',
                            signalDate: sig.signalDate,
                            signalClose: sig.signalClose,
                            breakoutLevel: sig.breakoutLevel,
                            status: 'CONFIRMED',
                            confirmedAt: new Date(targetDateStr + "T04:00:00Z"), // 09:30 AM
                            direction: 'SHORT',
                            entryPrice: entryPrice,
                            stopPrice: stopPrice,
                            t1Price: entryPrice - risk, // 1:1 Target
                            t2Price: entryPrice - (risk * 2),
                            tier: 'TIER_1',
                            entryType: 'FLUSH_SHORT',
                            confidenceScore: 80,
                            confidenceTier: 'TIER_1',
                            atr14: atr,
                            suggestedStop: stopPrice,
                            suggestedQty: 100,
                            meta: { entryPattern: 'FLUSH_SHORT', maxHoldDays: 3, parentSignalId: sig.id }
                        }
                    });

                    confirmedCount++;
                    console.log(`[ConfirmationService] ${sig.symbol} [ST_DOWN Phase 1] - CREATED FLUSH_SHORT trade!`);

                    await alertService.createAlert(sig.symbol, 'ENTRY', 'SHORT_TERM_SWING_BO_DOWN', 'SHORT', entryPrice, {
                        stop: stopPrice, t1: entryPrice - risk, entryType: 'FLUSH_SHORT'
                    });

                    try {
                        const ts = require('./telegramService.cjs');
                        ts.alertNewSignal({ symbol: sig.symbol, categoryKey: 'SHORT_TERM_SWING_BO_DOWN', direction: 'SHORT', entryPrice, stopPrice, t1Price: entryPrice - risk });
                    } catch (e) { }
                }

                // Mark the parent signal as evaluated for Phase 1. Leave status as PENDING_CONFIRMATION so we can track Phase 2.
                sigMeta.phase1Evaluated = true;
                sigMeta.trackingPhase2 = true;
                await prisma.v5Signal.update({
                    where: { id: sig.id },
                    data: { meta: sigMeta }
                });
            }

            // ==========================================
            // PHASE 2: "THE BOUNCE" (Strategy B)
            // ==========================================
            if (daysPassed > 15) {
                await prisma.v5Signal.update({
                    where: { id: sig.id },
                    data: { status: 'EXPIRED', expiredAt: new Date(targetDateStr + "T00:00:00Z"), meta: { ...sigMeta, expireReason: '15 Day Limit Exceeded' } }
                });
                expiredCount++;
                console.log(`[ConfirmationService] ${sig.symbol} [ST_DOWN Phase 2] - EXPIRED (15 Day Time Limit Reached)`);
                continue;
            }

            // Phase 2 triggers starting on Day 3 onwards
            if (daysPassed >= 3) {
                const todayClose = dataDay[targetIdx].close;
                const sma10 = calcSMA(dataDay, targetIdx, 10);

                if (sma10 && todayClose > sma10) {
                    let absoluteLow = dataDay[sigIdx].low;
                    for (let i = sigIdx; i <= targetIdx; i++) {
                        absoluteLow = Math.min(absoluteLow, dataDay[i].low);
                    }

                    const initialLevel = parseFloat(sig.breakoutLevel);

                    if (absoluteLow <= initialLevel * 1.01) {
                        const atr = parseFloat(sig.atr14);
                        const stopPrice = absoluteLow - (atr * 0.5);

                        await prisma.v5Signal.update({
                            where: { id: sig.id },
                            data: {
                                status: 'CONFIRMED',
                                direction: 'LONG', // Reverting back to original LONG bounce
                                confirmedAt: new Date(targetDateStr + "T00:00:00Z"),
                                suggestedStop: stopPrice,
                                entryType: 'MEAN_REVERSION',
                                meta: {
                                    ...sigMeta,
                                    structureLow: absoluteLow,
                                    daysToConfirm: daysPassed,
                                    entryPattern: 'MEAN_REVERSION'
                                }
                            }
                        });
                        confirmedCount++;
                        console.log(`[ConfirmationService] ${sig.symbol} [ST_DOWN Phase 2] - CONFIRMED BOUNCE at Day ${daysPassed} (Close: ${todayClose} > SMA10: ${sma10.toFixed(2)})`);

                        try {
                            const ts = require('./telegramService.cjs');
                            ts.alertNewSignal({ ...sig, direction: 'LONG', stopPrice, t1Price: sig.t1Price || (sig.entryPrice + (sig.entryPrice - stopPrice)) });
                        } catch (e) { }
                    }
                }
            }
        }
        return { attempted: pendingSignals.length, confirmed: confirmedCount, expired: expiredCount };
    }

    // -------------------------------------------------------------
    // INTRADAY ORB (Daily Income Engine)
    // -------------------------------------------------------------
    async confirmIntradaySignals(targetDateStr) {
        console.log(`[ConfirmationService] Processing REAL-TIME INTRADAY signals for ${targetDateStr}...`);

        // In reality, this runs continually fetching latest 30-min data. 
        // For testing, we simulate scanning the full given day using the INTRADAY_BOOST constituents.
        const ibCats = await prisma.stockCategory.findMany({
            where: { category: { key: 'INTRADAY_BOOST' } },
            include: { stock: true }
        });

        const activeIBStocks = ibCats.filter(r => {
            if (!r.addedDate) return false;
            // Convert DB date to IST date string for comparison
            const addedDateIST = dateToIST(r.addedDate);
            return addedDateIST === targetDateStr;
        }).map(r => r.stock);

        console.log(`[ConfirmationService] IB stocks for ${targetDateStr}: Total in category: ${ibCats.length}, Matched today: ${activeIBStocks.length}, Names: ${activeIBStocks.map(s => s.symbol).join(', ')}`);

        // Build Sector and Nifty Cache for the specific day to run Master Correlation checks
        const sectorDataCache = {};
        let niftyPerf = 0;

        const allSystemStocks = await prisma.stock.findMany();
        const niftyPath = path.join(__dirname, '../cache/day/NIFTY50_2020-01-01_2026-12-31.json');

        // 1. Calc NIFTY
        if (fs.existsSync(niftyPath)) {
            const niftyRaw = JSON.parse(fs.readFileSync(niftyPath, 'utf8')).data;
            const niftyData = niftyRaw.map(c => ({ date: String(c.timestamp || c.date).split('T')[0], close: parseFloat(c.close) })).sort((a, b) => a.date.localeCompare(b.date));
            const nIdx = niftyData.findIndex(c => c.date === targetDateStr);
            if (nIdx > 0) niftyPerf = ((niftyData[nIdx].close - niftyData[nIdx - 1].close) / niftyData[nIdx - 1].close) * 100;
        }

        // 2. Calc Sectors
        const sums = {}, counts = {};
        for (const st of allSystemStocks) {
            if (!st.sector) continue;
            const data = loadDayCache(st.symbol);
            if (!data) continue;
            const idx = data.findIndex(c => c.date === targetDateStr);
            if (idx > 0) {
                const pct = ((data[idx].close - data[idx - 1].close) / data[idx - 1].close) * 100;
                if (!sums[st.sector]) { sums[st.sector] = 0; counts[st.sector] = 0; }
                sums[st.sector] += pct;
                counts[st.sector]++;
            }
        }
        for (const s in sums) sectorDataCache[s] = sums[s] / counts[s];

        let generatedCount = 0;
        let expiredCount = 0;
        const scanLog = [];

        // Create scan_logs directory if needed
        const scanLogDir = path.join(__dirname, '../scan_logs');
        if (!fs.existsSync(scanLogDir)) fs.mkdirSync(scanLogDir, { recursive: true });

        for (const stock of activeIBStocks) {
            const sym = stock.symbol;

            // BUG 5 FIX: Prevent duplicate signals — one ORB signal per stock per day
            const existingSignal = await prisma.v5Signal.findFirst({
                where: {
                    symbol: sym,
                    signalDate: importDateIST(targetDateStr),
                    category: 'INTRADAY_BOOST'
                }
            });
            if (existingSignal) {
                scanLog.push({ symbol: sym, passed: false, reason: 'DUPLICATE — signal already exists today', status: existingSignal.status });
                continue;
            }

            const cacheResult = load5mCache(sym, targetDateStr);
            if (!cacheResult) {
                scanLog.push({ symbol: sym, passed: false, reason: 'NO_DATA — no 1-min/5-min/30-min cache available' });
                continue;
            }
            const isFallback = cacheResult.isFallback;
            const candles = cacheResult.candles;

            if (candles.length < 2) {
                scanLog.push({ symbol: sym, passed: false, reason: `INSUFFICIENT_CANDLES — only ${candles.length} candles (need ≥2)` });
                continue;
            }

            const dataDay = loadDayCache(sym);
            if (!dataDay) {
                scanLog.push({ symbol: sym, passed: false, reason: 'NO_DAY_DATA — no daily candle cache available' });
                continue;
            }
            const targetDayIdx = dataDay.findIndex(c => c.date === targetDateStr);
            if (targetDayIdx < 1) {
                scanLog.push({ symbol: sym, passed: false, reason: 'NO_DAY_MATCH — target date not found in daily data' });
                continue;
            }

            const prevDay = dataDay[targetDayIdx - 1];

            // Determine OR based on fallback status
            let orh = -Infinity, orl = Infinity, orOpen = parseFloat(candles[0].open), orVol = 0;
            let orEndIdx = -1;

            if (isFallback) {
                // 30-min logic (1 candle)
                orh = parseFloat(candles[0].high);
                orl = parseFloat(candles[0].low);
                orVol = parseFloat(candles[0].volume || 0);
                orEndIdx = 0;
            } else {
                // 5-min logic (6 candles for 9:15 to 9:45)
                const orCandles = candles.slice(0, 6);
                if (orCandles.length < 6) {
                    scanLog.push({ symbol: sym, passed: false, reason: 'INCOMPLETE_OR_CANDLES' });
                    continue;
                }
                for (const c of orCandles) {
                    if (parseFloat(c.high) > orh) orh = parseFloat(c.high);
                    if (parseFloat(c.low) < orl) orl = parseFloat(c.low);
                    orVol += parseFloat(c.volume || 0);
                }
                orEndIdx = 5;
            }

            const adv20 = calculateADV20(dataDay, targetDayIdx) || orVol;
            const orRange = orh - orl;
            if (orRange === 0) {
                scanLog.push({ symbol: sym, passed: false, reason: 'ZERO_OR_RANGE — OR high equals OR low' });
                continue;
            }

            // Score params
            const orRangePct = (orRange / orOpen) * 100;
            const gapPct = ((orOpen - prevDay.close) / prevDay.close) * 100;
            const pRange = ((prevDay.high - prevDay.low) / prevDay.low) * 100;
            const pGreen = prevDay.close > prevDay.open;
            const pRed = prevDay.open > prevDay.close;

            // --- ALERT: EARLY WARNING ---
            const cLastORClose = parseFloat(candles[orEndIdx].close);
            if (cLastORClose >= orh * 0.997) {
                await alertService.createAlert(sym, 'SETUP_FORMING', 'INTRADAY_BOOST', 'LONG', cLastORClose, { orh, orl, orRangePct });
            } else if (cLastORClose <= orl * 1.003) {
                await alertService.createAlert(sym, 'SETUP_FORMING', 'INTRADAY_BOOST', 'SHORT', cLastORClose, { orh, orl, orRangePct });
            }

            // Find breakout
            // Up to 12:00. In 30m, 12:00 is index 5. In 5m, 12:00 is index 33.
            let bIdx = -1, sType = null, boPrice = 0;
            const maxIdx = isFallback ? 5 : 33;
            for (let i = orEndIdx + 1; i < candles.length && i <= maxIdx; i++) {
                const c = parseFloat(candles[i].close);
                if (c > orh) { bIdx = i; sType = 'LONG'; boPrice = c; break; }
                else if (c < orl) { bIdx = i; sType = 'SHORT'; boPrice = c; break; }
            }

            if (bIdx !== -1) {
                // --- ALERT: BREAKOUT ---
                await alertService.createAlert(sym, 'BREAKOUT', 'INTRADAY_BOOST', sType, boPrice, { timeIndex: bIdx, orh, orl });
            }

            if (bIdx === -1) {
                scanLog.push({ symbol: sym, passed: false, reason: 'NO_BREAKOUT — price stayed within OR range', orHigh: orh, orLow: orl, orRangePct: orRangePct.toFixed(2) + '%' });
                continue;
            }

            // Use actual breakout candle timestamp, not batch run time
            const bCandle = candles[bIdx];
            const breakoutCandleTime = bCandle.timestamp || bCandle.date;
            const breakoutTimestamp = breakoutCandleTime ? new Date(breakoutCandleTime) : new Date(targetDateStr + 'T' + (bCandle.timeStr || '10:00:00') + '+05:30');

            const boVol = parseFloat(bCandle.volume);
            const avgV = adv20 / (isFallback ? 13 : 75); // rough scaling for volume intensity check
            const vRat = boVol / avgV;

            // Stop = breakout candle extreme (matches Pine V8 and validated 77% WR research)
            // Pine V8 line 67: rs = isL ? bcL : bcH
            const baseStop = sType === 'LONG' ? parseFloat(bCandle.low) : parseFloat(bCandle.high);
            const rawRisk = Math.abs(boPrice - baseStop);
            const risk = Math.max(rawRisk, boPrice * 0.005); // Minimum 0.5% risk rule

            // --- REBUILT INTRADAY 100-POINT SCORING ALGORITHM ---
            let score = 0;
            const sName = stock.sector || 'UNKNOWN';
            const sectorPerf = sectorDataCache[sName] || 0;

            const isSectorAligned = (sectorPerf > 0 && sType === 'LONG') || (sectorPerf < 0 && sType === 'SHORT');
            const isNiftyAligned = (niftyPerf > 0 && sType === 'LONG') || (niftyPerf < 0 && sType === 'SHORT');
            const isSectorTrending = (sType === 'LONG' && sectorPerf > 0.5) || (sType === 'SHORT' && sectorPerf < -0.5);

            // 1. Master Alignment (Max 45)
            if (isSectorAligned && isNiftyAligned) {
                score += 45;
                if (isSectorTrending) score += 15; // Bonus
            }
            else if (isSectorAligned && !isNiftyAligned) score += 30;
            else if (!isSectorAligned && isNiftyAligned) score += 20;

            // 2. Sector Mega Trend Magnitude (Max 15)
            if (isSectorTrending) score += 15;

            // 3. Previous Day Range (Max 15)
            if (pRange > 2.0) score += 15;
            else if (pRange > 1.0) score += 5;

            // 4. ORB Range Size (Max 10)
            if (orRangePct > 1.0) score += 10;
            else if (orRangePct > 0.5) score += 5;

            // 5. HPS Confluence (Max 15)
            // Check if this IB stock is also in HIGH_POWERED_STOCKS today
            const isAlsoHPS = await prisma.stockCategory.findFirst({
                where: {
                    stockId: stock.id,
                    category: { key: 'HIGH_POWERED_STOCKS' },
                    addedDate: new Date(targetDateStr + "T00:00:00Z")
                }
            });
            if (isAlsoHPS) {
                score += 15;
            }

            // Cap at 100
            score = Math.min(100, Math.max(0, score));

            // Assign Proven Thresholds
            let tier = 'TIER_3';
            if (score >= 95) tier = 'TIER_1';
            else if (score >= 65) tier = 'TIER_2';

            // Now, simulate realistic execution (Retest vs Runner)
            let touchedOR = false, piercedIntra = false, entryPrice = 0, entryType = 'RUNNER';

            let simEntryIdx = bIdx + 1;
            if (simEntryIdx >= candles.length) continue; // Broke out end of day

            // Calculate hypothetical Retest parameters to avoid false intra-candle stop-outs
            const hypoRetestEntry = sType === 'LONG' ? orh : orl;
            const hypoTrueRisk = Math.max(Math.abs(hypoRetestEntry - baseStop), hypoRetestEntry * 0.005);
            const hypoStopPrice = sType === 'LONG' ? hypoRetestEntry - hypoTrueRisk : hypoRetestEntry + hypoTrueRisk;

            // FIX 3: Limit retest window natively depending on resolution
            const maxRetestBars = isFallback ? 8 : 3; // 4 hours for 30m, 15 min for 5m
            for (let i = bIdx + 1; i < candles.length && i <= bIdx + maxRetestBars; i++) {
                const ch = parseFloat(candles[i].high), cl = parseFloat(candles[i].low);
                if (sType === 'LONG') {
                    if (!touchedOR && cl <= orh) { touchedOR = true; entryType = 'RETEST'; entryPrice = orh; if (cl <= hypoStopPrice) piercedIntra = true; }
                } else {
                    if (!touchedOR && ch >= orl) { touchedOR = true; entryType = 'RETEST'; entryPrice = orl; if (ch >= hypoStopPrice) piercedIntra = true; }
                }
            }

            // Valid Runner or Confirmed Retest!
            if (entryType === 'RUNNER') {
                entryPrice = parseFloat(candles[bIdx + 1].open); // Enter at next opening
            }

            // FIX 2: Use actual entryPrice for risk calculation
            const trueRisk = Math.max(Math.abs(entryPrice - baseStop), entryPrice * 0.005);
            const finalStopPrice = sType === 'LONG' ? entryPrice - trueRisk : entryPrice + trueRisk;
            const targetT1 = sType === 'LONG' ? entryPrice + trueRisk : entryPrice - trueRisk;
            const targetT2 = sType === 'LONG' ? entryPrice + (trueRisk * 2) : entryPrice - (trueRisk * 2);

            if (touchedOR && piercedIntra) {
                // Instantly stopped out intra-candle by TRUE risk stop. We log an 'EXPIRED' trade so the UI shows we dodged it (or lost if traded live)
                await prisma.v5Signal.create({
                    data: {
                        symbol: sym,
                        instrumentKey: stock.instrumentKey || 'UNKNOWN',
                        category: 'INTRADAY_BOOST',
                        signalDate: new Date(targetDateStr + "T00:00:00Z"),
                        signalClose: entryPrice,
                        breakoutLevel: sType === 'LONG' ? orh : orl,
                        status: 'EXPIRED',
                        confirmedAt: breakoutTimestamp,
                        direction: sType,
                        entryPrice: entryPrice,
                        stopPrice: finalStopPrice,
                        tier: tier,
                        entryType: 'RETEST_FAILED',
                        confidenceScore: score,
                        confidenceTier: tier,
                        atr14: targetT1,
                        suggestedStop: finalStopPrice,
                        suggestedQty: 100,
                        rsi14: vRat,
                        adx14: orRangePct,
                        volumeRatio: gapPct,
                        candleQuality: 0,
                        macd1hState: sType,
                        niftyClose: 0,
                        niftyEma20: 0,
                        niftyContext: '',
                        meta: { entryPattern: 'RETEST_FAILED' }
                    }
                });
                expiredCount++;
                continue;
            }

            // Calculate entry range buffer (30% of risk)
            const entryBuffer = trueRisk * 0.30;
            let entryRangeMin, entryRangeMax;
            if (sType === 'LONG') {
                entryRangeMin = entryPrice;
                entryRangeMax = entryPrice + entryBuffer;
            } else {
                entryRangeMin = entryPrice - entryBuffer;
                entryRangeMax = entryPrice;
            }

            // Commit the successful CONFIRMED Intraday execution
            await prisma.v5Signal.create({
                data: {
                    symbol: sym,
                    instrumentKey: stock.instrumentKey || 'UNKNOWN',
                    category: 'INTRADAY_BOOST',
                    signalDate: new Date(targetDateStr + "T00:00:00Z"),
                    signalClose: entryPrice,
                    breakoutLevel: entryPrice,
                    status: 'CONFIRMED',
                    confirmedAt: breakoutTimestamp,
                    direction: sType,
                    entryPrice: entryPrice,
                    stopPrice: finalStopPrice,
                    t1Price: targetT1,
                    t2Price: targetT2,
                    tier: tier,
                    entryType: entryType,
                    confidenceScore: score,
                    confidenceTier: tier,
                    atr14: targetT1,
                    suggestedStop: finalStopPrice,
                    suggestedQty: 100,
                    rsi14: vRat,
                    adx14: orRangePct,
                    volumeRatio: gapPct,
                    candleQuality: Math.round(trueRisk),
                    macd1hState: sType,
                    niftyClose: targetT2,
                    niftyEma20: 0,
                    niftyContext: '',
                    meta: {
                        entryPattern: entryType,
                        entryRangeMin: entryRangeMin,
                        entryRangeMax: entryRangeMax
                    }
                }
            });
            generatedCount++;
            scanLog.push({ symbol: sym, passed: true, reason: `SIGNAL_GENERATED \u2014 ${entryType} (${sType})`, score, tier, entryPrice, stop: baseStop, t1: targetT1, t2: targetT2, orHigh: orh, orLow: orl, orRangePct: orRangePct.toFixed(2) + '%' });
            console.log(`[ConfirmationService] ${sym} [INTRADAY] - CREATED & CONFIRMED ${entryType} (${sType}) | Score: ${score} [${tier}]`);

            // --- ALERT: ENTRY ---
            await alertService.createAlert(sym, 'ENTRY', 'INTRADAY_BOOST', sType, entryPrice, {
                stop: baseStop, t1: targetT1, t2: targetT2, score: score, tier: tier, entryType: entryType
            });

            try {
                const ts = require('./telegramService.cjs');
                ts.alertNewSignal({ symbol: sym, categoryKey: 'INTRADAY_BOOST', direction: sType, entryPrice, stopPrice: baseStop, t1Price: targetT1 });
            } catch (e) { }
        }

        // Persist scan log to file
        try {
            const logPath = path.join(scanLogDir, `${targetDateStr}.json`);
            let existing = [];
            if (fs.existsSync(logPath)) {
                try { existing = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch (e) { }
            }
            // Append this scan cycle
            const entry = {
                scanTime: new Date().toISOString(),
                totalStocks: activeIBStocks.length,
                triggered: generatedCount,
                expired: expiredCount,
                results: scanLog
            };
            existing.push(entry);
            fs.writeFileSync(logPath, JSON.stringify(existing, null, 2));
        } catch (e) {
            console.error('[ConfirmationService] Failed to write scan log:', e.message);
        }

        return { triggered: generatedCount, expired: expiredCount, scanLog };
    }
}

module.exports = new ConfirmationService();
