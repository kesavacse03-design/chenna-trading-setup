#!/usr/bin/env node

// Staging deployment script for live trading system
// Usage: node scripts/staging-deploy.cjs

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Starting Staging Deployment...');

// Load staging environment
const envPath = path.join(__dirname, '..', '.env.staging');
if (fs.existsSync(envPath)) {
  console.log('📄 Loading staging environment from .env.staging');
  require('dotenv').config({ path: envPath });
} else {
  console.log('⚠️  .env.staging not found. Using environment variables.');
}

// Validate required environment variables
const required = ['UPSTOX_API_KEY', 'UPSTOX_ACCESS_TOKEN'];
const missing = required.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.error('❌ Missing required environment variables:', missing.join(', '));
  console.error('Please set them in .env.staging or environment');
  process.exit(1);
}

console.log('✅ Environment validation passed');
console.log(`🌍 Environment: ${process.env.UPSTOX_ENV || 'production'}`);
console.log(`🔒 Dry Run: ${process.env.DRY_RUN === '1' ? 'ENABLED' : 'DISABLED'}`);

// Start the live runner
console.log('🎯 Starting Live Runner...');

const liveRunner = spawn('node', ['backend/strategy/liveRunner.cjs'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'staging' }
});

liveRunner.on('close', (code) => {
  console.log(`Live Runner exited with code ${code}`);
});

liveRunner.on('error', (err) => {
  console.error('Failed to start Live Runner:', err);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down staging deployment...');
  liveRunner.kill('SIGINT');
  process.exit(0);
});

console.log('✅ Staging deployment active. Press Ctrl+C to stop.');
