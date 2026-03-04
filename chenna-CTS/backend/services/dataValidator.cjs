/**
 * Data Validator - Ensures backtest uses ONLY REAL market data
 * 
 * Validates:
 * 1. Trading days (excludes weekends)
 * 2. NSE holidays (excludes all holidays)
 * 3. OHLC sanity (High > Low, etc.)
 * 4. Data quality warnings
 */

// Complete NSE Holiday List 2024-2025-2026
const NSE_HOLIDAYS = [
    // 2024 Holidays
    '2024-01-26', // Republic Day
    '2024-03-08', // Maha Shivaratri
    '2024-03-25', // Holi
    '2024-03-29', // Good Friday
    '2024-04-11', // Ugadi/Gudi Padwa
    '2024-04-14', // Ambedkar Jayanti
    '2024-04-17', // Ram Navami
    '2024-04-21', // Mahavir Jayanti
    '2024-05-23', // Buddha Purnima
    '2024-06-17', // Eid-ul-Fitr
    '2024-07-17', // Muharram
    '2024-08-15', // Independence Day
    '2024-10-02', // Gandhi Jayanti
    '2024-10-12', // Dussehra
    '2024-10-31', // Diwali Laxmi Puja (markets closed early)
    '2024-11-01', // Diwali Balipratipada
    '2024-11-15', // Guru Nanak Jayanti
    '2024-12-25', // Christmas

    // 2025 Holidays (Official NSE list)
    '2025-01-26', // Republic Day
    '2025-02-26', // Maha Shivaratri
    '2025-03-14', // Holi
    '2025-03-31', // Id-ul-Fitr (Eid)
    '2025-04-10', // Mahavir Jayanti
    '2025-04-14', // Ambedkar Jayanti
    '2025-04-18', // Good Friday
    '2025-05-01', // Maharashtra Day
    '2025-05-12', // Buddha Purnima
    '2025-08-15', // Independence Day
    '2025-08-16', // Parsi New Year (Nowroz)
    '2025-08-27', // Janmashtami
    '2025-10-02', // Gandhi Jayanti
    '2025-10-20', // Dussehra
    '2025-10-21', // Diwali Laxmi Puja
    '2025-11-05', // Guru Nanak Jayanti
    '2025-12-25', // Christmas

    // 2026 Holidays (Partial - add more as official list releases)
    '2026-01-26', // Republic Day
    '2026-02-17', // Maha Shivaratri (approx)
    '2026-03-03', // Holi (approx)
    '2026-03-20', // Id-ul-Fitr (approx)
    '2026-04-03', // Good Friday
    '2026-04-14', // Ambedkar Jayanti
    '2026-05-01', // May Day
    '2026-08-15', // Independence Day
    '2026-10-02', // Gandhi Jayanti
    '2026-11-10', // Diwali (approx)
    '2026-12-25', // Christmas
];

/**
 * Check if a date string is a valid NSE trading day
 */
function isValidTradingDay(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') {
        return { valid: false, reason: 'INVALID_DATE_FORMAT' };
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
        return { valid: false, reason: 'INVALID_DATE_FORMAT' };
    }

    const dayOfWeek = date.getDay();

    // Weekend check (Saturday = 6, Sunday = 0)
    if (dayOfWeek === 0) {
        return { valid: false, reason: 'SUNDAY' };
    }
    if (dayOfWeek === 6) {
        return { valid: false, reason: 'SATURDAY' };
    }

    // NSE Holiday check
    if (NSE_HOLIDAYS.includes(dateStr)) {
        return { valid: false, reason: 'NSE_HOLIDAY' };
    }

    return { valid: true, reason: 'VALID_TRADING_DAY' };
}

/**
 * Validate OHLC data sanity
 */
function validateOHLC(ohlc) {
    const errors = [];
    const warnings = [];

    const { open, high, low, close } = ohlc;

    // Basic existence checks
    if (open === undefined || open === null) errors.push('Missing open price');
    if (high === undefined || high === null) errors.push('Missing high price');
    if (low === undefined || low === null) errors.push('Missing low price');
    if (close === undefined || close === null) errors.push('Missing close price');

    if (errors.length > 0) {
        return { valid: false, errors, warnings };
    }

    // Price sanity checks (impossible scenarios)
    if (open <= 0) errors.push(`Invalid open price: ${open}`);
    if (high <= 0) errors.push(`Invalid high price: ${high}`);
    if (low <= 0) errors.push(`Invalid low price: ${low}`);
    if (close <= 0) errors.push(`Invalid close price: ${close}`);

    if (high < low) errors.push(`High (${high}) < Low (${low}) - IMPOSSIBLE`);
    if (high < open) errors.push(`High (${high}) < Open (${open}) - IMPOSSIBLE`);
    if (high < close) errors.push(`High (${high}) < Close (${close}) - IMPOSSIBLE`);
    if (low > open) errors.push(`Low (${low}) > Open (${open}) - IMPOSSIBLE`);
    if (low > close) errors.push(`Low (${low}) > Close (${close}) - IMPOSSIBLE`);

    // Suspicious data warnings
    const allRound = open % 1 === 0 && high % 1 === 0 && low % 1 === 0 && close % 1 === 0;
    if (allRound) {
        warnings.push('All prices are round numbers - may be synthetic data');
    }

    // Check for unrealistic price movements (> 20% in a day)
    const dayRange = ((high - low) / low) * 100;
    if (dayRange > 20) {
        warnings.push(`Unusual day range: ${dayRange.toFixed(1)}%`);
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Generate pre-backtest validation report
 */
async function generateValidationReport(trades, category) {
    const report = {
        category,
        timestamp: new Date().toISOString(),
        summary: {
            totalTrades: trades.length,
            validTrades: 0,
            invalidTrades: 0,
            holidayTrades: 0,
            weekendTrades: 0
        },
        invalidEntries: [],
        warnings: [],
        dataQuality: 'UNKNOWN'
    };

    for (const trade of trades) {
        const dateCheck = isValidTradingDay(trade.date);

        if (!dateCheck.valid) {
            report.summary.invalidTrades++;
            report.invalidEntries.push({
                date: trade.date,
                symbol: trade.symbol,
                reason: dateCheck.reason
            });

            if (dateCheck.reason === 'NSE_HOLIDAY') {
                report.summary.holidayTrades++;
            } else if (dateCheck.reason === 'SATURDAY' || dateCheck.reason === 'SUNDAY') {
                report.summary.weekendTrades++;
            }
        } else {
            report.summary.validTrades++;
        }
    }

    // Determine data quality
    const validPercent = (report.summary.validTrades / trades.length) * 100;
    if (validPercent >= 95) {
        report.dataQuality = 'EXCELLENT';
    } else if (validPercent >= 90) {
        report.dataQuality = 'GOOD';
    } else if (validPercent >= 80) {
        report.dataQuality = 'ACCEPTABLE';
    } else {
        report.dataQuality = 'POOR';
    }

    return report;
}

/**
 * Filter trades to only include valid trading days
 */
function filterValidTrades(trades) {
    const validTrades = [];
    const removedTrades = [];

    for (const trade of trades) {
        const dateCheck = isValidTradingDay(trade.date);

        if (dateCheck.valid) {
            validTrades.push(trade);
        } else {
            removedTrades.push({
                ...trade,
                removalReason: dateCheck.reason
            });
        }
    }

    return { validTrades, removedTrades };
}

module.exports = {
    NSE_HOLIDAYS,
    isValidTradingDay,
    validateOHLC,
    generateValidationReport,
    filterValidTrades
};
