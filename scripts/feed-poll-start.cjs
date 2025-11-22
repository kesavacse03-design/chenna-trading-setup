// Convenience wrapper to run the feed bridge in live HTTP poll mode (no WS by default)
process.env.START_RUNNER = process.env.START_RUNNER || '0';
process.env.SIMULATE_FEED = process.env.SIMULATE_FEED || '0';
process.env.LIVE_POLL = process.env.LIVE_POLL || '1';
require('./upstox-feed-bridge.cjs');
