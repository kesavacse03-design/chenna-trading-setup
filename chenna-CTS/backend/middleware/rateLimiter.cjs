// Rate Limiting Middleware
// Protects API endpoints from abuse and excessive requests

const rateLimit = require('express-rate-limit');

// ========== GLOBAL RATE LIMITER ==========
// Applies to all API requests
const globalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute per IP
    message: {
        ok: false,
        error: 'Too many requests, please try again later.',
        retryAfter: '1 minute'
    },
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false,
});

// ========== OPTIMIZATION ENDPOINT LIMITER ==========
// Stricter limit for compute-intensive operations
const optimizationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 optimization requests per hour per IP
    message: {
        ok: false,
        error: 'Optimization limit reached. Please wait before starting another optimization.',
        retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false, // Count all requests
});

// ========== BACKTEST ENDPOINT LIMITER ==========
const backtestLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 backtests per 15 minutes per IP
    message: {
        ok: false,
        error: 'Backtest limit reached. Please wait before running another backtest.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// ========== PRICE DATA LIMITER ==========
// Protects Upstox API from rate limit violations
const priceLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 price requests per minute
    message: {
        ok: false,
        error: 'Price fetch limit reached. Please try again in a minute.',
        retryAfter: '1 minute'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// ========== IMPORT LIMITER ==========
const importLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // 10 imports per 5 minutes
    message: {
        ok: false,
        error: 'Too many stock imports. Please wait before importing more stocks.',
        retryAfter: '5 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// ========== AUTH LIMITER ==========
// Protects login/register endpoints from brute force
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5  login attempts per 15 minutes
    message: {
        ok: false,
        error: 'Too many authentication attempts. Please try again later.',
        retryAfter: '15 minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Only count failed attempts
});

module.exports = {
    globalLimiter,
    optimizationLimiter,
    backtestLimiter,
    priceLimiter,
    importLimiter,
    authLimiter,
};
