const fs = require('fs');
const path = require('path');
const validator = require(path.resolve(__dirname, '..', 'schema', 'validateBacktestResult.cjs'));

const dbgDir = path.resolve(__dirname, '..', 'jobs');
const dbgAfter = path.join(dbgDir, 'debug_after_normalize.json');

const hasDebug = fs.existsSync(dbgAfter);

(hasDebug ? it : it.skip)('debug_after_normalize.json validates schema', () => {
  const raw = fs.readFileSync(dbgAfter, 'utf8');
  const obj = JSON.parse(raw);
  const { valid, errors } = validator.validate(obj);
  if (!valid) {
    console.error('Validation errors:', JSON.stringify(errors, null, 2));
  }
  expect(valid).toBe(true);
});
