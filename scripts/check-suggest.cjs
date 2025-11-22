// scripts/check-suggest.cjs
// Quick script to load the generated instruments.json and exercise the suggestBuckets logic
const fs = require('fs');
const path = require('path');
const instrumentsPath = path.resolve(__dirname, '..', 'src', 'data', 'instruments.json');
const instruments = JSON.parse(fs.readFileSync(instrumentsPath, 'utf8'));

function levenshtein(a,b){
  const al=a.length, bl=b.length;
  if(al===0) return bl; if(bl===0) return al;
  const dp = Array.from({length:al+1}, ()=> new Array(bl+1).fill(0));
  for(let i=0;i<=al;i++) dp[i][0]=i;
  for(let j=0;j<=bl;j++) dp[0][j]=j;
  for(let i=1;i<=al;i++) for(let j=1;j<=bl;j++){
    const cost = a[i-1]===b[j-1]?0:1;
    dp[i][j]=Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
  }
  return dp[al][bl];
}

function isPrimary(s){ return /^[A-Z0-9]{1,12}$/.test(s); }
const excludeTokens = ['FUT','PE','CE','OPT','ETF','AUTO','FUND','MF','NFO','IDX','DX','OIL','STK'];
function isNoisy(s,name){ const c=(s+' '+(name||'')).toUpperCase(); for(const t of excludeTokens) if(c.includes(t)) return true; return false; }

function buildCandidates(){
  const best = new Map();
  for(const it of instruments){
    const sym = (it.symbol||'').toUpperCase();
    if(!isPrimary(sym)) continue;
    if(isNoisy(sym,it.name)) continue;
    const existing = best.get(sym);
    if(!existing) best.set(sym,it);
    else if(((existing.exchange||'').toUpperCase()!=='NSE') && ((it.exchange||'').toUpperCase()==='NSE')) best.set(sym,it);
  }
  return Array.from(best.values());
}

function suggestBuckets(q,max=8){
  q = q.trim().toUpperCase();
  if(!q) return {symbolPrefix:[], namePrefix:[], fuzzy:[]};
  const candidates = buildCandidates();
  const symbolPrefix = [], namePrefix = [], fuzzy=[];
  for(const it of candidates){
    const sym = it.symbol;
    const nameUp = (it.name||'').toUpperCase();
    if(sym===q||sym.startsWith(q)){ symbolPrefix.push(it); continue; }
    if(nameUp.startsWith(q)){ namePrefix.push(it); continue; }
    const score = levenshtein(q,sym);
    if(score<=2) fuzzy.push({it,score});
  }
  // prefer exact match, then longer (more specific) symbols first
  symbolPrefix.sort((a,b)=>{ if(a.symbol===q) return -1; if(b.symbol===q) return 1; return b.symbol.length - a.symbol.length; });
  namePrefix.sort((a,b)=>a.symbol.localeCompare(b.symbol));
  fuzzy.sort((x,y)=> x.score - y.score || x.it.symbol.localeCompare(y.it.symbol));
  return {symbolPrefix: symbolPrefix.slice(0,max), namePrefix: namePrefix.slice(0,max), fuzzy: fuzzy.map(f=>f.it).slice(0,max)};
}

function show(q){
  const b = suggestBuckets(q,10);
  console.log('QUERY:',q);
  console.log('symbolPrefix:', b.symbolPrefix.slice(0,6).map(x=>x.symbol).join(', '));
  console.log('namePrefix   :', b.namePrefix.slice(0,6).map(x=>x.symbol+'|'+(x.name||'')).join(', '));
  console.log('fuzzy        :', b.fuzzy.slice(0,6).map(x=>x.symbol).join(', '));
  console.log('---\n');
}

// test the problematic queries
['AURO','AUROPHARMA','ICICI','ICICI BANK','AUROXYZ'].forEach(show);
