#!/usr/bin/env node
/**
 * Fast repo text search using ripgrep (rg).
 * Features:
 *  - Excludes heavy/irrelevant paths: node_modules, .git, backend/strategy/output, tmp
 *  - Accepts --scope=backend|frontend to limit search roots
 *  - Returns filename:line:column:text (text truncated) ONLY (no headers, no binary)
 *  - Avoids scanning binaries via rg flags
 *  - Nightly cached index (optional) stored under .cache/rg-index (refresh if older than 24h)
 *  - Falls back gracefully if rg not installed
 *
 * Usage:
 *    node scripts/fast_search.cjs "query string"
 *    node scripts/fast_search.cjs --regex "foo|bar" --scope=backend
 *    node scripts/fast_search.cjs --refresh-index "error pattern"
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function parseArgs(argv){
  const out = { query: null, regex: false, scope: null, refreshIndex: false };
  for (let i=2;i<argv.length;i++) {
    const a = argv[i];
    if (a === '--regex') out.regex = true;
    else if (a.startsWith('--scope=')) out.scope = a.split('=')[1];
    else if (a === '--refresh-index') out.refreshIndex = true;
    else if (!out.query) out.query = a;
    else out.query += ' ' + a; // allow spaced query words
  }
  return out;
}

function getRoots(scope){
  // Enforce limited root scope per user request: NEVER search whole workspace.
  const root = process.cwd();
  const allowedRoots = [];
  const backend1 = path.join(root, 'backend');
  const backend2 = path.join(root, 'chenna-CTS', 'backend');
  if (fs.existsSync(backend1)) allowedRoots.push(backend1);
  if (fs.existsSync(backend2)) allowedRoots.push(backend2);
  const f1 = path.join(root, 'frontend', 'src');
  const f2 = path.join(root, 'src');
  if (fs.existsSync(f1)) allowedRoots.push(f1);
  if (fs.existsSync(f2)) allowedRoots.push(f2);

  if (scope === 'backend') return allowedRoots.filter(r => r.includes(path.sep + 'backend') || r.includes('chenna-CTS' + path.sep + 'backend'));
  if (scope === 'frontend') return allowedRoots.filter(r => r.includes(path.sep + 'frontend' + path.sep + 'src') || r.includes(path.sep + 'src' + path.sep));
  return allowedRoots;
}

function ensureIndex(root){
  // Very light stub index logic: create a marker file with mtime; real rg indexing would require --precompile which rg lacks.
  // We simulate by recording last refresh time. If older than 24h or --refresh-index, we touch it.
  const cacheDir = path.join(root, '.cache');
  const idxFile = path.join(cacheDir, 'rg-index.json');
  if (!fs.existsSync(cacheDir)) { try { fs.mkdirSync(cacheDir, { recursive: true }); } catch {} }
  let stale = true;
  try { const st = fs.statSync(idxFile); stale = ((Date.now() - st.mtimeMs) > 24*60*60*1000); } catch { stale = true; }
  return { idxFile, stale };
}

function touchIndex(idxFile){
  try { fs.writeFileSync(idxFile, JSON.stringify({ refreshedAt: new Date().toISOString() }, null, 2)); } catch {}
}

function runRg({ query, regex, roots, excludes, includeGlobs }){
  const args = [
    '--with-filename', '--line-number', '--column', '--color', 'never', '--no-heading', '--trim',
    '--max-columns', '320'
  ];
  if (!regex) args.push('-F'); // fixed string for speed unless regex requested
  args.push(query);
  // include-only requested file types
  for (const ig of (includeGlobs || [])) args.push('--glob', ig);
  for (const ex of excludes) args.push('--glob', '!' + ex);
  for (const r of roots) args.push(r);
  const t0 = Date.now();
  const proc = spawnSync('rg', args, { encoding: 'utf8' });
  const dt = Date.now() - t0;
  if (proc.error) return { ok:false, error:'rg-not-found', detail: proc.error.message };
  return { ok:true, stdout:proc.stdout, stderr:proc.stderr, ms:dt };
}

function main(){
  const args = parseArgs(process.argv);
  if (!args.query) {
    console.error('Usage: node scripts/fast_search.cjs [--regex] [--scope=backend|frontend] [--refresh-index] <query>');
    process.exit(2);
  }
  const roots = getRoots(args.scope);
  const anyRootMissing = roots.length === 0;
  if (anyRootMissing){
    console.error('Scope produced no existing roots');
    process.exit(3);
  }
  // handle index caching (marker only)
  for (const r of roots){
    const { idxFile, stale } = ensureIndex(r);
    if (stale || args.refreshIndex) touchIndex(idxFile);
  }
  const excludes = [
    'node_modules/**',
    '.git/**',
    'tmp/**',
    'logs/**',
    'backend/strategy/output/**',
    'backend/strategy/input/**',
    'auto-backup*/**',
    '**/*.csv',
    '**/*.txt'
  ];
  const includeGlobs = ['**/*.js', '**/*.cjs', '**/*.ts', '**/*.json'];
  const result = runRg({ query: args.query, regex: args.regex, roots, excludes, includeGlobs });
  if (!result.ok){
    console.error(JSON.stringify(result));
    process.exit(1);
  }
  const lines = result.stdout.split(/\r?\n/).filter(Boolean).slice(0, 5000);
  // Format output: file:line:col:text (truncate text > 240 chars)
  for (const line of lines){
    const parts = line.split(':');
    if (parts.length < 4) continue; // skip malformed
    const [file, ln, col, ...rest] = parts;
    let text = rest.join(':');
    if (text.length > 240) text = text.slice(0, 240) + '…';
    console.log(`${file}:${ln}:${col}:${text}`);
  }
  // minimal perf footer to stderr
  console.error(`Search completed in ${result.ms}ms, matches=${lines.length}`);
}

if (require.main === module){
  main();
}
