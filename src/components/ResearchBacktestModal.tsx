import React, { useState, useEffect } from 'react';
import { ShadowReportPanel } from './ShadowReportPanel';

interface ResearchBacktestModalProps {
    isOpen: boolean;
    onClose: () => void;
    categoryKey: string;
}

interface BacktestMetrics {
    trades: number;
    wins: number;
    losses: number;
    winRate: string;
    totalPnl: string;
    expectancy: string;
    capitalWinRate: string;
    avgHoldingDays: string;
    maxDrawdown?: number;
    targetHitRate?: string;
}

interface ComparisonData {
    before: BacktestMetrics | null;
    after: BacktestMetrics | null;
}

export const ResearchBacktestModal: React.FC<ResearchBacktestModalProps> = ({
    isOpen,
    onClose,
    categoryKey
}) => {
    const [isRunning, setIsRunning] = useState(false);
    const [comparison, setComparison] = useState<ComparisonData>({ before: null, after: null });
    const [shadowReport, setShadowReport] = useState<any | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'before' | 'after'>('after');
    const [showPromoteConfirm, setShowPromoteConfirm] = useState(false);

    // Category context
    const [categoryContext, setCategoryContext] = useState({
        thesis: 'Capture exhaustion bounces in oversold conditions',
        expectedBehavior: {
            holdingDays: '2-5 days',
            targetMove: '2-3%',
            maxDrawdown: '5%'
        },
        version: 'V1'
    });

    // Load baseline (before) metrics when modal opens
    useEffect(() => {
        if (isOpen) {
            loadBaselineMetrics();
        }
    }, [isOpen, categoryKey]);

    const loadBaselineMetrics = async () => {
        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            // Try to load the most recent backtest for comparison
            const response = await fetch(`${apiBase}/api/labs/latest/${categoryKey}`);
            const data = await response.json();

            if (data.ok && data.result?.summary) {
                const summary = data.result.summary;
                setComparison(prev => ({
                    ...prev,
                    before: {
                        trades: summary.executedTrades || 0,
                        wins: summary.wins || 0,
                        losses: summary.losses || 0,
                        winRate: summary.winRate || '0',
                        totalPnl: summary.totalPnl || '0',
                        expectancy: summary.expectancy || '0',
                        capitalWinRate: summary.capitalWinRate || '0',
                        avgHoldingDays: summary.avgHoldingDays || '0',
                        targetHitRate: summary.targetHitRate || '0'
                    }
                }));
                setLogs(['📊 Loaded baseline metrics for comparison']);
            }
        } catch (err) {
            console.log('No baseline metrics available');
        }
    };

    const handleRunResearch = async () => {
        setIsRunning(true);
        setError(null);
        setShadowReport(null);
        setLogs(['🔬 Starting Research Backtest with Shadow Learner...', '⏳ This may take several minutes (research-grade analysis)']);

        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            const response = await fetch(`${apiBase}/api/strategy/realistic-simulation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryKey, quickMode: false, backtestMode: true })
            });

            const data = await response.json();

            if (data.ok) {
                // Update "after" metrics
                setComparison(prev => ({
                    ...prev,
                    after: {
                        trades: data.summary?.executedTrades || 0,
                        wins: data.summary?.wins || 0,
                        losses: data.summary?.losses || 0,
                        winRate: data.summary?.winRate || '0',
                        totalPnl: data.summary?.totalPnl || '0',
                        expectancy: data.summary?.expectancy || '0',
                        capitalWinRate: data.summary?.capitalWinRate || '0',
                        avgHoldingDays: data.summary?.avgHoldingDays || '0',
                        targetHitRate: data.summary?.targetHitRate || '0'
                    }
                }));

                // Set Shadow Report
                if (data.shadowReport) {
                    setShadowReport(data.shadowReport);
                }

                setLogs(prev => [
                    ...prev,
                    '✅ Research Backtest Complete!',
                    `📈 Trades: ${data.summary?.executedTrades || 0}`,
                    `🎯 Win Rate: ${data.summary?.winRate}%`,
                    `💰 Total PnL: ${data.summary?.totalPnl}%`,
                    '🔮 Shadow Report Generated - Review suggestions below'
                ]);

                setActiveTab('after');
            } else {
                throw new Error(data.error || 'Research backtest failed');
            }
        } catch (err: any) {
            setError(err.message);
            setLogs(prev => [...prev, `❌ Error: ${err.message}`]);
        } finally {
            setIsRunning(false);
        }
    };

    const handlePromote = async (version: string) => {
        setShowPromoteConfirm(false);
        setLogs(prev => [...prev, `🚀 Promoting to ${version}...`]);

        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            const response = await fetch(`${apiBase}/api/labs/promote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoryKey,
                    targetVersion: version,
                    refinedByShadow: true
                })
            });

            const data = await response.json();
            if (data.ok) {
                setLogs(prev => [...prev, `✅ Successfully promoted to ${version}`]);
                setCategoryContext(prev => ({ ...prev, version }));
            } else {
                throw new Error(data.error);
            }
        } catch (err: any) {
            setLogs(prev => [...prev, `❌ Promotion failed: ${err.message}`]);
        }
    };

    // Calculate deltas for comparison
    const calculateDelta = (before: string | number, after: string | number) => {
        const b = parseFloat(String(before));
        const a = parseFloat(String(after));
        if (isNaN(b) || isNaN(a)) return { value: 0, direction: 'neutral' };
        const diff = a - b;
        return {
            value: diff,
            direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral',
            percent: b !== 0 ? ((diff / Math.abs(b)) * 100).toFixed(0) : '∞'
        };
    };

    // Generate "What Changed" summary
    const generateWhatChanged = () => {
        if (!shadowReport?.refinementSuggestions) return [];

        const changes: string[] = [];
        const suggestions = shadowReport.refinementSuggestions;

        // Find key improvements
        const earlyEntry = suggestions.find((s: any) => s.area === 'Entry Timing');
        if (earlyEntry) changes.push('✅ Improved entry timing with price acceptance filter');

        const weakStrategy = suggestions.find((s: any) => s.area === 'Strategy Selection');
        if (weakStrategy) changes.push('✅ Reduced weak strategy participation');

        const patience = suggestions.find((s: any) => s.area === 'Trade Management');
        if (patience) changes.push('✅ Allowed strong trades more breathing room');

        const capitalProtection = suggestions.find((s: any) => s.area === 'Risk Management');
        if (capitalProtection) changes.push('✅ Enhanced capital protection via partial exits');

        // Add failure patterns as removed issues
        if (shadowReport?.failureAnalysis?.patterns) {
            const failures = shadowReport.failureAnalysis.patterns;
            const earlyStops = failures.find((p: any) => p.type === 'EARLY_ENTRY');
            if (earlyStops) changes.push(`❌ Removed ${earlyStops.count || 0} early entries`);
        }

        return changes.length > 0 ? changes : ['Analyzing patterns...'];
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-lg z-50 flex items-center justify-center p-4">
            <div className="bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 border border-purple-500/40 rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col overflow-hidden">

                {/* Header - Research Mode Badge */}
                <div className="flex items-center justify-between p-4 border-b border-purple-500/30 bg-purple-900/20">
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col">
                            <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 flex items-center gap-2">
                                🔬 Research Backtest + Shadow Learner
                            </h2>
                            <p className="text-xs text-purple-300/70">Scientific analysis • Learning mode • Suggestions enabled</p>
                        </div>
                        <span className="px-3 py-1 bg-purple-600/30 border border-purple-500/50 rounded-full text-xs text-purple-300 font-medium">
                            RESEARCH MODE
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white p-2 hover:bg-slate-700/50 rounded-lg transition"
                    >
                        ✕
                    </button>
                </div>

                {/* Main Content - 3 Zone Layout */}
                <div className="flex-1 flex gap-4 p-4 overflow-hidden">

                    {/* LEFT ZONE: Context */}
                    <div className="w-64 flex-shrink-0 bg-slate-800/50 rounded-xl p-4 border border-purple-500/20 flex flex-col gap-4">
                        <h3 className="text-sm font-semibold text-purple-300 border-b border-purple-500/20 pb-2">📋 CONTEXT</h3>

                        <div className="space-y-3">
                            <div>
                                <div className="text-xs text-slate-500">Category</div>
                                <div className="text-sm text-white font-medium">{categoryKey.replace(/_/g, ' ')}</div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-500">Version</div>
                                <div className="text-sm text-cyan-400 font-mono">{categoryContext.version}</div>
                            </div>
                            <div>
                                <div className="text-xs text-slate-500">Market Thesis</div>
                                <div className="text-xs text-slate-300 italic">"{categoryContext.thesis}"</div>
                            </div>
                            <div className="pt-2 border-t border-slate-700">
                                <div className="text-xs text-slate-500 mb-2">Expected Behavior</div>
                                <div className="space-y-1 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Holding:</span>
                                        <span className="text-slate-300">{categoryContext.expectedBehavior.holdingDays}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Target:</span>
                                        <span className="text-green-400">{categoryContext.expectedBehavior.targetMove}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Max DD:</span>
                                        <span className="text-red-400">{categoryContext.expectedBehavior.maxDrawdown}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Run Button */}
                        <div className="mt-auto">
                            <button
                                onClick={handleRunResearch}
                                disabled={isRunning}
                                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-3 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                            >
                                {isRunning ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <span className="animate-spin">⏳</span>
                                        Running Research...
                                    </span>
                                ) : (
                                    '🔬 Run Research Backtest'
                                )}
                            </button>
                            <p className="text-xs text-center text-purple-400/60 mt-2">
                                Heavy computation • May take minutes
                            </p>
                        </div>
                    </div>

                    {/* CENTER ZONE: Results with Before/After */}
                    <div className="flex-1 bg-slate-800/50 rounded-xl border border-purple-500/20 flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-purple-500/20">
                            <h3 className="text-sm font-semibold text-purple-300 mb-3">📊 RESULTS COMPARISON</h3>

                            {/* Tabs */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setActiveTab('before')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'before'
                                            ? 'bg-slate-700 text-white'
                                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                        }`}
                                >
                                    Before (Original)
                                </button>
                                <button
                                    onClick={() => setActiveTab('after')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'after'
                                            ? 'bg-purple-600 text-white'
                                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                        }`}
                                >
                                    After (Shadow-Refined)
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 p-4 overflow-y-auto">
                            {/* Comparison Table */}
                            {comparison.before && comparison.after ? (
                                <div className="space-y-4">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-700">
                                                <th className="text-left py-2 px-3 text-slate-400">Metric</th>
                                                <th className="text-right py-2 px-3 text-slate-400">Before</th>
                                                <th className="text-right py-2 px-3 text-purple-400">After</th>
                                                <th className="text-right py-2 px-3 text-slate-400">Change</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[
                                                { label: 'Trades', before: comparison.before.trades, after: comparison.after.trades, goodIfLower: true },
                                                { label: 'Win Rate', before: comparison.before.winRate + '%', after: comparison.after.winRate + '%', suffix: '' },
                                                { label: 'Total PnL', before: comparison.before.totalPnl + '%', after: comparison.after.totalPnl + '%', suffix: '' },
                                                { label: 'Expectancy', before: comparison.before.expectancy, after: comparison.after.expectancy, suffix: 'R' },
                                                { label: 'Capital Protection', before: comparison.before.capitalWinRate + '%', after: comparison.after.capitalWinRate + '%', suffix: '' },
                                                { label: 'Avg Holding', before: comparison.before.avgHoldingDays + 'd', after: comparison.after.avgHoldingDays + 'd', suffix: '' }
                                            ].map((row, idx) => {
                                                const delta = calculateDelta(
                                                    parseFloat(String(row.before)),
                                                    parseFloat(String(row.after))
                                                );
                                                const isGood = row.goodIfLower ? delta.direction === 'down' : delta.direction === 'up';

                                                return (
                                                    <tr key={idx} className="border-b border-slate-800">
                                                        <td className="py-3 px-3 text-slate-300">{row.label}</td>
                                                        <td className="py-3 px-3 text-right text-slate-500">{row.before}</td>
                                                        <td className="py-3 px-3 text-right text-white font-medium">{row.after}</td>
                                                        <td className={`py-3 px-3 text-right font-bold ${isGood ? 'text-green-400' : delta.direction === 'neutral' ? 'text-slate-400' : 'text-red-400'}`}>
                                                            {delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '–'}
                                                            {delta.percent !== '∞' && ` ${delta.percent}%`}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>

                                    {/* What Changed Summary */}
                                    <div className="bg-slate-900/50 rounded-lg p-4 border border-purple-500/30">
                                        <h4 className="text-sm font-semibold text-purple-300 mb-3">🧠 What Changed After Shadow Learning</h4>
                                        <div className="space-y-2">
                                            {generateWhatChanged().map((change, idx) => (
                                                <div key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                                                    <span>{change}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                    <div className="text-6xl mb-4 opacity-20">🔬</div>
                                    <p className="text-center">
                                        Run Research Backtest to see<br />Before vs After comparison
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Log */}
                        <div className="p-3 border-t border-purple-500/20 bg-black/20 max-h-32 overflow-y-auto">
                            <div className="text-xs font-mono text-slate-500 space-y-1">
                                {logs.map((log, i) => (
                                    <div key={i}>{log}</div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT ZONE: Shadow Learner */}
                    <div className="w-80 flex-shrink-0 bg-slate-800/50 rounded-xl border border-purple-500/20 flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-purple-500/20">
                            <h3 className="text-sm font-semibold text-purple-300">🔮 SHADOW LEARNER</h3>
                            <p className="text-xs text-slate-500">Failures • Strengths • Suggestions</p>
                        </div>

                        <div className="flex-1 p-4 overflow-y-auto">
                            {shadowReport ? (
                                <ShadowReportPanel
                                    shadowReport={shadowReport}
                                    version={categoryContext.version}
                                    category={categoryKey}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center">
                                    <div className="text-4xl mb-3 opacity-20">🔮</div>
                                    <p className="text-sm">Shadow Report will appear here after research backtest</p>
                                </div>
                            )}
                        </div>

                        {/* Promotion Actions */}
                        {shadowReport && (
                            <div className="p-4 border-t border-purple-500/20 space-y-2">
                                <button
                                    onClick={() => setShowPromoteConfirm(true)}
                                    className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-2.5 px-4 rounded-lg transition-all"
                                >
                                    🚀 Promote to V1.b1
                                </button>
                                <p className="text-xs text-center text-slate-500">
                                    Creates new version with Shadow refinements
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Promotion Confirmation Modal */}
                {showPromoteConfirm && (
                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10">
                        <div className="bg-slate-800 border border-purple-500/50 rounded-xl p-6 max-w-md shadow-2xl">
                            <h3 className="text-lg font-bold text-purple-400 mb-4">🚀 Promote Shadow-Refined Logic</h3>
                            <div className="space-y-3 text-sm text-slate-300 mb-6">
                                <p>You are promoting logic refined by Shadow Learner.</p>
                                <p>This will create <span className="text-cyan-400 font-bold">V1.b1</span> (manual refinement).</p>
                                <p className="text-amber-400">Normal backtest will treat this as a new strategy version.</p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowPromoteConfirm(false)}
                                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 px-4 rounded-lg transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handlePromote('V1.b1')}
                                    className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white py-2 px-4 rounded-lg transition font-bold"
                                >
                                    Confirm Promotion
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ResearchBacktestModal;
