/**
 * END-TO-END PIPELINE AUDIT — Feb 27, 2026
 * Tests every step of the V5 pipeline with REAL data.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');

const AUDIT_DATE = '2026-02-27';
const results = [];

function log(step, status, message) {
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    const line = `${icon} ${step}: ${message}`;
    console.log(line);
    results.push(line);
}

async function step1_verifyStockData() {
    console.log('\n========================================');
    console.log('STEP 1: VERIFY TODAY\'S STOCK DATA EXISTS');
    console.log('========================================\n');

    const today = new Date(AUDIT_DATE + 'T00:00:00.000Z');
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 1a) Category stock counts for today
    const allCats = await prisma.category.findMany();
    const catMap = {};
    allCats.forEach(c => catMap[c.id] = c.key);

    // Get raw counts grouped by category
    const catCounts = await prisma.stockCategory.groupBy({
        by: ['categoryId'],
        where: {
            addedDate: { gte: today, lt: tomorrow }
        },
        _count: true
    });

    if (catCounts.length === 0) {
        // Check what the latest date even is
        const latest = await prisma.stockCategory.findFirst({ orderBy: { addedDate: 'desc' } });
        log('1a', 'FAIL', `NO stocks found for ${AUDIT_DATE}. Latest addedDate in DB: ${latest?.addedDate?.toISOString() || 'NONE'}`);

        // Show what categories have data for the latest date
        if (latest) {
            const latestDate = new Date(latest.addedDate);
            latestDate.setHours(0, 0, 0, 0);
            const latestTomorrow = new Date(latestDate);
            latestTomorrow.setDate(latestTomorrow.getDate() + 1);
            const latestCounts = await prisma.stockCategory.groupBy({
                by: ['categoryId'],
                where: { addedDate: { gte: latestDate, lt: latestTomorrow } },
                _count: true
            });
            console.log(`  Showing counts for latest available date (${latestDate.toISOString().split('T')[0]}):`);
            for (const c of latestCounts) {
                console.log(`    ${(catMap[c.categoryId] || String(c.categoryId)).padEnd(35)} : ${c._count} stocks`);
            }
        }
    } else {
        for (const c of catCounts) {
            const catName = catMap[c.categoryId] || String(c.categoryId);
            const count = c._count;
            const isIB = catName === 'INTRADAY_BOOST';
            if (isIB && count >= 30) {
                log('1a', 'PASS', `${catName}: ${count} stocks (expected 40-50)`);
            } else if (isIB) {
                log('1a', 'PARTIAL', `${catName}: ${count} stocks (expected 40-50, got fewer)`);
            } else {
                log('1a', 'PASS', `${catName}: ${count} stocks`);
            }
        }
    }

    // 1b) Show first 10 IB stocks for TODAY (or latest date)
    let ibStocksToday = await prisma.stockCategory.findMany({
        where: {
            category: { key: 'INTRADAY_BOOST' },
            addedDate: { gte: today, lt: tomorrow }
        },
        include: { stock: true },
        take: 10
    });

    if (ibStocksToday.length === 0) {
        // Try latest date
        const latest = await prisma.stockCategory.findFirst({
            where: { category: { key: 'INTRADAY_BOOST' } },
            orderBy: { addedDate: 'desc' }
        });
        if (latest) {
            const latestDate = new Date(latest.addedDate);
            latestDate.setHours(0, 0, 0, 0);
            const latestTomorrow = new Date(latestDate);
            latestTomorrow.setDate(latestTomorrow.getDate() + 1);
            ibStocksToday = await prisma.stockCategory.findMany({
                where: {
                    category: { key: 'INTRADAY_BOOST' },
                    addedDate: { gte: latestDate, lt: latestTomorrow }
                },
                include: { stock: true },
                take: 10
            });
            log('1b', 'PARTIAL', `Using latest IB date: ${latestDate.toISOString().split('T')[0]} (not today)`);
        }
    }

    console.log('\n  First 10 IB stocks:');
    const ibSymbols = [];
    for (const r of ibStocksToday) {
        ibSymbols.push(r.stock.symbol);
        console.log(`    ${r.stock.symbol.padEnd(20)} | sector: ${r.stock.sector || 'NULL'} | addedDate: ${r.addedDate.toISOString().split('T')[0]}`);
    }

    // 1c) Verify sector mappings
    const nullSectors = ibStocksToday.filter(r => !r.stock.sector);
    if (nullSectors.length === 0) {
        log('1c', 'PASS', `Sectors populated for all ${ibStocksToday.length} checked IB stocks`);
    } else {
        log('1c', 'FAIL', `${nullSectors.length}/${ibStocksToday.length} IB stocks have NULL sector: ${nullSectors.map(r => r.stock.symbol).join(', ')}`);
    }

    return ibSymbols;
}

async function step2_verifyUpstoxPipeline(ibSymbols) {
    console.log('\n========================================');
    console.log('STEP 2: VERIFY UPSTOX DATA PIPELINE');
    console.log('========================================\n');

    // 2a) Check Upstox auth
    try {
        const tokenPath = path.join(__dirname, '../upstox_tokens.json');
        if (fs.existsSync(tokenPath)) {
            const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
            if (tokens.access_token) {
                log('2a', 'PASS', `Upstox access_token present (length: ${tokens.access_token.length})`);
            } else {
                log('2a', 'FAIL', 'Upstox access_token is EMPTY');
            }
        } else {
            log('2a', 'FAIL', `No upstox_tokens.json found at ${tokenPath}`);
        }
    } catch (e) {
        log('2a', 'FAIL', `Error reading Upstox tokens: ${e.message}`);
    }

    // 2b) Check 30-min cache for 3 IB stocks
    const testSymbols = ibSymbols.slice(0, 3);
    if (testSymbols.length === 0) {
        log('2b', 'FAIL', 'No IB symbols to test cache for');
        return;
    }

    const CACHE_DIR_30M = path.join(__dirname, '../cache/30minute');
    const CACHE_DIR_DAY = path.join(__dirname, '../cache/day');

    for (const sym of testSymbols) {
        const cleanKey = sym.replace(/[^a-zA-Z0-9_-]/g, '_');
        const p30 = path.join(CACHE_DIR_30M, `${cleanKey}_master.json`);
        const pDay = path.join(CACHE_DIR_DAY, `${cleanKey}_master.json`);

        if (!fs.existsSync(p30)) {
            log('2b', 'FAIL', `${sym}: No 30-min cache file at ${cleanKey}_master.json`);
            continue;
        }

        try {
            const raw = JSON.parse(fs.readFileSync(p30, 'utf8'));
            // Find today's candles
            const todayCandles = raw.filter(c => {
                const d = String(c.timestamp || c.date).split('T')[0];
                return d === AUDIT_DATE;
            });

            if (todayCandles.length === 0) {
                // Find latest date in cache
                const dates = [...new Set(raw.map(c => String(c.timestamp || c.date).split('T')[0]))].sort();
                const latestCacheDate = dates[dates.length - 1];
                log('2b', 'PARTIAL', `${sym}: No candles for ${AUDIT_DATE}. Latest cache date: ${latestCacheDate}. Total candles: ${raw.length}`);

                // Show candles from latest cached date
                const latestCandles = raw.filter(c => String(c.timestamp || c.date).split('T')[0] === latestCacheDate);
                if (latestCandles.length > 0) {
                    const c1 = latestCandles[0];
                    console.log(`    ${sym} Latest OR (${latestCacheDate}): H=${parseFloat(c1.high).toFixed(2)}, L=${parseFloat(c1.low).toFixed(2)}, O=${parseFloat(c1.open).toFixed(2)}, C=${parseFloat(c1.close).toFixed(2)}`);
                }
            } else {
                const c1 = todayCandles[0];
                const firstTs = String(c1.timestamp || c1.date);
                const lastTs = String(todayCandles[todayCandles.length - 1].timestamp || todayCandles[todayCandles.length - 1].date);
                log('2b', 'PASS', `${sym}: ${todayCandles.length} candles for today. First: ${firstTs}, Last: ${lastTs}`);

                // 2c) Show Opening Range
                console.log(`    ${sym} OR (30min): H=${parseFloat(c1.high).toFixed(2)}, L=${parseFloat(c1.low).toFixed(2)}, O=${parseFloat(c1.open).toFixed(2)}, C=${parseFloat(c1.close).toFixed(2)}`);
            }
        } catch (e) {
            log('2b', 'FAIL', `${sym}: Error reading 30m cache: ${e.message}`);
        }

        // Check day cache too
        if (!fs.existsSync(pDay)) {
            log('2b-day', 'FAIL', `${sym}: No daily cache file`);
        } else {
            const dayRaw = JSON.parse(fs.readFileSync(pDay, 'utf8'));
            const dayDates = dayRaw.map(c => String(c.timestamp || c.date).split('T')[0]).sort();
            const latestDayDate = dayDates[dayDates.length - 1];
            log('2b-day', dayDates.includes(AUDIT_DATE) ? 'PASS' : 'PARTIAL',
                `${sym}: Daily cache has ${dayRaw.length} candles. Latest: ${latestDayDate}`);
        }
    }
}

async function step3_signalGeneration() {
    console.log('\n========================================');
    console.log('STEP 3: MODULE 1 — SIGNAL GENERATION');
    console.log('========================================\n');

    // Check if we have existing V5 signals for today
    const today = new Date(AUDIT_DATE + 'T00:00:00.000Z');
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existingSignals = await prisma.v5Signal.findMany({
        where: {
            signalDate: { gte: today, lt: tomorrow }
        },
        orderBy: { confidenceScore: 'desc' }
    });

    if (existingSignals.length > 0) {
        log('3a', 'PASS', `Found ${existingSignals.length} V5 signals for ${AUDIT_DATE}`);

        // Group by category
        const byCat = {};
        for (const s of existingSignals) {
            if (!byCat[s.category]) byCat[s.category] = 0;
            byCat[s.category]++;
        }
        for (const [cat, count] of Object.entries(byCat)) {
            console.log(`    ${cat}: ${count} signals`);
        }

        // Show first 5 IB signals
        const ibSignals = existingSignals.filter(s => s.category === 'INTRADAY_BOOST').slice(0, 5);
        console.log('\n  Top 5 IB signals:');
        for (const s of ibSignals) {
            console.log(`    ${s.symbol.padEnd(15)} | ${s.direction?.padEnd(5) || 'N/A'} | entry: ${s.entryPrice} | stop: ${s.stopPrice} | score: ${s.confidenceScore} | tier: ${s.tier} | status: ${s.status}`);
        }
    } else {
        log('3a', 'FAIL', `No V5 signals found for ${AUDIT_DATE}`);

        // Check ALL signals to find latest date
        const latestSignal = await prisma.v5Signal.findFirst({ orderBy: { signalDate: 'desc' } });
        if (latestSignal) {
            console.log(`    Latest signal date: ${latestSignal.signalDate.toISOString().split('T')[0]}`);

            // Show signals from latest date
            const latestDate = new Date(latestSignal.signalDate);
            latestDate.setHours(0, 0, 0, 0);
            const latestTomorrow = new Date(latestDate);
            latestTomorrow.setDate(latestTomorrow.getDate() + 1);
            const latestSignals = await prisma.v5Signal.findMany({
                where: { signalDate: { gte: latestDate, lt: latestTomorrow } },
                orderBy: { confidenceScore: 'desc' },
                take: 5
            });
            console.log(`    Showing top 5 from latest available date (${latestDate.toISOString().split('T')[0]}):`);
            for (const s of latestSignals) {
                console.log(`      ${s.symbol.padEnd(15)} | ${s.direction?.padEnd(5) || 'N/A'} | entry: ${s.entryPrice} | stop: ${s.stopPrice} | score: ${s.confidenceScore} | tier: ${s.tier} | status: ${s.status}`);
            }
        } else {
            console.log('    No V5 signals exist in the database at all!');
        }
    }

    return existingSignals;
}

async function step4_confirmation(signals) {
    console.log('\n========================================');
    console.log('STEP 4: MODULE 2 — CONFIRMATION');
    console.log('========================================\n');

    const confirmed = signals.filter(s => s.status === 'CONFIRMED');
    const pending = signals.filter(s => s.status === 'PENDING_CONFIRMATION');
    const expired = signals.filter(s => s.status === 'EXPIRED');
    const executed = signals.filter(s => s.status === 'EXECUTED');

    log('4a', confirmed.length > 0 ? 'PASS' : 'FAIL',
        `CONFIRMED: ${confirmed.length} | PENDING: ${pending.length} | EXPIRED: ${expired.length} | EXECUTED: ${executed.length}`);

    if (confirmed.length > 0) {
        const top = confirmed[0];
        console.log(`\n  Top confirmed signal breakdown:`);
        console.log(`    Symbol: ${top.symbol}`);
        console.log(`    Direction: ${top.direction}`);
        console.log(`    Category: ${top.category}`);
        console.log(`    Entry: ${top.entryPrice}`);
        console.log(`    Stop: ${top.stopPrice}`);
        console.log(`    T1: ${top.t1Price}`);
        console.log(`    T2: ${top.t2Price}`);
        console.log(`    Confidence: ${top.confidenceScore}`);
        console.log(`    Tier: ${top.tier}`);
        console.log(`    Status: ${top.status}`);
        console.log(`    Entry Type: ${top.entryType}`);
        log('4b', 'PASS', `Top signal: ${top.symbol} (${top.direction}) score=${top.confidenceScore} tier=${top.tier}`);
    }

    return confirmed;
}

async function step5_positionManager(confirmed) {
    console.log('\n========================================');
    console.log('STEP 5: MODULE 3 — POSITION MANAGER');
    console.log('========================================\n');

    // Check existing open positions
    const openPositions = await prisma.v5Position.findMany({
        where: { status: 'OPEN' },
        include: { signal: true }
    });

    if (openPositions.length > 0) {
        log('5a', 'PASS', `Found ${openPositions.length} OPEN positions`);
        for (const pos of openPositions) {
            const risk = Math.abs(parseFloat(pos.entryPrice) - parseFloat(pos.stopPrice));
            const expectedQty = Math.floor(15000 / risk);
            const storedQty = pos.quantity;
            console.log(`    ${pos.symbol.padEnd(15)} | qty: ${storedQty} | entry: ${pos.entryPrice} | stop: ${pos.stopPrice} | risk: ${risk.toFixed(2)} | expectedQty: ${expectedQty}`);
            if (Math.abs(storedQty - expectedQty) <= 2) {
                log('5c', 'PASS', `${pos.symbol} position sizing correct (stored=${storedQty}, expected~${expectedQty})`);
            } else {
                log('5c', 'PARTIAL', `${pos.symbol} qty mismatch (stored=${storedQty}, expected~${expectedQty})`);
            }
        }
    } else {
        log('5a', 'PARTIAL', 'No OPEN positions found. Checking if Module 3 can open one...');
        if (confirmed.length > 0) {
            log('5b', 'PARTIAL', `Top confirmed signal ${confirmed[0].symbol} (id=${confirmed[0].id}) is available for position opening. Not auto-opening to avoid side effects.`);
        } else {
            log('5b', 'FAIL', 'No confirmed signals available to open a position from');
        }
    }

    // Check closed positions
    const closedPositions = await prisma.v5Position.count({ where: { status: 'CLOSED' } });
    log('5d', closedPositions > 0 ? 'PASS' : 'PARTIAL', `Total CLOSED positions in DB: ${closedPositions}`);
}

async function step6_dashboardAPIs() {
    console.log('\n========================================');
    console.log('STEP 6: MODULE 4 — DASHBOARD API');
    console.log('========================================\n');

    const endpoints = [
        { name: 'dashboard/summary', url: 'http://localhost:3001/api/v5/dashboard/summary' },
        { name: 'dashboard/positions', url: 'http://localhost:3001/api/v5/dashboard/positions' },
        { name: 'dashboard/signals', url: 'http://localhost:3001/api/v5/dashboard/signals' },
        { name: 'alerts/today', url: 'http://localhost:3001/api/v5/alerts/today' },
        { name: 'alerts/active', url: 'http://localhost:3001/api/v5/alerts/active' },
    ];

    for (const ep of endpoints) {
        try {
            const res = await fetch(ep.url);
            const data = await res.json();

            if (data.ok) {
                // Check if data is empty or has substance
                let detail = '';
                if (ep.name === 'dashboard/summary') {
                    detail = `today.openPositions=${data.summary?.today?.openPositions}, pendingSignals=${data.summary?.today?.pendingSignals}`;
                } else if (ep.name === 'dashboard/positions') {
                    detail = `${data.count || 0} positions`;
                } else if (ep.name === 'dashboard/signals') {
                    const sigs = data.signals || {};
                    const total = (sigs.CONFIRMED?.length || 0) + (sigs.PENDING?.length || 0) + (sigs.EXPIRED?.length || 0) + (sigs.EXECUTED?.length || 0);
                    detail = `CONFIRMED=${sigs.CONFIRMED?.length || 0}, PENDING=${sigs.PENDING?.length || 0}, EXPIRED=${sigs.EXPIRED?.length || 0}, EXECUTED=${sigs.EXECUTED?.length || 0} (total=${total})`;
                } else if (ep.name.includes('alerts')) {
                    detail = `${data.count || 0} alerts`;
                }
                log('6', 'PASS', `${ep.name} → ok:true | ${detail}`);
            } else {
                log('6', 'FAIL', `${ep.name} → ok:false, error: ${data.error || 'unknown'}`);
            }
        } catch (e) {
            log('6', 'FAIL', `${ep.name} → UNREACHABLE: ${e.message}`);
        }
    }
}

// ============== MAIN ==============
async function runAudit() {
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  V5 END-TO-END PIPELINE AUDIT                ║');
    console.log('║  Date: ' + AUDIT_DATE + ' (Thursday — Expiry Day)    ║');
    console.log('╚══════════════════════════════════════════════╝');

    const ibSymbols = await step1_verifyStockData();
    await step2_verifyUpstoxPipeline(ibSymbols);
    const signals = await step3_signalGeneration();
    const confirmed = await step4_confirmation(signals);
    await step5_positionManager(confirmed);
    await step6_dashboardAPIs();

    // Summary
    console.log('\n========================================');
    console.log('AUDIT SUMMARY');
    console.log('========================================\n');
    const passes = results.filter(r => r.startsWith('✅')).length;
    const fails = results.filter(r => r.startsWith('❌')).length;
    const partials = results.filter(r => r.startsWith('⚠️')).length;
    console.log(`  ✅ PASS: ${passes}`);
    console.log(`  ❌ FAIL: ${fails}`);
    console.log(`  ⚠️  PARTIAL: ${partials}`);
    console.log(`  Total checks: ${results.length}`);

    // Write audit report
    const reportPath = path.join(__dirname, '../outputs/audit_report_20260227.md');
    const report = `# V5 Pipeline Audit Report — ${AUDIT_DATE}\n\n` +
        `## Summary\n- ✅ PASS: ${passes}\n- ❌ FAIL: ${fails}\n- ⚠️ PARTIAL: ${partials}\n\n` +
        `## Detailed Results\n\`\`\`\n${results.join('\n')}\n\`\`\`\n`;
    fs.writeFileSync(reportPath, report, 'utf8');
    console.log(`\n  Report saved to: ${reportPath}`);
}

runAudit()
    .then(() => prisma.$disconnect())
    .catch(e => { console.error('AUDIT CRASHED:', e); prisma.$disconnect(); });
