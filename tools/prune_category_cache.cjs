#!/usr/bin/env node
// Prune backtest cache files to keep only those for the given category symbol set and date window.
const fs = require('fs');
const path = require('path');

function usage(){
  console.log('Usage: node tools/prune_category_cache.cjs --category DOWNSIDE_LOM_SWING --from 2025-07-29 --to 2025-10-30 --interval day');
}

(function main(){
  const args = process.argv.slice(2);
  let category=null, from=null, to=null, interval='day';
  for (let i=0;i<args.length;i++){ const a=args[i], n=args[i+1]; if (a==='--category'){ category=n; i++; } else if (a==='--from'){ from=n; i++; } else if (a==='--to'){ to=n; i++; } else if (a==='--interval'){ interval=n; i++; } }
  if (!category || !from || !to) { usage(); process.exit(2); }
  const symFile = path.resolve('tmp','category_symbols',`${category}.txt`);
  if (!fs.existsSync(symFile)) { console.error('Symbol file missing', symFile); process.exit(3); }
  const symbols = fs.readFileSync(symFile,'utf8').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const keep = new Set(symbols.map(s=>`${s}_${from}_${to}_${interval}.json`));

  let cacheDir = path.resolve('backend','strategy','cache', category);
  const parentDir = path.resolve('backend','strategy','cache');
  if (!fs.existsSync(cacheDir)) {
    // fall back to parent if category subdir not yet created
    if (fs.existsSync(parentDir)) {
      console.log('Category cache subdir missing; using parent');
      cacheDir = parentDir;
    }
  }
  if (!fs.existsSync(cacheDir)) { console.log('No cache dir', cacheDir); process.exit(0); }
  const files = fs.readdirSync(cacheDir).filter(f=>f.endsWith('.json'));
  let deleted=0, total=files.length;
  for (const f of files){ if (!keep.has(f)) { try { fs.unlinkSync(path.join(cacheDir,f)); deleted++; } catch(_){} } }
  console.log(`PRUNE done: kept=${symbols.length} deleted=${deleted} total=${total}`);
})();
