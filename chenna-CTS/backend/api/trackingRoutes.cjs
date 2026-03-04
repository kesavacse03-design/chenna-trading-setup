const express = require('express');
const router = express.Router();
const monitorService = require('../services/intradayMonitorService.cjs');

// GET /api/tracking/intraday-status
router.get('/intraday-status', (req, res) => {
    try {
        const status = monitorService.getStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/tracking/intraday-start
router.post('/intraday-start', (req, res) => {
    try {
        monitorService.start();
        res.json({ success: true, message: 'Intraday Monitor started' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/tracking/intraday-stop
router.post('/intraday-stop', (req, res) => {
    try {
        monitorService.stop();
        res.json({ success: true, message: 'Intraday Monitor stopped' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
