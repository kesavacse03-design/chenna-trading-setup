/**
 * VersionManager - Version Chain Evolution for Shadow Learner
 * 
 * PURPOSE:
 * Manage version naming and evolution history for Research Backtest.
 * 
 * VERSION NAMING:
 * - TT-V1 (baseline from Labs)
 * - TT-V1.a (first proven improvement)
 * - TT-V1.b (second proven improvement)
 * - TT-V1.c, TT-V1.d, etc.
 * 
 * ARCHITECTURE:
 * - In PAST mode (Research): Shadow can auto-promote
 * - In LIVE mode: User must approve promotion
 */

/**
 * Get next version name in chain
 * @param {string} currentVersion - Current version (e.g., "TT-V1", "TT-V1.a")
 * @returns {string} Next version name
 */
function getNextVersion(currentVersion) {
    if (!currentVersion) return 'TT-V1';

    // Parse current version
    const match = currentVersion.match(/^(TT-V\d+)(?:\.([a-z]))?$/);
    if (!match) {
        console.warn('Invalid version format:', currentVersion);
        return currentVersion + '.a';
    }

    const baseVersion = match[1]; // e.g., "TT-V1"
    const suffix = match[2];       // e.g., "a" or undefined

    if (!suffix) {
        // TT-V1 → TT-V1.a
        return `${baseVersion}.a`;
    }

    // TT-V1.a → TT-V1.b, TT-V1.z → TT-V1.aa (for safety, but unlikely)
    const nextChar = String.fromCharCode(suffix.charCodeAt(0) + 1);
    return `${baseVersion}.${nextChar}`;
}

/**
 * Parse version string into components
 * @param {string} version - Version string
 * @returns {Object} Parsed version components
 */
function parseVersion(version) {
    const match = version.match(/^(TT-V(\d+))(?:\.([a-z]+))?$/);
    if (!match) return { base: version, major: 1, suffix: null, iteration: 0 };

    return {
        base: match[1],
        major: parseInt(match[2]),
        suffix: match[3] || null,
        iteration: match[3] ? match[3].charCodeAt(0) - 96 : 0 // a=1, b=2, etc.
    };
}

/**
 * Compare two versions
 * @param {string} v1 - First version
 * @param {string} v2 - Second version
 * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1, v2) {
    const p1 = parseVersion(v1);
    const p2 = parseVersion(v2);

    if (p1.major !== p2.major) return p1.major - p2.major;
    return p1.iteration - p2.iteration;
}

/**
 * Create evolution record for version jump
 * @param {Object} params - Evolution parameters
 * @returns {Object} Evolution record
 */
function createEvolutionRecord({
    passNumber,
    fromVersion,
    toVersion,
    provenRules,
    beforeMetrics,
    afterMetrics,
    appliedFilters
}) {
    const delta = {
        winRateDelta: calculateDelta(beforeMetrics.winRate, afterMetrics.winRate),
        lossesAvoided: (beforeMetrics.losses || 0) - (afterMetrics.losses || 0),
        winsMissed: (beforeMetrics.wins || 0) - (afterMetrics.wins || 0),
        tradesFiltered: (beforeMetrics.trades || 0) - (afterMetrics.trades || 0)
    };

    return {
        passNumber,
        fromVersion,
        toVersion,
        timestamp: new Date().toISOString(),
        provenRules: provenRules.map(r => r.ruleId || r),
        appliedFilters: appliedFilters || provenRules.map(r => {
            // Convert failure tag to filter name
            const name = (r.ruleId || r).replace('FAIL_', '').replace(/_/g, ' ');
            return `REQUIRE_${name.toUpperCase().replace(/ /g, '_')}`;
        }),
        beforeMetrics: {
            winRate: beforeMetrics.winRate,
            wins: beforeMetrics.wins,
            losses: beforeMetrics.losses,
            trades: beforeMetrics.trades
        },
        afterMetrics: {
            winRate: afterMetrics.winRate,
            wins: afterMetrics.wins,
            losses: afterMetrics.losses,
            trades: afterMetrics.trades
        },
        delta,
        status: provenRules.length > 0 ? 'EVOLVED' : 'BASELINE'
    };
}

/**
 * Calculate delta between two metrics
 */
function calculateDelta(before, after) {
    const b = parseFloat(before) || 0;
    const a = parseFloat(after) || 0;
    const diff = a - b;
    return diff >= 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
}

/**
 * VersionManager class for managing evolution state
 */
class VersionManager {
    constructor(categoryKey, initialVersion = 'TT-V1') {
        this.categoryKey = categoryKey;
        this.currentVersion = initialVersion;
        this.evolutionHistory = [];
        this.activeFilters = [];
    }

    /**
     * Get current version
     */
    getVersion() {
        return this.currentVersion;
    }

    /**
     * Evolve to next version (auto-promote in past mode)
     * @param {Array} provenRules - Rules that were proven
     * @param {Object} beforeMetrics - Metrics before evolution
     * @param {Object} afterMetrics - Metrics after evolution
     * @returns {Object} Evolution result
     */
    evolve(provenRules, beforeMetrics, afterMetrics) {
        if (!provenRules || provenRules.length === 0) {
            return {
                evolved: false,
                version: this.currentVersion,
                reason: 'No proven improvements'
            };
        }

        const fromVersion = this.currentVersion;
        const toVersion = getNextVersion(fromVersion);

        // Create evolution record
        const record = createEvolutionRecord({
            passNumber: this.evolutionHistory.length + 1,
            fromVersion,
            toVersion,
            provenRules,
            beforeMetrics,
            afterMetrics,
            appliedFilters: provenRules.map(r => r.ruleId || r)
        });

        this.evolutionHistory.push(record);
        this.currentVersion = toVersion;

        // Add filters
        for (const rule of provenRules) {
            this.activeFilters.push(rule.ruleId || rule);
        }

        return {
            evolved: true,
            fromVersion,
            toVersion,
            record,
            activeFilters: [...this.activeFilters]
        };
    }

    /**
     * Record baseline (Pass 1) without evolution
     */
    recordBaseline(metrics) {
        const record = {
            passNumber: 1,
            version: this.currentVersion,
            fromVersion: null,
            toVersion: this.currentVersion,
            timestamp: new Date().toISOString(),
            provenRules: [],
            appliedFilters: [],
            beforeMetrics: null,
            afterMetrics: metrics,
            delta: null,
            status: 'BASELINE'
        };

        this.evolutionHistory.push(record);
        return record;
    }

    /**
     * Get full evolution history
     */
    getHistory() {
        return [...this.evolutionHistory];
    }

    /**
     * Get summary of evolution
     */
    getSummary() {
        const baseline = this.evolutionHistory[0];
        const final = this.evolutionHistory[this.evolutionHistory.length - 1];

        return {
            categoryKey: this.categoryKey,
            baselineVersion: baseline?.version || 'TT-V1',
            finalVersion: this.currentVersion,
            totalPasses: this.evolutionHistory.length,
            totalEvolutions: this.evolutionHistory.filter(e => e.status === 'EVOLVED').length,
            activeFilters: [...this.activeFilters],
            baselineMetrics: baseline?.afterMetrics || null,
            finalMetrics: final?.afterMetrics || null
        };
    }

    /**
     * Generate human-readable evolution timeline
     */
    generateTimeline() {
        const lines = [];
        lines.push('📈 VERSION EVOLUTION TIMELINE');
        lines.push('────────────────────────────────────');

        for (const record of this.evolutionHistory) {
            const metrics = record.afterMetrics;
            const status = record.status === 'BASELINE' ? '(Baseline)' : '';
            lines.push(`${record.version} ${status} → ${metrics?.winRate || '?'}% WR, ${metrics?.losses || '?'} losses`);

            if (record.appliedFilters && record.appliedFilters.length > 0) {
                for (const filter of record.appliedFilters) {
                    lines.push(`    ↓ +${filter.replace('FAIL_', '').replace(/_/g, '_')}`);
                }
            }
        }

        if (this.evolutionHistory.length > 1) {
            lines.push('');
            lines.push(`✅ FINAL VERSION: ${this.currentVersion}`);
        }

        return lines.join('\n');
    }
}

module.exports = {
    getNextVersion,
    parseVersion,
    compareVersions,
    createEvolutionRecord,
    VersionManager
};
