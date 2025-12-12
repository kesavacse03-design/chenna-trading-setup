/**
 * Telegram Alert Service
 * Phase 13: Telegram Integration
 */

const axios = require('axios');

let telegramConfig = {
    enabled: false,
    botToken: null,
    chatId: null
};

/**
 * Configure Telegram bot
 */
function configureTelegram(botToken, chatId) {
    telegramConfig = {
        enabled: true,
        botToken,
        chatId
    };
    return { ok: true, message: 'Telegram configured' };
}

/**
 * Send Telegram message
 */
async function sendTelegramMessage(message, parseMode = 'Markdown') {
    if (!telegramConfig.enabled || !telegramConfig.botToken || !telegramConfig.chatId) {
        console.log('[Telegram] Not configured, skipping message');
        return { ok: false, error: 'Telegram not configured' };
    }

    try {
        const url = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;
        const response = await axios.post(url, {
            chat_id: telegramConfig.chatId,
            text: message,
            parse_mode: parseMode
        });

        return { ok: true, messageId: response.data.result.message_id };
    } catch (error) {
        console.error('[Telegram] Send error:', error.message);
        return { ok: false, error: error.message };
    }
}

/**
 * Send trade entry alert
 */
async function sendTradeEntryAlert(trade) {
    const message = `
🟢 *TRADE ENTRY*

Symbol: \`${trade.symbol}\`
Category: ${trade.categoryKey}
Entry: ₹${trade.entryPrice}
Target: ₹${trade.targetPrice} (+${trade.targetPercent}%)
Stop Loss: ₹${trade.stopLossPrice} (-${trade.stopLossPercent}%)
Position Size: ₹${trade.positionSize}
Version: ${trade.strategyVersion || 'V1'}

${trade.reason || 'Strategy entry signal'}
`;

    return sendTelegramMessage(message);
}

/**
 * Send target hit alert
 */
async function sendTargetHitAlert(trade) {
    const message = `
🎯 *TARGET HIT!*

Symbol: \`${trade.symbol}\`
Entry: ₹${trade.entryPrice}
Exit: ₹${trade.exitPrice}
Profit: ${trade.pnlPercent.toFixed(2)}% (₹${trade.pnlAmount})
Duration: ${trade.daysHeld} days

Great trade! ✅
`;

    return sendTelegramMessage(message);
}

/**
 * Send stop loss hit alert
 */
async function sendStopLossAlert(trade) {
    const message = `
🛑 *STOP LOSS HIT*

Symbol: \`${trade.symbol}\`
Entry: ₹${trade.entryPrice}
Exit: ₹${trade.exitPrice}
Loss: ${trade.pnlPercent.toFixed(2)}% (₹${trade.pnlAmount})
Duration: ${trade.daysHeld} days

Risk managed. Moving on. 💪
`;

    return sendTelegramMessage(message);
}

/**
 * Send trailing stop update alert
 */
async function sendTrailingStopAlert(trade) {
    const message = `
📊 *TRAILING STOP UPDATED*

Symbol: \`${trade.symbol}\`
New Stop Loss: ₹${trade.newStopLoss}
Current Price: ₹${trade.currentPrice}
Unrealized P&L: ${trade.unrealizedPnl.toFixed(2)}%

Locking in profits! 🔒
`;

    return sendTelegramMessage(message);
}

/**
 * Send time exit alert
 */
async function sendTimeExitAlert(trade) {
    const message = `
⏰ *TIME EXIT*

Symbol: \`${trade.symbol}\`
Entry: ₹${trade.entryPrice}
Exit: ₹${trade.exitPrice}
P&L: ${trade.pnlPercent.toFixed(2)}% (₹${trade.pnlAmount})
Duration: ${trade.daysHeld}/${trade.maxDays} days

Trade closed at time limit.
`;

    return sendTelegramMessage(message);
}

/**
 * Send version change alert
 */
async function sendVersionChangeAlert(categoryKey, oldVersion, newVersion, reason) {
    const message = `
🔄 *STRATEGY VERSION UPDATED*

Category: ${categoryKey}
${oldVersion} → ${newVersion}

Reason: ${reason}

New logic active for future trades.
`;

    return sendTelegramMessage(message);
}

/**
 * Send daily summary
 */
async function sendDailySummary(summary) {
    const message = `
📈 *DAILY SUMMARY*

Date: ${new Date().toDateString()}

Trades Today: ${summary.totalTrades}
Wins: ${summary.wins} | Losses: ${summary.losses}
Win Rate: ${summary.winRate.toFixed(1)}%

Total P&L: ${summary.totalPnl >= 0 ? '+' : ''}${summary.totalPnl.toFixed(2)}%
Best Trade: ${summary.bestTrade}
Worst Trade: ${summary.worstTrade}

Active Trades: ${summary.activeTrades}
`;

    return sendTelegramMessage(message);
}

/**
 * Test Telegram connection
 */
async function testTelegram() {
    return sendTelegramMessage('✅ Telegram connection test successful!\n\nChenna Trading System is ready to send alerts.');
}

module.exports = {
    configureTelegram,
    sendTelegramMessage,
    sendTradeEntryAlert,
    sendTargetHitAlert,
    sendStopLossAlert,
    sendTrailingStopAlert,
    sendTimeExitAlert,
    sendVersionChangeAlert,
    sendDailySummary,
    testTelegram,
    getConfig: () => telegramConfig
};
