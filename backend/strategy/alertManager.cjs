// Alerting system for live trading metrics
class AlertManager {
  constructor() {
    this.alerts = new Map(); // alertId -> { condition, threshold, message, lastTriggered }
    this.notifications = []; // Recent notifications
    this.emailEnabled = process.env.ALERT_EMAIL ? true : false;
    this.emailTo = process.env.ALERT_EMAIL;
  }

  // Add an alert condition
  addAlert(id, condition, threshold, message) {
    this.alerts.set(id, {
      condition,
      threshold,
      message,
      lastTriggered: 0
    });
  }

  // Check metrics against alerts
  checkAlerts(metrics) {
    const now = Date.now();
  const triggered = [];

    for (const [id, alert] of this.alerts) {
      const { condition, threshold, message, lastTriggered } = alert;

      // Throttle alerts to once per 5 minutes
      if (now - lastTriggered < 5 * 60 * 1000) continue;

    let isTrig = false;
      switch (condition) {
        case 'drawdown_percent >':
      if (metrics.live_drawdown_percent > threshold) isTrig = true;
          break;
        case 'error_rate >':
      if (metrics.live_errors_total > threshold) isTrig = true;
          break;
        case 'exposure >':
      if (metrics.live_exposure_current > threshold) isTrig = true;
          break;
        case 'stopped':
      if (metrics.live_is_stopped) isTrig = true;
          break;
      }

    if (isTrig) {
        const notification = {
          id,
          message: message.replace('{value}', metrics[condition.split(' ')[0]] || threshold),
          timestamp: now,
          level: 'CRITICAL'
        };

        this.notifications.unshift(notification);
        this.notifications = this.notifications.slice(0, 10); // Keep last 10

        alert.lastTriggered = now;

        // Send email if configured
        if (this.emailEnabled) {
          this.sendEmail(notification);
        }

  triggered.push(notification);
      }
    }

    return triggered;
  }

  // Send email notification (mock implementation)
  async sendEmail(notification) {
    console.log(`📧 ALERT EMAIL to ${this.emailTo}: ${notification.message}`);

    // In production, integrate with email service like SendGrid, SES, etc.
    // For now, just log it
  }

  // Get recent notifications
  getNotifications() {
    return this.notifications;
  }

  // Setup default alerts
  setupDefaultAlerts() {
    this.addAlert('high_drawdown', 'drawdown_percent >', 5, 'High drawdown detected: {value}%');
    this.addAlert('circuit_breaker', 'error_rate >', 10, 'High error rate: {value} errors');
    this.addAlert('exposure_limit', 'exposure >', 50000, 'Exposure limit exceeded: ₹{value}');
    this.addAlert('trading_stopped', 'stopped', true, 'Live trading has been stopped');
  }
}

module.exports = { AlertManager };
