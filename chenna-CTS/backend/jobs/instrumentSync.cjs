// Daily Instrument Sync Job
// Auto-updates NSE instrument mappings and handles delisted stocks

const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger.cjs');

const prisma = new PrismaClient();

class InstrumentSyncScheduler {
    constructor() {
        this.isRunning = false;
        this.lastSync = null;
    }

    // ========== MANUAL SYNC ==========

    async syncInstruments() {
        if (this.isRunning) {
            logger.warn('Instrument sync already running, skipping...');
            return { ok: false, error: 'Sync already in progress' };
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            logger.info('Starting instrument sync...');

            // 1. Load NSE.json
            const nseJsonPath = path.join(__dirname, '../../NSE.json');

            if (!fs.existsSync(nseJsonPath)) {
                throw new Error('NSE.json not found');
            }

            const nseData = JSON.parse(fs.readFileSync(nseJsonPath, 'utf-8'));
            const instruments = Array.isArray(nseData) ? nseData : nseData.data || [];

            logger.info(`Loaded ${instruments.length} instruments from NSE.json`);

            // 2. Update or create instruments in database
            let inserted = 0;
            let updated = 0;
            let skipped = 0;

            for (const inst of instruments) {
                try {
                    const existing = await prisma.instrument.findUnique({
                        where: { symbol: inst.symbol }
                    });

                    const instrumentData = {
                        symbol: inst.symbol,
                        tradingSymbol: inst.trading_symbol || inst.symbol,
                        name: inst.name || inst.symbol,
                        exchange: inst.exchange || 'NSE',
                        segment: inst.segment || 'NSE_EQ',
                        instrumentKey: inst.instrument_key,
                        instrumentType: inst.instrument_type || 'EQ',
                        isin: inst.isin,
                        lotSize: inst.lot_size ? parseInt(inst.lot_size) : null,
                        tickSize: inst.tick_size ? parseFloat(inst.tick_size) : null,
                        sector: inst.sector,
                        isActive: true,
                    };

                    if (existing) {
                        await prisma.instrument.update({
                            where: { id: existing.id },
                            data: instrumentData
                        });
                        updated++;
                    } else {
                        await prisma.instrument.create({
                            data: instrumentData
                        });
                        inserted++;
                    }

                    if ((inserted + updated) % 100 === 0) {
                        logger.info(`Progress: ${inserted + updated}/${instruments.length} processed`);
                    }
                } catch (error) {
                    logger.warn(`Skipped ${inst.symbol}:`, error.message);
                    skipped++;
                }
            }

            // 3. Mark delisted stocks as inactive
            const delistedCount = await this.markDelistedStocks(instruments);

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            this.lastSync = new Date();

            const result = {
                ok: true,
                inserted,
                updated,
                skipped,
                delisted: delistedCount,
                total: instruments.length,
                duration: `${duration}s`,
                lastSync: this.lastSync,
            };

            logger.info('Instrument sync completed', result);

            return result;
        } catch (error) {
            logger.error('Instrument sync failed', { error: error.message });
            return { ok: false, error: error.message };
        } finally {
            this.isRunning = false;
        }
    }

    // ========== DELISTED STOCKS ==========

    async markDelistedStocks(activeInstruments) {
        try {
            const activeSymbols = activeInstruments.map(i => i.symbol);

            // Mark instruments not in NSE.json as inactive
            const result = await prisma.instrument.updateMany({
                where: {
                    symbol: {
                        notIn: activeSymbols
                    },
                    isActive: true
                },
                data: {
                    isActive: false
                }
            });

            if (result.count > 0) {
                logger.warn(`Marked ${result.count} instruments as inactive (delisted)`);
            }

            return result.count;
        } catch (error) {
            logger.error('Failed to mark delisted stocks', { error: error.message });
            return 0;
        }
    }

    // ========== AUTO-SYNC ON SERVER START ==========

    async syncOnStartup() {
        logger.info('Running instrument sync on server startup...');
        await this.syncInstruments();
    }

    // ========== SCHEDULE DAILY SYNC ==========

    scheduleDailySync() {
        // Run every day at 2:00 AM
        cron.schedule('0 2 * * *', async () => {
            logger.info('Running scheduled daily instrument sync...');
            await this.syncInstruments();
        });

        logger.info('✅ Daily instrument sync scheduled (2:00 AM)');
    }

    // ========== SCHEDULE WEEKLY SYNC (Alternative) ==========

    scheduleWeeklySync() {
        // Run every Sunday at 3:00 AM
        cron.schedule('0 3 * * 0', async () => {
            logger.info('Running scheduled weekly instrument sync...');
            await this.syncInstruments();
        });

        logger.info('✅ Weekly instrument sync scheduled (Sunday 3:00 AM)');
    }

    // ========== CLEANUP ==========

    async cleanup() {
        await prisma.$disconnect();
    }
}

// Singleton instance
const scheduler = new InstrumentSyncScheduler();

module.exports = scheduler;
