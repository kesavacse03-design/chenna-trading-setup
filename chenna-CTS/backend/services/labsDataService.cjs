/**
 * Labs Data Service
 * Handles fetching historical price data for Time-Travel Labs
 * 3-tier fallback: CSV Cache → Upstox API → Mock Data
 */

const fs = require('fs').promises;
const path = require('path');
const priceService = require('./priceService.cjs');

// Test mode: limit to 2 stocks for initial validation
const TEST_MODE = false; // Set to false for production - processes all stocks

class LabsDataService {
    constructor() {
        this.cacheDir = path.join(__dirname, '../cache/historical');
        this.ensureCacheDir();
    }

    async ensureCacheDir() {
        try {
            await fs.mkdir(this.cacheDir, { recursive: true });
        } catch (error) {
            console.log('[LabsData] Cache directory already exists');
        }
    }

    /**
     * Main entry point: Get historical data for all stocks
     * @param {Array} stocks - Array of {symbol, listedDate}
     * @param {Object} options - {mode: 'upstox'|'mock', days: 200}
     * @returns {Object} - {symbol: [candles]}
     */
    async getHistoricalData(stocks, options = {}) {
        const { mode = 'auto', days = 200 } = options;
        const data = {};

        // Test mode: use first 2 stocks from the category
        let stocksToProcess = stocks;
        if (TEST_MODE) {
            stocksToProcess = stocks.slice(0, 2); // First 2 stocks
            console.log(`[LabsData] TEST MODE: Processing first 2 stocks: ${stocksToProcess.map(s => s.symbol).join(', ')}`);
        }

        console.log(`[LabsData] Fetching data for ${stocksToProcess.length} stocks`);

        for (const stock of stocksToProcess) {
            try {
                // Tier 1: Try CSV cache
                const csvData = await this.loadFromCSV(stock.symbol);
                if (csvData && csvData.length >= 180) {
                    data[stock.symbol] = csvData.slice(-days);
                    console.log(`[LabsData] ✓ ${stock.symbol}: CSV cache (${csvData.length} candles)`);
                    continue;
                }

                // Tier 2: Try Upstox API (if not in mock-only mode)
                if (mode !== 'mock') {
                    const upstoxData = await this.fetchFromUpstox(stock.symbol, days);

                    console.log(`[LabsData] DEBUG ${stock.symbol}: upstoxData=${upstoxData ? upstoxData.length : 'NULL'} candles`);

                    // GUNSHOT FIX: Lower threshold from 180 to 50 candles
                    if (upstoxData && upstoxData.length >= 50) {
                        data[stock.symbol] = upstoxData.slice(-days);
                        console.log(`[LabsData] ✓ ${stock.symbol}: Upstox API (${upstoxData.length} candles)`);

                        // Save to CSV cache for future use
                        await this.saveToCSV(stock.symbol, upstoxData);
                        continue;
                    }
                }

                // CRITICAL FIX: Do NOT fall back to mock data
                // Skip this stock entirely if we can't get real data
                console.log(`[LabsData] ⚠ ${stock.symbol}: SKIPPED (no real data available)`);
                // DO NOT generate mock data - leave stock out of results

            } catch (error) {
                console.error(`[LabsData] Error fetching ${stock.symbol}:`, error.message);
                // CRITICAL FIX: Do NOT fall back to mock data on error
                // Skip this stock entirely
            }
        }

        const sources = this.analyzeDataSources(data, stocksToProcess);
        console.log(`[LabsData] Data sources: ${sources.csv} CSV, ${sources.upstox} Upstox, ${sources.mock} Mock`);

        return data;
    }

    /**
     * Load data from CSV cache
     */
    async loadFromCSV(symbol) {
        const csvPath = path.join(this.cacheDir, `${symbol}.csv`);

        try {
            const exists = await fs.access(csvPath).then(() => true).catch(() => false);
            if (!exists) return null;

            const csvContent = await fs.readFile(csvPath, 'utf8');
            const lines = csvContent.trim().split('\n');

            // Skip header
            const candles = lines.slice(1).map(line => {
                const [date, open, high, low, close, volume] = line.split(',');
                return {
                    date,
                    open: parseFloat(open),
                    high: parseFloat(high),
                    low: parseFloat(low),
                    close: parseFloat(close),
                    volume: parseFloat(volume || 0)
                };
            });

            // CRITICAL: Sort by date ASCENDING (oldest first) to prevent future data leak
            candles.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            return candles.length > 0 ? candles : null;
        } catch (error) {
            return null;
        }
    }
    /**
     * Save data to CSV cache for future use
     * Historical data doesn't change - cache once, use forever
     * CRITICAL: Sort by date ASCENDING (oldest first) for proper backtest
     */
    async saveToCSV(symbol, candles) {
        try {
            await this.ensureCacheDir();
            const csvPath = path.join(this.cacheDir, `${symbol}.csv`);

            // CRITICAL FIX: Sort by date ASCENDING (oldest first)
            // Without this, backtest walks backward in time causing exit before entry!
            const sortedCandles = [...candles].sort((a, b) =>
                new Date(a.date).getTime() - new Date(b.date).getTime()
            );

            // Create CSV content with sorted dates
            const header = 'date,open,high,low,close,volume';
            const rows = sortedCandles.map(c =>
                `${c.date},${c.open},${c.high},${c.low},${c.close},${c.volume || 0}`
            );
            const csvContent = [header, ...rows].join('\n');

            await fs.writeFile(csvPath, csvContent, 'utf8');
            console.log(`[LabsData] 💾 Cached ${symbol}: ${sortedCandles.length} candles saved (sorted ASC)`);
        } catch (error) {
            console.log(`[LabsData] ⚠ Failed to cache ${symbol}:`, error.message);
        }
    }

    /**
     * Fetch from Upstox API via priceService (GUNSHOT FIX)
     * Using proven logic from backtestEngine that works
     */
    async fetchFromUpstox(symbol, days = 200) {
        try {
            const toDate = new Date();
            const fromDate = new Date();
            // Increased from 300 to 500 days to cover older addedDates (July 2025)
            fromDate.setDate(fromDate.getDate() - Math.max(days + 50, 500));

            const fromStr = fromDate.toISOString().split('T')[0];
            const toStr = toDate.toISOString().split('T')[0];

            // GUNSHOT FIX: Use shared prisma to avoid connection pool exhaustion
            const prisma = require('../lib/prisma.cjs');

            // Try to find instrument by symbol OR tradingSymbol
            let instrument = await prisma.instrument.findFirst({
                where: {
                    symbol: symbol,
                    exchange: 'NSE'
                }
            });

            // If not found by symbol, try tradingSymbol
            if (!instrument) {
                instrument = await prisma.instrument.findFirst({
                    where: {
                        tradingSymbol: symbol,
                        exchange: 'NSE'
                    }
                });
            }

            // Don't disconnect shared client

            if (!instrument || !instrument.instrumentKey) {
                console.log(`[LabsData] ❌ No instrument for ${symbol}`);
                return null;
            }

            console.log(`[LabsData] 🔑 ${symbol} → ${instrument.instrumentKey}`);

            // Use fetchBulk like backtestEngine does
            const result = await priceService.fetchBulk([{
                symbol: symbol,
                instrumentKey: instrument.instrumentKey,  // Fixed: camelCase!
                fromDate: fromStr,
                toDate: toStr
            }]);

            const candles = result[symbol];

            if (!candles || !candles.success || !candles.data || candles.data.length === 0) {
                console.log(`[LabsData] ❌ ${symbol}: No price data`);
                return null;
            }

            console.log(`[LabsData] ✅ ${symbol}: Got ${candles.data.length} candles`);

            // Transform to our format
            // CRITICAL FIX: Extract date directly from ISO string, don't convert via Date
            // Upstox returns: "2025-07-28T00:00:00+05:30" (IST)
            // Using new Date().toISOString() would convert to UTC, shifting back 1 day
            return candles.data.map(c => {
                // Extract YYYY-MM-DD from timestamp string (before the 'T')
                const dateStr = typeof c.timestamp === 'string'
                    ? c.timestamp.split('T')[0]
                    : new Date(c.timestamp).toISOString().split('T')[0];
                return {
                    date: dateStr,
                    timestamp: c.timestamp, // Keep original for reference
                    open: c.open,
                    high: c.high,
                    low: c.low,
                    close: c.close,
                    volume: c.volume
                };
            });

        } catch (error) {
            console.error(`[LabsData] ❌ Error for ${symbol}:`, error.message);
            return null;
        }
    }

    /**
     * Resolve symbol to instrument key
     */
    async resolveInstrument(symbol) {
        try {
            const { PrismaClient } = require('@prisma/client');
            const prisma = new PrismaClient();

            const instrument = await prisma.instrument.findFirst({
                where: {
                    tradingsymbol: symbol,
                    exchange: 'NSE'
                }
            });

            return instrument?.instrument_key || null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Save candles to CSV cache
     */
    async saveToCSV(symbol, candles) {
        try {
            const csvPath = path.join(this.cacheDir, `${symbol}.csv`);

            // Create CSV content
            const header = 'date,open,high,low,close,volume';
            const rows = candles.map(c =>
                `${c.date},${c.open},${c.high},${c.low},${c.close},${c.volume || 0}`
            );

            const csvContent = [header, ...rows].join('\n');
            await fs.writeFile(csvPath, csvContent, 'utf8');

            console.log(`[LabsData] Saved ${candles.length} candles to ${symbol}.csv`);
        } catch (error) {
            console.error(`[LabsData] Error saving CSV for ${symbol}:`, error.message);
        }
    }

    /**
     * Generate mock candles (fallback)
     */
    generateMockCandles(symbol, count) {
        const candles = [];
        let price = 100 + Math.random() * 400;

        for (let i = 0; i < count; i++) {
            const change = (Math.random() - 0.5) * 10;
            price = Math.max(50, price + change);

            const open = price;
            const close = price + (Math.random() - 0.5) * 5;
            const high = Math.max(open, close) + Math.random() * 3;
            const low = Math.min(open, close) - Math.random() * 3;
            const volume = 100000 + Math.random() * 500000;

            candles.push({
                date: new Date(Date.now() - (count - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                open,
                high,
                low,
                close,
                volume
            });
        }

        return candles;
    }

    /**
     * Analyze data sources used
     */
    analyzeDataSources(data, stocks) {
        // Simple heuristic: check if data looks like mock (very random)
        const sources = { csv: 0, upstox: 0, mock: 0 };

        for (const stock of stocks) {
            if (!data[stock.symbol]) continue;

            // If data has realistic price movements, it's likely real
            // Otherwise, it's mock
            const candles = data[stock.symbol];
            const avgVolatility = this.calculateVolatility(candles);

            // Mock data tends to have very high volatility
            if (avgVolatility > 5) {
                sources.mock++;
            } else {
                // Assume real (CSV or Upstox)
                sources.upstox++; // Can't distinguish between CSV and Upstox after loading
            }
        }

        return sources;
    }

    /**
     * Calculate average volatility
     */
    calculateVolatility(candles) {
        if (candles.length < 2) return 0;

        let sumChange = 0;
        for (let i = 1; i < Math.min(candles.length, 20); i++) {
            const change = Math.abs(candles[i].close - candles[i - 1].close) / candles[i - 1].close;
            sumChange += change;
        }

        return (sumChange / Math.min(candles.length - 1, 19)) * 100;
    }

    /**
     * Get stats about cache
     */
    async getCacheStats() {
        try {
            const files = await fs.readdir(this.cacheDir);
            const csvFiles = files.filter(f => f.endsWith('.csv'));

            return {
                totalCached: csvFiles.length,
                symbols: csvFiles.map(f => f.replace('.csv', ''))
            };
        } catch (error) {
            return { totalCached: 0, symbols: [] };
        }
    }
}

module.exports = new LabsDataService();
