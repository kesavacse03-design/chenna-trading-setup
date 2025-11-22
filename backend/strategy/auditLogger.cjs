const fs = require('fs');
const path = require('path');

// Simple JSONL audit logger with date-based file naming and mkdirp
class AuditLogger {
  constructor(opts = {}) {
    const baseDir = opts.baseDir || path.join(process.cwd(), 'logs');
    const prefix = opts.prefix || 'live-audit';
    const date = new Date();
    const y = String(date.getFullYear());
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    this.dir = baseDir;
    this.filePath = path.join(baseDir, `${prefix}-${y}${m}${d}.jsonl`);
    this.queue = [];
    this.writing = false;
    this.ensureDir();
  }

  ensureDir() {
    try { fs.mkdirSync(this.dir, { recursive: true }); } catch (_) {}
  }

  log(type, payload = {}) {
    const rec = {
      ts: new Date().toISOString(),
      type,
      ...payload
    };
    this.queue.push(JSON.stringify(rec) + '\n');
    this._drain();
  }

  _drain() {
    if (this.writing || this.queue.length === 0) return;
    this.writing = true;
    const chunk = this.queue.shift();
    fs.appendFile(this.filePath, chunk, (err) => {
      this.writing = false;
      if (err) {
        // Fallback: print to stderr to avoid silent loss
        try { console.error('[AUDIT] write error:', err.message); } catch(_) {}
      }
      if (this.queue.length > 0) this._drain();
    });
  }
}

module.exports = { AuditLogger };
