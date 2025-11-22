#!/usr/bin/env node
const fs=require('fs');
const path=require('path');
const root=process.cwd();
const patterns=[/api[_-]?key\s*[:=]\s*['"][A-Za-z0-9\-_/+=]{16,}['"]/i,/secret\s*[:=]\s*['"][A-Za-z0-9\-_/+=]{12,}['"]/i,/BEGIN( RSA)? PRIVATE KEY/];
let found=[];
function walk(dir){ for(const e of fs.readdirSync(dir)){ if(e.startsWith('.git')) continue; const p=path.join(dir,e); const s=fs.statSync(p); if(s.isDirectory()) walk(p); else if(s.isFile()){ const txt=fs.readFileSync(p,'utf8'); for(const re of patterns){ if(re.test(txt)){ found.push({file:p, pattern:String(re)}); break; } } } } }
walk(root);
if(found.length){ console.error('SECRETS_FOUND', JSON.stringify(found,null,2)); process.exit(2); }
console.log('SECRETS_OK');
