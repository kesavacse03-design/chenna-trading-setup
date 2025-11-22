// finalize helper snippet to include in backend/backtester.cjs
const fs = require('fs');
const { computeMetrics } = require('./metrics/metrics.cjs');
let normalizeJob = (j) => j;
try { normalizeJob = require('./normalizeJob.cjs').normalizeJob || normalizeJob; } catch(e){}
let ajvValidate = null;
try { ajvValidate = require('./validateBacktestResult.cjs'); } catch(e){ ajvValidate = null; }

async function finalizeJob(jobResult, outPath, logger = console) {
  try {
    logger.info('[backtester] finalizing job, computing metrics & validation');
    jobResult.trades = jobResult.trades ?? [];
    jobResult.metrics = jobResult.metrics ?? computeMetrics(jobResult.trades, logger);
    const normalized = typeof normalizeJob === 'function' ? normalizeJob(jobResult) : jobResult;
    const valid = typeof ajvValidate === 'function' ? ajvValidate(normalized) : true;
    if (!valid) {
      logger.error('[backtester] validation FAILED for job JSON. Errors:', ajvValidate.errors || 'unknown');
      fs.writeFileSync(outPath.replace('.json', '.validation-failed.json'), JSON.stringify({ normalized, errors: ajvValidate.errors || null }, null, 2));
      throw new Error('Backtest result failed validation; wrote .validation-failed.json');
    }
    fs.writeFileSync(outPath, JSON.stringify(normalized, null, 2));
    logger.info('[backtester] job JSON written to', outPath);
    return normalized;
  } catch (err) {
    logger.error('[backtester] fatal error during finalizeJob:', err);
    throw err;
  }
}
module.exports = { finalizeJob };
