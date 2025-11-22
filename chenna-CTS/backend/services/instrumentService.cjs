const { PrismaClient } = require('@prisma/client');
const fs = require('fs').promises;
const path = require('path');

const prisma = new PrismaClient();

class InstrumentService {
    /**
     * Search instruments by symbol or name
     * @param {string} query - Search query
     * @param {number} limit - Max results
     * @returns {Promise<Array>} Matching instruments
     */
    async searchInstruments(query, limit = 20) {
        const q = (query || '').trim().toUpperCase();
        if (!q) return [];

        try {
            return await prisma.instrument.findMany({
                where: {
                    AND: [
                        { isActive: true },
                        {
                            OR: [
                                { symbol: { startsWith: q, mode: 'insensitive' } },
                                { tradingSymbol: { startsWith: q, mode: 'insensitive' } },
                                { name: { contains: q, mode: 'insensitive' } },
                            ]
                        }
                    ]
                },
                take: Math.min(limit, 100),
                orderBy: [
                    { symbol: 'asc' }
                ]
            });
        } catch (err) {
            console.error('[InstrumentService] searchInstruments error:', err);
            return [];
        }
    }

    /**
     * Get instrument by exact symbol match
     * @param {string} symbol - Instrument symbol
     * @returns {Promise<Object|null>} Instrument or null
     */
    async getBySymbol(symbol) {
        if (!symbol) return null;

        try {
            return await prisma.instrument.findFirst({
                where: {
                    symbol: symbol.toUpperCase(),
                    isActive: true
                }
            });
        } catch (err) {
            console.error('[InstrumentService] getBySymbol error:', err);
            return null;
        }
    }

    /**
     * Get instrument by instrument key
     * @param {string} key - Instrument key (e.g., NSE_EQ|INE009A01021)
     * @returns {Promise<Object|null>} Instrument or null
     */
    async getByKey(key) {
        if (!key) return null;

        try {
            return await prisma.instrument.findFirst({
                where: {
                    instrumentKey: key,
                    isActive: true
                }
            });
        } catch (err) {
            console.error('[InstrumentService] getByKey error:', err);
            return null;
        }
    }

    /**
     * Sync instruments from JSON file (NSE.json format)
     * @param {string} filepath - Path to instruments JSON file
     * @returns {Promise<{inserted: number, updated: number, errors: number}>}
     */
    async syncFromFile(filepath) {
        let inserted = 0;
        let updated = 0;
        let errors = 0;

        try {
            const content = await fs.readFile(filepath, 'utf-8');
            const instruments = JSON.parse(content);

            if (!Array.isArray(instruments)) {
                throw new Error('Invalid JSON format: expected array');
            }

            console.log(`[InstrumentService] Syncing ${instruments.length} instruments from ${filepath}`);

            for (const inst of instruments) {
                try {
                    // Extract fields from various possible formats
                    const symbol = (inst.trading_symbol || inst.tradingsymbol || inst.symbol || '').toUpperCase();
                    if (!symbol) {
                        errors++;
                        continue;
                    }

                    const data = {
                        tradingSymbol: inst.trading_symbol || inst.tradingsymbol || null,
                        name: inst.name || inst.company_name || inst.companyName || null,
                        exchange: (inst.exchange || inst.exch || 'NSE').toUpperCase(),
                        segment: inst.segment || inst.segment_name || inst.exchange_segment || null,
                        instrumentKey: inst.instrument_key || inst.asset_key || inst.instrumentKey || null,
                        instrumentType: inst.instrument_type || inst.instrumentType || 'EQ',
                        isin: inst.isin || null,
                        lotSize: inst.lot_size || inst.lotSize || null,
                        tickSize: inst.tick_size || inst.tickSize || null,
                        sector: inst.sector || inst.industry || null,
                        isActive: true,
                        updatedAt: new Date()
                    };

                    const existing = await prisma.instrument.findUnique({
                        where: { symbol }
                    });

                    if (existing) {
                        await prisma.instrument.update({
                            where: { symbol },
                            data
                        });
                        updated++;
                    } else {
                        await prisma.instrument.create({
                            data: {
                                symbol,
                                ...data
                            }
                        });
                        inserted++;
                    }
                } catch (err) {
                    console.error(`[InstrumentService] Error syncing instrument:`, err.message);
                    errors++;
                }
            }

            console.log(`[InstrumentService] Sync complete: ${inserted} inserted, ${updated} updated, ${errors} errors`);

            return { inserted, updated, errors };
        } catch (err) {
            console.error('[InstrumentService] syncFromFile error:', err);
            throw err;
        }
    }

    /**
     * Get total count of active instruments
     * @returns {Promise<number>} Count
     */
    async getCount() {
        try {
            return await prisma.instrument.count({
                where: { isActive: true }
            });
        } catch (err) {
            console.error('[InstrumentService] getCount error:', err);
            return 0;
        }
    }

    /**
     * Mark instrument as inactive (delisted)
     * @param {string} symbol - Symbol to deactivate
     * @returns {Promise<boolean>} Success
     */
    async deactivate(symbol) {
        try {
            await prisma.instrument.update({
                where: { symbol: symbol.toUpperCase() },
                data: { isActive: false, updatedAt: new Date() }
            });
            return true;
        } catch (err) {
            console.error('[InstrumentService] deactivate error:', err);
            return false;
        }
    }
}

module.exports = new InstrumentService();
