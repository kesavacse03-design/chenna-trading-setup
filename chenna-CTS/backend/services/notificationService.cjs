/**
 * Notification Service
 * Handles alerts for new signals via browser, in-app, and optional Telegram
 */

class NotificationService {
    constructor() {
        this.pendingNotifications = [];
        this.notificationHistory = [];
        this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || null;
        this.telegramChatId = process.env.TELEGRAM_CHAT_ID || null;
    }

    /**
     * Send notification for new signals
     */
    async notifyNewSignals(signals, categoryKey) {
        if (!signals || signals.length === 0) return;

        const notification = {
            id: `notif_${Date.now()}`,
            type: 'NEW_SIGNALS',
            category: categoryKey,
            count: signals.length,
            signals: signals.slice(0, 5), // Top 5 only
            timestamp: new Date().toISOString(),
            read: false
        };

        // Store notification
        this.pendingNotifications.push(notification);
        this.notificationHistory.push(notification);

        // Keep history limited
        if (this.notificationHistory.length > 100) {
            this.notificationHistory = this.notificationHistory.slice(-100);
        }

        console.log(`\n🔔 NOTIFICATION: ${signals.length} new signals in ${categoryKey}`);

        // Try Telegram if configured
        if (this.telegramBotToken && this.telegramChatId) {
            await this.sendTelegram(notification);
        }

        return notification;
    }

    /**
     * Send Telegram notification (optional)
     */
    async sendTelegram(notification) {
        if (!this.telegramBotToken || !this.telegramChatId) {
            return { sent: false, reason: 'Telegram not configured' };
        }

        try {
            const message = this.formatTelegramMessage(notification);

            const fetch = require('node-fetch');
            const url = `https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.telegramChatId,
                    text: message,
                    parse_mode: 'HTML'
                })
            });

            const result = await response.json();
            console.log(`[Telegram] Message sent: ${result.ok}`);
            return { sent: result.ok };
        } catch (error) {
            console.error('[Telegram] Error:', error.message);
            return { sent: false, error: error.message };
        }
    }

    /**
     * Format message for Telegram
     */
    formatTelegramMessage(notification) {
        let message = `🔔 <b>NEW SIGNALS - ${notification.category}</b>\n\n`;

        for (const signal of notification.signals) {
            message += `📈 <b>${signal.symbol}</b>\n`;
            message += `   Entry: ₹${signal.price.toFixed(2)}\n`;
            message += `   Target: ₹${signal.target.toFixed(2)} (+${signal.targetPercent}%)\n`;
            message += `   Stop: ₹${signal.stop.toFixed(2)} (-${signal.stopPercent}%)\n`;
            message += `   Confidence: ${signal.confidence}%\n\n`;
        }

        message += `⏰ ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
        return message;
    }

    /**
     * Get pending (unread) notifications
     */
    getPendingNotifications() {
        return this.pendingNotifications.filter(n => !n.read);
    }

    /**
     * Mark notification as read
     */
    markAsRead(notificationId) {
        const notif = this.pendingNotifications.find(n => n.id === notificationId);
        if (notif) {
            notif.read = true;
        }
    }

    /**
     * Mark all as read
     */
    markAllAsRead() {
        this.pendingNotifications.forEach(n => n.read = true);
    }

    /**
     * Get notification history
     */
    getHistory(limit = 20) {
        return this.notificationHistory.slice(-limit).reverse();
    }

    /**
     * Get notification count badge
     */
    getBadgeCount() {
        return this.pendingNotifications.filter(n => !n.read).length;
    }

    /**
     * Configure Telegram (runtime)
     */
    configureTelegram(botToken, chatId) {
        this.telegramBotToken = botToken;
        this.telegramChatId = chatId;
        console.log('[Notifications] Telegram configured');
    }

    /**
     * Test notification
     */
    async sendTestNotification() {
        const testSignal = {
            symbol: 'TEST',
            price: 100,
            target: 102.5,
            stop: 98.5,
            targetPercent: 2.5,
            stopPercent: 1.5,
            confidence: 75
        };

        return await this.notifyNewSignals([testSignal], 'TEST_CATEGORY');
    }
}

// Export singleton
module.exports = new NotificationService();
