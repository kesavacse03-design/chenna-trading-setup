const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
    const run = await p.backtestRun.findUnique({
        where: { id: 'daa8fc1e-cb02-463b-a2be-116aa5adf8234' }
    });
    console.log('Run Status:', run ? run.status : 'Not found');
    await p.$disconnect();
})();
