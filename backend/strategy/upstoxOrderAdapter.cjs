const fetch = require('node-fetch');
const { TokenManager } = require('./tokenManager.cjs');

// UpstoxOrderAdapter: Production adapter for order execution with dry-run support
class UpstoxOrderAdapter {
  constructor(apiBase = null, accessToken = null) {
    // Support staging vs production environments
    this.isStaging = process.env.UPSTOX_ENV === 'staging';
    this.apiBase = apiBase || 'https://api.upstox.com';
    this.accessToken = accessToken || process.env.UPSTOX_ACCESS_TOKEN;
    this.apiKey = process.env.UPSTOX_API_KEY;
    this.apiSecret = process.env.UPSTOX_API_SECRET;
    this.dryRun = process.env.DRY_RUN === '1';
  this.allowLive = process.env.ALLOW_LIVE === '1';
  this.tokenManager = new TokenManager();
  }

  // Ensure access token (reuse logic from server.cjs if needed)
  async ensureToken() {
    if (this.accessToken) return this.accessToken;

    // Try to get from environment
    if (process.env.UPSTOX_ACCESS_TOKEN) {
      this.accessToken = process.env.UPSTOX_ACCESS_TOKEN;
      return this.accessToken;
    }

    // Try encrypted token store
    try {
      const t = this.tokenManager.loadToken();
      if (t) { this.accessToken = t; return this.accessToken; }
    } catch (e) {
      // surface later only if needed
    }

    // For staging, we might need to authenticate
    if (this.isStaging && this.apiKey && this.apiSecret) {
      return await this.authenticateStaging();
    }

    throw new Error('Access token not provided. Set UPSTOX_ACCESS_TOKEN environment variable');
  }

  // Refresh access token using refresh_token
  async refreshToken() {
    // Simulation mode for CI: bypass network
    if (process.env.SIMULATE_UPSTOX === '1') {
      const tm = this.tokenManager;
      const currentRefresh = tm.loadRefreshToken() || 'sim-refresh';
      const newAccess = `refreshed-${Date.now()}`;
      tm.saveTokens(newAccess, currentRefresh);
      this.accessToken = newAccess;
      console.log('[UPSTOX] (sim) Token refreshed');
      return newAccess;
    }

    const refreshToken = this.tokenManager.loadRefreshToken();
    if (!refreshToken) throw new Error('No refresh_token available');

    const url = `${this.apiBase}/v2/login/refresh-token`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.apiKey,
        client_secret: this.apiSecret
      })
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const newAccessToken = data.access_token;
    const newRefreshToken = data.refresh_token; // Upstox returns new refresh_token

    // Save the new tokens
    this.tokenManager.saveTokens(newAccessToken, newRefreshToken);
    this.accessToken = newAccessToken;
    console.log('[UPSTOX] Token refreshed successfully');
    return newAccessToken;
  }

  // Authenticate with Upstox staging (simplified - in production use proper OAuth flow)
  async authenticateStaging() {
    try {
      const authUrl = `${this.apiBase}/login/authorization/dialog`;
      const response = await fetch(authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: this.apiKey,
          redirect_uri: 'http://localhost:3000/callback', // staging callback
          response_type: 'code'
        })
      });

      if (!response.ok) {
        throw new Error(`Auth failed: ${response.statusText}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      return this.accessToken;
    } catch (error) {
      console.error('[UPSTOX] Staging auth error:', error.message);
      throw error;
    }
  }

  // Submit order: safe send with retries
  async submit(order, priorCandles = [], currentCandle = null) {
    const { side, qty, type, symbol, price, stopPrice, targetPrice } = order;
    const instrumentKey = String(order.instrument_key || order.instrumentKey || order.instrument_token || order.instrumentToken || '').trim();
    // Dry-run: do not hit broker, synthesize immediate fill at current price
    if (this.dryRun) {
      const fillPrice = price || (currentCandle ? currentCandle.close : 100);
      return {
        orderId: `dry-${Date.now()}`,
        symbol,
        side,
        qty,
        price: fillPrice,
        ts: new Date().toISOString(),
        status: 'filled'
      };
    }
    // Simulation mode for CI: force a refresh path then return fake fill
    if (process.env.SIMULATE_UPSTOX === '1') {
      let token = await this.ensureToken();
      if (!this._simAuthOnce) {
        this._simAuthOnce = true;
        console.log('[UPSTOX] (sim) Forcing 401 then refreshing...');
        await this.refreshToken();
        token = this.accessToken;
      }
      const fillPrice = price || (currentCandle ? currentCandle.close : 100);
      return {
        orderId: `sim-${Date.now()}`,
        symbol,
        side,
        qty,
        price: fillPrice,
        ts: new Date().toISOString(),
        status: 'filled'
      };
    }

    // Real execution (guarded)
  if (!this.allowLive) throw new Error('live-trading-guard: ALLOW_LIVE=1 required');
  if (!symbol && !instrumentKey) throw new Error('instrument missing: symbol or instrument_key required');
    if (!qty || qty <= 0) throw new Error('invalid qty');
    if (!type) throw new Error('order type required');
    const token = await this.ensureToken();
    const orderPayload = {
      quantity: qty,
      product: 'D', // Delivery; adjust as needed
      validity: 'DAY',
      price: type === 'limit' ? price : 0,
      tag: 'live-trader',
      instrument_token: instrumentKey || symbol, // Prefer instrument_key
      order_type: type.toUpperCase(),
      transaction_type: side.toUpperCase(),
      disclosed_quantity: 0,
      trigger_price: stopPrice || 0,
      is_amo: false
    };

    const url = `${this.apiBase}/v2/order/place`;
    let attempts = 3;
    let retriedAuth = false;
    while (attempts > 0) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(orderPayload)
        });
        if (res.ok) {
          const data = await res.json();
          const orderId = data.order_id;
          // Poll for fill confirmation
          return await this.pollForFill(orderId, symbol, side, qty);
        } else {
          if ((res.status === 401 || res.status === 403) && !retriedAuth) {
            // Try refresh token first
            try {
              await this.refreshToken();
              token = this.accessToken;
              retriedAuth = true;
              continue;
            } catch (refreshErr) {
              console.error(`Token refresh failed: ${refreshErr.message}`);
              // Fall back to clearing and reloading
              this.accessToken = null;
              try { token = await this.ensureToken(); retriedAuth = true; continue; } catch(_) {}
            }
          }
          const err = await res.text();
          console.error(`Order submit failed: ${res.status} ${err}`);
          if (res.status >= 500) {
            attempts--;
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
          throw new Error(`Order submit error: ${err}`);
        }
      } catch (e) {
        console.error(`Order submit exception: ${e.message}`);
        attempts--;
        if (attempts === 0) throw e;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  // Cancel order
  async cancel(orderId) {
    if (this.dryRun) {
      console.log(`[DRY-RUN] Cancel order: ${orderId}`);
      return { orderId, status: 'cancelled' };
    }

    const token = await this.ensureToken();
    const url = `${this.apiBase}/v2/order/cancel`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ order_id: orderId })
    });
    if (res.ok) {
      return { orderId, status: 'cancelled' };
    } else {
      const err = await res.text();
      throw new Error(`Cancel error: ${err}`);
    }
  }

  // Replace/modify order
  async replace(orderId, newOrder) {
    if (this.dryRun) {
      console.log(`[DRY-RUN] Replace order: ${orderId} with ${JSON.stringify(newOrder)}`);
      return { orderId, status: 'modified' };
    }

    const token = await this.ensureToken();
    const url = `${this.apiBase}/v2/order/modify`;
    const modifyPayload = {
      order_id: orderId,
      quantity: newOrder.qty,
      price: newOrder.price || 0,
      order_type: newOrder.type.toUpperCase(),
      trigger_price: newOrder.stopPrice || 0
    };
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(modifyPayload)
    });
    if (res.ok) {
      return { orderId, status: 'modified' };
    } else {
      const err = await res.text();
      throw new Error(`Modify error: ${err}`);
    }
  }

  // Poll for fill confirmation (simplified)
  async pollForFill(orderId, symbol, side, qty) {
    let token = await this.ensureToken();
    const url = `${this.apiBase}/v2/order/history?order_id=${orderId}`;
    for (let i = 0; i < 10; i++) { // poll up to 10 times
      await new Promise(r => setTimeout(r, 1000));
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const order = data[0]; // assume first
        if (order.order_status === 'complete') {
          return {
            orderId,
            symbol,
            side,
            qty,
            price: order.average_price,
            ts: order.order_timestamp,
            status: 'filled'
          };
        }
      } else if (res.status === 401 || res.status === 403) {
        // Attempt token refresh and retry immediately in next loop
        try {
          await this.refreshToken();
          token = this.accessToken;
        } catch (refreshErr) {
          console.error(`Token refresh failed in poll: ${refreshErr.message}`);
          this.accessToken = null;
          token = await this.ensureToken();
        }
      }
    }
    throw new Error(`Order ${orderId} did not fill within timeout`);
  }
}

module.exports = { UpstoxOrderAdapter };
