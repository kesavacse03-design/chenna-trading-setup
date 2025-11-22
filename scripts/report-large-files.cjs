#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

function walk(dir) {
  const res = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    try {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        res.push(...walk(p));
      } else if (ent.isFile()) {
        const s = fs.statSync(p);
        res.push({ path: p, size: s.size });
      }
    } catch (e) {
      // ignore unreadable
    }
  }
  return res;
}

console.log('Scanning (this can take time)...');
const files = walk(root);
files.sort((a,b)=>b.size-a.size);
const top = files.slice(0,50);
for (const f of top) {
  console.log(`${(f.size/1024/1024).toFixed(2)} MB  ${f.path}`);
}
console.log('Total files scanned:', files.length);
