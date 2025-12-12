/**
 * Telegram API Routes
 * Phase 13
 */

const express = require('express');
const router = express.Router();
const telegramService = require('../services/telegramService.cjs');

// Configure Telegram
router.post('/config', (req, res) => {
    try {
        const { botToken, chatId } = req.body;
        const result = telegramService.configureTelegram(botToken, chatId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Test Telegram connection
router.post('/test', async (req, res) => {
    try {
        const result = await telegramService.testTelegram();
        res.json(result);
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Send custom message
router.post('/send', async (req, res) => {
    try {
        const { message } = req.body;
        const result = await telegramService.sendTelegramMessage(message);
        res.json(result);
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
});

// Get current configuration
router.get('/config', (req, res) => {
    const config = telegramService.getConfig();
    res.json({
        ok: true,
        enabled: config.enabled,
        configured: !!(config.botToken && config.chatId)
    });
});

module.exports = router;
