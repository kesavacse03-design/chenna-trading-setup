const categoryController = require('../chenna-CTS/backend/services/categoryController.cjs');

async function audit() {
    const TEST_KEY = 'PRE_MARKET';

    try {
        console.log(`🔍 Auditing Controller Logic for ${TEST_KEY}...`);

        // 1. Check Initial State
        let initial = await categoryController.getCategory(TEST_KEY);
        console.log(`Initial State: Enabled=${initial.enabled}, Scanning=${initial.scanningEnabled}`);

        // 2. Disable Category
        console.log('🔻 Disabling Category...');
        await categoryController.updateCategoryStatus(TEST_KEY, { enabled: false, scanningEnabled: false });

        // 3. Verify Disabled
        let disabled = await categoryController.getCategory(TEST_KEY);
        let isActive = await categoryController.isCategoryActive(TEST_KEY);
        console.log(`Disabled State: Enabled=${disabled.enabled}, Active=${isActive}`);

        if (isActive === true || disabled.enabled === true) {
            console.error('❌ FAILED to disable category!');
            process.exit(1);
        }

        // 4. Enable Category
        console.log('🔺 Enabling Category...');
        await categoryController.updateCategoryStatus(TEST_KEY, { enabled: true, scanningEnabled: true });

        // 5. Verify Enabled
        let enabled = await categoryController.getCategory(TEST_KEY);
        isActive = await categoryController.isCategoryActive(TEST_KEY);
        console.log(`Enabled State: Enabled=${enabled.enabled}, Active=${isActive}`);

        if (isActive === false || enabled.enabled === false) {
            console.error('❌ FAILED to enable category!');
            process.exit(1);
        }

        console.log('✅ Controller Logic Audit PASSED!');
        process.exit(0);

    } catch (e) {
        console.error('❌ Error:', e);
        process.exit(1);
    }
}

audit();
