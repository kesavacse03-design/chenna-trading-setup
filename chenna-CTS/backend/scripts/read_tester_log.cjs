const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '../../reports/tester_output_today.txt');

if (fs.existsSync(p)) {
    const data = fs.readFileSync(p, 'utf16le');
    console.log(data);
} else {
    console.log("File not found:", p);
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkOldCats() {
    console.log("Checking INTRADAY_BOOST stocks for Feb 2025...");
    const sc = await prisma.stockCategory.findFirst({
        where: {
            category: { key: 'INTRADAY_BOOST' },
            addedDate: { gte: new Date('2025-01-01T00:00:00.000Z'), lte: new Date('2025-03-31T00:00:00.000Z') }
        },
        orderBy: { addedDate: 'asc' }
    });
    console.log('Oldest INTRADAY_BOOST in 2025 Q1:', sc);
    await prisma.$disconnect();
}
checkOldCats().catch(console.error);
