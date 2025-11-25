/**
 * Automated Backup System
 * Prevents file corruption by creating snapshots before any major operation
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BACKUP_DIR = path.join(__dirname, '../../.backups');
const CRITICAL_FILES = [
    'src/App.tsx',
    'src/types.ts',
    'chenna-CTS/backend/server.cjs',
    'chenna-CTS/backend/prisma/schema.prisma',
    'chenna-CTS/backend/strategy/autoGenerator.cjs',
    'chenna-CTS/backend/strategy/patternRecognition.cjs'
];

class AutoBackup {
    constructor() {
        this.ensureBackupDir();
    }

    ensureBackupDir() {
        if (!fs.existsSync(BACKUP_DIR)) {
            fs.mkdirSync(BACKUP_DIR, { recursive: true });
        }
    }

    /**
     * Create timestamped backup of critical files
     */
    async createSnapshot(label = 'manual') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const snapshotDir = path.join(BACKUP_DIR, `${timestamp}_${label}`);

        fs.mkdirSync(snapshotDir, { recursive: true });

        console.log(`\n📸 Creating backup snapshot: ${label}`);

        for (const file of CRITICAL_FILES) {
            const src = path.join(__dirname, '../..', file);
            if (fs.existsSync(src)) {
                const dest = path.join(snapshotDir, path.basename(file));
                fs.copyFileSync(src, dest);
                console.log(`   ✓ Backed up: ${file}`);
            }
        }

        console.log(`✅ Snapshot saved to: ${snapshotDir}\n`);
        return snapshotDir;
    }

    /**
     * Auto-commit to git after backup
     */
    async gitCommit(message) {
        try {
            execSync('git add -A', { stdio: 'inherit' });
            execSync(`git commit -m "${message}"`, { stdio: 'inherit' });
            console.log(`✅ Git commit: ${message}`);
        } catch (error) {
            console.log(`⚠️  Git commit skipped (no changes or error)`);
        }
    }

    /**
     * Restore from latest backup
     */
    async restore(file) {
        const backups = fs.readdirSync(BACKUP_DIR)
            .filter(d => fs.statSync(path.join(BACKUP_DIR, d)).isDirectory())
            .sort()
            .reverse();

        if (backups.length === 0) {
            console.error('❌ No backups found!');
            return false;
        }

        const latest = backups[0];
        const backupFile = path.join(BACKUP_DIR, latest, path.basename(file));

        if (fs.existsSync(backupFile)) {
            const dest = path.join(__dirname, '../..', file);
            fs.copyFileSync(backupFile, dest);
            console.log(`✅ Restored ${file} from ${latest}`);
            return true;
        }

        console.error(`❌ File ${file} not found in backup`);
        return false;
    }

    /**
     * List all backups
     */
    listBackups() {
        const backups = fs.readdirSync(BACKUP_DIR)
            .filter(d => fs.statSync(path.join(BACKUP_DIR, d)).isDirectory())
            .sort()
            .reverse();

        console.log('\n📦 Available Backups:\n');
        backups.forEach((backup, idx) => {
            console.log(`${idx + 1}. ${backup}`);
        });
        console.log('');
    }
}

// CLI usage
if (require.main === module) {
    const backup = new AutoBackup();
    const command = process.argv[2];

    switch (command) {
        case 'create':
            const label = process.argv[3] || 'manual';
            backup.createSnapshot(label);
            break;

        case 'restore':
            const file = process.argv[3];
            if (!file) {
                console.error('Usage: node auto_backup.cjs restore <file>');
                process.exit(1);
            }
            backup.restore(file);
            break;

        case 'list':
            backup.listBackups();
            break;

        default:
            console.log(`
Automated Backup System

Usage:
  node scripts/auto_backup.cjs create [label]  - Create snapshot
  node scripts/auto_backup.cjs restore <file>   - Restore file
  node scripts/auto_backup.cjs list             - List backups

Examples:
  node scripts/auto_backup.cjs create before_ai_integration
  node scripts/auto_backup.cjs restore src/App.tsx
      `);
    }
}

module.exports = AutoBackup;
