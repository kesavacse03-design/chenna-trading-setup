const fs = require('fs');
const path = require('path');

const constantsPath = path.resolve(__dirname, '..', 'src', 'constants.ts');
const txt = fs.readFileSync(constantsPath, 'utf8');

// extract PREPOPULATED_WATCHLIST block
const preMatch = txt.match(/export const PREPOPULATED_WATCHLIST[\s\S]*?=\s*\{([\s\S]*?)\};/m);
let canonicalKeys = new Set();
if (preMatch) {
  const block = preMatch[1];
  // find keys that look like "KEY":
  const keyRe = /"([A-Z0-9_]+)"\s*:\s*\{/g;
  let m;
  while ((m = keyRe.exec(block)) !== null) {
    // now capture inner keys for this page
    const pageStart = m.index + m[0].length;
    // find substring for inner object by simple brace matching
    // fallback: just capture subsequent quoted keys
    const innerRe = /"([A-Z0-9_]+)"\s*:/g;
    let mm;
    while ((mm = innerRe.exec(block)) !== null) {
      canonicalKeys.add(mm[1]);
    }
    break;
  }
}

// Also extract CATEGORY_CANONICAL_MAP to map variants
const mapMatch = txt.match(/export const CATEGORY_CANONICAL_MAP[\s\S]*?=\s*\{([\s\S]*?)\};/m);
const variantMap = {};
if (mapMatch) {
  const body = mapMatch[1];
  const pairRe = /'([^']+)'\s*:\s*'([^']+)'/g;
  let p;
  while ((p = pairRe.exec(body)) !== null) {
    variantMap[p[1]] = p[2];
  }
}

function normalizeToken(raw) {
  return (raw||'').toString().trim().replace(/[–—−]/g,'-').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'');
}

function mapToCanonical(raw) {
  const token = normalizeToken(raw);
  const compact = token.replace(/_/g, '');
  if (variantMap[compact]) return variantMap[compact];
  if (variantMap[token]) return variantMap[token];
  const tokenUpper = token.replace(/_/g, '_').toUpperCase();
  if (canonicalKeys.has(tokenUpper)) return tokenUpper;
  const compactUpper = compact.toUpperCase();
  if (canonicalKeys.has(compactUpper)) return compactUpper;
  return tokenUpper || null;
}

function toISODate(input) {
  if (!input) return new Date().toISOString().slice(0,10);
  const s = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    const [d,m,y] = s.split('-'); return `${y}-${m}-${d}`;
  }
  return new Date().toISOString().slice(0,10);
}

function parseSample(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;
    const parts = line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(p => p.replace(/^\s*"|"\s*$/g,'').trim());
    const sym = (parts[0]||'').toUpperCase();
    const dateRaw = parts[1]||'';
    const catRaw = parts[2]||'';
    const dateISO = toISODate(dateRaw);
    const mapped = mapToCanonical(catRaw||'');
    out.push({symbol: sym, date: dateISO, rawCategory: catRaw, mapped: mapped});
  }
  return out;
}

const sample = `"SHREECEM, 2025-10-28, LONG TERM SWING BO - DOWN"
TATASTEEL, 2025-10-29, HIGH POWERED STOCKS
INFY, , DOWNSIDE LOM SWING
# a comment line
INVALIDSYM!, 2025-10-28, PRE MARKET
`;

const parsed = parseSample(sample);
console.log('Canonical keys sample (first 20):', Array.from(canonicalKeys).slice(0,20));
console.log('Parsed rows:');
console.log(parsed);

// report unmapped
const unmapped = parsed.filter(p => !p.mapped).map(p => p.rawCategory || '<empty>');
console.log('UNMAPPED categories:', Array.from(new Set(unmapped)));

// write results to file
fs.writeFileSync(path.resolve(__dirname, 'test_parse_result.json'), JSON.stringify(parsed, null, 2));
console.log('Wrote test_parse_result.json');
