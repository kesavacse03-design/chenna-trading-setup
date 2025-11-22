#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage(){ console.log('Usage: node tools/validateBacktestResult.cjs --in backend/jobs/job_<runId>.json'); }

(function main(){
  const args = process.argv.slice(2);
  let inp=null; for (let i=0;i<args.length;i++){ const a=args[i], n=args[i+1]; if (a==='--in'){ inp=n; i++; } }
  if (!inp){ usage(); process.exit(2); }
  const p = path.resolve(inp);
  const j = JSON.parse(fs.readFileSync(p,'utf8'));
  const validator = require(path.resolve(__dirname, '..', 'backend', 'schema', 'validateBacktestResult.cjs'));
  const { valid, errors } = validator.validate(j);
  if (!valid){
    console.error('ERR schema validation failed');
    console.error(JSON.stringify(errors, null, 2));
    process.exit(3);
  }
  console.log('OK schema valid');
})();
