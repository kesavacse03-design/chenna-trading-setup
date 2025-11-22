const fs = require('fs');
const path = require('path');

function getCategoryDir(categoryKey){
  const base = path.resolve(__dirname, '..', 'strategy', 'category');
  const dir = path.join(base, String(categoryKey||'UNKNOWN'));
  try { fs.mkdirSync(dir, { recursive: true }); } catch(_){}
  return dir;
}

function saveCategorySymbols(categoryKey, symbols, meta){
  const dir = getCategoryDir(categoryKey);
  const symPath = path.join(dir, 'symbols.txt');
  const manifestPath = path.join(dir, 'manifest.json');
  const uniq = Array.from(new Set((symbols||[]).map(s=>String(s).trim()).filter(Boolean))).sort();
  fs.writeFileSync(symPath, uniq.join('\n') + (uniq.length?'\n':''), 'utf8');
  const manifest = Object.assign({ categoryKey, count: uniq.length, updatedAt: new Date().toISOString() }, meta||{});
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return { symPath, manifestPath, count: uniq.length };
}

function loadCategorySymbols(categoryKey){
  const dir = getCategoryDir(categoryKey);
  const symPath = path.join(dir, 'symbols.txt');
  try { const txt = fs.readFileSync(symPath, 'utf8'); return txt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean); }
  catch(_) { return []; }
}

function readManifest(categoryKey){
  const dir = getCategoryDir(categoryKey);
  const p = path.join(dir, 'manifest.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch(_) { return null; }
}

module.exports = { getCategoryDir, saveCategorySymbols, loadCategorySymbols, readManifest };
