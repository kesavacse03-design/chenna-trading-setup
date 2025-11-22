const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function readGzJson(filePath) {
  return new Promise((resolve, reject) => {
    const buf = [];
    fs.createReadStream(filePath)
      .on('error', reject)
      .pipe(zlib.createGunzip())
      .on('error', reject)
      .on('data', (chunk) => buf.push(chunk))
      .on('end', () => {
        const content = Buffer.concat(buf).toString('utf8');
        try {
          const parsed = JSON.parse(content);
          resolve(parsed);
        } catch (e) {
          // try newline JSON
          const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          const arr = lines.map(l => JSON.parse(l));
          resolve(arr);
        }
      });
  });
}

async function main() {
  const dataDir = path.resolve(__dirname, '..', '.data');
  const outDir = path.resolve(__dirname, '..', 'src', 'data');
  try { fs.mkdirSync(outDir, { recursive: true }); } catch(_) {}

  // Prefer NSE first so NSE entries will win when deduplicating
  const preferOrder = ['NSE.json.gz', 'BSE.json.gz'];
  const files = preferOrder.map(f => path.join(dataDir, f)).filter(fs.existsSync);
  if (!files.length) {
    console.error('No input gz files found in .data');
    process.exit(1);
  }

  const seen = new Map();
  for (const f of files) {
    console.log('Reading', f);
    const arr = await readGzJson(f);
    if (!Array.isArray(arr)) continue;
    // infer exchange from filename
    const exchange = path.basename(f).toUpperCase().includes('NSE') ? 'NSE' : 'BSE';
    for (const item of arr) {
      // try several known symbol fields
      const symbol = (item.trading_symbol || item.asset_symbol || item.symbol || item.code || item.ticker || '').toString().trim().toUpperCase();
      const name = item.name || item.longName || item.company || item.securityName || item.description || '';
      if (!symbol) continue;
      // Prefer the earlier file in `files` order (NSE first). Overwrite existing so NSE wins.
      seen.set(symbol, { symbol, name, exchange });
    }
  }

  const out = Array.from(seen.values()).map(x => ({ symbol: x.symbol, name: x.name, exchange: x.exchange }));
  const outPath = path.join(outDir, 'instruments.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log('Wrote', outPath, 'with', out.length, 'symbols');
}

main().catch(err => { console.error(err); process.exit(2); });
