/**
 * Centralized Upstox API Client
 * 
 * ALL Upstox API calls should go through this module.
 * Tracks: API call count, last call time, token validity, 401 detection.
 * 
 * Usage:
 *   const upstox = require('./upstoxClient.cjs');
 *   const data = await upstox.get('/v2/market-quote/ltp?instrument_key=NSE_EQ|...', token);
 */

const fetch = require('node-fetch');

// ─── Shared State ─────────────────────────────────────────────────────
let apiCallCount = 0;
let lastCallTime = null;
let tokenValid = true;
let lastError = null;
let callsSinceStartup = 0;
const startupTime = new Date();

// ─── Core API Call ────────────────────────────────────────────────────
async function callUpstox(url, token, options = {}) {
    apiCallCount++;
    callsSinceStartup++;
    lastCallTime = new Date();

    const fullUrl = url.startsWith('http') ? url : `https://api.upstox.com${url}`;

    try {
        const response = await fetch(fullUrl, {
            method: options.method || 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`,
                ...(options.headers || {})
            },
            body: options.body || undefined
        });

        // 401 = Token expired
        if (response.status === 401) {
            tokenValid = false;
            lastError = 'UPSTOX_TOKEN_EXPIRED';
            console.error(`[UpstoxClient] ❌ 401 UNAUTHORIZED — Token expired! API call #${apiCallCount}`);
            return { ok: false, status: 401, error: 'UPSTOX_TOKEN_EXPIRED', data: null };
        }

        // 429 = Rate limited
        if (response.status === 429) {
            lastError = 'RATE_LIMITED';
            console.warn(`[UpstoxClient] ⚠️ 429 RATE LIMITED — API call #${apiCallCount}`);
            return { ok: false, status: 429, error: 'RATE_LIMITED', data: null };
        }

        if (!response.ok) {
            lastError = `HTTP_${response.status}`;
            return { ok: false, status: response.status, error: `HTTP ${response.status}`, data: null };
        }

        // Success — token is valid
        tokenValid = true;
        lastError = null;

        const data = await response.json();
        return { ok: true, status: 200, data };

    } catch (err) {
        lastError = err.message;
        console.error(`[UpstoxClient] Network error: ${err.message}`);
        return { ok: false, status: 0, error: err.message, data: null };
    }
}

// ─── Health Report ────────────────────────────────────────────────────
function getHealth() {
    return {
        tokenValid,
        apiCallCount,
        callsSinceStartup,
        lastCallTime: lastCallTime?.toISOString() || null,
        lastError,
        uptimeMinutes: Math.floor((Date.now() - startupTime.getTime()) / 60000)
    };
}

// ─── Reset (e.g., after re-login) ────────────────────────────────────
function resetTokenState() {
    tokenValid = true;
    lastError = null;
    console.log('[UpstoxClient] Token state reset — marked as valid');
}

module.exports = {
    callUpstox,
    getHealth,
    resetTokenState,
    // Direct accessors for quick checks
    isTokenValid: () => tokenValid,
    getCallCount: () => apiCallCount
};
