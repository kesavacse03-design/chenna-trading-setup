/**
 * Cookie-based Tredcode Sync Solution
 * 
 * Since Google blocks Puppeteer automated logins, this script:
 * 1. Uses cookies from your normal Chrome browser session
 * 2. Injects those cookies into Puppeteer
 * 3. Fetches data without needing to login
 * 
 * USAGE:
 * Step 1: Login to tredcode.tradingcafeindia.com in your normal Chrome
 * Step 2: Run: node scripts/export_tredcode_cookies.cjs
 * Step 3: Then run: npm run dev (cookies will be used automatically)
 */

const fs = require('fs');
const path = require('path');

// Path to Chrome's Cookies database - Windows
const CHROME_COOKIES_PATH = path.join(
    process.env.LOCALAPPDATA,
    'Google', 'Chrome', 'User Data', 'Default', 'Network', 'Cookies'
);

const COOKIES_OUTPUT_FILE = path.join(__dirname, '..', 'auth', 'tredcode_cookies.json');

async function exportCookies() {
    console.log('📦 Exporting tredcode cookies from Chrome...\n');

    // Check if Chrome cookies file exists
    if (!fs.existsSync(CHROME_COOKIES_PATH)) {
        console.log('❌ Chrome cookies file not found at:');
        console.log(`   ${CHROME_COOKIES_PATH}`);
        console.log('\nAlternative: Copy cookies manually using browser DevTools:');
        console.log('1. Open tredcode.tradingcafeindia.com in Chrome');
        console.log('2. Open DevTools (F12) → Application → Cookies');
        console.log('3. Copy all cookies for tredcode domain');
        console.log('4. Save as JSON to:', COOKIES_OUTPUT_FILE);
        return;
    }

    console.log('⚠️  Chrome stores cookies in an encrypted SQLite database.');
    console.log('   For security reasons, we cannot directly read them.\n');
    console.log('📋 MANUAL STEPS TO EXPORT COOKIES:\n');

    console.log('Option 1: Use "EditThisCookie" Chrome Extension');
    console.log('   1. Install "EditThisCookie" from Chrome Web Store');
    console.log('   2. Go to tredcode.tradingcafeindia.com');
    console.log('   3. Click the cookie icon → Export as JSON');
    console.log('   4. Save to:', COOKIES_OUTPUT_FILE);

    console.log('\nOption 2: Using DevTools Console');
    console.log('   1. Open tredcode.tradingcafeindia.com in Chrome');
    console.log('   2. Login with Google');
    console.log('   3. Open DevTools (F12) → Console');
    console.log('   4. Run this command:');
    console.log(`
   copy(document.cookie.split(';').map(c => {
       const [name, value] = c.trim().split('=');
       return { name, value, domain: '.tradingcafeindia.com' };
   }));
`);
    console.log('   5. Paste into a file at:', COOKIES_OUTPUT_FILE);

    // Create auth directory if it doesn't exist
    const authDir = path.dirname(COOKIES_OUTPUT_FILE);
    if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
        console.log('\n✅ Created auth directory:', authDir);
    }

    console.log('\n📁 Expected cookie format (JSON array):');
    console.log(`[
  { "name": "session_id", "value": "abc123", "domain": ".tradingcafeindia.com" },
  { "name": "user_token", "value": "xyz789", "domain": ".tradingcafeindia.com" }
]`);
}

exportCookies().catch(console.error);
