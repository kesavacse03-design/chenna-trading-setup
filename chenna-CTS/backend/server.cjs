// CTS backend with Upstox OAuth and price proxy
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
let axios = null;
try { axios = require('axios'); } catch (e) { axios = null; }

// Load environment variables
try {
  require('dotenv').config({ path: path.resolve(__dirname, '.env') });
} catch (_) { }

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Initialize InstrumentResolver
const { InstrumentResolver } = require(path.resolve(__dirname, '../../backend/strategy/instrumentResolver.cjs'));
const instrumentResolver = new InstrumentResolver();

// Register Auto-Strategy Generation Routes
const registerAutoStrategyRoutes = require('./api/autoStrategyRoutes.cjs');
registerAutoStrategyRoutes(app);

// Register Backtest Results Routes (for CSV download and history)
const registerBacktestResultsRoutes = require('./api/backtestResultsRoutes.cjs');
registerBacktestResultsRoutes(app);

// Register Labs Routes (for Time-Travel Labs API)
const labsRoutes = require('./api/labsRoutes.cjs');
app.use('/api/labs', labsRoutes);

// --- GUN SHOT FIXES ---
// 1. Instrument Search (Fixed - use Prisma directly)
app.get('/api/instruments/search', async (req, res) => {
  try {
    const { q = '', limit = '20' } = req.query;
    const searchLimit = Math.min(Number(limit) || 20, 10000);

    // Query database directly - search by symbol or name
    const instruments = await prisma.instrument.findMany({
      where: {
        AND: [
          { isActive: true },
          q ? {
            OR: [
              { symbol: { contains: q, mode: 'insensitive' } },
              { tradingSymbol: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } }
            ]
          } : {}
        ]
      },
      take: searchLimit,
      select: {
        symbol: true,
        tradingSymbol: true,
        name: true,
        exchange: true,
        segment: true,
        instrumentKey: true,
        instrumentType: true,
        isin: true,
        lotSize: true,
        tickSize: true,
        sector: true,
        isActive: true
      }
    });

    res.json(instruments);
  } catch (e) {
    console.error('[GET /api/instruments/search] Error:', e);
    res.status(500).json({ error: String(e.message) });
  }
});

// 2. Import Stock (Ensure it exists at top level)
app.post('/api/stocks', async (req, res) => {
  const { symbol, date, category } = req.body;
  console.log(`[POST /api/stocks] Received ${symbol} for ${category} on ${date}`);

  if (!symbol || !category) return res.status(400).json({ ok: false, error: 'symbol and category are required' });

  try {
    // Normalize Date
    let dateStr = date || new Date().toISOString().slice(0, 10);
    const [yyyy, mm, dd] = dateStr.split('-').map(Number);
    const addedDate = new Date(Date.UTC(yyyy, mm - 1, dd));

    // Ensure Category - handle null/undefined safely
    const categoryKey = (category || 'UNMAPPED').toString().replace(/ /g, '_').toUpperCase();
    const categoryName = category || 'UNMAPPED';

    const catRecord = await prisma.category.upsert({
      where: { key: categoryKey },
      update: {},
      create: { key: categoryKey, name: categoryName }
    });

    // Ensure Stock
    const stock = await prisma.stock.upsert({
      where: { symbol: symbol },
      update: {},
      create: { symbol, name: symbol, instrumentKey: '' }
    });

    // Check Duplicate
    const existingLink = await prisma.stockCategory.findFirst({
      where: { stockId: stock.id, categoryId: catRecord.id, addedDate: addedDate }
    });

    if (existingLink) {
      console.log(`[POST /api/stocks] ⚠️ DUPLICATE: ${symbol}`);
      return res.status(409).json({ ok: false, error: 'Duplicate entry', code: 'DUPLICATE' });
    }

    // Create Link
    await prisma.stockCategory.create({
      data: { stockId: stock.id, categoryId: catRecord.id, addedDate: addedDate }
    });

    console.log(`[POST /api/stocks] ✅ Added ${symbol}`);
    res.json({ ok: true, stockName: stock.symbol, date: dateStr, category: categoryKey });
  } catch (e) {
    console.error('[POST /api/stocks] Error:', e);
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});
// ----------------------

// Auto-sync instruments on startup
(async () => {
  try {
    const instrumentService = require('./services/instrumentService.cjs');
    const nseFilepath = path.join(__dirname, '..', '..', 'NSE.json');

    console.log(`[Startup] Looking for NSE.json at: ${nseFilepath}`);

    if (fs.existsSync(nseFilepath)) {
      console.log('[Startup] Syncing instruments from NSE.json...');
      const result = await instrumentService.syncFromFile(nseFilepath);
      console.log(`[Startup] ✅ Synced ${result.inserted} new, ${result.updated} updated instruments`);

      // Reload instrument resolver cache
      await instrumentResolver.reload();
    } else {
      console.log('[Startup] ⚠️ NSE.json not found, skipping instrument sync');
    }
  } catch (err) {
    console.error('[Startup] ❌ Instrument sync failed:', err.message);
  }
})();

// Import Backtester
let runBacktest = null;
try {
  const btPath = path.resolve(__dirname, '../../backend/strategy/backtester.cjs');
  runBacktest = require(btPath).runBacktest;
} catch (e) { console.error('[BACKEND] Failed to load backtester:', e); }

// In-memory job store for SSE
const activeJobs = new Map(); // jobId -> { res: Response, logs: string[] }

// Crash handlers
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  console.error('[FATAL] Stack:', err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Promise Rejection at:', promise);
  console.error('[FATAL] Reason:', reason);
});

const PORT = process.env.BACKEND_PORT ? Number(process.env.BACKEND_PORT) : 3001;
const UPSTOX_CLIENT_ID = process.env.UPSTOX_CLIENT_ID || '';
const UPSTOX_CLIENT_SECRET = process.env.UPSTOX_CLIENT_SECRET || '';
const UPSTOX_REDIRECT_URI = process.env.UPSTOX_REDIRECT_URI || `http://localhost:${PORT}/auth/upstox/callback`;

// Token management
const TOKENS_FILE = path.join(__dirname, 'auth', 'tokens.json');
function readTokens() {
  try { return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')); } catch { return { access_token: null, refresh_token: null, expires_at: 0 }; }
}
function writeTokens(t) {
  try {
    const dir = path.dirname(TOKENS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(t, null, 2));
  } catch (e) { console.error('Failed to write tokens:', e); }
}
function isExpired(t) { return !t || !t.expires_at || (Date.now() >= t.expires_at - 30_000); }

async function ensureAccessToken() {
  let t = readTokens();
  if (t.access_token && !isExpired(t)) return t.access_token;
  if (!t.refresh_token) return t.access_token;
  try {
    const body = new URLSearchParams();
    body.set('refresh_token', t.refresh_token);
    body.set('client_id', UPSTOX_CLIENT_ID);
    body.set('client_secret', UPSTOX_CLIENT_SECRET);
    body.set('grant_type', 'refresh_token');
    const r = await fetch('https://api.upstox.com/v2/login/authorization/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!r.ok) return null;
    const data = await r.json();
    const expiresAt = Date.now() + (data.expires_in ? Number(data.expires_in) * 1000 : 50 * 60 * 1000);
    writeTokens({ access_token: data.access_token, refresh_token: data.refresh_token || t.refresh_token, expires_at: expiresAt });
    return data.access_token;
  } catch (e) { return null; }
}

// Health endpoints
app.get('/ping', (req, res) => res.send('pong'));
app.get('/health', (req, res) => res.json({ status: 'ok', version: '0.3.0-upstox' }));
app.get('/version', (req, res) => res.json({ version: '0.3.0-upstox' }));

// Upstox OAuth
app.get('/auth/upstox/start', (req, res) => {
  if (!UPSTOX_CLIENT_ID) return res.status(500).send('Missing UPSTOX_CLIENT_ID');
  const state = Math.random().toString(36).slice(2);
  const scope = encodeURIComponent('marketdata:read historical:read profile:read');
  const url = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${encodeURIComponent(UPSTOX_CLIENT_ID)}&redirect_uri=${encodeURIComponent(UPSTOX_REDIRECT_URI)}&state=${state}&scope=${scope}`;
  res.redirect(url);
});

app.get('/auth/upstox/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code parameter');

  try {
    const body = new URLSearchParams();
    body.set('code', String(code));
    body.set('client_id', UPSTOX_CLIENT_ID);
    body.set('client_secret', UPSTOX_CLIENT_SECRET);
    body.set('redirect_uri', UPSTOX_REDIRECT_URI);
    body.set('grant_type', 'authorization_code');

    const backoffs = [500, 1000, 2000];
    let data = null;
    for (let attempt = 0; attempt <= backoffs.length; attempt++) {
      try {
        const r = await fetch('https://api.upstox.com/v2/login/authorization/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
          body,
          timeout: 10000
        });
        if (!r.ok) {
          if (attempt < backoffs.length) { await new Promise(r => setTimeout(r, backoffs[attempt])); continue; }
          throw new Error(`Status ${r.status}`);
        }
        data = await r.json();
        break;
      } catch (e) {
        if (attempt < backoffs.length) await new Promise(r => setTimeout(r, backoffs[attempt]));
        else throw e;
      }
    }

    const expiresAt = Date.now() + (data.expires_in ? Number(data.expires_in) * 1000 : 50 * 60 * 1000);
    writeTokens({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: expiresAt });
    res.send('<html><body><h1>✅ Upstox Authentication Successful!</h1><p>You can close this tab.</p></body></html>');
  } catch (e) {
    res.status(500).send(`Callback error: ${e.message}`);
  }
});

app.get('/auth/upstox/status', (req, res) => {
  const t = readTokens();
  res.json({ hasToken: !!t.access_token, expiresAt: t.expires_at || 0, expired: isExpired(t) });
});

// OHLCV endpoint
app.get('/api/upstox/ohlcv', async (req, res) => {
  const { symbol, interval, from, to } = req.query;
  if (!symbol || !interval || !from || !to) return res.status(400).json({ error: 'Missing params' });

  const token = await ensureAccessToken();
  if (!token) return res.status(401).json({ error: 'Not authenticated with Upstox' });

  const resolved = instrumentResolver.resolveBySymbol(symbol);
  const instrumentKey = resolved ? resolved.key : symbol;

  let uInterval = interval;
  if (interval === '1m') uInterval = '1minute';
  else if (interval === '5m') uInterval = '5minute';
  else if (interval === '15m') uInterval = '15minute';
  else if (interval === '30m') uInterval = '30minute';
  else if (interval === '1h' || interval === '60m') uInterval = '60minute';
  else if (interval === 'day') uInterval = 'day';

  const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/${uInterval}/${to}/${from}`;

  const backoffs = [200, 600, 1800];
  let lastErr = null;
  for (let attempt = 0; attempt < backoffs.length; attempt++) {
    try {
      const https = require('https');
      const urlParsed = new URL(url);
      const respData = await new Promise((resolve, reject) => {
        const req = https.get({
          hostname: urlParsed.hostname,
          path: urlParsed.pathname + urlParsed.search,
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          timeout: 15000
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            if (res.statusCode >= 400) reject(new Error(`Status ${res.statusCode}`));
            else {
              try { resolve(JSON.parse(data)); }
              catch (e) { reject(new Error('Invalid JSON')); }
            }
          });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      });
      return res.json(respData);
    } catch (e) {
      lastErr = e;
      if (attempt < backoffs.length - 1) await new Promise(r => setTimeout(r, backoffs[attempt]));
    }
  }
  return res.status(502).json({ error: 'Proxy failed', detail: String(lastErr?.message) });
});

// Batch prefetch endpoint with rate limiting fix
app.post('/strategy/prefetch', async (req, res) => {
  const { mode, items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ ok: false, error: 'items must be an array' });

  const token = await ensureAccessToken();
  if (!token && mode !== 'mock') return res.status(401).json({ ok: false, error: 'Not authenticated' });

  const results = [];
  let cached = 0, errors = 0;

  for (const item of items) {
    const { symbol, from, to, interval } = item;
    if (!symbol || !from || !to || !interval) {
      results.push({ symbol, status: 'error', error: 'Missing params' });
      errors++;
      continue;
    }

    const resolved = instrumentResolver.resolveBySymbol(symbol);
    const instrumentKey = resolved ? resolved.key : symbol;
    let uInterval = interval === 'day' ? 'day' : (interval === '1m' ? '1minute' : interval);
    const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/${uInterval}/${to}/${from}`;

    const backoffs = [500, 1500, 3000];
    let respData = null, lastError = null;

    for (let attempt = 0; attempt < backoffs.length; attempt++) {
      try {
        const https = require('https');
        const urlParsed = new URL(url);
        respData = await new Promise((resolve, reject) => {
          const req = https.get({
            hostname: urlParsed.hostname,
            path: urlParsed.pathname + urlParsed.search,
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            timeout: 15000
          }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
              if (res.statusCode >= 400) reject(new Error(`Status ${res.statusCode}`));
              else {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('Invalid JSON')); }
              }
            });
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        });
        break;
      } catch (e) {
        lastError = e;
        if (attempt < backoffs.length - 1) await new Promise(r => setTimeout(r, backoffs[attempt]));
      }
    }

    if (respData?.status === 'success' && Array.isArray(respData.data?.candles)) {
      results.push({ symbol, status: 'cached', count: respData.data.candles.length });
      cached++;
    } else {
      results.push({ symbol, status: 'error', error: String(lastError?.message || 'Failed') });
      errors++;
    }

    // RATE LIMITING FIX: Add delay between symbols to avoid Upstox blocking
    await new Promise(r => setTimeout(r, 800));
  }

  console.log(`[prefetch] ${cached} cached, ${errors} errors`);
  return res.json({ ok: true, cached, errors, results });
});

// Debug endpoint
app.get('/debug/upstox/candles', async (req, res) => {
  try {
    const symbol = String(req.query.symbol || '').trim();
    if (!symbol) return res.status(400).json({ ok: false, error: 'symbol is required' });

    const token = await ensureAccessToken();
    if (!token) return res.status(401).json({ ok: false, error: 'Not authenticated' });

    const resolved = instrumentResolver.resolveBySymbol(symbol);
    const instrumentKey = resolved ? resolved.key : symbol;

    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/day/${to}/${from}`;

    const backoffs = [200, 600, 1800];
    for (let attempt = 0; attempt < backoffs.length; attempt++) {
      try {
        const https = require('https');
        const urlParsed = new URL(url);
        const respData = await new Promise((resolve, reject) => {
          const req = https.get({
            hostname: urlParsed.hostname,
            path: urlParsed.pathname + urlParsed.search,
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            timeout: 15000
          }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
              if (res.statusCode >= 400) reject(new Error(`Status ${res.statusCode}`));
              else {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('Invalid JSON')); }
              }
            });
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        });

        if (respData?.status === 'success' && Array.isArray(respData.data?.candles)) {
          const candles = respData.data.candles.slice(0, 10);
          return res.json({ ok: true, symbol, instrumentKey, count: candles.length, candles });
        }
        return res.json({ ok: false, error: 'No candles in response' });
      } catch (e) {
        if (attempt < backoffs.length - 1) await new Promise(r => setTimeout(r, backoffs[attempt]));
        else return res.status(500).json({ ok: false, error: String(e.message) });
      }
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// --- Watchlist & Stocks Data APIs ---

// GET /api/watchlist - Returns grouped watchlist for dashboard
app.get('/api/watchlist', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        stocks: {
          include: { stock: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Construct GroupedWatchlist: { [page]: { [category]: StockData[] } }
    // We'll use "Main" as the default page for now.
    const grouped = { "Main": {} };

    for (const cat of categories) {
      grouped["Main"][cat.key] = cat.stocks.map(item => ({
        stockName: item.stock.symbol, // Frontend uses stockName or symbol
        symbol: item.stock.symbol,
        name: item.stock.name,
        date: item.addedDate ? item.addedDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        price: null, // Price would need a real-time fetch or cache
        category: cat.key,
        exchange: item.stock.exchange,
        instrument_token: item.stock.instrumentKey
      }));
    }

    res.json(grouped);
  } catch (e) {
    console.error('[GET /api/watchlist] Error:', e);
    res.status(500).json({ error: String(e.message) });
  }
});

// GET /api/stocks - Returns flat list of all stocks with category info
app.get('/api/stocks', async (req, res) => {
  try {
    const stocks = await prisma.stock.findMany({
      include: {
        categories: {
          include: { category: true }
        }
      }
    });

    // Flatten: a stock can be in multiple categories, so we emit a row per category assignment
    const flatList = [];
    for (const s of stocks) {
      for (const c of s.categories) {
        flatList.push({
          stockName: s.symbol, // Frontend expects stockName
          symbol: s.symbol,
          name: s.name,
          category: c.category.key,
          categoryKey: c.category.key,
          date: c.addedDate ? c.addedDate.toISOString().split('T')[0] : null,
          instrument_token: s.instrumentKey,
          exchange: s.exchange
        });
      }
    }

    res.json(flatList);
  } catch (e) {
    console.error('[ /api/stocks] Error:', e);
    res.status(500).json({ error: String(e.message) });
  }
});

// ==================== INSTRUMENT API ENDPOINTS ====================

// GET /api/instruments/search?q=<query>&limit=20
app.get('/api/instruments/search', async (req, res) => {
  try {
    const { q = '', limit = '20' } = req.query;
    const instrumentService = require('./services/instrumentService.cjs');
    const results = await instrumentService.searchInstruments(q, parseInt(limit));
    res.json(results);
  } catch (err) {
    console.error('[API] Instrument search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/instruments/:symbol
app.get('/api/instruments/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const instrumentService = require('./services/instrumentService.cjs');
    const instrument = await instrumentService.getBySymbol(symbol);
    if (!instrument) return res.status(404).json({ error: 'Instrument not found' });
    res.json(instrument);
  } catch (err) {
    console.error('[API] Instrument fetch error:', err);
    res.status(500).json({ error: 'Fetch failed' });
  }
});

// POST /api/instruments/sync - manually trigger instrument sync from NSE.json
app.post('/api/instruments/sync', async (req, res) => {
  try {
    const instrumentService = require('./services/instrumentService.cjs');
    const filepath = path.join(process.cwd(), '..', '..', '.data', 'NSE.json');

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'NSE.json not found', path: filepath });
    }

    const result = await instrumentService.syncFromFile(filepath);
    res.json(result);
  } catch (err) {
    console.error('[API] Instrument sync error:', err);
    res.status(500).json({ error: 'Sync failed', message: err.message });
  }
});

// GET /api/instruments/count - get total active instruments count
app.get('/api/instruments/count', async (req, res) => {
  try {
    const instrumentService = require('./services/instrumentService.cjs');
    const count = await instrumentService.getCount();
    res.json({ count });
  } catch (err) {
    console.error('[API] Instrument count error:', err);
    res.status(500).json({ error: 'Count failed' });
  }
});

// --- Stock Management APIs ---

// GET all categories
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      select: {
        key: true,
        name: true,
        description: true
      },
      orderBy: { name: 'asc' }
    });
    res.json({ ok: true, categories });
  } catch (e) {
    console.error('[GET /api/categories] Error:', e);
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// GET stocks for a category
app.get('/api/categories/:categoryKey/stocks', async (req, res) => {
  const { categoryKey } = req.params;
  try {
    const category = await prisma.category.findUnique({
      where: { key: categoryKey },
      include: {
        stocks: {
          include: { stock: true }
        }
      }
    });

    if (!category) {
      return res.json({ ok: true, stocks: [] }); // Return empty if category doesn't exist yet
    }

    const stocks = category.stocks.map(item => ({
      symbol: item.stock.symbol,
      name: item.stock.name,
      instrumentKey: item.stock.instrumentKey,
      listedDate: item.stock.createdAt // Using createdAt as proxy for listedDate if not stored
    }));

    res.json({ ok: true, stocks });
  } catch (e) {
    console.error('Error fetching category stocks:', e);
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST (Save) stocks to a category
app.post('/api/categories/:categoryKey/stocks', async (req, res) => {
  const { categoryKey } = req.params;
  const { stocks } = req.body; // Expecting array of { symbol, name?, ... }

  console.log(`[POST /api/categories/${categoryKey}/stocks] Received ${stocks?.length || 0} stocks`);

  if (!Array.isArray(stocks)) {
    return res.status(400).json({ ok: false, error: 'stocks must be an array' });
  }

  try {
    // 1. Ensure Category exists
    const categoryName = categoryKey.replace(/_/g, ' ');

    const category = await prisma.category.upsert({
      where: { key: categoryKey },
      update: {},
      create: {
        key: categoryKey,
        name: categoryName
      }
    });

    let processed = 0;
    let duplicates = 0;

    // 2. Process stocks
    for (const item of stocks) {
      const symbol = item.symbol || item.stockName;
      if (!symbol) continue;

      try {
        // Upsert Stock
        const stock = await prisma.stock.upsert({
          where: { symbol: symbol },
          update: {},
          create: {
            symbol: symbol,
            name: item.name || symbol,
            exchange: 'NSE_EQ', // Default assumption
            instrumentType: 'EQ'
          }
        });

        // Parse the listedDate/date field
        const dateStr = item.listedDate || item.date || item.addedDate;
        let addedDate;

        if (dateStr) {
          // Parse date and normalize to UTC midnight to match PostgreSQL @db.Date storage
          const parsed = new Date(dateStr);
          addedDate = new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
        } else {
          // Use today's date at UTC midnight
          const now = new Date();
          addedDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        }

        console.log(`[BACKEND] Processing ${symbol}: dateStr=${dateStr}, addedDate=${addedDate.toISOString().slice(0, 10)}`);

        // 🔍 DUPLICATE CHECK: Check if this exact stock+category+date combination exists
        // Note: PostgreSQL @db.Date strips time, so we compare date-only
        const existing = await prisma.stockCategory.findFirst({
          where: {
            stockId: stock.id,
            categoryId: category.id,
            addedDate: addedDate
          }
        });

        if (existing) {
          console.log(`[BACKEND] ⚠️ DUPLICATE detected: ${symbol} in ${categoryKey} on ${addedDate.toISOString().slice(0, 10)} - SKIPPING`);
          duplicates++;
          continue; // Skip this stock
        }

        // Create new stock-category link (not upsert, to avoid silent updates)
        await prisma.stockCategory.create({
          data: {
            stockId: stock.id,
            categoryId: category.id,
            addedDate: addedDate
          }
        });

        processed++;
      } catch (itemError) {
        console.error(`[BACKEND] ❌ Failed to process stock ${symbol}:`, itemError.message);
        console.error(`[BACKEND]    Data: symbol=${symbol}, listedDate=${item.listedDate}, date=${item.date}`);
      }
    }

    console.log(`[POST /api/categories/${categoryKey}/stocks] Processed ${processed}/${stocks.length} stocks (${duplicates} duplicates skipped)`);
    res.json({ ok: true, count: processed, duplicates: duplicates, category: category.name });
  } catch (e) {
    console.error(`[POST /api/categories/${categoryKey}/stocks] ❌ ERROR:`, e);
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST (Save) single stock (used by ManualImport)
app.post('/api/stocks', async (req, res) => {
  const { symbol, date, category } = req.body;

  console.log(`[POST /api/stocks] Received ${symbol} for ${category} on ${date}`);

  if (!symbol || !category) {
    return res.status(400).json({ ok: false, error: 'symbol and category are required' });
  }

  try {
    // 1. Normalize Date (UTC Midnight)
    let dateStr = date;
    if (!dateStr) dateStr = new Date().toISOString().slice(0, 10);

    // Parse YYYY-MM-DD
    const [yyyy, mm, dd] = dateStr.split('-').map(Number);
    // Create UTC date at midnight
    const addedDate = new Date(Date.UTC(yyyy, mm - 1, dd));

    // 2. Ensure Category exists
    // Normalize category key (simple replacement for now, relying on frontend to send valid key)
    const categoryKey = category.replace(/ /g, '_').toUpperCase();
    const categoryName = category;

    const catRecord = await prisma.category.upsert({
      where: { key: categoryKey },
      update: {},
      create: {
        key: categoryKey,
        name: categoryName
      }
    });

    // 3. Ensure Stock exists
    const stock = await prisma.stock.upsert({
      where: { symbol: symbol },
      update: {},
      create: {
        symbol: symbol,
        name: symbol, // Default name
        instrumentKey: '' // Default
      }
    });

    // 4. Link Stock to Category (Check for duplicates)
    const existingLink = await prisma.stockCategory.findFirst({
      where: {
        stockId: stock.id,
        categoryId: catRecord.id,
        addedDate: addedDate // Check exact date match
      }
    });

    if (existingLink) {
      console.log(`[POST /api/stocks] ⚠️ DUPLICATE detected: ${symbol} in ${categoryKey} on ${dateStr}`);
      return res.status(409).json({ ok: false, error: 'Duplicate entry', code: 'DUPLICATE' });
    }

    // Create link
    await prisma.stockCategory.create({
      data: {
        stockId: stock.id,
        categoryId: catRecord.id,
        addedDate: addedDate
      }
    });

    console.log(`[POST /api/stocks] ✅ Added ${symbol} to ${categoryKey}`);

    // Return structure matching frontend expectation
    res.json({
      ok: true,
      stockName: stock.symbol,
      date: dateStr,
      category: categoryKey,
      categoryKey: categoryKey,
      categoryRaw: category
    });

  } catch (e) {
    console.error('[POST /api/stocks] Error:', e);
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// DELETE stock from category
app.delete('/api/categories/:categoryKey/stocks/:symbol', async (req, res) => {
  const { categoryKey, symbol } = req.params;

  console.log(`[DELETE /api/categories/${categoryKey}/stocks/${symbol}] Removing stock from category`);

  try {
    // Find category
    const category = await prisma.category.findUnique({
      where: { key: categoryKey }
    });

    if (!category) {
      console.log(`[DELETE] Category ${categoryKey} not found`);
      return res.json({ ok: true, message: 'Category not found' });
    }

    // Find stock
    const stock = await prisma.stock.findUnique({
      where: { symbol: symbol }
    });

    if (!stock) {
      console.log(`[DELETE] Stock ${symbol} not found`);
      return res.json({ ok: true, message: 'Stock not found' });
    }

    // Delete the link between stock and category
    const deleted = await prisma.stockCategory.deleteMany({
      where: {
        stockId: stock.id,
        categoryId: category.id
      }
    });

    console.log(`[DELETE] ✅ Removed ${symbol} from ${categoryKey} (deleted ${deleted.count} links)`);
    res.json({ ok: true, deleted: deleted.count, symbol, category: categoryKey });
  } catch (e) {
    console.error(`[DELETE /api/categories/${categoryKey}/stocks/${symbol}] ❌ ERROR:`, e);
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// GET promoted strategy for a category
app.get('/api/categories/:categoryKey/strategy', async (req, res) => {
  const { categoryKey } = req.params;

  console.log(`[GET /api/categories/${categoryKey}/strategy] Fetching promoted strategy`);

  try {
    // Find category
    const category = await prisma.category.findUnique({
      where: { key: categoryKey }
    });

    if (!category) {
      console.log(`[GET /strategy] Category ${categoryKey} not found`);
      return res.status(404).json({ ok: false, error: 'Category not found' });
    }

    // Find promoted strategy for this category
    const strategy = await prisma.strategy.findFirst({
      where: {
        categoryId: category.id,
        promoted: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    if (!strategy) {
      console.log(`[GET /strategy] No promoted strategy found for ${categoryKey}`);
      return res.status(404).json({ ok: false, error: 'No promoted strategy found' });
    }

    console.log(`[GET /strategy] ✅ Found promoted strategy (id=${strategy.id}) for ${categoryKey}`);

    res.json({
      ok: true,
      strategy: {
        id: strategy.id,
        rules: strategy.rules,
        params: strategy.params,
        metrics: strategy.metrics,
        version: strategy.version,
        description: strategy.description,
        updatedAt: strategy.updatedAt
      }
    });
  } catch (e) {
    console.error(`[GET /api/categories/${categoryKey}/strategy] ❌ ERROR:`, e);
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// POST (Save/Promote) strategy for a category
app.post('/api/categories/:categoryKey/strategy', async (req, res) => {
  const { categoryKey } = req.params;
  const { rules, params, metrics, description } = req.body;

  console.log(`[POST /api/categories/${categoryKey}/strategy] Saving promoted strategy`);

  try {
    // Find category
    const category = await prisma.category.findUnique({
      where: { key: categoryKey }
    });

    if (!category) {
      console.log(`[POST /strategy] Category ${categoryKey} not found`);
      return res.status(404).json({ ok: false, error: 'Category not found' });
    }

    // Unpromote all existing strategies for this category (keep history)
    await prisma.strategy.updateMany({
      where: {
        categoryId: category.id,
        promoted: true
      },
      data: { promoted: false }
    });

    console.log(`[POST /strategy] Unpromoted old strategies for ${categoryKey}`);

    // Create new promoted strategy
    const newStrategy = await prisma.strategy.create({
      data: {
        categoryId: category.id,
        rules: rules || null,
        params: params || null,
        metrics: metrics || null,
        description: description || null,
        version: 'V1',
        promoted: true
      }
    });

    console.log(`[POST /strategy] ✅ Created promoted strategy (id=${newStrategy.id}) for ${categoryKey}`);

    res.json({
      ok: true,
      strategy: {
        id: newStrategy.id,
        rules: newStrategy.rules,
        params: newStrategy.params,
        metrics: newStrategy.metrics,
        version: newStrategy.version,
        description: newStrategy.description,
        updatedAt: newStrategy.updatedAt
      }
    });
  } catch (e) {
    console.error(`[POST /api/categories/${categoryKey}/strategy] ❌ ERROR:`, e);
    console.error('[BACKEND] Stack trace:', e.stack);
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// --- Backtest & SSE Endpoints ---

// POST /api/backtest/start
app.post('/api/backtest/start', async (req, res) => {
  if (!runBacktest) return res.status(500).json({ ok: false, error: 'Backtester not loaded' });

  const config = req.body; // { symbols, from, to, interval, strategyConfig, ... }
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  console.log(`[BACKTEST] Starting job ${jobId} for ${config.symbols?.length || 0} symbols`);

  // Start backtest asynchronously
  (async () => {
    try {
      const hooks = {
        onLog: (msg) => {
          const entry = `[${new Date().toISOString()}] ${msg}`;
          const job = activeJobs.get(jobId);
          if (job && job.res) {
            job.res.write(`data: ${JSON.stringify({ type: 'log', payload: entry })}\n\n`);
          }
        },
        onProgress: (prog) => {
          const job = activeJobs.get(jobId);
          if (job && job.res) {
            job.res.write(`data: ${JSON.stringify({ type: 'progress', payload: prog })}\n\n`);
          }
        },
        isCancelled: () => {
          const job = activeJobs.get(jobId);
          return !job; // Cancel if job removed from map (connection closed)
        }
      };

      const result = await runBacktest({ ...config, runId: jobId }, hooks);

      const job = activeJobs.get(jobId);
      if (job && job.res) {
        job.res.write(`data: ${JSON.stringify({ type: 'complete', payload: result })}\n\n`);
        job.res.end();
      }
    } catch (e) {
      console.error(`[BACKTEST] Job ${jobId} failed:`, e);
      const job = activeJobs.get(jobId);
      if (job && job.res) {
        job.res.write(`data: ${JSON.stringify({ type: 'error', payload: String(e.message) })}\n\n`);
        job.res.end();
      }
    } finally {
      activeJobs.delete(jobId);
    }
  })();

  res.json({ ok: true, jobId });
});

// GET /api/backtest/progress/:jobId (SSE)
app.get('/api/backtest/progress/:jobId', (req, res) => {
  const { jobId } = req.params;

  console.log(`[SSE] Client connected for job ${jobId}`);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', jobId })}\n\n`);

  // Store connection
  activeJobs.set(jobId, { res });

  // Clean up on close
  req.on('close', () => {
    console.log(`[SSE] Client disconnected for job ${jobId}`);
    activeJobs.delete(jobId);
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'running', timestamp: new Date().toISOString() });
});

// ========== LIVE PRICE API ENDPOINTS ==========
const livePriceService = require('./services/livePriceService.cjs');

// Get all live prices
app.get('/api/live-prices', (req, res) => {
  try {
    const data = livePriceService.getAllPrices();
    res.json({
      ok: true,
      ...data
    });
  } catch (error) {
    console.error('[API] Live prices error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Manually trigger price refresh
app.post('/api/live-prices/refresh', async (req, res) => {
  try {
    console.log('[API] Manual price refresh requested');
    await livePriceService.updateAllPrices();
    const data = livePriceService.getAllPrices();
    res.json({
      ok: true,
      message: 'Prices refreshed successfully',
      ...data
    });
  } catch (error) {
    console.error('[API] Refresh error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Configure update interval
app.post('/api/live-prices/config', (req, res) => {
  try {
    const { intervalMinutes } = req.body;
    if (!intervalMinutes || intervalMinutes < 1) {
      return res.status(400).json({ ok: false, error: 'Invalid interval' });
    }
    livePriceService.setUpdateInterval(intervalMinutes);
    res.json({
      ok: true,
      message: `Update interval set to ${intervalMinutes} minutes`
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Start live price service on server startup
livePriceService.start().catch(err => {
  console.error('[Server] Failed to start live prices:', err);
});



// ========== OPTIMIZATION API ENDPOINTS ==========
const AdvancedOptimizer = require('./optimization/advancedOptimizer.cjs');

// Store active optimization jobs
const optimizationJobs = new Map();

// Start optimization
app.post('/api/optimize/start', async (req, res) => {
  try {
    const { category = 'LONGTERM SWING BO UP' } = req.body;
    const jobId = `opt_${Date.now()}`;

    console.log(`[Optimization] Starting job ${jobId} for category: ${category}`);

    // Create optimizer instance
    const optimizer = new AdvancedOptimizer(category);

    // Store job
    optimizationJobs.set(jobId, {
      status: 'RUNNING',
      progress: 0,
      total: 0,
      phase: 'STARTING',
      message: 'Initializing...',
      startTime: new Date(),
      optimizer
    });

    // Set progress callback
    optimizer.setProgressCallback((progress) => {
      const job = optimizationJobs.get(jobId);
      if (job) {
        job.status = progress.phase === 'COMPLETE' ? 'COMPLETE' : 'RUNNING';
        job.progress = progress.progress;
        job.total = progress.total;
        job.phase = progress.phase;
        job.message = progress.message;
        if (progress.bestStrategy) {
          job.result = progress.bestStrategy;
        }
      }
    });

    // Run optimization in background
    optimizer.optimize()
      .then(async (bestStrategy) => {
        const job = optimizationJobs.get(jobId);
        if (job) {
          job.status = 'COMPLETE';
          job.result = bestStrategy;
          job.completedAt = new Date();

          // Auto-generate strategy code
          const filename = await optimizer.generateStrategyCode(bestStrategy);
          job.generatedFile = filename;

          console.log(`[Optimization] Job ${jobId} completed. Accuracy: ${bestStrategy.accuracy.toFixed(2)}%`);
        }
      })
      .catch((error) => {
        const job = optimizationJobs.get(jobId);
        if (job) {
          job.status = 'ERROR';
          job.error = error.message;
          console.error(`[Optimization] Job ${jobId} failed:`, error.message);
        }
      });

    res.json({ ok: true, jobId, message: 'Optimization started' });

  } catch (error) {
    console.error('[POST /api/optimize/start] Error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Composite optimizer endpoint (for Strategy Workbench "Sanity Check")
app.post('/api/optimize/composite', async (req, res) => {
  try {
    const { symbols, from, to, categoryKey, mode = 'upstox', pool, limits, threshold } = req.body;

    console.log(`[Composite Optimizer] Starting for ${categoryKey} with ${symbols?.length || 0} symbols`);

    if (!symbols || symbols.length === 0) {
      return res.json({
        ok: false,
        categoryKey,
        candidates: 0,
        ranked: [],
        error: 'No symbols provided'
      });
    }

    // Import BacktestEngine
    const BacktestEngine = require('./strategy/backtestEngine.cjs');

    // Run backtest to get actual results
    const engine = new BacktestEngine(categoryKey);
    const backtestResult = await engine.run();

    console.log(`[Composite Optimizer] Backtest complete:`, {
      totalStocks: backtestResult.totalStocks,
      totalTrades: backtestResult.totalTrades,
      accuracy: backtestResult.accuracy
    });

    // Convert backtest result to ranked candidate format
    const config = {
      ema_short: 20,
      ema_long: 50,
      rsi_period: 14,
      rsi_min: 30,
      rsi_max: 70,
      atr_mult: 1.5,
      volumeFactor: 1.5,
      targetR: 2.0,
      patterns: 'all'
    };

    const metrics = {
      winRate: parseFloat(backtestResult.accuracy) / 100,
      avgReturn: parseFloat(backtestResult.avgProfit) / 100,
      netPnl: backtestResult.totalTrades * (parseFloat(backtestResult.avgProfit) / 100) * 100, // Rough estimate
      maxDrawdown: 0.15, // Placeholder
      trades: backtestResult.totalTrades
    };

    const candidate = {
      config,
      metrics,
      trades: backtestResult.trades || []
    };

    // Check if meets threshold
    const meetsThreshold = threshold
      ? (metrics.winRate * 100) >= (threshold.minAccuracyPct || 70) && metrics.avgReturn >= (threshold.minExpectancy || 0)
      : true;

    const response = {
      ok: true,
      categoryKey,
      candidates: 1,
      ranked: [candidate],
      selected: meetsThreshold ? candidate : null,
      persisted: false,
      message: `Backtest completed: ${backtestResult.totalTrades} trades, ${backtestResult.accuracy} accuracy`
    };

    console.log(`[Composite Optimizer] Returning ranked results:`, {
      candidates: response.candidates,
      selected: !!response.selected,
      winRate: (metrics.winRate * 100).toFixed(1) + '%'
    });

    res.json(response);

  } catch (error) {
    console.error('[POST /api/optimize/composite] Error:', error);
    res.status(500).json({
      ok: false,
      categoryKey: req.body.categoryKey,
      candidates: 0,
      ranked: [],
      error: error.message
    });
  }
});

// Get optimization status
app.get('/api/optimize/status/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const job = optimizationJobs.get(jobId);

    if (!job) {
      return res.status(404).json({ ok: false, error: 'Job not found' });
    }

    res.json({
      ok: true,
      jobId,
      status: job.status,
      progress: job.progress,
      total: job.total,
      phase: job.phase,
      message: job.message,
      startTime: job.startTime,
      completedAt: job.completedAt
    });

  } catch (error) {
    console.error('[GET /api/optimize/status] Error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Get optimization results
app.get('/api/optimize/results/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const job = optimizationJobs.get(jobId);

    if (!job) {
      return res.status(404).json({ ok: false, error: 'Job not found' });
    }

    if (job.status !== 'COMPLETE') {
      return res.status(400).json({ ok: false, error: 'Optimization not complete' });
    }

    res.json({
      ok: true,
      jobId,
      result: job.result,
      generatedFile: job.generatedFile,
      duration: (new Date(job.completedAt) - new Date(job.startTime)) / 1000
    });

  } catch (error) {
    console.error('[GET /api/optimize/results] Error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ========== END OPTIMIZATION API ==========

// ========== AI INTELLIGENCE API ==========

// Import AI services
const MarketSentiment = require('./services/MarketSentiment.cjs');
const MarketRegimeDetector = require('./services/MarketRegimeDetector.cjs');
const TechnicalAnalysis = require('./services/TechnicalAnalysis.cjs');
const AIIntelligence = require('./services/AIIntelligence.cjs');

// GET /api/ai/market-sentiment - Get overall market sentiment
app.get('/api/ai/market-sentiment', async (req, res) => {
  try {
    const sentiment = await MarketSentiment.getMarketSentiment();
    res.json({ ok: true, sentiment });
  } catch (error) {
    console.error('[GET /api/ai/market-sentiment] Error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/ai/analyze-news - Analyze news headlines
app.post('/api/ai/analyze-news', async (req, res) => {
  try {
    const { headlines } = req.body;
    if (!Array.isArray(headlines)) {
      return res.status(400).json({ ok: false, error: 'headlines must be an array' });
    }

    const analysis = await MarketSentiment.analyzeNewsSentiment(headlines);
    res.json({ ok: true, analysis });
  } catch (error) {
    console.error('[POST /api/ai/analyze-news] Error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/ai/detect-regime - Detect market regime from candles
app.post('/api/ai/detect-regime', async (req, res) => {
  try {
    const { candles } = req.body;
    if (!Array.isArray(candles)) {
      return res.status(400).json({ ok: false, error: 'candles must be an array' });
    }

    const regime = MarketRegimeDetector.detectRegime(candles);
    res.json({ ok: true, regime });
  } catch (error) {
    console.error('[POST /api/ai/detect-regime] Error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/ai/technical-analysis - Perform comprehensive technical analysis
app.post('/api/ai/technical-analysis', async (req, res) => {
  try {
    const { candles, config } = req.body;
    if (!Array.isArray(candles)) {
      return res.status(400).json({ ok: false, error: 'candles must be an array' });
    }

    const analysis = TechnicalAnalysis.analyze(candles, config || {});
    res.json({ ok: true, analysis });
  } catch (error) {
    console.error('[POST /api/ai/technical-analysis] Error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// GET /api/ai/token-usage - Get AI token usage statistics
app.get('/api/ai/token-usage', (req, res) => {
  try {
    const stats = AIIntelligence.getUsageStats();
    res.json({ ok: true, stats });
  } catch (error) {
    console.error('[GET /api/ai/token-usage] Error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/ai/reset-usage - Reset AI token usage statistics
app.post('/api/ai/reset-usage', (req, res) => {
  try {
    AIIntelligence.resetUsageStats();
    res.json({ ok: true, message: 'Usage stats reset' });
  } catch (error) {
    console.error('[POST /api/ai/reset-usage] Error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// POST /api/ai/validate-signal - Validate trading strategy with AI
app.post('/api/ai/validate-signal', async (req, res) => {
  try {
    const { strategy, categoryKey, marketConditions } = req.body;

    if (!strategy) {
      return res.status(400).json({
        ok: false,
        passed: false,
        confidence: 0,
        issues: ['Strategy object is required']
      });
    }

    const result = await AIIntelligence.validateSignalWithAI(strategy, {
      categoryKey: categoryKey || 'UNKNOWN',
      marketConditions: marketConditions || {},
      description: strategy.description || 'Custom strategy'
    });

    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[POST /api/ai/validate-signal] Error:', error);
    res.status(500).json({
      ok: false,
      passed: false,
      confidence: 0,
      issues: [`Validation failed: ${error.message}`],
      error: error.message
    });
  }
});

// ========== V1 STRATEGY API ==========

/**
 * GET /api/categories/:categoryKey/v1-strategy
 * Load the promoted V1 strategy for a category
 */
app.get('/api/categories/:categoryKey/v1-strategy', async (req, res) => {
  try {
    const { categoryKey } = req.params;

    const v1Strategy = await prisma.strategy.findFirst({
      where: {
        category: { key: categoryKey },
        promoted: true,
        version: 'V1'
      },
      include: {
        category: true
      }
    });

    if (!v1Strategy) {
      return res.status(404).json({
        ok: false,
        error: 'No V1 strategy found. Run Time-Travel backtest first.'
      });
    }

    res.json({
      ok: true,
      strategy: {
        id: v1Strategy.id,
        version: v1Strategy.version,
        description: v1Strategy.description,
        rules: v1Strategy.rules,
        params: v1Strategy.params,
        metrics: v1Strategy.metrics,
        promoted: v1Strategy.promoted,
        createdAt: v1Strategy.createdAt,
        updatedAt: v1Strategy.updatedAt
      }
    });

  } catch (error) {
    console.error('[GET /api/categories/:categoryKey/v1-strategy] Error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// ========== END V1 STRATEGY API ==========

// ========== AI INTELLIGENCE API ==========

// Start server
app.listen(PORT, () => {
  console.log(`[CTS] backend listening on http://localhost:${PORT}`);
});
