// storage/stocks.cjs
// Lightweight file-backed stocks persistence for Chenna CTS backend.
// Each stock: { id, stockName, date, category, addedDate, price?, expires_at? }
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '..', '..', '.data');
const FILE_PATH = path.join(DATA_DIR, 'stocks.json');

function ensureDir() { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(_){} }
function loadStocks() {
  ensureDir();
  try {
    const raw = fs.readFileSync(FILE_PATH, 'utf8');
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : [];
  } catch(_) { return []; }
}
function saveStocks(list) {
  ensureDir();
  try { fs.writeFileSync(FILE_PATH, JSON.stringify(list, null, 2), 'utf8'); } catch(_){}
}

function upsertStock({ symbol, date, category }) {
  const list = loadStocks();
  const nowIso = new Date().toISOString();
  // Duplicate criteria: same symbol + date + category (case-insensitive category)
  const dup = list.find(s => s.stockName === symbol && s.date === date && (s.category||'').toUpperCase() === (category||'').toUpperCase());
  if (dup) {
    const err = new Error('Duplicate');
    err.code = 'DUPLICATE';
    throw err;
  }
  const item = { id: Date.now() + Math.floor(Math.random()*1000), stockName: symbol, date, category, addedDate: nowIso };
  list.push(item);
  saveStocks(list);
  return item;
}

function deleteStock(id) {
  const list = loadStocks();
  const idx = list.findIndex(s => s.id === id);
  if (idx === -1) {
    const err = new Error('Not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  list.splice(idx, 1);
  saveStocks(list);
  return { success: true };
}

module.exports = { loadStocks, saveStocks, upsertStock, deleteStock };
