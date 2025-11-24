// JWT Authentication Service
// Handles token generation, validation, and user authentication

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

class AuthService {
    constructor() {
        // Use environment variable or default secret (change in production!)
        this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
        this.jwtExpiry = process.env.JWT_EXPIRY || '24h';
        this.saltRounds = 10;
    }

    // ========== PASSWORD HASHING ==========

    async hashPassword(password) {
        try {
            const hash = await bcrypt.hash(password, this.saltRounds);
            return hash;
        } catch (error) {
            throw new Error('Password hashing failed: ' + error.message);
        }
    }

    async comparePassword(password, hash) {
        try {
            return await bcrypt.compare(password, hash);
        } catch (error) {
            throw new Error('Password comparison failed: ' + error.message);
        }
    }

    // ========== TOKEN GENERATION ==========

    generateToken(payload) {
        try {
            const token = jwt.sign(payload, this.jwtSecret, {
                expiresIn: this.jwtExpiry,
            });
            return token;
        } catch (error) {
            throw new Error('Token generation failed: ' + error.message);
        }
    }

    // ========== TOKEN VALIDATION ==========

    verifyToken(token) {
        try {
            const decoded = jwt.verify(token, this.jwtSecret);
            return { valid: true, payload: decoded };
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return { valid: false, error: 'Token expired' };
            }
            if (error.name === 'JsonWebTokenError') {
                return { valid: false, error: 'Invalid token' };
            }
            return { valid: false, error: error.message };
        }
    }

    // ========== USER CREATION ==========

    async createUser(email, password, role = 'USER') {
        try {
            // Hash password
            const passwordHash = await this.hashPassword(password);

            // Return user data (caller should save to database)
            return {
                email,
                passwordHash,
                role,
                createdAt: new Date(),
            };
        } catch (error) {
            throw new Error('User creation failed: ' + error.message);
        }
    }

    // ========== LOGIN ==========

    async login(user, password) {
        try {
            // Verify password
            const isValid = await this.comparePassword(password, user.passwordHash);

            if (!isValid) {
                return { success: false, error: 'Invalid credentials' };
            }

            // Generate token
            const token = this.generateToken({
                id: user.id,
                email: user.email,
                role: user.role,
            });

            return {
                success: true,
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                },
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // ========== API KEY GENERATION ==========

    generateApiKey() {
        // Generate a random API key for automation/bots
        const crypto = require('crypto');
        const apiKey = crypto.randomBytes(32).toString('hex');
        return apiKey;
    }

    async hashApiKey(apiKey) {
        // Hash API key before storing in database
        return await this.hashPassword(apiKey);
    }

    async verifyApiKey(apiKey, hash) {
        // Verify API key against stored hash
        return await this.comparePassword(apiKey, hash);
    }
}

// Singleton instance
const authService = new AuthService();

module.exports = authService;
