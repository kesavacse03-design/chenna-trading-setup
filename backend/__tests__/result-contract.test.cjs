const fs = require('fs');
const path = require('path');
const validator = require(path.resolve(__dirname, '..', 'schema', 'validateBacktestResult.cjs'));

function findLatestJob() {
  const jobsDir = path.resolve(__dirname, '..', 'jobs');
  if (!fs.existsSync(jobsDir)) throw new Error('jobs directory not found: ' + jobsDir);
  const files = fs.readdirSync(jobsDir).filter(f => f.startsWith('job_run-') && f.endsWith('.json'))
    .map(f => ({ f, t: fs.statSync(path.join(jobsDir, f)).mtimeMs })).sort((a,b)=>b.t-a.t);
  if (!files.length) throw new Error('no job_run-*.json files found in ' + jobsDir);
  return path.join(jobsDir, files[0].f);
}

describe('latest backtest job contract', () => {
  it('validates schema without exiting', () => {
    const jobPath = findLatestJob();
    expect(fs.existsSync(jobPath)).toBe(true);
    const jobObj = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
    const { valid, errors } = validator.validate(jobObj);
    if (!valid) {
      console.error('Errors:', JSON.stringify(errors, null, 2));
    }
    expect(valid).toBe(true);
  });
});
