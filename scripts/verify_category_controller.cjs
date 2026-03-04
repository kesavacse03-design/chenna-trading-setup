const categoryController = require('../chenna-CTS/backend/services/categoryController.cjs');

async function verify() {
    try {
        console.log('Testing CategoryController standalone...');
        const categories = await categoryController.getAllCategories();

        console.log(`Found ${categories.length} categories.`);
        const cat = categories[0];
        console.log('Sample:', JSON.stringify(cat, null, 2));

        if (cat.enabled !== undefined && cat.scanningEnabled !== undefined) {
            console.log('✅ Controller Logic Verified! Control fields present.');
            process.exit(0);
        } else {
            console.error('❌ Controller Logic Failed! Missing fields.');
            process.exit(1);
        }

    } catch (e) {
        console.error('❌ Error:', e);
        process.exit(1);
    }
}

verify();
