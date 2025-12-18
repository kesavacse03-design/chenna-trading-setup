/**
 * CTS Data Fetch Agent
 * Fetches stock data from tredcode.tradingcafeindia.com and stores to database
 * 
 * Categories fetched:
 * - Swing Center: 50 Day High/Low Breakout, Downside/Upside LOM
 * - Pro Setups: Daily Contraction, Pre Market, Momentum Spike
 */

const { PrismaClient } = require('@prisma/client');
const puppeteer = require('puppeteer');

const prisma = new PrismaClient();

// Category mapping: tredcode category name -> CTS category key
const CATEGORY_MAPPING = {
    '50 Day High Breakout': 'HIGH_POWERED_STOCKS',
    '50 Day Low Breakout': 'DOWNSIDE_LOM_SWING',
    'Upside LOM': 'UPSIDE_LOM_SWING',
    'Downside LOM': 'DOWNSIDE_LOM_SWING',
    'DAILY CONTRACTION': 'DAILY_CONTRACTION',
    'PRE MARKET': 'PRE_MARKET',
    '5 Minute MOMENTUM SPIKE': 'INTRADAY_BOOST',
    'INTRADAY BOOST': 'INTRADAY_BOOST'
};

// Pages to fetch
const PAGES = [
    { url: 'https://tredcode.tradingcafeindia.com/swing-center', name: 'Swing Center' },
    { url: 'https://tredcode.tradingcafeindia.com/pro-setups', name: 'Pro Setups' }
];

class DataFetchAgent {
    constructor() {
        this.browser = null;
        this.page = null;
        this.lastFetchTime = null;
        this.isRunning = false;
        this.stats = {
            fetched: 0,
            changed: 0,
            skipped: 0,
            inserted: 0
        };
    }

    /**
     * Initialize browser with existing session cookies
     */
    async initBrowser() {
        if (this.browser) return;

        console.log('[DataFetchAgent] Initializing browser...');
        this.browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1920, height: 1080 });

        console.log('[DataFetchAgent] Browser initialized');
    }

    /**
     * Close browser
     */
    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }

    /**
     * Fetch a single page and extract all tables
     */
    async fetchPage(pageConfig) {
        const { url, name } = pageConfig;
        console.log(`[DataFetchAgent] Fetching ${name}...`);

        try {
            await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
            await this.page.waitForTimeout(2000); // Wait for dynamic content

            // Scroll to load all data
            await this.page.evaluate(async () => {
                await new Promise(resolve => {
                    let totalHeight = 0;
                    const distance = 500;
                    const timer = setInterval(() => {
                        window.scrollBy(0, distance);
                        totalHeight += distance;
                        if (totalHeight >= document.body.scrollHeight - window.innerHeight) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 100);
                    setTimeout(() => { clearInterval(timer); resolve(); }, 10000);
                });
            });

            // Extract all tables
            const tables = await this.page.evaluate(() => {
                const result = [];
                const categoryHeaders = document.querySelectorAll('h2, h3, .category-title, [class*="category"]');

                // Find all tables and their preceding category headers
                const allTables = document.querySelectorAll('table');

                allTables.forEach((table, idx) => {
                    // Try to find category name from nearest header
                    let categoryName = `Unknown_${idx}`;
                    const parent = table.closest('[class*="section"]') || table.parentElement;
                    const header = parent?.querySelector('h2, h3, [class*="title"]');
                    if (header) {
                        categoryName = header.textContent.trim();
                    }

                    // Extract rows
                    const rows = [];
                    const tbody = table.querySelector('tbody');
                    const trs = tbody ? tbody.querySelectorAll('tr') : table.querySelectorAll('tr');

                    trs.forEach(tr => {
                        const tds = tr.querySelectorAll('td');
                        if (tds.length >= 4) {
                            rows.push({
                                symbol: tds[0]?.textContent?.trim() || '',
                                ltp: parseFloat(tds[1]?.textContent?.replace(/[₹,]/g, '').trim()) || 0,
                                prevClose: parseFloat(tds[2]?.textContent?.replace(/[₹,]/g, '').trim()) || 0,
                                pctChange: parseFloat(tds[3]?.textContent?.replace(/[%]/g, '').trim()) || 0,
                                sector: tds[4]?.textContent?.trim() || '',
                                date: tds[5]?.textContent?.trim() || null
                            });
                        }
                    });

                    if (rows.length > 0) {
                        result.push({ categoryName, rows });
                    }
                });

                return result;
            });

            console.log(`[DataFetchAgent] Found ${tables.length} tables on ${name}`);
            return tables;

        } catch (error) {
            console.error(`[DataFetchAgent] Error fetching ${name}:`, error.message);
            return [];
        }
    }

    /**
     * Save data to database with change detection
     */
    async saveToDatabase(categoryName, rows) {
        const ctsCategory = CATEGORY_MAPPING[categoryName] || categoryName.toUpperCase().replace(/\s+/g, '_');

        for (const row of rows) {
            if (!row.symbol || row.symbol === 'Symbol') continue; // Skip headers

            this.stats.fetched++;

            try {
                // Check for existing recent snapshot (within last 5 minutes)
                const recent = await prisma.liveSnapshot.findFirst({
                    where: {
                        symbol: row.symbol,
                        category: ctsCategory,
                        fetchedAt: {
                            gte: new Date(Date.now() - 5 * 60 * 1000)
                        }
                    }
                });

                // Skip if identical
                if (recent && recent.ltp === row.ltp && recent.pctChange === row.pctChange) {
                    this.stats.skipped++;
                    continue;
                }

                // Insert new snapshot
                await prisma.liveSnapshot.create({
                    data: {
                        symbol: row.symbol,
                        category: ctsCategory,
                        ltp: row.ltp,
                        prevClose: row.prevClose,
                        pctChange: row.pctChange,
                        sector: row.sector,
                        sourceDate: row.date ? new Date(row.date) : null
                    }
                });

                this.stats.inserted++;
                if (recent) this.stats.changed++;

            } catch (error) {
                // Likely unique constraint violation, skip
            }
        }
    }

    /**
     * Sync to StockCategory table for signal scanner
     */
    async syncToStockCategory(categoryName, rows) {
        const ctsCategory = CATEGORY_MAPPING[categoryName] || categoryName.toUpperCase().replace(/\s+/g, '_');

        // Find category in database
        const category = await prisma.category.findUnique({
            where: { key: ctsCategory }
        });

        if (!category) {
            console.log(`[DataFetchAgent] Category ${ctsCategory} not found in CTS, skipping sync`);
            return;
        }

        for (const row of rows) {
            if (!row.symbol || row.symbol === 'Symbol') continue;

            try {
                // Upsert stock
                const stock = await prisma.stock.upsert({
                    where: { symbol: row.symbol },
                    update: {
                        name: row.symbol,
                        currentPrice: row.ltp,
                        updatedAt: new Date()
                    },
                    create: {
                        symbol: row.symbol,
                        name: row.symbol,
                        currentPrice: row.ltp
                    }
                });

                // Link to category
                await prisma.stockCategory.upsert({
                    where: {
                        stockId_categoryId: {
                            stockId: stock.id,
                            categoryId: category.id
                        }
                    },
                    update: {
                        addedAt: new Date()
                    },
                    create: {
                        stockId: stock.id,
                        categoryId: category.id
                    }
                });

            } catch (error) {
                // Skip errors
            }
        }
    }

    /**
     * Run a full fetch cycle
     */
    async runCycle() {
        if (this.isRunning) {
            console.log('[DataFetchAgent] Cycle already running, skipping');
            return;
        }

        this.isRunning = true;
        this.stats = { fetched: 0, changed: 0, skipped: 0, inserted: 0 };
        const startTime = new Date();

        console.log(`\n[${startTime.toISOString()}] ========== FETCH CYCLE START ==========`);

        try {
            await this.initBrowser();

            for (const pageConfig of PAGES) {
                const tables = await this.fetchPage(pageConfig);

                for (const table of tables) {
                    await this.saveToDatabase(table.categoryName, table.rows);
                    await this.syncToStockCategory(table.categoryName, table.rows);
                }
            }

            this.lastFetchTime = new Date();

            console.log(`[${this.lastFetchTime.toISOString()}] fetched:${this.stats.fetched} changed:${this.stats.changed} skipped:${this.stats.skipped} inserted:${this.stats.inserted} status:OK`);

        } catch (error) {
            console.error(`[${new Date().toISOString()}] status:FAILED - ${error.message}`);
        } finally {
            await this.closeBrowser();
            this.isRunning = false;
        }
    }

    /**
     * Start scheduled fetching (every 10 minutes)
     */
    startScheduledFetching() {
        console.log('[DataFetchAgent] Starting scheduled fetching (every 10 min)...');

        // Run immediately
        this.runCycle();

        // Then every 10 minutes
        setInterval(() => {
            this.runCycle();
        }, 10 * 60 * 1000);
    }

    /**
     * Get fetch status
     */
    getStatus() {
        return {
            lastFetchTime: this.lastFetchTime,
            isRunning: this.isRunning,
            stats: this.stats
        };
    }
}

// Export singleton
module.exports = new DataFetchAgent();
