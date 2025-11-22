#!/usr/bin/env node
// Archive promotion records and job artifacts into archive/ with timestamp
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const root = process.cwd();
const jobsDir = path.join(root, 'jobs');
const promDir = path.join(root, 'backend', 'jobs', 'promotion_records');
const archiveDir = path.join(root, 'archive', 'promotion_records');
if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return 0;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const files = fs.readdirSync(src);
  files.forEach(f => {
    const s = path.join(src, f);
    const d = path.join(dest, f);
    if (fs.statSync(s).isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  });
  return files.length;
}

const ts = Date.now();
const outDir = path.join(archiveDir, String(ts));
fs.mkdirSync(outDir, { recursive: true });

let count = 0;
count += copyDir(promDir, outDir);
console.log(`copied ${count} files to ${outDir}`);

// Also tar jobs artifacts (if tar available)
const tarPath = path.join(jobsDir, `artifacts_${ts}.tar.gz`);
try {
  const tar = spawnSync('tar', ['-czf', tarPath, '-C', jobsDir, '.'], { stdio: 'inherit' });
  if (tar.status === 0) console.log(`created ${tarPath}`);
  else console.warn('tar failed or not available');
} catch (e) {
  console.warn('tar not available or failed', e && e.message);
}

console.log('archive_artifacts complete');
