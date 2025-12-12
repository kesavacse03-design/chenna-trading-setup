const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function checkV1Strategy() {
    try {
        console.log('=== CHECKING V1 STRATEGY IN DATABASE ===\n');

        const v1 = await prisma.strategy.findFirst({
            where: {
                categoryKey: 'DOWNSIDE_LOM_SWING',
                version: 'V1'
            }
        });

        if (v1) {
            console.log('✅ V1 STRATEGY FOUND!\n');
            console.log('Version:', v1.version);
            console.log('Description:', v1.description);
            console.log('\n=== STRATEGY PARAMS ===');
            console.log(JSON.stringify(v1.params, null, 2));
            console.log('\n=== METRICS ===');
            console.log(JSON.stringify(v1.metrics, null, 2));
        } else {
            console.log('❌ NO V1 STRATEGY FOUND');
            console.log('   This means Promote button has NOT been clicked yet');
        }

        await prisma.$disconnect();
    } catch (error) {
        console.error('Error:', error);
        await prisma.$disconnect();
        process.exit(1);
    }
}

checkV1Strategy();
