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
        humanReadableSummary?: string;
    };
    version?: string;
    category?: string;
}

export const ShadowReportPanel: React.FC<ShadowReportProps> = ({ shadowReport, version = 'V1', category = 'Unknown' }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [activeTab, setActiveTab] = useState<'summary' | 'failures' | 'strengths' | 'suggestions'>('summary');

    if (!shadowReport || shadowReport.error) {
        return (
            <div className="p-6 rounded-xl bg-slate-800 border border-amber-700/30">
                <h3 className="text-lg font-bold text-amber-400 mb-2">⚠️ Shadow Learner</h3>
                <p className="text-slate-400 text-sm">Shadow Report not available for this run.</p>
            </div>
        );
    }

    const { performanceFacts, failureAnalysis, strengthAnalysis, refinementSuggestions } = shadowReport;

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
                                Shadow Learner Report
                            </h3>
                            <p className="text-xs text-slate-400">{category} - {version} | Observational Research</p>
                        </div>
                    </div>
                    <button className="text-slate-400 hover:text-white transition">
                        {isExpanded ? '▼' : '▶'}
                    </button>
                </div>
            </div>

            {isExpanded && (
                <div className="p-4">
                    {/* Tab Navigation */}
                    <div className="flex gap-2 mb-4 border-b border-slate-700 pb-2">
                        {[
                            { key: 'summary', label: '📊 Performance' },
                            { key: 'failures', label: '📉 Failures' },
                            { key: 'strengths', label: '📈 Strengths' },
                            { key: 'suggestions', label: '💡 Suggestions' }
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key as any)}
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
