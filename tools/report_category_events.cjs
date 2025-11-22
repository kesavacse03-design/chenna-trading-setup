#!/usr/bin/env node
// Summarize event-level simulation JSON into category accuracy report.
// Usage: node tools/report_category_events.cjs --in backend/strategy/output/run-events-DOWNSIDE_LOM_SWING.json --out backend/strategy/output/run-events-DOWNSIDE_LOM_SWING.report.json
const fs = require('fs');
const path = require('path');

function usage(){ console.log('Usage: node tools/report_category_events.cjs --in <events.json> --out <report.json>'); }

(function main(){
  const args = process.argv.slice(2);
  let inPath=null, outPath=null;
  for (let i=0;i<args.length;i++){ const a=args[i], n=args[i+1]; if (a==='--in'){ inPath=n; i++; } else if (a==='--out'){ outPath=n; i++; } }
  if (!inPath || !outPath){ usage(); process.exit(2); }
  if (!fs.existsSync(inPath)){ console.error('Missing input', inPath); process.exit(3); }
  let ev=null; try { ev = JSON.parse(fs.readFileSync(inPath,'utf8')); } catch(e){ console.error('Bad JSON', e.message); process.exit(4); }
  const rows = Array.isArray(ev.results)? ev.results : [];
  const withTrades = rows.filter(r=>!r.error && r.trades>0);
  const profitable = withTrades.filter(r=>r.netPnl>0);
  const loss = withTrades.filter(r=>r.netPnl<=0);
  const winRate = withTrades.length? profitable.length / withTrades.length : 0;
  // aggregate pnl per symbol
  const bySym = {};
  for (const r of withTrades){ bySym[r.symbol] = (bySym[r.symbol]||0) + (r.netPnl||0); }
  const symRanks = Object.entries(bySym).map(([s,p])=>({symbol:s, pnl:p})).sort((a,b)=>b.pnl-a.pnl);
  const top = symRanks.slice(0,10);
  const bottom = symRanks.slice(-10).reverse();
  // Category-level summary additions
  const totalTrades = withTrades.reduce((a,b)=>a + (b.trades||0),0);
  const totalNetPnl = withTrades.reduce((a,b)=>a + (b.netPnl||0),0);
  const avgRMultiple = (()=>{ const rs = withTrades.map(r=>r.rMultiple).filter(x=>typeof x==='number'); return rs.length? rs.reduce((a,b)=>a+b,0)/rs.length : 0; })();
  // Pull aggregate if present (from enhanced simulation)
  const agg = ev.aggregate || {};
  const expectancy = typeof agg.expectancy === 'number' ? agg.expectancy : null;
  const maxDrawdown = typeof agg.maxDrawdown === 'number' ? agg.maxDrawdown : null;
  // 10-day success metrics (if trades annotated)
  let successWithin10Days = 0, failWithin10Days = 0, expiredTrades = 0;
  try {
    for (const r of withTrades) {
      // each row r originates from event simulation; may include trades meta if enriched
      const barsHeld = Number(r.barsHeld || r.holdingBars || 0);
      const within10 = barsHeld > 0 && barsHeld <= 10;
      if (r.exitReason === 'target' && within10) successWithin10Days++;
      else if (r.exitReason === 'stop' && within10) failWithin10Days++;
      if (String(r.exitReason||'').startsWith('expired-10')) expiredTrades++;
    }
  } catch(_){ }
  const successRateWithin10Days = (successWithin10Days + failWithin10Days) > 0 ? +(successWithin10Days*100/(successWithin10Days+failWithin10Days)).toFixed(2) : 0;
  const report = {
    categoryKey: ev.categoryKey || null,
    totalEvents: rows.length,
    eventsWithTrades: withTrades.length,
    profitableEvents: profitable.length,
    failedEvents: loss.length,
    accuracy: +winRate.toFixed(4),
    totalTrades,
    totalNetPnl,
    avgNetPnlPerEvent: withTrades.length? (totalNetPnl/withTrades.length) : 0,
    avgRMultiple: +avgRMultiple.toFixed(4),
    expectancy: expectancy !== null ? +expectancy.toFixed(4) : null,
    maxDrawdown: maxDrawdown !== null ? maxDrawdown : null,
    strategyConfig: ev.strategyConfig || null,
    topSymbolsByAggregatePnl: top,
    bottomSymbolsByAggregatePnl: bottom,
    successWithin10Days,
    failWithin10Days,
    expiredTrades,
    successRateWithin10Days,
    generatedAt: new Date().toISOString(),
    source: path.basename(inPath)
  };
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log('OK wrote report', outPath);
})();