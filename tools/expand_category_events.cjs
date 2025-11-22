#!/usr/bin/env node
// Build symbol-date event list from audit examples for a category (e.g. 233 entries for DOWNSIDE_LOM_SWING)
// Usage: node tools/expand_category_events.cjs --audit backend/strategy/output/run-1761997050387-audit.json --out tmp/category_events/DOWNSIDE_LOM_SWING.events.json
const fs = require('fs');
const path = require('path');

function usage(){
  console.log('Usage: node tools/expand_category_events.cjs --audit <audit.json> --out <out.json>');
}

(function main(){
  const args = process.argv.slice(2);
  let auditPath=null, outPath=null;
  for (let i=0;i<args.length;i++){ const a=args[i], n=args[i+1]; if (a==='--audit'){ auditPath=n; i++; } else if (a==='--out'){ outPath=n; i++; } }
  if (!auditPath || !outPath){ usage(); process.exit(2); }
  if (!fs.existsSync(auditPath)){ console.error('Missing audit', auditPath); process.exit(3); }
  let audit=null; try { audit = JSON.parse(fs.readFileSync(auditPath,'utf8')); } catch(e){ console.error('Bad audit JSON', e.message); process.exit(4); }
  const examples = Array.isArray(audit.examples) ? audit.examples : (audit.inputs && Array.isArray(audit.inputs.examples) ? audit.inputs.examples : []);
  const events = examples.map(ex => ({ symbol: String(ex.symbol).toUpperCase(), date: ex.listedDate || null, categoryKey: ex.categoryKey || audit.inputs?.categoryKey || audit.categoryKey || null }));
  const out = { categoryKey: events[0]?.categoryKey || null, count: events.length, uniqueSymbols: Array.from(new Set(events.map(e=>e.symbol))).length, events };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`OK wrote events file ${outPath} entries=${events.length} uniqueSymbols=${out.uniqueSymbols}`);
})();