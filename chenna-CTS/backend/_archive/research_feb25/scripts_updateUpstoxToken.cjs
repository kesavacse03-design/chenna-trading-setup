#!/usr/bin/env node
/**
 * Simple Upstox Token Updater
 * Updates the access token in auth/tokens.json
 */

const fs = require('fs').promises;
const path = require('path');

const TOKENS_PATH = path.join(__dirname, '../auth/tokens.json');

async function updateToken() {
    console.log('🔧 Upstox Token Updater\n');

    try {
        // Read current tokens
        let tokens = {};
        try {
            const data = await fs.readFile(TOKENS_PATH, 'utf8');
            tokens = JSON.parse(data);
            console.log('Current token:', tokens.access_token ? tokens.access_token.substring(0, 30) + '...' : 'NOT SET');
        } catch (err) {
            console.log('❌ No existing tokens file found');
            tokens = {};
        }

        // Check if new token provided as argument
        const newToken = process.argv[2];

        if (!newToken || newToken.length < 20) {
            console.log('\n📝 Usage:');
            console.log('   node scripts/updateUpstoxToken.cjs YOUR_NEW_ACCESS_TOKEN\n');
            console.log('To get a new token:');
            console.log(' 1. Go to: https://api-v2.upstox.com/');
            console.log('2. Login with your Upstox account');
            console.log('3. Navigate to "API Keys" or "Access Token"');
            console.log('4. Generate a new access token');
            console.log('5. Copy the token and run this script with it\n');

            if (tokens.access_token) {
                console.log('Current token status: ✅ EXISTS (may be expired)');
            } else {
                console.log('Current token status: ❌ NOT SET');
            }

            return;
        }

        // Update token
        tokens.access_token = newToken;
        tokens.updated_at = new Date().toISOString();

        // Ensure auth directory exists
        const authDir = path.join(__dirname, '../auth');
        try {
            await fs.mkdir(authDir, { recursive: true });
        } catch (err) {
            // Directory already exists
        }

        // Save updated tokens
        await fs.writeFile(TOKENS_PATH, JSON.stringify(tokens, null, 2));

        console.log('✅ Token updated successfully!');
        console.log('Updated at:', tokens.updated_at);
        console.log('\n🚀 Please restart your backend server:');
        console.log('   1. Stop current server (Ctrl+C in the terminal running npm run dev)');
        console.log('   2. Run: npm run dev');
        console.log('\nAfter restart, the new token will be used for all price fetching!');

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

updateToken();
