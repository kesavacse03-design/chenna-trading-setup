#!/usr/bin/env node
// Build a union symbol set for a given category by combining:
// 1) Curated rows from "backtest data V1.txt"
// 2) Backend audit/results outputs under backend/strategy/output (inputs.symbols, examples)
// 3) jobs.json logs and job.symbols for matching runs (with prefetch 233)
// Writes an output list and a diagnostic JSON with per-source counts.
const fs = require('fs');
const path = require('path');

function usage(){
  console.log('Usage:');
  console.log('  node tools/build_category_symbols_union.cjs --category "DOWNSIDE LOM SWING" --out tmp/category_symbols_union.txt');
  console.log('  [--src "backtest data V1.txt"] [--auditDir backend/strategy/output] [--expected N] [--limit N] [--show-stats]');
}

function normalizeToken(raw){
  return (raw||'').toString().trim().replace(/[–—−]/g,'-').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'');
}

function loadCanonicalMap(){
  try {
    const constantsPath = path.resolve(__dirname, '..', 'src', 'constants.ts');
    const txt = fs.readFileSync(constantsPath, 'utf8');
    const mapMatch = txt.match(/export const CATEGORY_CANONICAL_MAP[\s\S]*?=\s*\{([\s\S]*?)\};/m);
    const variantMap = {};
    if (mapMatch){
      const body = mapMatch[1];
      const pairRe = /'([^']+)'\s*:\s*'([^']+)'/g;
      let p; while ((p = pairRe.exec(body)) !== null) { variantMap[p[1]] = p[2]; }
    }
    return variantMap;
  } catch(e){ return {}; }
}

function mapToCanonical(raw, variantMap){
  const token = normalizeToken(raw);
  const compact = token.replace(/_/g,'');
  if (variantMap[compact]) return variantMap[compact];
  if (variantMap[token]) return variantMap[token];
  return (token || '').toUpperCase();
}

function readLinesFileSymbolsByCategory(srcPath, wantCanonical, variantMap){
  const out = new Set();
  let parsedRows = 0; let matchedRows = 0; let totalLines = 0; let variants = new Set();
  try {
    const txt = fs.readFileSync(srcPath, 'utf8');
    const lines = txt.split(/\r?\n/).filter(l=>l.trim());
    totalLines = lines.length;
    for (const raw of lines){
      let w = raw.trim();
      if (w.startsWith('"') && w.endsWith('"')) w = w.slice(1,-1).trim();
      const parts = w.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(p=>p.replace(/^\s*"|"\s*$/g,'').trim());
      if (parts.length < 3) continue;
      const sym = (parts[0]||'').trim().toUpperCase();
      const catRaw = (parts[2]||'').trim();
      if (!sym || !catRaw) continue;
      parsedRows++;
      const canonical = mapToCanonical(catRaw, variantMap);
      variants.add(canonical);
      if (canonical === wantCanonical){ matchedRows++; out.add(sym); }
    }
  } catch(e){}
  return { set: out, stats: { totalLines, parsedRows, matchedRows, variants: Array.from(variants).sort() } };
}

function scanAuditOutputs(auditDir, wantCanonical){
  const dir = path.resolve(process.cwd(), auditDir);
  const symFromInputs = new Set();
  const symFromExamples = new Set();
  let filesScanned = 0, matchedFiles = 0;
  let files = [];
  try { files = fs.readdirSync(dir).filter(f=>f.endsWith('.json')).map(f=>path.join(dir,f)); } catch(e){ /* ignore */ }
  for (const f of files){
    filesScanned++;
    try {
      const txt = fs.readFileSync(f, 'utf8');
      const obj = JSON.parse(txt);
      const cat = (obj && obj.inputs && obj.inputs.categoryKey) || obj.categoryKey || (obj.parameters && obj.parameters.categoryKey) || null;
      if (cat !== wantCanonical) continue;
      matchedFiles++;
      const inputs = obj && obj.inputs && obj.inputs.symbols;
      if (Array.isArray(inputs)) for (const s of inputs) if (s) symFromInputs.add(String(s).toUpperCase());
      const examples = (obj && obj.inputs && obj.inputs.examples) || obj.examples;
      if (Array.isArray(examples)) for (const ex of examples){
        const k = (ex && (ex.categoryKey || ex.category)) || null; if (k === wantCanonical){
          const s = ex && ex.symbol; if (s) symFromExamples.add(String(s).toUpperCase());
        }
      }
    } catch(e){ /* ignore bad JSON */ }
  }
  return { symFromInputs, symFromExamples, filesScanned, matchedFiles };
}

(function main(){
  const args = process.argv.slice(2);
  let category = null, outPath = null;
  let src = path.resolve(process.cwd(), 'backtest data V1.txt');
  let auditDir = path.resolve(process.cwd(), 'backend', 'strategy', 'output');
  let expected = null; let limit = null; let showStats = false;
  for (let i=0;i<args.length;i++){
    const a=args[i], n=args[i+1];
    if (a==='--category'){ category = n; i++; }
    else if (a==='--out'){ outPath = n; i++; }
    else if (a==='--src'){ src = n; i++; }
    else if (a==='--auditDir'){ auditDir = n; i++; }
    else if (a==='--expected'){ expected = Number(n); i++; }
    else if (a==='--limit'){ limit = Number(n); i++; }
    else if (a==='--show-stats'){ showStats = true; }
  }
  if (!category || !outPath){ usage(); process.exit(2); }

  const variantMap = loadCanonicalMap();
  const wantCanonical = mapToCanonical(category, variantMap);

  // curated source
  const curated = readLinesFileSymbolsByCategory(src, wantCanonical, variantMap);

  // audit outputs
  const audit = scanAuditOutputs(auditDir, wantCanonical);

  // union
  const union = new Set();
  curated.set.forEach(s=>union.add(s));
  audit.symFromInputs.forEach(s=>union.add(s));
  audit.symFromExamples.forEach(s=>union.add(s));

  // jobs.json log extraction (processing SYMBOL lines) tied to matching category and only runs with prefetch 233 symbols
  let jobsDiag = { jobsFile: null, totalJobs: 0, matchedCategory: 0, matchedPrefetch233: 0 };
  try {
    const jobsPath = path.resolve(auditDir, 'jobs.json');
    jobsDiag.jobsFile = jobsPath;
    if (fs.existsSync(jobsPath)){
      const txt = fs.readFileSync(jobsPath, 'utf8');
      const arr = JSON.parse(txt);
      const processingRe = /\bprocessing\s+([A-Z0-9\-]+)\b/;
      const prefetch233Re = /prefetch\s+233\s+symbols/i;
      jobsDiag.totalJobs = Array.isArray(arr) ? arr.length : 0;
      for (const job of Array.isArray(arr)?arr:[]){
        try {
          // Determine runId and audit path
          let runId = null;
          if (typeof job.runId === 'string' && job.runId.startsWith('run-')) runId = job.runId;
          if (!runId && job.resultsPath){
            const m = String(job.resultsPath).match(/(run-\d+)-/);
            if (m && m[1]) runId = m[1];
          }
          let auditPath = null;
          if (runId) {
            const candidate = path.resolve(auditDir, `${runId}-audit.json`);
            if (fs.existsSync(candidate)) auditPath = candidate;
          }
          let jobCategory = null;
          if (auditPath) {
            try {
              const j = JSON.parse(fs.readFileSync(auditPath,'utf8'));
              jobCategory = (j && j.inputs && j.inputs.categoryKey) || j.categoryKey || null;
            } catch(_){ /* ignore */ }
          } else {
            jobCategory = (job && job.categoryKey) || (job && job.parameters && job.parameters.categoryKey) || null;
          }
          if (jobCategory !== wantCanonical) continue;
          jobsDiag.matchedCategory++;
          const logs = Array.isArray(job.logs)? job.logs : [];
          const hasPrefetch233 = logs.some(line => typeof line === 'string' && prefetch233Re.test(line));
          if (!hasPrefetch233) continue;
          jobsDiag.matchedPrefetch233++;
          // From logs
          for (const line of logs){
            const m2 = typeof line === 'string' ? line.match(processingRe) : null;
            if (m2 && m2[1]) union.add(m2[1].toUpperCase());
          }
          // From job.symbols array
          if (Array.isArray(job.symbols)) {
            for (const s of job.symbols){ if (s) union.add(String(s).toUpperCase()); }
          }
        } catch(_){ /* ignore job parse error */ }
      }
    }
  } catch(_){ /* ignore jobs errors */ }

  let arr = Array.from(union).sort();
  const totalBeforeLimit = arr.length;
  if (limit && arr.length > limit) arr = arr.slice(0, limit);

  // write outputs
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, arr.join('\n') + (arr.length? '\n' : ''), 'utf8');
  const diagPath = path.join(path.dirname(outPath), path.basename(outPath).replace(/\.txt$/, '.diag.json'));
  const diag = {
    categoryInput: category,
    categoryCanonical: wantCanonical,
    curated: {
      source: src,
      uniqueSymbols: curated.set.size,
      stats: curated.stats
    },
    audit: {
      dir: auditDir,
      filesScanned: audit.filesScanned,
      matchedFiles: audit.matchedFiles,
      fromInputs: audit.symFromInputs.size,
      fromExamples: audit.symFromExamples.size
    },
    jobs: jobsDiag,
    union: {
      uniqueSymbols: totalBeforeLimit,
      truncated: !!(limit && totalBeforeLimit>limit)
    },
    expected: expected || null,
    timestamp: new Date().toISOString()
  };
  try { fs.writeFileSync(diagPath, JSON.stringify(diag, null, 2), 'utf8'); } catch(_){ }

  if (expected && arr.length !== expected){
    console.log(`WARN expected=${expected} found=${arr.length}`);
  }
  console.log(`OK wrote ${arr.length} symbols to ${outPath} (canonical=${wantCanonical})`);
  if (showStats){
    console.log(`STATS curated=${curated.set.size} audit.inputs=${audit.symFromInputs.size} audit.examples=${audit.symFromExamples.size} union=${totalBeforeLimit}`);
    console.log(`AUDIT filesScanned=${audit.filesScanned} matchedFiles=${audit.matchedFiles}`);
    console.log(`JOBS total=${jobsDiag.totalJobs} matchedCategory=${jobsDiag.matchedCategory} matchedPrefetch233=${jobsDiag.matchedPrefetch233}`);
  }
})();
