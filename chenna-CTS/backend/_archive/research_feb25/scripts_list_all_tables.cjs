const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function listAllTables() {
    console.log('═'.repeat(70));
    console.log('ALL DATABASE TABLES AND STOCK COUNTS');
    console.log('═'.repeat(70));

    // List all tables
    const tables = await p.$queryRaw`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
    `;

    console.log('\n1. ALL TABLES:');
    for (const t of tables) {
        console.log(`   - ${t.table_name}`);
    }

    // Check stock-related tables
    console.log('\n2. STOCK-RELATED TABLE COUNTS:');

    try {
        const stockCount = await p.$queryRaw`SELECT COUNT(*) as count FROM stocks`;
        console.log(`   stocks: ${stockCount[0].count}`);
    } catch (e) { console.log('   stocks: N/A'); }

    try {
        const scCount = await p.$queryRaw`SELECT COUNT(*) as count FROM stock_categories`;
        console.log(`   stock_categories: ${scCount[0].count}`);
    } catch (e) { console.log('   stock_categories: N/A'); }

    try {
        const catCount = await p.$queryRaw`SELECT COUNT(*) as count FROM categories`;
        console.log(`   categories: ${catCount[0].count}`);
    } catch (e) { console.log('   categories: N/A'); }

    // Check for PRE_MARKET specifically
    console.log('\n3. PRE_MARKET STOCKS IN DIFFERENT SOURCES:');

    // stock_categories (the one we found 98 in)
    try {
        const cat = await p.category.findFirst({ where: { key: 'PRE_MARKET' } });
        if (cat) {
            const count = await p.stockCategory.count({ where: { categoryId: cat.id } });
            console.log(`   stock_categories (via Prisma): ${count}`);
        }
    } catch (e) { console.log('   stock_categories: Error'); }

    // Check if there's a stocks table with category field
    try {
        const stocksWithCat = await p.$queryRaw`
            SELECT COUNT(*) as count FROM stocks 
            WHERE category = 'PRE_MARKET' OR "categoryKey" = 'PRE_MARKET'
        `;
        console.log(`   stocks table with PRE_MARKET: ${stocksWithCat[0].count}`);
    } catch (e) {
        // Try different column names
        try {
            const stocksBasic = await p.$queryRaw`SELECT COUNT(*) as count FROM stocks`;
            console.log(`   stocks table total: ${stocksBasic[0].count}`);
        } catch (e2) { }
    }

    // Check schema of stocks table
    console.log('\n4. STOCKS TABLE STRUCTURE:');
    try {
        const columns = await p.$queryRaw`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'stocks'
            ORDER BY ordinal_position
        `;
        for (const col of columns) {
            console.log(`   ${col.column_name}: ${col.data_type}`);
        }
    } catch (e) { console.log('   Error getting schema'); }

    await p.$disconnect();
}

listAllTables().catch(console.error);
