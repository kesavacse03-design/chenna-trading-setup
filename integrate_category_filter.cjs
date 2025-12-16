const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'chenna-CTS/backend/strategy/timeTravelEngine.cjs');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add import for CategoryFilteredCatalogue at the top
const oldImports = `const { CATEGORY_CONFIRMATION_RULES } = require('../config/labsCategoryRules.cjs');`;
const newImports = `const { CATEGORY_CONFIRMATION_RULES } = require('../config/labsCategoryRules.cjs');
const { CategoryFilteredCatalogue } = require('./categoryFilteredCatalogue.cjs');`;

if (content.includes(oldImports) && !content.includes('CategoryFilteredCatalogue')) {
    content = content.replace(oldImports, newImports);
    console.log('✅ Added CategoryFilteredCatalogue import');
} else {
    console.log('⚠️ Import already present or pattern not found');
}

// 2. Modify runTimeTravelBacktest to rebuild catalogue based on category
// Find the line where logicCatalogue is used and rebuild it for the category
const oldCatalogueUsage = `console.log(\`📊 Testing \${stocks.length} stocks \${quickMode ? \`(QUICK MODE - \${stockCount} of \${allStocks.length})\` : '(FULL MODE)'}\\n\`);`;

const newCatalogueUsage = `console.log(\`📊 Testing \${stocks.length} stocks \${quickMode ? \`(QUICK MODE - \${stockCount} of \${allStocks.length})\` : '(FULL MODE)'}\\n\`);

        // ✅ NEW: Rebuild logic catalogue for this specific category
        // Only tests relevant strategy families (e.g., exhaustion for DOWNSIDE_LOM_SWING)
        this.logicCatalogue = CategoryFilteredCatalogue.buildForCategory(categoryKey);`;

if (content.includes('📊 Testing') && !content.includes('buildForCategory')) {
    content = content.replace(oldCatalogueUsage, newCatalogueUsage);
    console.log('✅ Added category-filtered catalogue rebuild');
} else {
    console.log('⚠️ Category filter already present or pattern not found');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ timeTravelEngine.cjs updated with category filtering');
