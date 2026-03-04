// Run EOD evaluation for March 2 INTRADAY_BOOST signals
const prisma = require('./lib/prisma.cjs');
const { evaluateOutcome } = require('./services/signalEngine.cjs');
const { fetch1MinCandles } = require('./services/eodReportService.cjs');

async function runEod() {
    const date = '2026-03-02';
    const dayStart = new Date(date + 'T00:00:00Z');
    const dayEnd = new Date(date + 'T23:59:59Z');

    const signals = await prisma.v5Signal.findMany({
        where: { category: 'INTRADAY_BOOST', signalDate: { gte: dayStart, lte: dayEnd } }
    });

    console.log(`Evaluating ${signals.length} signals for March 2...\n`);
    console.log('Symbol   | Dir   | Entry   | Stop    | T1      | Risk   | Outcome      | Exit     | R-Mult | Fill');
    console.log('---------+-------+---------+---------+---------+--------+--------------+----------+--------+-----');

    let wins = 0, losses = 0, expired = 0, notfilled = 0;

    for (const sig of signals) {
        try {
            const candles = await fetch1MinCandles(sig.instrumentKey, date);
            if (!candles || candles.length === 0) {
                console.log(`${sig.symbol.padEnd(9)}| NO_DATA`);
                continue;
            }

            const result = evaluateOutcome(sig, candles);
            const entry = Number(sig.entryPrice);
            const stop = Number(sig.stopPrice);
            const t1 = sig.t1Price ? Number(sig.t1Price) : null;
            const risk = Math.abs(entry - stop).toFixed(1);
            const exitTime = result.exitTime ? result.exitTime.split('T')[1]?.substring(0, 5) : '-';

            console.log(
                `${sig.symbol.padEnd(9)}| ${sig.direction.padEnd(6)}| ${entry.toFixed(1).padStart(7)} | ${stop.toFixed(1).padStart(7)} | ${(t1 ? t1.toFixed(1) : 'N/A').padStart(7)} | ${risk.padStart(6)} | ${result.outcome.padEnd(13)}| ${exitTime.padStart(8)} | ${result.rMultiple.toFixed(2).padStart(6)} | ${result.fillTime ? result.fillTime.split('T')[1]?.substring(0, 5) : '-'}`
            );

            // Update DB with outcome
            const statusMap = { 'T1_HIT': 'T1_HIT', 'T2_HIT': 'T2_HIT', 'STOP_HIT': 'STOPPED', 'EOD_CLOSE': 'EOD_CLOSE', 'NOT_FILLED': 'EXPIRED' };
            await prisma.v5Signal.update({
                where: { id: sig.id },
                data: {
                    status: statusMap[result.outcome] || sig.status,
                    meta: {
                        ...(typeof sig.meta === 'object' ? sig.meta : {}),
                        eodOutcome: result.outcome,
                        eodExitPrice: result.exitPrice,
                        eodRMultiple: result.rMultiple,
                        eodFillTime: result.fillTime,
                        eodEvaluatedAt: new Date().toISOString()
                    }
                }
            });

            if (result.outcome === 'T1_HIT' || result.outcome === 'T2_HIT') wins++;
            else if (result.outcome === 'STOP_HIT') losses++;
            else if (result.outcome === 'NOT_FILLED') notfilled++;
            else expired++;
        } catch (e) {
            console.log(`${sig.symbol.padEnd(9)}| ERROR: ${e.message}`);
        }
    }

    console.log(`\n══════════════════════════════════════════`);
    console.log(`RESULTS: ${wins} wins, ${losses} losses, ${expired} eod/other, ${notfilled} not filled`);
    console.log(`Win Rate: ${signals.length > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : 0}%`);
    console.log(`══════════════════════════════════════════`);

    await prisma.$disconnect();
}

runEod().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
