const prisma = require('../lib/prisma.cjs');
const strategyManager = require('../services/labs/strategyManager.cjs');

async function debug() {
    const key = 'SHORT_TERM_SWING_BO_DOWN';
    console.log(`Getting config for ${key}...`);

    try {
        const config = await strategyManager.getStrategyConfig(key);
        console.log('Config:', JSON.stringify(config, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

debug()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
