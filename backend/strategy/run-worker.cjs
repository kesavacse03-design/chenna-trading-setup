const fs = require('fs');
const path = require('path');
let storage = null;
try { storage = require('../storage/minioClient.cjs'); } catch(_) { storage = null; }

// This worker is intended to be forked by the server. It receives a single
// message of shape { cmd: 'run', payload: { symbols, from, to, interval, mode } }
// It will require the backtester module, run it, and then atomically persist
// any returned artifact paths by copying to a .part file then renaming.

function copyAtomic(src, dest) {
  try {
    if (!fs.existsSync(src)) return null;
    const tmp = dest + '.part';
    fs.copyFileSync(src, tmp);
    fs.renameSync(tmp, dest);
    return dest;
  } catch (e) {
    try { if (fs.existsSync(dest + '.part')) fs.unlinkSync(dest + '.part'); } catch(_){}
    return null;
  }
}

process.on('message', async (m) => {
  if (!m || m.cmd !== 'run') return;
  const payload = m.payload || {};
  const hooks = {
    onLog: (line) => { try { process.send && process.send({ type: 'log', line }); } catch(_){} },
    onProgress: (p) => { try { process.send && process.send({ type: 'progress', progress: p }); } catch(_){} },
    isCancelled: () => false,
  };

  try {
    const btPath = path.resolve(__dirname, 'backtester.cjs');
    if (!fs.existsSync(btPath)) throw new Error('backtester not available');
    const { runBacktest } = require(btPath);
    const out = await runBacktest(payload, hooks);
    // Atomically copy/upload known artifacts into place (if they exist)
    const toCopy = ['resultsPath','tradesPath','perfPath'];
    const persisted = {};
    for (const k of toCopy) {
      const p = out && out[k];
      if (p && fs.existsSync(p)) {
        try {
          // if storage is configured, upload to S3/MinIO
          if (storage && process.env.S3_BUCKET) {
            const key = `${path.basename(p)}`;
            const url = await storage.uploadFile(p, key);
            persisted[k] = { storage: 's3', url };
          } else {
            const dest = p; // local - ensure atomic replace
            const ok = copyAtomic(p, dest);
            if (ok) persisted[k] = { storage: 'local', path: ok };
          }
        } catch (e) {
          persisted[k] = { error: String(e && e.message || e) };
        }
      }
    }
    try { process.send && process.send({ type: 'done', out, persisted }); } catch(_){}
    process.exit(0);
  } catch (e) {
    try { process.send && process.send({ type: 'error', error: String(e && e.message || e) }); } catch(_){}
    process.exit(2);
  }
});

// if launched directly with JSON payload as arg, run immediately
if (require.main === module) {
  const arg = process.argv[2];
  try {
    const cfg = arg ? JSON.parse(arg) : null;
    if (cfg) {
      process.nextTick(()=> process.emit('message', { cmd: 'run', payload: cfg }));
    }
  } catch(_){}
}
