import React, { useState } from 'react';

interface ShadowReportProps {
    shadowReport: {
        error?: string;
        performanceFacts?: {
            totalTrades: number;
            wins: number;
            losses: number;
            accuracy: string;
            maxDrawdown: string;
            maxDrawdownTrades: number;
            expectancy: string;
            avgWinR: string;
            avgLossR: string;
            capitalWinRate: string;
            avgHoldingDays: string;
        };
        failureAnalysis?: {
            patterns: Array<{
                type: string;
                severity: string;
                description?: string;
                count?: number;
            }>;
            earlyEntries: Array<{
                symbol: string;
                strategy: string;
                holdingDays: number;
            }>;
        };
        strengthAnalysis?: {
            patterns: Array<{
                type: string;
                severity: string;
                description?: string;
                count?: number;
            }>;
            patiencePayoffs: Array<{
                symbol: string;
                holdingDays: number;
                pnl: string;
            }>;
        };
        refinementSuggestions?: Array<{
            id: string;
            priority: string;
            area: string;
            observation: string;
            suggestion: string;
            impact: string;
        }>;
        // Layer 1: Structural Failures
        structuralFailures?: {
            totalLosses: number;
            aggregated: Array<{
                tag: string;
                category: string;
                severity: string;
                description: string;
                marketReality?: string;
                count: number;
                impactPct: string;
            }>;
            dominantFailures: Array<any>;
            // Per-trade analysis with causal reasoning
            taggedTrades?: Array<{
                symbol: string;
                entryDate: string;
                pnl: number;
                failureTags: Array<{ tag: string; severity: string }>;
                traderReason?: {
                    primaryCause: string;
                    traderExplanation: string;
                    avoidanceGuidance: string;
                    tagDescriptions: string;
                    summary: string;
                    liveActionable: boolean;
                };
            }>;
            // Category-level patterns (Layer 2 summary)
            categoryPatterns?: Array<{
                cause: string;
                count: number;
                totalLoss: number;
                percentage: string;
                examples: Array<{ symbol: string; date: string; explanation: string }>;
            }>;
        };

        // Layer 2: Rule Gap Hypotheses
        ruleGapHypotheses?: Array<{
            failureTag: string;
            failureCount: number;
            impactPct: string;
            ruleGap: string;
            hypothesis: string;
            implementation?: string;
            testable: boolean;
            status: string;
        }>;
        // Layer 3: Variant Test Results
        variantTestResults?: {
            totalTested: number;
            proven: number;
            notProven: number;
            results: Array<any>;
        };
        provenImprovements?: Array<{
            hypothesisId: string;
            status: string;
            baseline: { trades: number; wins: number; losses: number; winRate: string };
            variant: { trades: number; wins: number; losses: number; winRate: string };
            deltas: { lossesAvoided: number; winsMissed: number; winRateDelta: string; netPnlImprovement: string };
            recommendation: string;
            implementation?: string;
        }>;
        // Layer 4: Promotion Report
        promotionReport?: {
            canPromote: boolean;
            promotionStatus: string;
            statusReason: string;
            verification: {
                items: Array<{ check: string; passed: boolean }>;
                allPassed: boolean;
                failedChecks: string[];
            };
            categoryAnalysis: {
                dominantFailure: string;
                dominantPercentage: string;
                failureBreakdown: Array<{ cause: string; percentage: string; count: number }>;
            };
            provenRules: Array<{
                ruleId: string;
                action: string;
                impact: { lossesAvoided: number; winsMissed: number; winRateDelta: string; confidence: number };
                implementation?: string;
            }>;
            provenCount: number;
            rejectedRules: Array<{
                ruleId: string;
                status: string;
                reason: string;
                recommendation: string;
            }>;
            rejectedCount: number;
            beforeVsAfter: {
                before: string;
                after: string;
                identical: boolean;
            };
            nextAction: string;
            summary: string;
        };
        humanReadableSummary?: string;

    };
    version?: string;
    category?: string;
}

type TabKey = 'summary' | 'structural' | 'hypotheses' | 'proven' | 'promotion' | 'failures' | 'strengths' | 'suggestions';

export const ShadowReportPanel: React.FC<ShadowReportProps> = ({ shadowReport, version = 'V1', category = 'Unknown' }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [activeTab, setActiveTab] = useState<TabKey>('summary');

    if (!shadowReport || shadowReport.error) {
        return (
            <div className="p-6 rounded-xl bg-slate-800 border border-amber-700/30">
                <h3 className="text-lg font-bold text-amber-400 mb-2">⚠️ Shadow Learner</h3>
                <p className="text-slate-400 text-sm">Shadow Report not available for this run.</p>
            </div>
        );
    }

    const { performanceFacts, failureAnalysis, strengthAnalysis, refinementSuggestions,
        structuralFailures, ruleGapHypotheses, variantTestResults, provenImprovements, promotionReport } = shadowReport;

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'HIGH': return 'text-red-400 bg-red-900/30 border-red-700';
            case 'MEDIUM': return 'text-amber-400 bg-amber-900/30 border-amber-700';
            case 'LOW': return 'text-blue-400 bg-blue-900/30 border-blue-700';
            case 'INFO': return 'text-cyan-400 bg-cyan-900/30 border-cyan-700';
            default: return 'text-slate-400 bg-slate-700/30 border-slate-600';
        }
    };

    const getSeverityBadge = (severity: string) => {
        switch (severity) {
            case 'HIGH': return '🔴';
            case 'MEDIUM': return '🟡';
            case 'POSITIVE': return '🟢';
            default: return '⚪';
        }
    };

    const hasLayerData = structuralFailures || ruleGapHypotheses || provenImprovements || promotionReport;

    return (
        <div className="rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-purple-700/40 shadow-xl overflow-hidden">
            {/* Header */}
            <div
                className="p-4 bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border-b border-purple-700/30 cursor-pointer"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🔮</span>
                        <div>
                            <h3 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                                Shadow Learner Report {hasLayerData && <span className="text-xs font-normal text-cyan-400">(3-Layer)</span>}
                            </h3>
                            <p className="text-xs text-slate-400">{category} - {version} | Structural Analysis</p>
                        </div>
                    </div>
                    <button className="text-slate-400 hover:text-white transition">
                        {isExpanded ? '▼' : '▶'}
                    </button>
                </div>
            </div>

            {isExpanded && (
                <div className="p-4">
                    {/* Tab Navigation - Now with Layer tabs */}
                    <div className="flex flex-wrap gap-2 mb-4 border-b border-slate-700 pb-2">
                        {[
                            { key: 'summary', label: '📊 Performance', show: true },
                            { key: 'structural', label: '🏷️ Layer 1: Tags', show: !!structuralFailures?.aggregated?.length },
                            { key: 'hypotheses', label: '🔬 Layer 2: Gaps', show: !!ruleGapHypotheses?.length },
                            { key: 'proven', label: '✅ Layer 3: Proven', show: !!variantTestResults },
                            { key: 'promotion', label: '🚀 Promotion', show: !!promotionReport },
                            { key: 'failures', label: '📉 Failures', show: true },
                            { key: 'strengths', label: '📈 Strengths', show: true },
                            { key: 'suggestions', label: '💡 Suggestions', show: true }
                        ].filter(t => t.show).map(tab => (

                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key as TabKey)}
                                className={`px-3 py-1.5 text-xs rounded-lg transition ${activeTab === tab.key
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Performance Tab */}
                    {activeTab === 'summary' && performanceFacts && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                                <div className="text-xs text-slate-500 mb-1">Accuracy</div>
                                <div className="text-lg font-bold text-cyan-400">{performanceFacts.accuracy}</div>
                            </div>
                            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                                <div className="text-xs text-slate-500 mb-1">Max Drawdown</div>
                                <div className="text-lg font-bold text-red-400">{performanceFacts.maxDrawdown}</div>
                            </div>
                            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                                <div className="text-xs text-slate-500 mb-1">Expectancy</div>
                                <div className="text-lg font-bold text-green-400">{performanceFacts.expectancy}</div>
                            </div>
                            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                                <div className="text-xs text-slate-500 mb-1">Capital Win Rate</div>
                                <div className="text-lg font-bold text-purple-400">{performanceFacts.capitalWinRate}</div>
                            </div>
                            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                                <div className="text-xs text-slate-500 mb-1">Total Trades</div>
                                <div className="text-lg font-bold text-slate-300">{performanceFacts.totalTrades} ({performanceFacts.wins}W / {performanceFacts.losses}L)</div>
                            </div>
                            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                                <div className="text-xs text-slate-500 mb-1">Avg Win / Loss R</div>
                                <div className="text-lg font-bold">
                                    <span className="text-green-400">{performanceFacts.avgWinR}</span>
                                    <span className="text-slate-500 mx-1">/</span>
                                    <span className="text-red-400">{performanceFacts.avgLossR}</span>
                                </div>
                            </div>
                            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                                <div className="text-xs text-slate-500 mb-1">Avg Holding</div>
                                <div className="text-lg font-bold text-slate-300">{performanceFacts.avgHoldingDays} days</div>
                            </div>
                            <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
                                <div className="text-xs text-slate-500 mb-1">DD Streak</div>
                                <div className="text-lg font-bold text-amber-400">{performanceFacts.maxDrawdownTrades} trades</div>
                            </div>
                        </div>
                    )}

                    {/* Layer 1: Structural Failures Tab - Per-Trade Causal Reasoning */}
                    {activeTab === 'structural' && structuralFailures && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-cyan-400">🏷️ Layer 1: Trade-Level Failure Reasoning</h4>
                                <span className="text-xs text-slate-400">{structuralFailures.totalLosses} losses analyzed</span>
                            </div>

                            {/* LAYER 2 SUMMARY: Category-Level Patterns */}
                            {(structuralFailures.categoryPatterns?.length ?? 0) > 0 && (
                                <div className="bg-gradient-to-r from-indigo-900/30 to-purple-900/30 border border-indigo-700/30 rounded-lg p-4">
                                    <h5 className="text-xs font-semibold text-indigo-400 mb-3">📊 Category-Level Failure Patterns</h5>
                                    <div className="space-y-2">
                                        {(structuralFailures.categoryPatterns || []).map((pattern: any, idx: number) => (
                                            <div key={idx} className="flex items-center justify-between bg-slate-900/50 rounded px-3 py-2">
                                                <span className="text-sm text-slate-300">{pattern.cause?.replace(/_/g, ' ')}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs bg-indigo-900/50 text-indigo-300 px-2 py-0.5 rounded">{pattern.count} trades</span>
                                                    <span className="text-sm font-semibold text-amber-400">{pattern.percentage}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* LAYER 1 DETAIL: Per-Trade Causal Explanations */}
                            {(structuralFailures.taggedTrades?.length ?? 0) > 0 ? (
                                <div className="space-y-3">
                                    <h5 className="text-xs font-semibold text-slate-400">📋 Per-Trade Analysis (What a trader would say)</h5>
                                    {(structuralFailures.taggedTrades || []).slice(0, 10).map((trade: any, idx: number) => (
                                        <div key={idx} className="bg-slate-900/50 border border-red-900/30 rounded-lg p-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-semibold text-red-400">{trade.symbol}</span>
                                                    <span className="text-xs text-slate-500">{trade.entryDate}</span>
                                                </div>
                                                <span className="text-xs bg-red-900/50 text-red-300 px-2 py-0.5 rounded">
                                                    {trade.pnl?.toFixed(2)}%
                                                </span>
                                            </div>

                                            {trade.traderReason && (
                                                <>
                                                    {/* Primary Cause Badge */}
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-xs bg-amber-900/50 text-amber-300 px-2 py-0.5 rounded font-mono">
                                                            {trade.traderReason.primaryCause}
                                                        </span>
                                                    </div>

                                                    {/* Trader Explanation */}
                                                    <p className="text-sm text-slate-300 mb-2 leading-relaxed">
                                                        {trade.traderReason.traderExplanation}
                                                    </p>

                                                    {/* Avoidance Guidance */}
                                                    <div className="bg-slate-800/50 rounded p-2 border-l-2 border-cyan-500">
                                                        <p className="text-xs text-cyan-300">
                                                            <span className="font-semibold">🎯 Future Avoidance:</span> {trade.traderReason.avoidanceGuidance}
                                                        </p>
                                                    </div>
                                                </>
                                            )}

                                            {/* Taxonomy Tags (secondary info) */}
                                            {trade.failureTags?.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    {trade.failureTags.map((tag: any, tagIdx: number) => (
                                                        <span key={tagIdx} className="text-xs bg-slate-700/50 text-slate-400 px-1.5 py-0.5 rounded">
                                                            {getSeverityBadge(tag.severity)} {tag.tag?.replace('FAIL_', '')}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {(structuralFailures.taggedTrades?.length || 0) > 10 && (
                                        <p className="text-xs text-slate-500 text-center">
                                            Showing 10 of {structuralFailures.taggedTrades?.length || 0} trades
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-slate-500 text-sm">No losing trades to analyze.</p>
                            )}
                        </div>
                    )}

                    {/* Layer 2: Rule Gap Hypotheses Tab */}
                    {activeTab === 'hypotheses' && ruleGapHypotheses && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-amber-400">🔬 Layer 2: Rule Gap Hypotheses</h4>
                                <span className="text-xs text-slate-400">{ruleGapHypotheses.length} hypotheses</span>
                            </div>

                            {ruleGapHypotheses.length > 0 ? (
                                <div className="space-y-2">
                                    {ruleGapHypotheses.map((hyp, idx) => (
                                        <div key={idx} className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-mono text-amber-400">{hyp.failureTag}</span>
                                                <span className={`text-xs px-2 py-0.5 rounded ${hyp.status === 'PROVEN' ? 'bg-green-900/30 text-green-400' :
                                                    hyp.status === 'HYPOTHESIS' ? 'bg-amber-900/30 text-amber-400' :
                                                        'bg-slate-700 text-slate-400'
                                                    }`}>{hyp.status}</span>
                                            </div>
                                            <p className="text-sm text-white font-medium mb-1">{hyp.ruleGap}</p>
                                            <p className="text-sm text-slate-300 mb-2">💡 {hyp.hypothesis}</p>
                                            {hyp.implementation && (
                                                <p className="text-xs text-slate-500 font-mono bg-slate-900/50 p-2 rounded">
                                                    📝 {hyp.implementation}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-slate-500 text-sm">No rule gap hypotheses generated.</p>
                            )}
                        </div>
                    )}

                    {/* Layer 3: Proven Improvements Tab */}
                    {activeTab === 'proven' && variantTestResults && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-green-400">✅ Layer 3: Variant Test Results</h4>
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="text-green-400">{variantTestResults.proven} proven</span>
                                    <span className="text-slate-500">|</span>
                                    <span className="text-red-400">{variantTestResults.notProven} not proven</span>
                                </div>
                            </div>

                            {provenImprovements && provenImprovements.length > 0 ? (
                                <div className="space-y-2">
                                    {provenImprovements.map((improvement, idx) => (
                                        <div key={idx} className="bg-green-900/20 border border-green-700/30 rounded-lg p-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-sm font-bold text-green-400">✅ PROVEN IMPROVEMENT</span>
                                                <span className="text-xs font-mono text-slate-400">{improvement.hypothesisId}</span>
                                            </div>

                                            {/* Before/After comparison */}
                                            <div className="grid grid-cols-2 gap-4 mb-3">
                                                <div className="bg-slate-900/50 rounded p-2">
                                                    <div className="text-xs text-slate-500 mb-1">BASELINE</div>
                                                    <div className="text-sm text-slate-300">
                                                        {improvement.baseline.trades} trades | {improvement.baseline.winRate}
                                                    </div>
                                                </div>
                                                <div className="bg-green-900/30 rounded p-2">
                                                    <div className="text-xs text-green-400 mb-1">WITH FIX</div>
                                                    <div className="text-sm text-white font-medium">
                                                        {improvement.variant.trades} trades | {improvement.variant.winRate}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Deltas */}
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                <span className="text-xs bg-green-900/30 text-green-400 px-2 py-1 rounded">
                                                    -{improvement.deltas.lossesAvoided} losses
                                                </span>
                                                <span className="text-xs bg-amber-900/30 text-amber-400 px-2 py-1 rounded">
                                                    -{improvement.deltas.winsMissed} wins
                                                </span>
                                                <span className="text-xs bg-cyan-900/30 text-cyan-400 px-2 py-1 rounded">
                                                    +{improvement.deltas.winRateDelta} WR
                                                </span>
                                            </div>

                                            <p className="text-sm text-white">{improvement.recommendation}</p>
                                            {improvement.implementation && (
                                                <p className="text-xs text-slate-400 mt-2 font-mono bg-slate-900/50 p-2 rounded">
                                                    📝 {improvement.implementation}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-4">
                                    <p className="text-red-400 font-medium">❌ No statistically proven improvements</p>
                                    <p className="text-slate-400 text-sm mt-1">
                                        All tested hypotheses failed to meet significance criteria.
                                        The current strategy may already be optimized, or the sample size is too small.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* LAYER 4: PROMOTION REPORT TAB */}
                    {activeTab === 'promotion' && promotionReport && (
                        <div className="space-y-4">
                            {/* Promotion Status Header */}
                            <div className={`p-4 rounded-lg border ${promotionReport.canPromote
                                ? 'bg-green-900/20 border-green-700/50'
                                : 'bg-amber-900/20 border-amber-700/50'}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-lg font-bold">
                                        {promotionReport.canPromote
                                            ? '🚀 READY FOR PROMOTION'
                                            : '⏸️ NOT READY FOR PROMOTION'}
                                    </h4>
                                    <span className={`text-sm px-2 py-1 rounded ${promotionReport.canPromote
                                        ? 'bg-green-700 text-green-100'
                                        : 'bg-amber-700 text-amber-100'}`}>
                                        {promotionReport.statusReason}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-300">{promotionReport.nextAction}</p>
                            </div>

                            {/* Self-Verification Checklist */}
                            <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-4">
                                <h5 className="text-sm font-semibold text-purple-400 mb-3">📋 Self-Verification Checklist</h5>
                                <div className="space-y-2">
                                    {promotionReport.verification?.items?.map((item, idx) => (
                                        <div key={idx} className="flex items-center gap-3">
                                            <span className={`text-lg ${item.passed ? 'text-green-400' : 'text-red-400'}`}>
                                                {item.passed ? '✅' : '❌'}
                                            </span>
                                            <span className={`text-sm ${item.passed ? 'text-slate-300' : 'text-red-300'}`}>
                                                {item.check}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                {!promotionReport.verification?.allPassed && (
                                    <div className="mt-3 p-2 bg-red-900/30 border border-red-700/50 rounded">
                                        <p className="text-xs text-red-400">
                                            ⚠️ Cannot promote until all checks pass: {promotionReport.verification?.failedChecks?.join(', ')}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Before vs After */}
                            <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-4">
                                <h5 className="text-sm font-semibold text-cyan-400 mb-3">🔄 Before vs After</h5>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-3 bg-slate-800 rounded border-l-4 border-slate-500">
                                        <div className="text-xs text-slate-500 mb-1">BEFORE</div>
                                        <div className="text-sm text-white">{promotionReport.beforeVsAfter?.before}</div>
                                    </div>
                                    <div className={`p-3 rounded border-l-4 ${promotionReport.beforeVsAfter?.identical
                                        ? 'bg-slate-800 border-slate-500'
                                        : 'bg-green-900/30 border-green-500'}`}>
                                        <div className="text-xs text-slate-500 mb-1">AFTER</div>
                                        <div className={`text-sm ${promotionReport.beforeVsAfter?.identical ? 'text-slate-400' : 'text-green-300'}`}>
                                            {promotionReport.beforeVsAfter?.after}
                                        </div>
                                    </div>
                                </div>
                                {promotionReport.beforeVsAfter?.identical && (
                                    <p className="text-xs text-amber-400 mt-2 italic">
                                        ℹ️ Before = After because no improvements were statistically proven
                                    </p>
                                )}
                            </div>

                            {/* Proven Rules */}
                            {(promotionReport.provenCount ?? 0) > 0 && (
                                <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-4">
                                    <h5 className="text-sm font-semibold text-green-400 mb-3">
                                        ✅ Proven Improvements ({promotionReport.provenCount})
                                    </h5>
                                    <div className="space-y-3">
                                        {promotionReport.provenRules?.map((rule, idx) => (
                                            <div key={idx} className="bg-slate-900/50 p-3 rounded">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-sm font-mono text-green-400">{rule.ruleId}</span>
                                                    <span className="text-xs text-green-300">+{rule.impact.winRateDelta} WR</span>
                                                </div>
                                                <p className="text-sm text-white mb-1">{rule.action}</p>
                                                <div className="flex gap-2 text-xs">
                                                    <span className="text-green-400">-{rule.impact.lossesAvoided} losses</span>
                                                    <span className="text-amber-400">-{rule.impact.winsMissed} wins</span>
                                                </div>
                                                {rule.implementation && (
                                                    <p className="text-xs text-slate-400 mt-2 font-mono bg-slate-800 p-2 rounded">
                                                        📝 {rule.implementation}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Rejected Hypotheses */}
                            {(promotionReport.rejectedCount ?? 0) > 0 && (
                                <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-4">
                                    <h5 className="text-sm font-semibold text-red-400 mb-3">
                                        ❌ Rejected Hypotheses ({promotionReport.rejectedCount})
                                    </h5>
                                    <div className="space-y-2">
                                        {promotionReport.rejectedRules?.map((rule, idx) => (
                                            <div key={idx} className="bg-slate-900/50 p-3 rounded">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-sm font-mono text-red-400">{rule.ruleId}</span>
                                                    <span className="text-xs bg-red-900/50 text-red-300 px-2 py-0.5 rounded">
                                                        {rule.status}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-slate-300">
                                                    <span className="text-red-400">Reason:</span> {rule.reason}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Category-Level Failure Breakdown */}
                            {promotionReport.categoryAnalysis && (
                                <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-4">
                                    <h5 className="text-sm font-semibold text-indigo-400 mb-3">
                                        📊 Category-Level Failure Breakdown
                                    </h5>
                                    <p className="text-sm text-white mb-3">
                                        Dominant Failure: <span className="text-amber-400 font-semibold">
                                            {promotionReport.categoryAnalysis.dominantFailure?.replace(/_/g, ' ')}
                                        </span> ({promotionReport.categoryAnalysis.dominantPercentage})
                                    </p>
                                    <div className="space-y-1">
                                        {promotionReport.categoryAnalysis.failureBreakdown?.map((f, idx) => (
                                            <div key={idx} className="flex items-center justify-between text-xs">
                                                <span className="text-slate-400">{f.cause?.replace(/_/g, ' ')}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-slate-500">{f.count} trades</span>
                                                    <span className="text-amber-400 font-semibold">{f.percentage}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Failures Tab */}
                    {activeTab === 'failures' && failureAnalysis && (

                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-red-400">Detected Failure Patterns</h4>
                            {failureAnalysis.patterns?.length > 0 ? (
                                failureAnalysis.patterns.map((pattern, idx) => (
                                    <div key={idx} className="bg-red-900/20 border border-red-700/30 rounded-lg p-3">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span>{getSeverityBadge(pattern.severity)}</span>
                                            <span className="text-xs font-mono text-red-400">{pattern.type}</span>
                                        </div>
                                        <p className="text-sm text-slate-300">{pattern.description}</p>
                                        {pattern.count && <span className="text-xs text-red-300">Affected: {pattern.count} trades</span>}
                                    </div>
                                ))
                            ) : (
                                <p className="text-slate-500 text-sm">No significant failure patterns detected ✓</p>
                            )}
                        </div>
                    )}

                    {/* Strengths Tab */}
                    {activeTab === 'strengths' && strengthAnalysis && (
                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold text-green-400">Detected Strength Patterns</h4>
                            {strengthAnalysis.patterns?.length > 0 ? (
                                strengthAnalysis.patterns.map((pattern, idx) => (
                                    <div key={idx} className="bg-green-900/20 border border-green-700/30 rounded-lg p-3">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span>{getSeverityBadge(pattern.severity)}</span>
                                            <span className="text-xs font-mono text-green-400">{pattern.type}</span>
                                        </div>
                                        <p className="text-sm text-slate-300">{pattern.description}</p>
                                    </div>
                                ))
                            ) : (
                                <p className="text-slate-500 text-sm">Analyzing strength patterns...</p>
                            )}
                        </div>
                    )}

                    {/* Suggestions Tab */}
                    {activeTab === 'suggestions' && refinementSuggestions && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold text-purple-400">Refinement Suggestions</h4>
                                <span className="text-xs text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded">
                                    ⚠️ User decision required
                                </span>
                            </div>

                            {refinementSuggestions.map((sug, idx) => (
                                <div key={idx} className={`rounded-lg p-4 border ${getPriorityColor(sug.priority)}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono font-bold">[{sug.id}]</span>
                                            <span className="text-sm font-medium">{sug.area}</span>
                                        </div>
                                        <span className={`text-xs px-2 py-0.5 rounded ${getPriorityColor(sug.priority)}`}>
                                            {sug.priority}
                                        </span>
                                    </div>

                                    <div className="mb-2">
                                        <span className="text-xs text-slate-500">Observed: </span>
                                        <span className="text-sm text-slate-300">{sug.observation}</span>
                                    </div>

                                    <div className="mb-2 p-2 bg-black/20 rounded border-l-2 border-purple-500">
                                        <span className="text-xs text-slate-500">💡 Suggestion: </span>
                                        <span className="text-sm text-white font-medium">"{sug.suggestion}"</span>
                                    </div>

                                    <div>
                                        <span className="text-xs text-slate-500">Expected Impact: </span>
                                        <span className="text-xs text-cyan-300">{sug.impact}</span>
                                    </div>
                                </div>
                            ))}

                            <div className="mt-4 p-3 bg-slate-900/50 border border-slate-700 rounded-lg">
                                <p className="text-xs text-slate-400 text-center">
                                    ⚠️ These are suggestions only - NOT auto-applied.<br />
                                    Review carefully and apply manually if you agree.<br />
                                    <span className="text-cyan-400">To apply: Create V1.b1 with your refinements.</span>
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ShadowReportPanel;

