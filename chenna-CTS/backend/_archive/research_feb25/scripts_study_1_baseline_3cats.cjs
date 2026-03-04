const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

function toISTDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + 330);
    return d.toISOString().split('T')[0];
}

async function runStudyForCategory(categoryKey) {
    console.log(`\n======================================================`);
    console.log(`CATEGORY: ${categoryKey}`);

    const cat = await prisma.category.findUnique({ where: { key: categoryKey } });
    if (!cat) {
        console.log(`  Category not found.`);
        return;
    }

    const stockCategories = await prisma.stockCategory.findMany({
        where: { categoryId: cat.id },
        include: { stock: true },
        orderBy: { addedDate: 'asc' }
    });

    if (stockCategories.length === 0) {
        console.log(`  No signals found.`);
        return;
    }

    const signals = stockCategories.map(sc => ({
        symbol: sc.stock.symbol,
        instrumentKey: sc.stock.instrumentKey || sc.stock.symbol,
        signalDateStr: toISTDateString(sc.addedDate)
    }));

    // Deduplicate by symbol + date
    const uniqueSignals = [];
    const seen = new Set();
    for (const s of signals) {
        const k = `${s.symbol}_${s.signalDateStr}`;
        if (!seen.has(k)) {
            uniqueSignals.push(s);
            seen.add(k);
        }
    }

    let totalProcessed = 0;

    // Metrics trackers
    const dayReturns = {};
    for (let i = 1; i <= 20; i++) dayReturns[i] = [];

    const bottomDays = [];
    const peakDays = [];
    const drops = [];
    const pops = [];

    const cacheDir = path.join(__dirname, '../cache/day');

    for (const sig of uniqueSignals) {
        const cleanKey = sig.instrumentKey.replace(/[^a-zA-Z0-9_-]/g, '_');
        const fallbackKey = sig.symbol.replace(/[^a-zA-Z0-9_-]/g, '_');

        let cachePath = path.join(cacheDir, `${cleanKey}_master.json`);
        if (!fs.existsSync(cachePath)) {
            cachePath = path.join(cacheDir, `${fallbackKey}_master.json`);
        }

        if (!fs.existsSync(cachePath)) {
            // No cache available at all, skip without calling API
            continue;
        }

        let rawData;
        try {
            const fileContent = fs.readFileSync(cachePath, 'utf8');
            const parsed = JSON.parse(fileContent);
            rawData = parsed.data || parsed; // Handle wrapping
        } catch (e) {
            continue;
        }

        if (!rawData || rawData.length === 0) continue;

        const allCandles = rawData
            .map(c => ({
                date: String(c.timestamp || c.date).split('T')[0].split(' ')[0],
                open: parseFloat(c.open),
                high: parseFloat(c.high),
                low: parseFloat(c.low),
                close: parseFloat(c.close)
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const signalIdx = allCandles.findIndex(c => c.date === sig.signalDateStr);
        if (signalIdx === -1) continue;

        const signalClose = allCandles[signalIdx].close;

        let lowestLow = Infinity;
        let dayOfLowest = -1;

        let highestHigh = -Infinity;
        let dayOfHighest = -1;

        // Look forward up to 20 days
        for (let d = 1; d <= 20; d++) {
            const fIdx = signalIdx + d;
            if (fIdx >= allCandles.length) break;

            const fCandle = allCandles[fIdx];
            const retPct = ((fCandle.close - signalClose) / signalClose) * 100;
            dayReturns[d].push(retPct);

            if (fCandle.low < lowestLow) {
                lowestLow = fCandle.low;
                dayOfLowest = d;
            }

            if (fCandle.high > highestHigh) {
                highestHigh = fCandle.high;
                dayOfHighest = d;
            }
        }

        if (dayOfLowest !== -1) {
            bottomDays.push(dayOfLowest);
            drops.push(((lowestLow - signalClose) / signalClose) * 100);
        }

        if (dayOfHighest !== -1) {
            peakDays.push(dayOfHighest);
            pops.push(((highestHigh - signalClose) / signalClose) * 100);
        }

        totalProcessed++;
    }

    console.log(`  Total signals: ${totalProcessed}`);
    if (totalProcessed === 0) return;

    // Helper to print stats for a day
    const printDayStat = (day) => {
        const rets = dayReturns[day];
        if (rets.length === 0) return `Day ${day}: N/A`;
        const wins = rets.filter(r => r > 0).length;
        const wr = (wins / rets.length) * 100;
        const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
        return `Day ${String(day).padEnd(2)}:  ${wr.toFixed(1).padStart(4)}% WR | Avg return ${avg > 0 ? '+' : ''}${avg.toFixed(2)}%`;
    };

    console.log(`  ${printDayStat(5)}`);
    console.log(`  ${printDayStat(10)}`);
    console.log(`  ${printDayStat(15)}`);
    console.log(`  ${printDayStat(20)}\n`);

    let dayByDayStr = '  Day-by-day from signal (average across all signals):\n  ';
    for (let d = 1; d <= 20; d++) {
        const rets = dayReturns[d];
        if (rets.length > 0) {
            const avg = rets.reduce((a, b) => a + b, 0) / rets.length;
            dayByDayStr += `Day+${d}: ${avg > 0 ? '+' : ''}${avg.toFixed(2)}% | `;
            if (d % 5 === 0) dayByDayStr += '\n  ';
        }
    }
    console.log(dayByDayStr.trimEnd());

    const avgBottomDay = bottomDays.length ? (bottomDays.reduce((a, b) => a + b, 0) / bottomDays.length) : 0;
    const avgDrop = drops.length ? (drops.reduce((a, b) => a + b, 0) / drops.length) : 0;

    const avgPeakDay = peakDays.length ? (peakDays.reduce((a, b) => a + b, 0) / peakDays.length) : 0;
    const avgPop = pops.length ? (pops.reduce((a, b) => a + b, 0) / pops.length) : 0;

    console.log(`\n  Average day the stock hits its lowest low: Day+${avgBottomDay.toFixed(0)}`);
    console.log(`  Average further drop from signal close to bottom: ${avgDrop.toFixed(2)}%`);
    console.log(`\n  Average day the stock hits its highest high: Day+${avgPeakDay.toFixed(0)}`);
    console.log(`  Average further rise from signal close to peak: +${avgPop.toFixed(2)}%`);

}

async function main() {
    await runStudyForCategory('SHORT_TERM_SWING_BO_DOWN');
    await runStudyForCategory('LONG_TERM_SWING_BO_UP');
    await runStudyForCategory('LONG_TERM_SWING_BO_DOWN');

    await prisma.$disconnect();
    process.exit(0);
}

main().catch(console.error);
