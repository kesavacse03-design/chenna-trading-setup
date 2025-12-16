import React, { useState } from 'react';
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
    const [activeTab, setActiveTab] = useState<'results' | 'shadow'>('results');
    const [showPromoteConfirm, setShowPromoteConfirm] = useState(false);

    // 2-Pass Research Progress Tracking
    const [researchPhase, setResearchPhase] = useState<'idle' | 'pass1' | 'observing' | 'pass2' | 'complete' | 'error'>('idle');

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

    const handleRunResearch = async () => {
        setIsRunning(true);
        setShadowReport(null);
        setComparison({ before: null, after: null });
        setResearchPhase('pass1');
        setLogs([
            '🔬 RESEARCH BACKTEST: Pure Execution',
            '─────────────────────────────────────────',
            '📋 Running backtest with Shadow observation...',
            '',
            '⚠️ Note: Shadow provides SUGGESTIONS only.',
            '   No artificial filtering. Pure data, pure execution.',
            '   A senior trader knows: you cannot force accuracy.'
        ]);

        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';

            // Single pure backtest with Shadow observation
            const response = await fetch(`${apiBase}/api/strategy/realistic-simulation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoryKey,
                    quickMode: false,
                    backtestMode: true
                })
            });

            const data = await response.json();

            if (!data.ok) throw new Error(data.error || 'Backtest failed');

            // Store results as "current" (before = previous V1 if exists, after = current)
            const results = {
                trades: data.summary?.executedTrades || 0,
                wins: data.summary?.wins || 0,
                losses: data.summary?.losses || 0,
                winRate: data.summary?.winRate || '0',
                totalPnl: data.summary?.totalPnl || '0',
                expectancy: data.summary?.expectancy || '0',
                capitalWinRate: data.summary?.capitalWinRate || '0',
                avgHoldingDays: data.summary?.avgHoldingDays || '0',
                targetHitRate: data.summary?.targetHitRate || '0'
            };

            setComparison({ before: results, after: null }); // Use for display

            setLogs(prev => [
                ...prev,
                '',
                `✅ BACKTEST COMPLETE`,
                `   Trades: ${results.trades}`,
                `   Win Rate: ${results.winRate}%`,
                `   Total PnL: ${results.totalPnl}%`,
                `   Expectancy: ${results.expectancy}`,
                ''
            ]);

            setResearchPhase('observing');

            if (data.shadowReport) {
                setShadowReport(data.shadowReport);
                setLogs(prev => [
                    ...prev,
                    '🔮 SHADOW LEARNER: Analysis complete',
                    `   ${data.shadowReport.refinementSuggestions?.length || 0} suggestions generated`,
                    '',
                    '📝 Review suggestions in Shadow Analysis tab.',
                    '   These are RECOMMENDATIONS for manual consideration.',
                    '   Implement changes → Promote to V1.b1 → Re-run to see improvement.'
                ]);
            }

            setResearchPhase('complete');

        } catch (err: any) {
            setResearchPhase('error');
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
                body: JSON.stringify({ categoryKey, targetVersion: version, refinedByShadow: true })
            });
            const data = await response.json();
            if (data.ok) {
                setLogs(prev => [...prev, `✅ Promoted to ${version}`]);
                setCategoryContext(prev => ({ ...prev, version }));
            } else throw new Error(data.error);
        } catch (err: any) {
            setLogs(prev => [...prev, `❌ Failed: ${err.message}`]);
        }
    };

    const calculateDelta = (before: string | number, after: string | number) => {
        const b = parseFloat(String(before));
        const a = parseFloat(String(after));
        if (isNaN(b) || isNaN(a)) return { value: 0, direction: 'neutral', percent: '0' };
        const diff = a - b;
        return {
            value: diff,
            direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral',
            percent: b !== 0 ? ((diff / Math.abs(b)) * 100).toFixed(0) : '∞'
        };
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6">
            <div className="bg-slate-900 border border-purple-500/30 rounded-2xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-purple-500/30 bg-gradient-to-r from-purple-900/30 to-transparent">
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            🔬 Research Backtest
                            <span className="px-2 py-0.5 bg-purple-600/50 rounded text-xs text-purple-200">SCIENTIFIC</span>
                        </h2>
                        <p className="text-xs text-slate-400 mt-1">
                            {categoryKey.replace(/_/g, ' ')} • {categoryContext.version}
                        </p>
                    </div>

                    {/* Progress Steps - Single Pass Flow */}
                    <div className="flex items-center gap-3">
                        {['BACKTEST', 'SHADOW', 'DONE'].map((step, i) => {
                            const phases = ['pass1', 'observing', 'complete'];
                            const currentIdx = phases.indexOf(researchPhase);
                            const isComplete = currentIdx > i || researchPhase === 'complete';
                            const isCurrent = phases[i] === researchPhase;

                            return (
                                <div key={step} className="flex items-center gap-1">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isComplete ? 'bg-green-500 text-white' :
                                            isCurrent ? 'bg-purple-500 text-white animate-pulse' :
                                                'bg-slate-700 text-slate-400'
                                        }`}>
                                        {isComplete ? '✓' : i + 1}
                                    </div>
                                    <span className={`text-xs ${isComplete || isCurrent ? 'text-white' : 'text-slate-500'}`}>{step}</span>
                                    {i < 2 && <span className="text-slate-600 mx-1">→</span>}
                                </div>
                            );
                        })}
                    </div>

                    <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
                </div>

                {/* Tab Switcher */}
                <div className="flex gap-4 px-6 py-3 border-b border-slate-800">
                    <button
                        onClick={() => setActiveTab('results')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'results' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        📊 Results Comparison
                    </button>
                    <button
                        onClick={() => setActiveTab('shadow')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'shadow' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        🔮 Shadow Analysis {shadowReport && <span className="ml-1 px-1.5 py-0.5 bg-purple-900 rounded text-xs">NEW</span>}
                    </button>
                    <div className="flex-1" />
                    <button
                        onClick={handleRunResearch}
                        disabled={isRunning}
                        className="px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-lg disabled:opacity-50 transition"
                    >
                        {isRunning ? '⏳ Running...' : '▶ Run Research'}
                    </button>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Content Area */}
                    <div className="flex-1 p-6 overflow-y-auto">
                        {activeTab === 'results' ? (
                            <div className="space-y-6">
                                {/* Results Display - Single Pass */}
                                {comparison.before ? (
                                    <>
                                        {/* Current Results Card */}
                                        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-purple-500/30">
                                            <div className="flex items-center justify-between mb-6">
                                                <h3 className="text-lg font-semibold text-white">📊 BACKTEST RESULTS</h3>
                                                <span className="px-3 py-1 bg-green-600/20 border border-green-500/40 rounded text-xs text-green-400">
                                                    {categoryContext.version}
                                                </span>
                                            </div>

                                            {/* Key Metrics Grid */}
                                            <div className="grid grid-cols-3 gap-6 mb-6">
                                                <div className="bg-slate-900/60 rounded-xl p-5 text-center border border-slate-700">
                                                    <div className="text-4xl font-bold text-white">{comparison.before.trades}</div>
                                                    <div className="text-sm text-slate-400 mt-1">Total Trades</div>
                                                </div>
                                                <div className="bg-slate-900/60 rounded-xl p-5 text-center border border-slate-700">
                                                    <div className="text-4xl font-bold text-green-400">{comparison.before.winRate}%</div>
                                                    <div className="text-sm text-slate-400 mt-1">Win Rate</div>
                                                </div>
                                                <div className="bg-slate-900/60 rounded-xl p-5 text-center border border-slate-700">
                                                    <div className={`text-4xl font-bold ${parseFloat(comparison.before.totalPnl) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                        {comparison.before.totalPnl}%
                                                    </div>
                                                    <div className="text-sm text-slate-400 mt-1">Total PnL</div>
                                                </div>
                                            </div>

                                            {/* Secondary Metrics */}
                                            <div className="grid grid-cols-4 gap-4">
                                                <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                                                    <div className="text-xl font-semibold text-white">{comparison.before.expectancy}</div>
                                                    <div className="text-xs text-slate-500">Expectancy</div>
                                                </div>
                                                <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                                                    <div className="text-xl font-semibold text-white">{comparison.before.capitalWinRate}%</div>
                                                    <div className="text-xs text-slate-500">Capital Protected</div>
                                                </div>
                                                <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                                                    <div className="text-xl font-semibold text-white">{comparison.before.avgHoldingDays}d</div>
                                                    <div className="text-xs text-slate-500">Avg Hold</div>
                                                </div>
                                                <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                                                    <div className="text-xl font-semibold text-white">{comparison.before.wins}/{comparison.before.losses}</div>
                                                    <div className="text-xs text-slate-500">W/L</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Shadow Learner Info Box */}
                                        {shadowReport && (
                                            <div className="bg-purple-900/20 rounded-xl p-5 border border-purple-500/30">
                                                <div className="flex items-start gap-4">
                                                    <div className="text-3xl">🔮</div>
                                                    <div>
                                                        <h4 className="font-semibold text-purple-300 mb-2">SHADOW LEARNER INSIGHTS</h4>
                                                        <p className="text-sm text-slate-400 mb-3">
                                                            {shadowReport.refinementSuggestions?.length || 0} suggestions generated based on failure analysis.
                                                        </p>
                                                        <button
                                                            onClick={() => setActiveTab('shadow')}
                                                            className="px-4 py-2 bg-purple-600/50 hover:bg-purple-600 text-white text-sm font-medium rounded-lg transition"
                                                        >
                                                            View Shadow Analysis →
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Promote Button */}
                                        {shadowReport && (
                                            <div className="flex justify-center pt-4">
                                                <button
                                                    onClick={() => setShowPromoteConfirm(true)}
                                                    className="px-8 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-lg transition shadow-lg"
                                                >
                                                    🚀 Promote to Default Strategy (V1.b1)
                                                </button>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                        <div className="text-6xl mb-4 opacity-30">🔬</div>
                                        <p className="text-center text-lg">Click "Run Research" to start</p>
                                        <p className="text-sm text-slate-500 mt-2">Pure backtest with Shadow observation</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Shadow Tab */
                            <div className="h-full">
                                {shadowReport ? (
                                    <ShadowReportPanel
                                        shadowReport={shadowReport}
                                        version={categoryContext.version}
                                        category={categoryKey}
                                    />
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                        <div className="text-6xl mb-4 opacity-30">🔮</div>
                                        <p className="text-lg">Shadow analysis pending</p>
                                        <p className="text-sm text-slate-500 mt-2">Run research backtest to generate insights</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Sidebar: Logs */}
                    <div className="w-64 border-l border-slate-800 flex flex-col">
                        <div className="px-4 py-3 border-b border-slate-800">
                            <h3 className="text-xs font-semibold text-slate-400">ACTIVITY LOG</h3>
                        </div>
                        <div className="flex-1 p-3 overflow-y-auto">
                            <div className="space-y-1 text-xs font-mono text-slate-500">
                                {logs.map((log, i) => (
                                    <div key={i} className={log.startsWith('✅') ? 'text-green-400' : log.startsWith('❌') ? 'text-red-400' : ''}>{log}</div>
                                ))}
                                {logs.length === 0 && <p className="text-slate-600 italic">Ready to run...</p>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Promote Confirmation Modal */}
            {showPromoteConfirm && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20">
                    <div className="bg-slate-800 border border-purple-500/50 rounded-xl p-6 max-w-md shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-4">🚀 Confirm Promotion</h3>
                        <p className="text-slate-300 text-sm mb-2">This will create <span className="text-cyan-400 font-bold">V1.b1</span> with Shadow refinements.</p>
                        <p className="text-amber-400 text-sm mb-6">The refined logic will become the default for this category.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setShowPromoteConfirm(false)} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg">Cancel</button>
                            <button onClick={() => handlePromote('V1.b1')} className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white py-2 rounded-lg font-bold">Promote</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ResearchBacktestModal;
