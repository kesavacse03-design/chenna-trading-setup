#!/usr/bin/env node

// Gradual rollout manager for live trading system
// Usage: node scripts/rollout-manager.cjs [phase]

const fs = require('fs');
const path = require('path');

const PHASES = {
  canary: {
    name: 'Canary',
    description: 'Dry-run mode with minimal exposure',
    config: {
      DRY_RUN: '1',
      CANARY_MODE: '1',
      MAX_ORDERS_PER_HOUR: 5,
      MAX_POSITION_SIZE: 500,
      CIRCUIT_BREAKER_THRESHOLD: 2
    }
  },
  pilot: {
    name: 'Pilot',
    description: 'Real orders with very low limits',
    config: {
      DRY_RUN: '0',
      CANARY_MODE: '0',
      MAX_ORDERS_PER_HOUR: 10,
      MAX_POSITION_SIZE: 1000,
      CIRCUIT_BREAKER_THRESHOLD: 3
    }
  },
  limited: {
    name: 'Limited Production',
    description: 'Real trading with conservative limits',
    config: {
      DRY_RUN: '0',
      CANARY_MODE: '0',
      MAX_ORDERS_PER_HOUR: 50,
      MAX_POSITION_SIZE: 5000,
      CIRCUIT_BREAKER_THRESHOLD: 5
    }
  },
  full: {
    name: 'Full Production',
    description: 'Full live trading with standard limits',
    config: {
      DRY_RUN: '0',
      CANARY_MODE: '0',
      MAX_ORDERS_PER_HOUR: 200,
      MAX_POSITION_SIZE: 25000,
      CIRCUIT_BREAKER_THRESHOLD: 10
    }
  }
};

function getCurrentPhase() {
  // Read current .env.staging to determine phase
  const envPath = path.join(__dirname, '..', '.env.staging');
  if (!fs.existsSync(envPath)) {
    return 'canary'; // Default
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  if (envContent.includes('CANARY_MODE=1')) return 'canary';
  if (envContent.includes('DRY_RUN=1')) return 'canary';
  if (envContent.includes('MAX_ORDERS_PER_HOUR=10')) return 'pilot';
  if (envContent.includes('MAX_ORDERS_PER_HOUR=50')) return 'limited';
  return 'full';
}

function setPhase(phase) {
  if (!PHASES[phase]) {
    console.error(`❌ Unknown phase: ${phase}`);
    console.log('Available phases:', Object.keys(PHASES).join(', '));
    process.exit(1);
  }

  const phaseConfig = PHASES[phase];
  console.log(`🚀 Setting rollout phase: ${phaseConfig.name}`);
  console.log(`📝 ${phaseConfig.description}`);

  // Update .env.staging
  const envPath = path.join(__dirname, '..', '.env.staging');
  let envContent = '';

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
    // Remove existing rollout config
    envContent = envContent.split('\n').filter(line =>
      !line.startsWith('DRY_RUN=') &&
      !line.startsWith('CANARY_MODE=') &&
      !line.startsWith('MAX_ORDERS_PER_HOUR=') &&
      !line.startsWith('MAX_POSITION_SIZE=') &&
      !line.startsWith('CIRCUIT_BREAKER_THRESHOLD=')
    ).join('\n');
  }

  // Add new config
  const newConfig = Object.entries(phaseConfig.config)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  envContent += '\n# Rollout Phase Configuration\n' + newConfig + '\n';

  fs.writeFileSync(envPath, envContent.trim() + '\n');
  console.log('✅ Configuration updated in .env.staging');

  // Show next steps
  const phases = Object.keys(PHASES);
  const currentIndex = phases.indexOf(phase);
  if (currentIndex < phases.length - 1) {
    const nextPhase = phases[currentIndex + 1];
    console.log(`\n🔄 Next phase: ${nextPhase} (${PHASES[nextPhase].name})`);
    console.log(`   Run: node scripts/rollout-manager.cjs ${nextPhase}`);
  } else {
    console.log('\n🎉 Full production rollout complete!');
  }
}

function showStatus() {
  const currentPhase = getCurrentPhase();
  const phaseInfo = PHASES[currentPhase];

  console.log('📊 Current Rollout Status:');
  console.log(`   Phase: ${currentPhase} (${phaseInfo.name})`);
  console.log(`   Description: ${phaseInfo.description}`);
  console.log(`   Config:`, phaseInfo.config);

  console.log('\n📋 Available phases:');
  Object.entries(PHASES).forEach(([key, info]) => {
    const marker = key === currentPhase ? '▶️ ' : '   ';
    console.log(`${marker}${key}: ${info.name} - ${info.description}`);
  });
}

function main() {
  const command = process.argv[2];

  if (!command) {
    showStatus();
    return;
  }

  if (command === 'status') {
    showStatus();
    return;
  }

  if (PHASES[command]) {
    setPhase(command);
    return;
  }

  console.log('Usage: node scripts/rollout-manager.cjs [phase|status]');
  console.log('Phases:', Object.keys(PHASES).join(', '));
  process.exit(1);
}

main();
