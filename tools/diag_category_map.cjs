const fs = require('fs');
const path = require('path');

const CATEGORY_OPTIONS = [
  'HIGH POWERED STOCKS', 'INTRADAY BOOST', 'DOWNSIDE LOM INTRA', 'UPSIDE LOM INTRA', 'DAILY CONTRACTION', 'PRE MARKET',
  'DOWNSIDE LOM SWING', 'UPSIDE LOM SWING', 'MULTI RESISTANCE BO', 'MULTI SUPPORT BO',
  'SHORT TERM SWING BO – UP', 'SHORT TERM SWING BO – DOWN', 'LONG TERM SWING BO – UP', 'LONG TERM SWING BO – DOWN'
];

function normalize(s) {
  return (s||'').toString().trim().toLowerCase().replace(/[–—−]/g, '-').replace(/[^a-z0-9\- ]+/g,'').replace(/\s+/g,' ').replace(/\s?-\s?/g,' - ').trim();
}

function compact(s) { return normalize(s).replace(/[^a-z0-9]/g,''); }

const content = fs.readFileSync(path.join(__dirname, '..', 'backtest data V1.txt'), 'utf8');
const lines = content.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
const cats = new Map();
for (const ln of lines) {
  // remove outer quotes if present
  let w = ln;
  if (w.startsWith('"') && w.endsWith('"')) w = w.slice(1,-1).trim();
  const parts = w.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(p=>p.replace(/^\s*"|"\s*$/g,'').trim());
  const cat = parts[2] || '';
  if (!cats.has(cat)) cats.set(cat, 0);
  cats.set(cat, cats.get(cat)+1);
}

const unique = Array.from(cats.keys());

const report = [];
let autoMappedCount = 0;
let manualCandidates = [];

for (const raw of unique) {
  const normRaw = normalize(raw);
  const exact = CATEGORY_OPTIONS.find(o => o.toLowerCase() === raw.toLowerCase());
  const normExact = CATEGORY_OPTIONS.find(o => normalize(o) === normRaw);
  const compactExact = CATEGORY_OPTIONS.find(o => compact(o) === compact(raw));
  let mapped = null;
  let method = null;
  if (exact) { mapped = exact; method = 'exact'; }
  else if (normExact) { mapped = normExact; method = 'normalized'; }
  else if (compactExact) { mapped = compactExact; method = 'compact'; }
  else {
    // forgiving heuristics: try removing '-','–' and compare startsWith
    const rawNoDash = normRaw.replace(/\s*-\s*/g,' ');
    const starts = CATEGORY_OPTIONS.find(o=> normalize(o).startsWith(rawNoDash) || normalize(o).includes(rawNoDash));
    if (starts) { mapped = starts; method = 'starts/contains'; }
  }
  if (mapped) autoMappedCount += cats.get(raw);
  else manualCandidates.push(raw);
  report.push({ raw, count: cats.get(raw), mapped: mapped || null, method: method || null });
}

const diag = {
  totalRows: lines.length,
  uniqueCategories: report.length,
  autoMappedExamples: report.filter(r=>r.mapped).slice(0,10),
  unmapped: report.filter(r=>!r.mapped),
  autoMappedCount,
};

fs.writeFileSync(path.join(__dirname, 'category_diag.json'), JSON.stringify(diag, null, 2), 'utf8');
console.log('Wrote tools/category_diag.json');
console.log('Summary:', { totalRows: diag.totalRows, uniqueCategories: diag.uniqueCategories, autoMappedCount: diag.autoMappedCount, unmappedCount: diag.unmapped.length });
console.log('Unmapped examples:', diag.unmapped.slice(0,10));
