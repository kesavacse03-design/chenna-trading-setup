const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanup() {
    try {
        // Delete all Labs runs
        const deleted = await prisma.labsRun.deleteMany();
        console.log(`✅ Deleted ${deleted.count} Labs runs`);

        // Check current state
        const remaining = await prisma.labsRun.count();
        console.log(`📊 Remaining Labs runs: ${remaining}`);

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

cleanup();
