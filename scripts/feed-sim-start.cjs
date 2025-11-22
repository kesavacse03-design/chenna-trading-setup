// Convenience wrapper to run the feed bridge in safe SIM mode and auto-start LiveRunner
// Force overrides to avoid leaked session env (e.g., from prior LIVE_POLL runs)
process.env.START_RUNNER = '1';
process.env.SIMULATE_FEED = '1';
process.env.LIVE_POLL = '0';
require('./upstox-feed-bridge.cjs');
