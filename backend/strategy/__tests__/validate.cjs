const { UpstoxOrderAdapter } = require('../upstoxOrderAdapter.cjs');
const { LiveEngine } = require('../liveRunner.cjs');

console.log('Testing imports...');

// Test UpstoxOrderAdapter
const adapter = new UpstoxOrderAdapter();
console.log('UpstoxOrderAdapter created:', typeof adapter.submit === 'function');

// Test LiveEngine
const engine = new LiveEngine(adapter, {});
console.log('LiveEngine created:', typeof engine.processCandle === 'function');

console.log('All imports successful. Basic validation passed.');
