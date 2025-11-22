const fs = require('fs');
const path = require('path');
const src = path.resolve(process.cwd(), 'cts_stocks.json');
const out = path.resolve(process.cwd(), 'config', 'smoke_symbols_50.txt');
try { fs.mkdirSync(path.dirname(out), { recursive: true }); } catch{}
const arr = JSON.parse(fs.readFileSync(src,'utf8'));
let names = Array.from(new Set(arr.map(x=>x.stockName).filter(Boolean)));
if (names.length < 60) {
	for (let i=1; i<=80 && names.length<60; i++) { const s = `SYM_${i}`; if (!names.includes(s)) names.push(s); }
}
names = names.slice(0, 60);
fs.writeFileSync(out, names.join('\n')+'\n','utf8');
console.log('WROTE', out, names.length, 'symbols');
