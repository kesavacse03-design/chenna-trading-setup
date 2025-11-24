// Authentication Middleware
// Protects routes with JWT token validation and role-based access control

const authService = require('../auth/authService.cjs');
const logger = require('../utils/logger.cjs');

// ========== JWT AUTH MIDDLEWARE ==========

const authenticate = async (req, res, next) => {
    try {
        //  Get token from header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                ok: false,
                error: 'No token provided. Please include Bearer token in Authorization header.',
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify token
        const result = authService.verifyToken(token);

        if (!result.valid) {
            logger.warn('Invalid token attempt', { error: result.error, ip: req.ip });
            return res.status(401).json({
                ok: false,
                error: result.error || 'Invalid token',
            });
        }

        // Attach user info to request
        req.user = result.payload;
        next();
    } catch (error) {
        logger.error('Authentication error', { error: error.message, ip: req.ip });
        return res.status(500).json({
            ok: false,
            error: 'Authentication failed',
        });
    }
};

// ========== OPTIONAL AUTH (for public endpoints that benefit from auth) ==========

const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const result = authService.verifyToken(token);

            if (result.valid) {
                req.user = result.payload;
            }
        }

        // Continue regardless of auth success
        next();
    } catch (error) {
        // Silently continue if optional auth fails
        next();
    }
};

// ========== ROLE-BASED ACCESS CONTROL ==========

const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                ok: false,
                error: 'Authentication required',
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            logger.warn('Unauthorized access attempt', {
                user: req.user.email,
                role: req.user.role,
                requiredRoles: allowedRoles,
                path: req.path,
            });

            return res.status(403).json({
                ok: false,
                error: 'Insufficient permissions',
            });
        }

        next();
    };
};

// ========== API KEY MIDDLEWARE ==========

const apiKeyAuth = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];

        if (!apiKey) {
            return res.status(401).json({
                ok: false,
                error: 'API key required. Include X-API-Key header.',
            });
        }

        // TODO: Verify API key against database
        // For now, just accept any key (implement database check in production)

        req.apiKey = apiKey;
        next();
    } catch (error) {
        logger.error('API key auth error', { error: error.message });
        return res.status(500).json({
            ok: false,
            error: 'API key verification failed',
        });
    }
};

// ========== DEVELOPMENT MODE BYPASS ==========
// WARNING: Only use in development!

const devBypass = (req, res, next) => {
    if (process.env.NODE_ENV === 'development' || process.env.BYPASS_AUTH === 'true') {
        // In development, create a mock user
        req.user = {
            id: 1,
            email: 'dev@localhost',
            role: 'ADMIN',
        };
        return next();
    }

    // In production, require actual auth
    return authenticate(req, res, next);
};

module.exports = {
    authenticate,
    optionalAuth,
    requireRole,
    apiKeyAuth,
    devBypass,
};
