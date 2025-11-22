#!/usr/bin/env node
// Build symbol lists for all canonical categories using the curated "backtest data V1.txt".
// Outputs per-category files under tmp/category_symbols/<CATEGORY>.txt and a summary diag JSON.
const fs = require('fs');
const path = require('path');

function usage(){
  console.log('Usage: node tools/build_all_category_symbols.cjs [--src "backtest data V1.txt"] [--outDir tmp/category_symbols]');
}

function normalizeToken(raw){
  return (raw||'').toString().trim().replace(/[–—−]/g,'-').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'');
}

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

function loadCanonicalCategoryKeys(){
  const keys = new Set();
  try {
    const constantsPath = path.resolve(__dirname, '..', 'src', 'constants.ts');
    const txt = fs.readFileSync(constantsPath, 'utf8');
    const preMatch = txt.match(/export const PREPOPULATED_WATCHLIST[\s\S]*?=\s*\{([\s\S]*?)\};/m);
    if (preMatch) {
      const block = preMatch[1];
      const innerRe = /"([A-Z0-9_]+)"\s*:/g;
      let mm; while ((mm = innerRe.exec(block)) !== null) { keys.add(mm[1]); }
    }
  } catch(e){}
  return Array.from(keys).sort();
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
  let src = path.resolve(process.cwd(), 'backtest data V1.txt');
  let outDir = path.resolve(process.cwd(), 'tmp', 'category_symbols');
  for (let i=0;i<args.length;i++){
    const a=args[i], n=args[i+1];
    if (a==='--src'){ src = n; i++; }
    else if (a==='--outDir'){ outDir = n; i++; }
  }

  if (!fs.existsSync(src)) { usage(); console.error('Source not found:', src); process.exit(2); }

  const variantMap = loadCanonicalMap();
  const categories = loadCanonicalCategoryKeys();
  const txt = fs.readFileSync(src, 'utf8');
  const lines = txt.split(/\r?\n/).filter(l=>l.trim());

  // Prepare buckets
  const buckets = new Map();
  for (const k of categories) buckets.set(k, new Set());

  let parsedRows = 0;
  for (const raw of lines){
    let w = raw.trim();
    if (w.startsWith('"') && w.endsWith('"')) w = w.slice(1,-1).trim();
    const parts = w.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(p=>p.replace(/^\s*"|"\s*$/g,'').trim());
    if (parts.length < 3) continue;
    const sym = (parts[0]||'').trim().toUpperCase();
    const catRaw = (parts[2]||'').trim();
    if (!sym || !catRaw) continue;
    parsedRows++;
    const canonical = mapToCanonical(catRaw, variantMap);
    if (buckets.has(canonical)) buckets.get(canonical).add(sym);
  }

  // Write outputs
  fs.mkdirSync(outDir, { recursive: true });
  const summary = { source: src, outDir, totalLines: lines.length, parsedRows, categories: [] };
  for (const [key, set] of buckets){
    const arr = Array.from(set).sort();
    const filePath = path.join(outDir, `${key}.txt`);
    fs.writeFileSync(filePath, arr.join('\n') + (arr.length?'\n':''), 'utf8');
    summary.categories.push({ key, count: arr.length, file: filePath });
  }
  summary.categories.sort((a,b)=>a.key.localeCompare(b.key));
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log(`Wrote ${summary.categories.length} category files to ${outDir}`);
  console.log('Top counts:', summary.categories.slice().sort((a,b)=>b.count-a.count).slice(0,6));
})();
