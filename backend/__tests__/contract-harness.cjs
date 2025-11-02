const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const payloadPath = path.resolve(process.cwd(), 'payload.json');
const schemaPath = path.resolve(process.cwd(), 'backend/schema/backtest-result.schema.json');

function runLocalRunner() {
  console.log('Running local runner...');
  const res = spawnSync('node', ['backend/strategy/run-worker.cjs', payloadPath], { stdio: 'inherit' });
  if (res.error) {
    console.error('Failed to run local runner:', res.error);
    process.exit(2);
  }
  if (res.status !== 0) {
    console.error('Local runner exited non-zero:', res.status);
    process.exit(res.status);
  }
}

function findResultJson(runId) {
  const jobsDir = path.resolve(process.cwd(), 'backend/jobs');
  if (!fs.existsSync(jobsDir)) return null;
  const files = fs.readdirSync(jobsDir).filter(f => f.includes(runId));
  if (files.length === 0) {
    // try output folder
    const outDir = path.resolve(process.cwd(), 'backend/strategy/output');
    if (!fs.existsSync(outDir)) return null;
    const outs = fs.readdirSync(outDir).filter(f => f.includes(runId) && f.endsWith('-results.json'));
    if (outs.length === 0) return null;
    return path.join(outDir, outs[0]);
  }
  return path.join(jobsDir, files[0]);
}

function validateJson(filePath) {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const ok = validate(data);
  if (!ok) {
    console.error('Schema validation failed:');
    console.error(validate.errors);
    process.exit(3);
  }
  console.log('Schema validation passed for', filePath);
}

(async function main() {
  if (!fs.existsSync(payloadPath)) {
    console.error('payload.json not found in repo root');
    process.exit(1);
  }
  const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  if (!payload.runId) {
    console.error('payload.json must include runId');
    process.exit(1);
  }

  runLocalRunner();

  const resultPath = findResultJson(payload.runId);
  if (!resultPath) {
    console.error('Result JSON for runId not found');
    process.exit(4);
  }

  console.log('Found result JSON at', resultPath);
  validateJson(resultPath);
  console.log('Contract harness succeeded');
})();
