#!/usr/bin/env node
// Build a symbols file for a given category by parsing the curated "backtest data V1.txt"
// Improved parser: strips outer quotes, resilient split, canonical category mapping, diagnostics.
const fs = require('fs');
const path = require('path');

function usage(){
  console.log('Usage: node tools/build_category_symbols.cjs --category "DOWNSIDE LOM SWING" --out tmp/category_symbols.txt [--expected N] [--limit N] [--show-stats]');
}

// Load canonical map (if available) from src/constants.ts so we can accept raw variants and match canonical keys.
function loadCanonicalMap(){
  try {
    const constantsPath = path.resolve(__dirname, '..', 'src', 'constants.ts');
    const txt = fs.readFileSync(constantsPath, 'utf8');
    const mapMatch = txt.match(/export const CATEGORY_CANONICAL_MAP[\s\S]*?=\s*\{([\s\S]*?)\};/m);
    const variantMap = {};
    if (mapMatch){
      const body = mapMatch[1];
      const pairRe = /'([^']+)'\s*:\s*'([^']+)'/g;
      let p; while ((p = pairRe.exec(body)) !== null) { variantMap[p[1]] = p[2]; }
    }
    return variantMap;
  } catch(e){ return {}; }
}

function normalizeToken(raw){
  return (raw||'').toString().trim().replace(/[–—−]/g,'-').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'');
}

function mapToCanonical(raw, variantMap){
  const token = normalizeToken(raw);
  const compact = token.replace(/_/g,'');
  if (variantMap[compact]) return variantMap[compact];
  if (variantMap[token]) return variantMap[token];
  return (token || '').toUpperCase();
}

(function main(){
  const args = process.argv.slice(2);
  let category = null, outPath = null, src = path.resolve(process.cwd(), 'backtest data V1.txt');
  let expected = null; let limit = null; let showStats = false;
  for (let i=0;i<args.length;i++){
    const a=args[i], n=args[i+1];
    if (a==='--category'){ category = n; i++; }
    else if (a==='--out'){ outPath = n; i++; }
    else if (a==='--src'){ src = n; i++; }
    else if (a==='--expected'){ expected = Number(n); i++; }
    else if (a==='--limit'){ limit = Number(n); i++; }
    else if (a==='--show-stats'){ showStats = true; }
  }
  if (!category || !outPath){ usage(); process.exit(2); }

  const variantMap = loadCanonicalMap();
  const wantCanonical = mapToCanonical(category, variantMap);
  const txt = fs.readFileSync(src, 'utf8');
  const lines = txt.split(/\r?\n/).filter(l=>l.trim());
  const set = new Set();
  let parsedRows = 0, matchedRows = 0, rawCategoryVariants = new Set();

  for (const raw of lines){
    let w = raw.trim();
    if (w.startsWith('"') && w.endsWith('"')) w = w.slice(1,-1).trim();
    // Split on commas not within quotes (though current file doesn't embed inner quotes per field)
    const parts = w.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(p=>p.replace(/^\s*"|"\s*$/g,'').trim());
    if (parts.length < 3) continue; // need at least symbol,date,category
    const sym = (parts[0]||'').trim().toUpperCase();
    const catRaw = (parts[2]||'').trim();
    if (!sym || !catRaw) continue;
    parsedRows++;
    const canonical = mapToCanonical(catRaw, variantMap);
    rawCategoryVariants.add(canonical);
    if (canonical === wantCanonical){
      matchedRows++;
      set.add(sym);
    }
  }

  let arr = Array.from(set).sort();
  if (limit && arr.length > limit) arr = arr.slice(0, limit);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, arr.join('\n') + (arr.length?'\n':''), 'utf8');
  const diagPath = path.join(path.dirname(outPath), 'category_symbols.diag.json');
  const diag = {
    categoryInput: category,
    categoryCanonical: wantCanonical,
    source: src,
    uniqueSymbols: arr.length,
    expected: expected || null,
    truncated: !!(limit && arr.length===limit),
    timestamp: new Date().toISOString(),
    symbols: arr,
    stats: {
      totalLines: lines.length,
      parsedRows,
      matchedRows,
      rawCategoryVariants: Array.from(rawCategoryVariants).sort()
    }
  };
  try { fs.writeFileSync(diagPath, JSON.stringify(diag, null, 2), 'utf8'); } catch(_){ }
  if (expected && arr.length !== expected) {
    console.log(`WARN expected=${expected} found=${arr.length} (source ${src})`);
  }
  console.log(`OK wrote ${arr.length} symbols to ${outPath} (canonical=${wantCanonical})`);
  if (showStats){
    console.log(`STATS totalLines=${lines.length} parsedRows=${parsedRows} matchedRows=${matchedRows} uniqueSymbols=${arr.length}`);
  }
})();
