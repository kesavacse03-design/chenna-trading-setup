const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function activate() {
    const result = await prisma.categoryConfig.update({
        where: { categoryKey: 'UPSIDE_LOM_SWING' },
        data: { active: true, analyzed: true }
    });
    console.log('Updated:', result.categoryKey);
    console.log('Active:', result.active, 'Analyzed:', result.analyzed);
}

activate()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
