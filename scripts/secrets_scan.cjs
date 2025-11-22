#!/usr/bin/env node
// Very small secrets scanner: looks for potential API keys in repo files
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const textFiles = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'logs' || e.name === 'archive') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else {
      const ext = path.extname(e.name).toLowerCase();
      if (['.js', '.cjs', '.json', '.env', '.yaml', '.yml', '.ts', '.md', '.txt'].includes(ext) || e.name === 'package.json') textFiles.push(p);
    }
  }
}
walk(root);

const reLooksLikeKey = /(?:AKIA|ASIA|AIza|ghp_[A-Za-z0-9]{36}|x-admin-key|secret|api[_-]?key|token)[\s:=\"]{1,6}([A-Za-z0-9\-\_\./]{8,200})/i;
const findings = [];
for (const f of textFiles) {
  try {
    const s = fs.readFileSync(f, 'utf8');
    const m = reLooksLikeKey.exec(s);
    if (m) findings.push({ file: path.relative(root, f), match: m[0].slice(0, 200) });
  } catch (e) {}
}

if (findings.length === 0) console.log('no probable secrets found');
else {
  console.log('possible secrets:');
  findings.forEach(x=>console.log(x.file, '->', x.match));
}
