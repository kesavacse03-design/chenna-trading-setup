const axios = require('axios');

/**
 * Telegram Notification Service
 * Sends market intelligence updates to configured Telegram users
 */
class TelegramNotificationService {
    constructor() {
        this.botToken = process.env.TELEGRAM_BOT_TOKEN;
        this.enabled = process.env.ENABLE_TELEGRAM === 'true';
        this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;

        if (!this.enabled) {
            console.log('📱 Telegram notifications disabled');
            return;
        }

        if (!this.botToken) {
            console.error('❌ TELEGRAM_BOT_TOKEN not found in .env');
            this.enabled = false;
            return;
        }

        console.log('✅ Telegram notification service initialized');
    }

    /**
     * Send market open summary (9:15 AM daily)
     */
    async sendMarketOpenSummary(sentiment, regime, chatIds = []) {
        if (!this.enabled || chatIds.length === 0) return;

        const sentimentEmoji = sentiment.score > 0.3 ? '🟢' : sentiment.score < -0.3 ? '🔴' : '🟡';
        const regimeEmoji = regime.regime === 'TRENDING_BULLISH' ? '📈' :
            regime.regime === 'TRENDING_BEARISH' ? '📉' :
                regime.regime === 'VOLATILE' ? '⚡' : '↔️';

        const message = `
🌅 *MARKET OPEN UPDATE*
━━━━━━━━━━━━━━━━━━━

${sentimentEmoji} *Sentiment:* ${sentiment.label} (${sentiment.score > 0 ? '+' : ''}${(sentiment.score * 100).toFixed(0)}%)
${regimeEmoji} *Regime:* ${regime.regime.replace('_', ' ')}

💰 FII/DII: ${sentiment.components.fiiDii.netFlow > 0 ? '+' : ''}₹${sentiment.components.fiiDii.netFlow} Cr
😰 VIX: ${sentiment.components.vix.value.toFixed(1)} (${sentiment.components.vix.trend})
⚖️ PCR: ${sentiment.components.pcr.value.toFixed(2)}
🌍 Global: ${sentiment.components.globalCues}

${this.getTradingAdvice(sentiment, regime)}
    `.trim();

        return this.sendToMultipleChats(message, chatIds);
    }

    /**
     * Send regime change alert
     */
    async sendRegimeChangeAlert(oldRegime, newRegime, chatIds = []) {
        if (!this.enabled || chatIds.length === 0) return;

        const message = `
⚠️ *REGIME CHANGE DETECTED!*
━━━━━━━━━━━━━━━━━━━━━━━━━

From: ${oldRegime}
To: *${newRegime}*

${this.getRegimeAdvice(newRegime)}
    `.trim();

        return this.sendToMultipleChats(message, chatIds);
    }

    /**
     * Send sentiment shift warning
     */
    async sendSentimentShiftAlert(oldSentiment, newSentiment, chatIds = []) {
        if (!this.enabled || chatIds.length === 0) return;

        const emoji = newSentiment.score < oldSentiment.score ? '🔴' : '🟢';

        const message = `
${emoji} *SENTIMENT SHIFT ALERT!*
━━━━━━━━━━━━━━━━━━━━━━━

From: ${oldSentiment.label} (${(oldSentiment.score * 100).toFixed(0)}%)
To: *${newSentiment.label} (${(newSentiment.score * 100).toFixed(0)}%)*

⚠️ Change: ${((newSentiment.score - oldSentiment.score) * 100).toFixed(0)}%

${newSentiment.score < -0.3 ? '🛡️ Reduce positions, avoid new longs' : ''}
    `.trim();

        return this.sendToMultipleChats(message, chatIds);
    }

    /**
     * Helper: Get trading advice based on conditions
     */
    getTradingAdvice(sentiment, regime) {
        if (sentiment.score > 0.4 && regime.regime === 'TRENDING_BULLISH') {
            return '✅ Excellent conditions for momentum trades';
        } else if (sentiment.score < -0.4 && regime.regime === 'TRENDING_BEARISH') {
            return '🛡️ Defense mode: Reduce positions or stay in cash';
        } else if (regime.regime === 'VOLATILE') {
            return '⚠️ High volatility: Use wider stops, reduce size';
        } else if (regime.regime === 'RANGING') {
            return '↔️ Choppy market: Trade support/resistance, avoid breakouts';
        } else if (sentiment.score > 0.2) {
            return '✅ Favorable conditions for selective trades';
        } else if (sentiment.score < -0.2) {
            return '⚠️ Cautious approach recommended';
        }
        return 'ℹ️ Neutral conditions: Trade selectively';
    }

    /**
     * Helper: Get regime-specific advice
     */
    getRegimeAdvice(regime) {
        const advice = {
            'TRENDING_BULLISH': '✅ Use momentum strategies, follow the trend',
            'TRENDING_BEARISH': '🔻 Consider shorts or stay defensive',
            'RANGING': '↔️ Use mean-reversion, avoid breakout trades',
            'VOLATILE': '⚡ Reduce risk, widen stops, smaller positions'
        };
        return advice[regime] || 'ℹ️ Adjust strategies accordingly';
    }

    /**
     * Send message to multiple chat IDs
     */
    async sendToMultipleChats(message, chatIds) {
        if (!this.enabled) return;

        const promises = chatIds.map(chatId => this.sendMessage(chatId, message));
        const results = await Promise.allSettled(promises);

        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        console.log(`📱 Telegram: Sent to ${succeeded}/${chatIds.length} chats (${failed} failed)`);
        return { succeeded, failed, total: chatIds.length };
    }

    /**
     * Send individual message
     */
    async sendMessage(chatId, text) {
        if (!this.enabled) return;

        try {
            await axios.post(`${this.baseUrl}/sendMessage`, {
                chat_id: chatId,
                text: text,
                parse_mode: 'Markdown'
            });
            return true;
        } catch (error) {
            console.error(`Failed to send Telegram message to ${chatId}:`, error.message);
            return false;
        }
    }
}

module.exports = new TelegramNotificationService();
