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
// Categories are THE SAME between tredcode and CTS, just need to normalize
// (replace spaces and dashes with underscores)
// 
// COMPLETE LIST OF ALL 14 CTS CATEGORIES:
// 1. HIGH_POWERED_STOCKS    2. INTRADAY_BOOST       3. DOWNSIDE_LOM_INTRA
// 4. UPSIDE_LOM_INTRA       5. DAILY_CONTRACTION    6. PRE_MARKET
// 7. DOWNSIDE_LOM_SWING     8. UPSIDE_LOM_SWING     9. MULTI_RESISTANCE_BO
// 10. MULTI_SUPPORT_BO      11. SHORT_TERM_SWING_BO_UP   12. SHORT_TERM_SWING_BO_DOWN
// 13. LONG_TERM_SWING_BO_UP 14. LONG_TERM_SWING_BO_DOWN
//
const CATEGORY_MAPPING = {
    // ============== MARKET DEPTH CATEGORIES ==============
    'HIGH POWERED STOCKS': 'HIGH_POWERED_STOCKS',
    'INTRADAY BOOST': 'INTRADAY_BOOST',
    'DOWNSIDE LOM INTRA': 'DOWNSIDE_LOM_INTRA',
    'UPSIDE LOM INTRA': 'UPSIDE_LOM_INTRA',
    'DOWNSIDE LOM SWING': 'DOWNSIDE_LOM_SWING',
    'UPSIDE LOM SWING': 'UPSIDE_LOM_SWING',

    // ============== PRO SETUPS CATEGORIES ==============
    'DAILY CONTRACTION': 'DAILY_CONTRACTION',
    'PRE MARKET': 'PRE_MARKET',
    'MULTI RESISTANCE BO': 'MULTI_RESISTANCE_BO',
    'MULTI SUPPORT BO': 'MULTI_SUPPORT_BO',

    // ============== SWING CENTER CATEGORIES ==============
    'SHORT TERM SWING BO - UP': 'SHORT_TERM_SWING_BO_UP',
    'SHORT TERM SWING BO - DOWN': 'SHORT_TERM_SWING_BO_DOWN',
    'LONG TERM SWING BO - UP': 'LONG_TERM_SWING_BO_UP',
    'LONG TERM SWING BO - DOWN': 'LONG_TERM_SWING_BO_DOWN',

    // ============== ALTERNATIVE SPELLINGS/FORMATS ==============
    // Tredcode may use different dash types or spacing
    'DOWNSIDE LOM - SWING': 'DOWNSIDE_LOM_SWING',
    'UPSIDE LOM - SWING': 'UPSIDE_LOM_SWING',
    'DOWNSIDE LOM - INTRA': 'DOWNSIDE_LOM_INTRA',
    'UPSIDE LOM - INTRA': 'UPSIDE_LOM_INTRA',
    // With en-dash (–) instead of hyphen (-)
    'SHORT TERM SWING BO – UP': 'SHORT_TERM_SWING_BO_UP',
    'SHORT TERM SWING BO – DOWN': 'SHORT_TERM_SWING_BO_DOWN',
    'LONG TERM SWING BO – UP': 'LONG_TERM_SWING_BO_UP',
    'LONG TERM SWING BO – DOWN': 'LONG_TERM_SWING_BO_DOWN'
};


// Pages to fetch
const PAGES = [
    { url: 'https://tredcode.tradingcafeindia.com/swing-center', name: 'Swing Center' },
    { url: 'https://tredcode.tradingcafeindia.com/pro-setups', name: 'Pro Setups' },
    { url: 'https://tredcode.tradingcafeindia.com/market-depth', name: 'Market Depth' }
];

// Helper: delay function (replaces deprecated page.waitForTimeout)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
     * Initialize browser with dedicated CTS profile
     * First run: Opens browser for user to login
     * Subsequent runs: Uses saved session cookies
     */
    async initBrowser() {
        if (this.browser) return;

        console.log('[DataFetchAgent] Initializing browser...');

        // Use a dedicated profile directory for CTS (not user's Chrome)
        const path = require('path');
        const fs = require('fs');
        const ctsProfileDir = path.join(__dirname, '..', 'browser-data');
        const cookiesFile = path.join(__dirname, '..', 'auth', 'tredcode_cookies.json');

        this.browser = await puppeteer.launch({
            headless: false, // Keep visible for first-time login
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                `--user-data-dir=${ctsProfileDir}`
            ]
        });
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1920, height: 1080 });

        // Try to load and inject cookies from file
        console.log('[DataFetchAgent] Cookie file path:', cookiesFile);
        console.log('[DataFetchAgent] Cookie file exists:', fs.existsSync(cookiesFile));

        if (fs.existsSync(cookiesFile)) {
            try {
                const cookiesJson = fs.readFileSync(cookiesFile, 'utf8');
                const cookies = JSON.parse(cookiesJson);
                console.log('[DataFetchAgent] Parsed cookies count:', cookies.length);

                if (Array.isArray(cookies) && cookies.length > 0) {
                    // Ensure all cookies have required fields for setCookie
                    const validCookies = cookies.map(c => ({
                        name: c.name,
                        value: c.value,
                        domain: c.domain || '.tradingcafeindia.com',
                        path: c.path || '/',
                        httpOnly: c.httpOnly || false,
                        secure: c.secure || false,
                        sameSite: c.sameSite || 'Lax'
                    }));

                    await this.page.setCookie(...validCookies);
                    console.log(`[DataFetchAgent] ✅ Loaded ${validCookies.length} cookies from auth/tredcode_cookies.json`);
                }
            } catch (err) {
                console.log('[DataFetchAgent] ⚠️ Could not load cookies:', err.message);
                console.log('[DataFetchAgent] Full error:', err);
            }
        } else {
            console.log('[DataFetchAgent] ℹ️ No cookies file found. Will need manual login.');
            console.log('[DataFetchAgent] Run: node scripts/export_tredcode_cookies.cjs for instructions');
        }

        console.log('[DataFetchAgent] Browser initialized');

        console.log('[DataFetchAgent] Profile stored at:', ctsProfileDir);
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
     * Check if logged into tredcode, wait for login if needed
     */
    async checkLoginAndWait() {
        console.log('[DataFetchAgent] Checking login status...');

        await this.page.goto('https://tredcode.tradingcafeindia.com/', { waitUntil: 'networkidle2', timeout: 60000 });
        await delay(3000);

        // Check if we see data tables (logged in) or login page
        const isLoggedIn = await this.page.evaluate(() => {
            // Look for user email or data content
            const hasUserEmail = document.body.innerText.includes('@gmail.com');
            const hasDataTables = document.querySelectorAll('table').length > 0;
            const hasLoginButton = document.body.innerText.includes('Sign in with Google');

            return (hasUserEmail || hasDataTables) && !hasLoginButton;
        });

        if (isLoggedIn) {
            console.log('[DataFetchAgent] ✅ Already logged in');
            return true;
        }

        console.log('[DataFetchAgent] ⚠️ Not logged in - please login with Google in the browser window');
        console.log('[DataFetchAgent] Waiting up to 2 minutes for login...');

        // Wait for login (check every 5 seconds for 2 minutes)
        const maxWait = 120000; // 2 minutes
        const checkInterval = 5000;
        let waited = 0;

        while (waited < maxWait) {
            await delay(checkInterval);
            waited += checkInterval;

            const nowLoggedIn = await this.page.evaluate(() => {
                const hasUserEmail = document.body.innerText.includes('@gmail.com');
                const hasDataTables = document.querySelectorAll('table').length > 0;
                return hasUserEmail || hasDataTables;
            });

            if (nowLoggedIn) {
                console.log('[DataFetchAgent] ✅ Login detected! Continuing...');
                return true;
            }

            console.log(`[DataFetchAgent] Still waiting... (${Math.round(waited / 1000)}s / 120s)`);
        }

        console.log('[DataFetchAgent] ❌ Login timeout - skipping this fetch cycle');
        return false;
    }

    /**
     * Fetch a single page and extract all tables
     */
    async fetchPage(pageConfig) {
        const { url, name } = pageConfig;
        console.log(`[DataFetchAgent] Fetching ${name}...`);

        try {
            await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
            await delay(2000); // Wait for dynamic content

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

            // Check login status - wait for user to login if needed
            const loggedIn = await this.checkLoginAndWait();
            if (!loggedIn) {
                console.log('[DataFetchAgent] Skipping fetch cycle - not logged in');
                return { ok: false, error: 'Not logged in to tredcode' };
            }

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
