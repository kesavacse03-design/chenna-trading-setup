// Start Live Tracker Script
// Run this to start monitoring stocks

const LiveTracker = require('./liveTracker.cjs');

const tracker = new LiveTracker();

console.log('╔════════════════════════════════════════╗');
console.log('║   LIVE TRACKING SYSTEM                 ║');
console.log('║   DOWNSIDE_LOM_SWING Strategy          ║');
console.log('╚════════════════════════════════════════╝\n');

// Start tracker
tracker.start();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\nShutting down gracefully...');
    tracker.stop();

    // Show final stats
    const stats = await tracker.getStats();
    console.log('\n=== Final Stats ===');
    console.log(`Total Trades: ${stats.total}`);
    console.log(`Active: ${stats.active}`);
    console.log(`Completed: ${stats.completed}`);
    console.log(`Accuracy: ${stats.accuracy}`);
    console.log('\nGoodbye! 👋\n');

    process.exit(0);
});

// Show stats every hour
setInterval(async () => {
    const stats = await tracker.getStats();
    console.log('\n--- Hourly Stats ---');
    console.log(`Active Trades: ${stats.active}`);
    console.log(`Completed: ${stats.completed}`);
    console.log(`Accuracy: ${stats.accuracy}`);
    console.log('-------------------\n');
}, 60 * 60 * 1000); // Every hour

console.log('Press Ctrl+C to stop\n');
