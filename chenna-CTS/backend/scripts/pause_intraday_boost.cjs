const categoryController = require('../services/categoryController.cjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function pauseIntradayBoost() {
    console.log('Pausing INTRADAY_BOOST background activities...');
    try {
        await categoryController.updateCategoryStatus('INTRADAY_BOOST', {
            enabled: false,
            scanningEnabled: false,
            signalGenerationEnabled: false
        });

        const status = await categoryController.getCategory('INTRADAY_BOOST');
        console.log('Status updated:', status);

        console.log(`Background activities paused for INTRADAY_BOOST at ${new Date().toISOString()}`);
    } catch (e) {
        console.error('Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

pauseIntradayBoost();
