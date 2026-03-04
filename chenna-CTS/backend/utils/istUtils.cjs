/**
 * IST Timezone Utilities — Single Source of Truth
 * 
 * EVERY file in the backend imports from HERE for date/time operations.
 * The IST offset is defined exactly ONCE. If it's wrong, fix it here
 * and it's fixed everywhere.
 * 
 * RULES:
 *   1. Never use new Date().toISOString().split('T')[0] — use todayIST()
 *   2. Never use dbDate.toISOString().split('T')[0] — use dateToIST(dbDate)
 *   3. Never use new Date(dateStr + 'T00:00:00Z') — use startOfDayUTC(dateStr)
 *   4. Never use setHours(0,0,0,0) for "today" — use startOfDayUTC(todayIST())
 *   5. For stock imports, ALWAYS use importDateIST() for addedDate
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +05:30 in milliseconds

// ====================================================================
// CORE DATE FUNCTIONS
// ====================================================================

/**
 * Returns today's date as 'YYYY-MM-DD' in IST.
 * Use this instead of `new Date().toISOString().split('T')[0]` everywhere.
 */
function todayIST() {
    const now = new Date();
    const ist = new Date(now.getTime() + IST_OFFSET_MS);
    return ist.toISOString().split('T')[0];
}

/**
 * Converts any database Date object to an IST date string 'YYYY-MM-DD'.
 * Use this for ALL date comparisons with database dates.
 * 
 * @param {Date} dbDate - A Date object from Prisma/DB
 * @returns {string} 'YYYY-MM-DD' in IST
 */
function dateToIST(dbDate) {
    if (!dbDate) return null;
    const d = new Date(dbDate);
    const ist = new Date(d.getTime() + IST_OFFSET_MS);
    return ist.toISOString().split('T')[0];
}

/**
 * Converts an IST date string to UTC start-of-day Date for Prisma WHERE clauses.
 * IST midnight = UTC 18:30 previous day.
 * 
 * @param {string} istDateStr - 'YYYY-MM-DD' in IST
 * @returns {Date} UTC Date representing 00:00:00 IST (= previous day 18:30 UTC)
 */
function startOfDayUTC(istDateStr) {
    // Parse the IST date string
    const [yyyy, mm, dd] = istDateStr.split('-').map(Number);
    // Create the date at IST midnight, then subtract IST offset to get UTC
    const istMidnight = new Date(Date.UTC(yyyy, mm - 1, dd));
    return new Date(istMidnight.getTime() - IST_OFFSET_MS);
}

/**
 * Converts an IST date string to UTC end-of-day Date for Prisma WHERE clauses.
 * IST 23:59:59.999 = UTC 18:29:59.999 same day.
 * 
 * @param {string} istDateStr - 'YYYY-MM-DD' in IST
 * @returns {Date} UTC Date representing 23:59:59.999 IST
 */
function endOfDayUTC(istDateStr) {
    const [yyyy, mm, dd] = istDateStr.split('-').map(Number);
    // IST end of day = next day IST midnight minus 1ms
    const nextDayISTMidnight = new Date(Date.UTC(yyyy, mm - 1, dd + 1));
    return new Date(nextDayISTMidnight.getTime() - IST_OFFSET_MS - 1);
}

// ====================================================================
// STOCK IMPORT FUNCTION
// ====================================================================

/**
 * Returns the correct UTC Date to STORE in addedDate when importing stocks.
 * This is THE function that every stock import path must use.
 * 
 * When a user adds a stock on March 2 IST, we store 2026-03-02T00:00:00Z (UTC midnight).
 * This ensures that date comparisons using startOfDayUTC/endOfDayUTC work correctly.
 * 
 * @param {string} [istDateStr] - Optional 'YYYY-MM-DD'. Defaults to todayIST().
 * @returns {Date} UTC Date to store in database
 */
function importDateIST(istDateStr) {
    const dateStr = istDateStr || todayIST();
    const [yyyy, mm, dd] = dateStr.split('-').map(Number);
    // Store as UTC midnight of the IST date
    // This is a convention: addedDate='2026-03-02' means the stock was added on March 2 IST.
    // Queries filter using gte/lt on this value.
    return new Date(Date.UTC(yyyy, mm - 1, dd));
}

// ====================================================================
// DISPLAY FUNCTIONS
// ====================================================================

/**
 * Formats a UTC timestamp as '10:15 AM' IST for display.
 * 
 * @param {Date|string} utcDate - UTC Date object or ISO string
 * @returns {string} Formatted time like '10:15 AM'
 */
function formatISTTime(utcDate) {
    if (!utcDate) return null;
    const d = new Date(utcDate);
    return d.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

/**
 * Formats a UTC timestamp as 'Mar 2, 10:15 AM' IST for display.
 * 
 * @param {Date|string} utcDate - UTC Date object or ISO string
 * @returns {string} Formatted date+time like 'Mar 2, 10:15 AM'
 */
function formatISTDateTime(utcDate) {
    if (!utcDate) return null;
    const d = new Date(utcDate);
    return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

// ====================================================================
// MARKET PHASE FUNCTIONS
// ====================================================================

/**
 * Returns the current market phase based on IST time.
 * @returns {'PRE_MARKET'|'OR_FORMING'|'ACTIVE_TRADING'|'MONITORING'|'CLOSING'|'CLOSED'}
 */
function getMarketPhase() {
    const now = new Date();
    const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const h = istNow.getHours();
    const m = istNow.getMinutes();
    const t = h * 60 + m; // minutes since midnight IST

    if (t < 9 * 60 + 15) return 'PRE_MARKET';       // Before 9:15 AM
    if (t < 9 * 60 + 45) return 'OR_FORMING';        // 9:15 - 9:45 AM
    if (t < 12 * 60) return 'ACTIVE_TRADING';     // 9:45 AM - 12:00 PM
    if (t < 15 * 60) return 'MONITORING';         // 12:00 - 3:00 PM
    if (t < 15 * 60 + 30) return 'CLOSING';           // 3:00 - 3:30 PM
    return 'CLOSED';                                   // After 3:30 PM
}

/**
 * Returns true if market is currently open (9:15 AM - 3:30 PM IST, Mon-Fri).
 */
function isMarketOpen() {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return false;

    const phase = getMarketPhase();
    return ['OR_FORMING', 'ACTIVE_TRADING', 'MONITORING', 'CLOSING'].includes(phase);
}

/**
 * Returns true if the entry window is open (9:45 AM - 12:00 PM IST).
 * This is the only time during which new intraday trades should be entered.
 */
function isEntryWindowOpen() {
    return getMarketPhase() === 'ACTIVE_TRADING';
}

/**
 * Returns true if it's past intraday exit time (3:15 PM IST).
 * Used by the scheduler to trigger EOD auto-close.
 */
function isIntradayExitTime() {
    const now = new Date();
    const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const t = istNow.getHours() * 60 + istNow.getMinutes();
    return t >= 15 * 60 + 15; // 3:15 PM IST
}

/**
 * Returns the current IST time as 'HH:MM AM/PM' string.
 */
function currentISTTime() {
    return new Date().toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

// ====================================================================
// EXPORTS
// ====================================================================

module.exports = {
    // Core date functions
    todayIST,
    dateToIST,
    startOfDayUTC,
    endOfDayUTC,
    importDateIST,

    // Display functions
    formatISTTime,
    formatISTDateTime,
    currentISTTime,

    // Market phase functions
    getMarketPhase,
    isMarketOpen,
    isEntryWindowOpen,
    isIntradayExitTime,

    // Constant (for edge cases where raw offset is needed)
    IST_OFFSET_MS
};
