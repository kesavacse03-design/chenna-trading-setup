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
        const addedDate = dateStr ? new Date(dateStr) : new Date();

        console.log(`[BACKEND] Processing ${symbol}: dateStr=${dateStr}, addedDate=${addedDate.toISOString()}`);

        // Link to Category with addedDate
        await prisma.stockCategory.upsert({
          where: {
            stockId_categoryId: {
              stockId: stock.id,
              categoryId: category.id
            }
          },
          update: {
            addedDate: addedDate
          },
          create: {
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

    console.log(`[POST /api/categories/${categoryKey}/stocks] Processed ${processed}/${stocks.length} stocks`);
    res.json({ ok: true, count: processed, category: category.name });
  } catch (e) {
    console.error(`[POST /api/categories/${categoryKey}/stocks] ❌ ERROR:`, e);
    console.error('[BACKEND] Stack trace:', e.stack);
    res.status(500).json({ ok: false, error: String(e.message) });
  }
});

// DELETE stock from a category
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

// Start server
app.listen(PORT, () => {
  console.log(`[CTS] backend listening on http://localhost:${PORT}`);
});
