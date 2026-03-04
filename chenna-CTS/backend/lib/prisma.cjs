/**
 * Shared Prisma Client
 * 
 * This singleton ensures we only have one Prisma connection pool
 * across all services, preventing "Too many database connections" errors.
 */

const { PrismaClient } = require('@prisma/client');

// Create a singleton prisma client
const globalForPrisma = global;

if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
        log: ['warn', 'error'], // Reduce logging
    });
}

const prisma = globalForPrisma.prisma;

module.exports = prisma;
