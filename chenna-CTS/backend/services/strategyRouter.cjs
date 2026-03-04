/**
 * Strategy Router
 * Maps category keys to specific strategy implementation files.
 */

const swingBoDownLongStrategy = require('../strategies/swingBoDownLongStrategy.cjs');
const swingBoUpLongStrategy = require('../strategies/swingBoUpLongStrategy.cjs');
const ltSwingBoDownLongStrategy = require('../strategies/ltSwingBoDownLongStrategy.cjs');
const ltSwingBoUpLongStrategy = require('../strategies/ltSwingBoUpLongStrategy.cjs');
const multiSupportBoLongStrategy = require('../strategies/multiSupportBoLongStrategy.cjs');
const multiResistanceBoStrategy = require('../strategies/multiResistanceBoStrategy.cjs');

const STRATEGY_MAP = {
    // Short Term Swing
    'SHORT_TERM_SWING_BO_DOWN': swingBoDownLongStrategy,
    'SHORT_TERM_SWING_BO_UP': swingBoUpLongStrategy,

    // Long Term Swing
    'LONG_TERM_SWING_BO_DOWN': ltSwingBoDownLongStrategy,
    'LONG_TERM_SWING_BO_UP': ltSwingBoUpLongStrategy,

    // Multi Support/Resistance
    'MULTI_SUPPORT_BO': multiSupportBoLongStrategy,
    'MULTI_RESISTANCE_BO': multiResistanceBoStrategy,

    // Add others as they are implemented
    // 'DOWNSIDE_LOM_SWING': ...
};

/**
 * Get the strategy implementation for a category
 * @param {string} categoryKey 
 * @returns {Object|null} Strategy module or null
 */
function getStrategy(categoryKey) {
    return STRATEGY_MAP[categoryKey] || null;
}

module.exports = { getStrategy };
