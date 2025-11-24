// Structured Logging Service
// Winston-based logger with file rotation and multiple transports

const winston = require('winston');
const path = require('path');

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Console format (human-readable)
const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
    })
);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
const fs = require('fs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Create logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: 'trading-system' },
    transports: [
        // Error logs - separate file
        new winston.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),

        // Combined logs - all levels
        new winston.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 10,
        }),
    ],
});

// Add console transport in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: consoleFormat,
    }));
}

// Add daily rotation for production
if (process.env.NODE_ENV === 'production') {
    const DailyRotateFile = require('winston-daily-rotate-file');

    logger.add(new DailyRotateFile({
        filename: path.join(logsDir, 'application-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '14d', // Keep logs for 14 days
    }));
}

// Create a stream object for Morgan (HTTP logging)
logger.stream = {
    write: (message) => {
        logger.info(message.trim());
    },
};

// Helper methods for common logging patterns
logger.logRequest = (req) => {
    logger.info('HTTP Request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('user-agent'),
    });
};

logger.logBacktest = (jobId, category, status, duration) => {
    logger.info('Backtest', {
        jobId,
        category,
        status,
        duration,
    });
};

logger.logOptimization = (jobId, category, combinations, duration, bestAccuracy) => {
    logger.info('Optimization', {
        jobId,
        category,
        combinations,
        duration,
        bestAccuracy,
    });
};

logger.logTrade = (symbol, action, price, quantity) => {
    logger.info('Trade', {
        symbol,
        action,
        price,
        quantity,
        timestamp: new Date().toISOString(),
    });
};

logger.logSignal = (symbol, category, signal, confidence) => {
    logger.info('Signal Detected', {
        symbol,
        category,
        signal,
        confidence,
    });
};

logger.logError = (error, context = {}) => {
    logger.error(error.message, {
        stack: error.stack,
        ...context,
    });
};

module.exports = logger;
