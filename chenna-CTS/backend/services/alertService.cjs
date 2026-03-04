const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { todayIST, startOfDayUTC } = require('../utils/istUtils.cjs');

class AlertService {
    async createAlert(symbol, alertType, category, direction, price, metadata = {}) {
        try {
            // Prevent duplicate alerts for the same symbol + type + date
            const todayStart = startOfDayUTC(todayIST());

            const existing = await prisma.v5Alert.findFirst({
                where: {
                    symbol,
                    alertType,
                    createdAt: { gte: todayStart }
                }
            });

            if (existing) {
                // Return existing to avoid spam
                return existing;
            }

            const alert = await prisma.v5Alert.create({
                data: {
                    symbol,
                    alertType,
                    category,
                    direction,
                    price,
                    metadata,
                    isRead: false
                }
            });

            console.log(`[AlertService] New Alert: ${alertType} - ${symbol} (${direction || 'N/A'}) @ ${price}`);

            // Telegram Broadcast
            try {
                const telegramService = require('./telegramService.cjs');
                if (alertType === 'SETUP_FORMING') {
                    telegramService.alertSetupForming(symbol, category);
                } else if (alertType === 'BREAKOUT') {
                    telegramService.sendMessage(`🚨 *BREAKOUT ALERT*\nSymbol: *${symbol}*\nCategory: _${category}_\nDirection: ${direction === 'LONG' ? '🟢 LONG' : '🔴 SHORT'}\nPrice: ₹${price.toFixed(2)}\n\nValidating pullback structure...`);
                }
            } catch (e) {
                console.error('[AlertService] Failed to dispatch Telegram alert:', e.message);
            }

            return alert;
        } catch (error) {
            console.error(`[AlertService] Error creating alert:`, error);
        }
    }

    async getTodayAlerts() {
        const todayStart = startOfDayUTC(todayIST());

        return await prisma.v5Alert.findMany({
            where: { createdAt: { gte: todayStart } },
            orderBy: { createdAt: 'desc' }
        });
    }


    async getActiveAlerts() {
        return await prisma.v5Alert.findMany({
            where: { isRead: false },
            orderBy: { createdAt: 'desc' }
        });
    }

    async markAsRead(id) {
        return await prisma.v5Alert.update({
            where: { id: parseInt(id) },
            data: { isRead: true }
        });
    }
}

module.exports = new AlertService();
