/**
 * Market Hours Utility - NSE Trading Hours
 * Detects if NSE market is open for smart price fetching
 */

class MarketHours {
    constructor() {
        // NSE trading: Mon-Fri, 9:15 AM - 3:30 PM IST
        this.marketOpen = { hour: 9, minute: 15 };
        this.marketClose = { hour: 15, minute: 30 };

        // 2025 NSE holidays (simplified list)
        this.holidays = [
            '2025-01-26', '2025-03-14', '2025-04-10', '2025-04-18',
            '2025-05-01', '2025-08-15', '2025-10-02', '2025-11-01',
            '2025-12-25'
        ];
    }

    isMarketOpen() {
        const now = new Date();
        const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

        // Weekend check
        const day = ist.getDay();
        if (day === 0 || day === 6) {
            return { open: false, reason: 'WEEKEND' };
        }

        // Holiday check
        const dateStr = ist.toISOString().split('T')[0];
        if (this.holidays.includes(dateStr)) {
            return { open: false, reason: 'HOLIDAY' };
        }

        // Trading hours check
        const hour = ist.getHours();
        const minute = ist.getMinutes();
        const currentMinutes = hour * 60 + minute;
        const openMinutes = this.marketOpen.hour * 60 + this.marketOpen.minute;
        const closeMinutes = this.marketClose.hour * 60 + this.marketClose.minute;

        if (currentMinutes < openMinutes) {
            return { open: false, reason: 'PRE_MARKET' };
        }

        if (currentMinutes >= closeMinutes) {
            return { open: false, reason: 'POST_MARKET' };
        }

        return { open: true, reason: 'TRADING_HOURS' };
    }

    getMarketStatusMessage() {
        const status = this.isMarketOpen();

        if (status.open) {
            return {
                status: 'OPEN',
                message: 'Market is open',
                color: 'green',
                isOpen: true
            };
        }

        let message = '';
        switch (status.reason) {
            case 'WEEKEND': message = 'Market closed (Weekend)'; break;
            case 'HOLIDAY': message = 'Market closed (Holiday)'; break;
            case 'PRE_MARKET': message = 'Market closed (Pre-market)'; break;
            case 'POST_MARKET': message = 'Market closed (After hours)'; break;
            default: message = 'Market closed';
        }

        return {
            status: 'CLOSED',
            message,
            color: 'blue',
            isOpen: false
        };
    }
}

module.exports = new MarketHours();
