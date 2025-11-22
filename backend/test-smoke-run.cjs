const fs = require('fs');
const path = require('path');
const { createReplayEngine } = require('./replay/replay-engine.cjs');
const TestStrategy = require('./strategy/test-strategy.cjs');
const TradeCollector = require('./collector/trade-collector.cjs');
const { computeMetrics } = require('./metrics/metrics.cjs');
const logger = console;

async function runForSymbol(symbol, candles) {
  logger.info(`--- START SYMBOL ${symbol} ---`);
  const { emitter, runReplay } = createReplayEngine({ candles, emitEventName: 'candle', logger });
  const strat = new TestStrategy({ logger });
  const collector = new TradeCollector({ logger });

  collector.attach(emitter);
  strat.on('signal', sig => logger.debug('[smoke] signal', sig));
  strat.on('strategy:empty', info => logger.debug('[smoke] strategy:empty', info));

  emitter.on('candle', async (candle) => {
    const barIndex = candles.findIndex(c => c.ts === candle.ts);
    await strat.onCandle(candle, { symbol, barIndex });
  });

  // Wire strategy to collector by re-emitting on same emitter
  strat.on('signal', (sig) => emitter.emit('signal', sig));

  await runReplay();
  const trades = collector.getAllTrades();
  const metrics = collector.getMetrics();
  logger.info(`[smoke-run] ${symbol} trades=${trades.length} metrics=${JSON.stringify(metrics)}`);
  return { trades, metrics };
}

async function main() {
  const aapl = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-fixtures/AAPL_candles.json')));
  const msft = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-fixtures/MSFT_candles.json')));
  const a = await runForSymbol('AAPL', aapl);
  const b = await runForSymbol('MSFT', msft);

  const allTrades = [...a.trades, ...b.trades];
  const aggMetrics = computeMetrics(allTrades, logger);
  const out = path.join(__dirname, `run-smoke-${Date.now()}.json`);
  fs.writeFileSync(out, JSON.stringify({ perSymbol: { AAPL: a, MSFT: b }, trades: allTrades, metrics: { agg: aggMetrics } }, null, 2));
  logger.info('SMOKE RUN OUTPUT ->', out);
}
main().catch(err => { console.error(err); process.exit(1); });
