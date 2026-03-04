/**
 * Generate Trade Charts for Phase 1 Analysis
 * 
 * Creates HTML page with candlestick charts showing:
 * - 10 successful trades
 * - 10 failed trades
 * With entry/exit points, target/stop lines
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const labsDataService = require('./services/labsDataService.cjs');
const fs = require('fs');
const path = require('path');

// Easy parameters (best from sensitivity test)
const PARAMS = {
    targetPercent: 2.0,
    stopPercent: -1.5,
    maxDays: 15
};

async function generateCharts() {
    console.log('🎨 Generating Trade Charts for DOWNSIDE_LOM_SWING...\n');

    // 1. Get category stocks
    const category = await prisma.category.findFirst({
        where: { key: 'DOWNSIDE_LOM_SWING' }
    });

    if (!category) {
        console.log('Category not found');
        return;
    }

    const categoryStocks = await prisma.stockCategory.findMany({
        where: { categoryId: category.id },
        include: { stock: true },
        take: 100 // Limit for speed
    });

    const stocks = categoryStocks.map(cs => ({
        symbol: cs.stock?.symbol,
        addedDate: cs.addedDate || cs.createdAt
    })).filter(s => s.symbol);

    console.log(`📦 Loaded ${stocks.length} stocks`);

    // 2. Fetch price data
    const stocksWithDates = stocks.map(s => ({
        symbol: s.symbol,
        listedDate: s.addedDate
    }));

    const priceData = await labsDataService.getHistoricalData(stocksWithDates, { days: 50 });
    console.log(`📈 Fetched price data for ${Object.keys(priceData).length} stocks`);

    // 3. Simulate trades and collect samples
    const successTrades = [];
    const failedTrades = [];

    for (const stock of stocks) {
        const candles = priceData[stock.symbol];
        if (!candles || candles.length < 30) continue;

        // Use index 10 as entry (simulating addedDate before data)
        const entryIdx = 10;
        const entryCandle = candles[entryIdx];
        const entryPrice = entryCandle.close;
        const entryDate = entryCandle.timestamp || entryCandle.date;

        const targetPrice = entryPrice * (1 + PARAMS.targetPercent / 100);
        const stopPrice = entryPrice * (1 + PARAMS.stopPercent / 100);

        let outcome = 'TIMEOUT';
        let exitIdx = entryIdx + PARAMS.maxDays;
        let exitPrice = entryPrice;

        for (let day = 1; day <= PARAMS.maxDays; day++) {
            const idx = entryIdx + day;
            if (idx >= candles.length) break;

            const dayCandle = candles[idx];

            if (dayCandle.high >= targetPrice) {
                outcome = 'SUCCESS';
                exitIdx = idx;
                exitPrice = targetPrice;
                break;
            }

            if (dayCandle.low <= stopPrice) {
                outcome = 'FAILURE';
                exitIdx = idx;
                exitPrice = stopPrice;
                break;
            }

            exitIdx = idx;
            exitPrice = dayCandle.close;
        }

        const trade = {
            symbol: stock.symbol,
            entryIdx,
            exitIdx,
            entryPrice,
            exitPrice,
            targetPrice,
            stopPrice,
            outcome,
            candles: candles.slice(Math.max(0, entryIdx - 5), exitIdx + 5)
        };

        if (outcome === 'SUCCESS' && successTrades.length < 10) {
            successTrades.push(trade);
        } else if (outcome !== 'SUCCESS' && failedTrades.length < 10) {
            failedTrades.push(trade);
        }

        if (successTrades.length >= 10 && failedTrades.length >= 10) break;
    }

    console.log(`\n✅ Collected ${successTrades.length} successful trades`);
    console.log(`❌ Collected ${failedTrades.length} failed trades`);

    // 4. Generate HTML with charts
    const html = generateHTML(successTrades, failedTrades);

    const outputPath = path.join(__dirname, '../trade_charts.html');
    fs.writeFileSync(outputPath, html);
    console.log(`\n📄 Charts saved to: ${outputPath}`);

    await prisma.$disconnect();
    return outputPath;
}

function generateHTML(successTrades, failedTrades) {
    // Collect all chart data for drawing after load
    const allCharts = [
        ...successTrades.map((t, i) => ({ id: `success_${i}`, ...t })),
        ...failedTrades.map((t, i) => ({ id: `failure_${i}`, ...t }))
    ];

    const chartCards = (trades, type) => trades.map((trade, i) => `
        <div class="chart-card ${type}">
            <h3>${type === 'success' ? '✅' : '❌'} ${trade.symbol} - ${type.toUpperCase()}</h3>
            <div class="chart-info">
                <span>Entry: ₹${trade.entryPrice.toFixed(2)}</span>
                <span>Target: ₹${trade.targetPrice.toFixed(2)} (+${PARAMS.targetPercent}%)</span>
                <span>Stop: ₹${trade.stopPrice.toFixed(2)} (${PARAMS.stopPercent}%)</span>
                <span>Exit: ₹${trade.exitPrice.toFixed(2)}</span>
            </div>
            <canvas id="${type}_${i}" width="600" height="300"></canvas>
        </div>
    `).join('\n');

    return `
<!DOCTYPE html>
<html>
<head>
    <title>Trade Analysis Charts - DOWNSIDE_LOM_SWING</title>
    <style>
        body { 
            font-family: 'Segoe UI', sans-serif; 
            background: #1a1a2e; 
            color: #eee; 
            padding: 20px;
            margin: 0;
        }
        h1 { color: #00d4ff; text-align: center; }
        h2 { color: #ff6b6b; border-bottom: 2px solid #ff6b6b; padding-bottom: 10px; }
        .section { margin: 40px 0; }
        .charts-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(650px, 1fr));
            gap: 20px;
        }
        .chart-card {
            background: #16213e;
            border-radius: 12px;
            padding: 20px;
            border: 2px solid #0f3460;
        }
        .chart-card.success { border-color: #00ff88; }
        .chart-card.failure { border-color: #ff4757; }
        .chart-card h3 { margin: 0 0 10px 0; }
        .chart-info {
            display: flex;
            gap: 20px;
            margin-bottom: 15px;
            font-size: 13px;
            color: #aaa;
        }
        canvas { 
            background: #0a0a1a; 
            border-radius: 8px;
            width: 100%;
        }
        .params-box {
            background: #0f3460;
            padding: 15px 25px;
            border-radius: 8px;
            display: inline-block;
            margin-bottom: 30px;
        }
        .params-box span { margin-right: 30px; }
    </style>
</head>
<body>
    <h1>📊 Trade Analysis Charts - DOWNSIDE_LOM_SWING</h1>
    
    <div class="params-box">
        <span><strong>Target:</strong> +${PARAMS.targetPercent}%</span>
        <span><strong>Stop:</strong> ${PARAMS.stopPercent}%</span>
        <span><strong>Max Days:</strong> ${PARAMS.maxDays}</span>
    </div>
    
    <div class="section">
        <h2>✅ SUCCESSFUL TRADES (Hit Target)</h2>
        <div class="charts-grid">
            ${chartCards(successTrades, 'success')}
        </div>
    </div>
    
    <div class="section">
        <h2>❌ FAILED TRADES (Hit Stop or Timeout)</h2>
        <div class="charts-grid">
            ${chartCards(failedTrades, 'failure')}
        </div>
    </div>
    
    <script>
        function drawChart(canvasId, candles, entryPrice, targetPrice, stopPrice, entryIdx, exitIdx) {
            const canvas = document.getElementById(canvasId);
            const ctx = canvas.getContext('2d');
            
            const width = canvas.width;
            const height = canvas.height;
            const padding = { top: 20, right: 60, bottom: 40, left: 60 };
            
            const chartWidth = width - padding.left - padding.right;
            const chartHeight = height - padding.top - padding.bottom;
            
            // Find price range
            let minPrice = Infinity, maxPrice = -Infinity;
            candles.forEach(c => {
                minPrice = Math.min(minPrice, c.low, stopPrice * 0.99);
                maxPrice = Math.max(maxPrice, c.high, targetPrice * 1.01);
            });
            
            const priceRange = maxPrice - minPrice;
            const candleWidth = chartWidth / candles.length;
            
            const priceToY = (price) => padding.top + chartHeight - ((price - minPrice) / priceRange * chartHeight);
            const indexToX = (i) => padding.left + i * candleWidth + candleWidth / 2;
            
            // Background
            ctx.fillStyle = '#0a0a1a';
            ctx.fillRect(0, 0, width, height);
            
            // Grid lines
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 5; i++) {
                const y = padding.top + (i / 5) * chartHeight;
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(width - padding.right, y);
                ctx.stroke();
                
                const price = maxPrice - (i / 5) * priceRange;
                ctx.fillStyle = '#666';
                ctx.font = '11px sans-serif';
                ctx.fillText('₹' + price.toFixed(1), width - padding.right + 5, y + 4);
            }
            
            // Target line (green dotted)
            ctx.strokeStyle = '#00ff88';
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(padding.left, priceToY(targetPrice));
            ctx.lineTo(width - padding.right, priceToY(targetPrice));
            ctx.stroke();
            ctx.fillStyle = '#00ff88';
            ctx.fillText('Target', padding.left + 5, priceToY(targetPrice) - 5);
            
            // Stop line (red dotted)
            ctx.strokeStyle = '#ff4757';
            ctx.beginPath();
            ctx.moveTo(padding.left, priceToY(stopPrice));
            ctx.lineTo(width - padding.right, priceToY(stopPrice));
            ctx.stroke();
            ctx.fillStyle = '#ff4757';
            ctx.fillText('Stop', padding.left + 5, priceToY(stopPrice) + 12);
            
            // Entry line (blue dotted)
            ctx.strokeStyle = '#00d4ff';
            ctx.beginPath();
            ctx.moveTo(padding.left, priceToY(entryPrice));
            ctx.lineTo(width - padding.right, priceToY(entryPrice));
            ctx.stroke();
            ctx.fillStyle = '#00d4ff';
            ctx.fillText('Entry', padding.left + 5, priceToY(entryPrice) - 5);
            
            ctx.setLineDash([]);
            
            // Entry vertical line
            ctx.strokeStyle = '#00d4ff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(indexToX(entryIdx), padding.top);
            ctx.lineTo(indexToX(entryIdx), height - padding.bottom);
            ctx.stroke();
            
            // Exit vertical line
            ctx.strokeStyle = '#ffaa00';
            ctx.beginPath();
            ctx.moveTo(indexToX(exitIdx), padding.top);
            ctx.lineTo(indexToX(exitIdx), height - padding.bottom);
            ctx.stroke();
            
            // Candlesticks
            candles.forEach((c, i) => {
                const x = indexToX(i);
                const openY = priceToY(c.open);
                const closeY = priceToY(c.close);
                const highY = priceToY(c.high);
                const lowY = priceToY(c.low);
                
                const isGreen = c.close >= c.open;
                ctx.strokeStyle = isGreen ? '#00ff88' : '#ff4757';
                ctx.fillStyle = isGreen ? '#00ff88' : '#ff4757';
                
                // Wick
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, highY);
                ctx.lineTo(x, lowY);
                ctx.stroke();
                
                // Body
                const bodyWidth = candleWidth * 0.6;
                const bodyHeight = Math.abs(closeY - openY) || 1;
                ctx.fillRect(x - bodyWidth/2, Math.min(openY, closeY), bodyWidth, bodyHeight);
            });
            
            // Labels
            ctx.fillStyle = '#00d4ff';
            ctx.font = 'bold 12px sans-serif';
            ctx.fillText('ENTRY', indexToX(entryIdx) - 20, height - padding.bottom + 15);
            ctx.fillStyle = '#ffaa00';
            ctx.fillText('EXIT', indexToX(exitIdx) - 15, height - padding.bottom + 15);
        }
        
        // Chart data for all charts
        const chartData = ${JSON.stringify(allCharts.map(t => ({
        id: t.id,
        candles: t.candles,
        entryPrice: t.entryPrice,
        targetPrice: t.targetPrice,
        stopPrice: t.stopPrice,
        entryIdx: 5,
        exitIdx: t.exitIdx - t.entryIdx + 5
    })))};
        
        // Draw all charts after DOM is ready
        window.onload = function() {
            chartData.forEach(chart => {
                drawChart(chart.id, chart.candles, chart.entryPrice, chart.targetPrice, chart.stopPrice, chart.entryIdx, chart.exitIdx);
            });
        };
    </script>
</body>
</html>
`;
}

generateCharts().catch(console.error);
