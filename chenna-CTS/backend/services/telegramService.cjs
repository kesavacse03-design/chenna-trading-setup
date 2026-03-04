const fetch = require('node-fetch');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Sends a message via Telegram bot
 * @param {string} message Markdown formatted message
 */
async function sendMessage(message) {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.debug('[Telegram] Bot token or chat ID not configured in .env. Skipping alert.');
        return false;
    }

    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            })
        });

        const data = await response.json();
        if (!data.ok) {
            console.error('[Telegram] Failed to send message:', data.description);
            return false;
        }
        return true;
    } catch (err) {
        console.error('[Telegram] Error sending message:', err.message);
        return false;
    }
}

// Specific Alert formatters
function alertSetupForming(symbol, category) {
    const cat = (category || '').replace(/_/g, '\\_');
    return sendMessage(`⏳ *SETUP FORMING*\nSymbol: *${symbol}*\nCategory: ${cat}\nPrepare for possible entry.`);
}

function alertNewSignal(signal) {
    const dir = signal.direction || signal.type;
    const dirIcon = dir === 'LONG' ? '🟢 LONG' : '🔴 SHORT';
    const cat = (signal.categoryKey || signal.category || '').replace(/_/g, '\\_');
    const entry = typeof signal.entryPrice === 'number' ? signal.entryPrice.toFixed(2) : signal.entryPrice;
    const stop = typeof signal.stopPrice === 'number' ? signal.stopPrice.toFixed(2) : signal.stopPrice;
    const t1val = signal.t1Price || signal.targetPrice;
    const t1 = typeof t1val === 'number' ? t1val.toFixed(2) : t1val;
    return sendMessage(`🔔 *NEW SIGNAL*\n\n*${signal.symbol}* ${dirIcon}\nCategory: ${cat}\n\nEntry: ₹${entry}\nStop: ₹${stop}\nT1: ₹${t1}\n\n[Dashboard](http://localhost:5173/)`);
}

function alertTargetHit(signal, targetName, exitPrice) {
    return sendMessage(`🎯 *${targetName} HIT!*\n\nSymbol: *${signal.symbol}*\nExit Price: ₹${exitPrice.toFixed(2)}\n\nGreat trade!`);
}

function alertStopHit(signal, exitPrice) {
    return sendMessage(`🛑 *STOP LOSS HIT*\n\nSymbol: *${signal.symbol}*\nExit Price: ₹${exitPrice.toFixed(2)}\n\nRisk managed.`);
}

function alertExpired(signal) {
    const cat = (signal.categoryKey || signal.category || '').replace(/_/g, '\\_');
    return sendMessage(`⏰ *SIGNAL EXPIRED*\n\nSymbol: *${signal.symbol}*\nCategory: ${cat}\n\nTime elapsed, signal is no longer valid.`);
}

function alertEodSummary(summary) {
    return sendMessage(`📊 *EOD SUMMARY*\n\nTotal Signals: ${summary.totalSignals}\nTrades Executed: ${summary.totalTrades}\nWin Rate: ${summary.winRate}%\nGross P&L: ₹${summary.pnl.toFixed(2)}`);
}

module.exports = {
    sendMessage,
    alertSetupForming,
    alertNewSignal,
    alertTargetHit,
    alertStopHit,
    alertExpired,
    alertEodSummary
};
