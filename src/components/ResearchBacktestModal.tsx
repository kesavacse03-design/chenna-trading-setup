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

    // Multi-Pass Evolution Mode
    const [multiPassMode, setMultiPassMode] = useState(false);

    // TT Version Selection (Phase 2)
    const [availableTTVersions, setAvailableTTVersions] = useState<any[]>([]);
    const [selectedTTVersion, setSelectedTTVersion] = useState<string>('TT-V1');
    const [savedResearchVersion, setSavedResearchVersion] = useState<string | null>(null);

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

    // Load TT versions on mount
    React.useEffect(() => {
        if (isOpen && categoryKey) {
            loadTTVersions();
        }
    }, [isOpen, categoryKey]);

    const loadTTVersions = async () => {
        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            const response = await fetch(`${apiBase}/api/labs/versions/${categoryKey}`);
            const data = await response.json();
            if (data.ok && data.versions?.length > 0) {
                setAvailableTTVersions(data.versions);
                setSelectedTTVersion(data.versions[0].ttVersion);
            }
        } catch (err) {
            console.error('Failed to load TT versions:', err);
        }
    };

    const handleRunResearch = async () => {
        setIsRunning(true);
        setShadowReport(null);
        setComparison({ before: null, after: null });
        setResearchPhase('pass1');
        setLogs([
            '🔬 RESEARCH BACKTEST',
            '══════════════════════════════════════════',
            '',
            '📋 Running pure backtest with Shadow observation...'
        ]);

        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';

            // ═══════════════════════════════════════════════════════
            // SINGLE PASS: Run PURE strategy execution
            // ═══════════════════════════════════════════════════════
            const response = await fetch(`${apiBase}/api/strategy/realistic-simulation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoryKey,
                    quickMode: false,
                    backtestMode: true,
                    researchPass: 1,
                    // VERSION CHAIN EVOLUTION
                    multiPassMode: multiPassMode,
                    maxPasses: 5
                })
            });

            const data = await response.json();
            if (!data.ok) throw new Error(data.error || 'Backtest failed');

            const currentResults = {
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

            setComparison(prev => ({ ...prev, before: currentResults }));

            setLogs(prev => [
                ...prev,
                '',
                `✅ BACKTEST COMPLETE:`,
                `   Trades: ${currentResults.trades} | Win Rate: ${currentResults.winRate}%`,
                `   PnL: ${currentResults.totalPnl}% | Expectancy: ${currentResults.expectancy}`,
                ''
            ]);

            // ═══════════════════════════════════════════════════════
            // SHADOW OBSERVATION: Analyze and calculate theoretical improvement
            // ═══════════════════════════════════════════════════════
            setResearchPhase('observing');

            if (data.shadowReport) {
                setShadowReport(data.shadowReport);

                // Calculate THEORETICAL improvement from Shadow analysis
                // This shows what COULD happen if suggestions are implemented
                const failurePatterns = data.shadowReport.failurePatterns || [];
                const earlyEntryPattern = failurePatterns.find((p: any) => p.pattern === 'EARLY_ENTRY');
                const earlyEntryLosses = earlyEntryPattern?.count || 0;

                // Theoretical: If early-entry losses were avoided
                const theoreticalWins = currentResults.wins;
                const theoreticalLosses = Math.max(0, currentResults.losses - earlyEntryLosses);
                const theoreticalTrades = theoreticalWins + theoreticalLosses;
                const theoreticalWinRate = theoreticalTrades > 0
                    ? ((theoreticalWins / theoreticalTrades) * 100).toFixed(1)
                    : currentResults.winRate;

                // Store as "after" for display
                const theoreticalResults = {
                    ...currentResults,
                    trades: theoreticalTrades,
                    losses: theoreticalLosses,
                    winRate: theoreticalWinRate,
                    isTheoretical: true
                };

                setComparison(prev => ({ ...prev, after: theoreticalResults }));

                setLogs(prev => [
                    ...prev,
                    '👁️ SHADOW LEARNER: Analysis complete',
                    `   ${data.shadowReport.refinementSuggestions?.length || 0} suggestions generated`,
                    '',
                    '═══════════════════════════════════════════',
                    '📊 THEORETICAL IMPROVEMENT (if suggestions implemented):',
                    `   Early-entry losses that could be avoided: ${earlyEntryLosses}`,
                    `   Potential Win Rate: ${theoreticalWinRate}% (from ${currentResults.winRate}%)`,
                    '',
                    '⚠️ This is THEORETICAL. To achieve this:',
                    '   1. Review Shadow suggestions',
                    '   2. Implement changes manually',
                    '   3. Promote to V1.b1',
                    '   4. Run fresh backtest to verify',
                    '═══════════════════════════════════════════'
                ]);
            }

            setResearchPhase('complete');

            // ═══════════════════════════════════════════════════════
            // SAVE RESEARCH RUN TO DATABASE (V.bX versioning)
            // ═══════════════════════════════════════════════════════
            try {
                const saveResponse = await fetch(`${apiBase}/api/labs/research/save`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        categoryKey,
                        baseTTVersion: selectedTTVersion,
                        beforeMetrics: currentResults,
                        afterMetrics: comparison.after || currentResults,
                        shadowReport: data.shadowReport || {},
                        refinements: data.shadowReport?.refinementSuggestions || []
                    })
                });
                const saveData = await saveResponse.json();
                if (saveData.ok) {
                    setSavedResearchVersion(saveData.researchRun.researchVersion);
                    setLogs(prev => [...prev, '', `💾 Saved as ${saveData.researchRun.researchVersion}`]);
                }
            } catch (saveErr: any) {
                console.error('Failed to save research:', saveErr);
            }

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

                    {/* Progress Steps - Single Pass with Analysis */}
                    <div className="flex items-center gap-2">
                        {['BACKTEST', 'ANALYZE', 'DONE'].map((step, i) => {
                            const phases = ['pass1', 'observing', 'complete'];
                            const currentIdx = phases.indexOf(researchPhase);
                            const isComplete = currentIdx > i || researchPhase === 'complete';
                            const isCurrent = phases[i] === researchPhase;

                            return (
                                <div key={step} className="flex items-center gap-1">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${isComplete ? 'bg-green-500 text-white' :
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
                                {/* Results Display - 2-Pass Comparison */}
                                {comparison.before && comparison.after ? (
                                    <>
                                        {/* Before/After Cards Row */}
                                        <div className="grid grid-cols-2 gap-4">
                                            {/* BEFORE Card - Original Logic */}
                                            <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-600">
                                                <h3 className="text-sm font-semibold text-slate-400 mb-4 flex items-center gap-2">
                                                    📋 BEFORE <span className="text-xs bg-slate-700 px-2 py-0.5 rounded">Original</span>
                                                </h3>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                                                        <div className="text-2xl font-bold text-white">{comparison.before.trades}</div>
                                                        <div className="text-xs text-slate-500">Trades</div>
                                                    </div>
                                                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                                                        <div className="text-2xl font-bold text-white">{comparison.before.winRate}%</div>
                                                        <div className="text-xs text-slate-500">Win Rate</div>
                                                    </div>
                                                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                                                        <div className="text-2xl font-bold text-white">{comparison.before.totalPnl}%</div>
                                                        <div className="text-xs text-slate-500">Total PnL</div>
                                                    </div>
                                                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                                                        <div className="text-2xl font-bold text-white">{comparison.before.expectancy}</div>
                                                        <div className="text-xs text-slate-500">Expectancy</div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* AFTER Card - With Refinements */}
                                            <div className="bg-purple-900/30 rounded-xl p-5 border border-purple-500/30">
                                                <h3 className="text-sm font-semibold text-purple-300 mb-4 flex items-center gap-2">
                                                    🔧 AFTER <span className="text-xs bg-purple-700/50 px-2 py-0.5 rounded">Refined</span>
                                                </h3>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                                                        <div className="text-2xl font-bold text-white">{comparison.after.trades}</div>
                                                        <div className="text-xs text-purple-400">Trades</div>
                                                    </div>
                                                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                                                        <div className="text-2xl font-bold text-white">{comparison.after.winRate}%</div>
                                                        <div className="text-xs text-purple-400">Win Rate</div>
                                                    </div>
                                                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                                                        <div className="text-2xl font-bold text-white">{comparison.after.totalPnl}%</div>
                                                        <div className="text-xs text-purple-400">Total PnL</div>
                                                    </div>
                                                    <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                                                        <div className="text-2xl font-bold text-white">{comparison.after.expectancy}</div>
                                                        <div className="text-xs text-purple-400">Expectancy</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Delta Summary */}
                                        <div className="bg-slate-800/30 rounded-xl p-5 border border-slate-700">
                                            <h3 className="text-sm font-semibold text-white mb-4">📈 IMPROVEMENT DELTA</h3>
                                            <div className="grid grid-cols-6 gap-4">
                                                {[
                                                    { label: 'Trades', before: comparison.before.trades, after: comparison.after.trades, lowerBetter: true },
                                                    { label: 'Win Rate', before: comparison.before.winRate, after: comparison.after.winRate },
                                                    { label: 'PnL', before: comparison.before.totalPnl, after: comparison.after.totalPnl },
                                                    { label: 'Expectancy', before: comparison.before.expectancy, after: comparison.after.expectancy },
                                                    { label: 'Capital Safe', before: comparison.before.capitalWinRate, after: comparison.after.capitalWinRate },
                                                    { label: 'Avg Hold', before: comparison.before.avgHoldingDays, after: comparison.after.avgHoldingDays }
                                                ].map((item, i) => {
                                                    const delta = calculateDelta(item.before, item.after);
                                                    const isGood = item.lowerBetter ? delta.direction === 'down' : delta.direction === 'up';
                                                    return (
                                                        <div key={i} className="text-center">
                                                            <div className={`text-lg font-bold ${isGood ? 'text-green-400' : delta.direction === 'neutral' ? 'text-slate-400' : 'text-red-400'}`}>
                                                                {delta.direction === 'up' ? '↑' : delta.direction === 'down' ? '↓' : '–'} {delta.percent}%
                                                            </div>
                                                            <div className="text-xs text-slate-500">{item.label}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Promote Button */}
                                        <div className="flex justify-center pt-2">
                                            <button
                                                onClick={() => setShowPromoteConfirm(true)}
                                                className="px-8 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-lg transition shadow-lg"
                                            >
                                                🚀 Promote Refined Logic to V1.b1
                                            </button>
                                        </div>
                                    </>
                                ) : comparison.before ? (
                                    /* Partial results - Pass 1 only */
                                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                        <div className="animate-spin text-4xl mb-4">⏳</div>
                                        <p className="text-lg">Running Pass 2 with refinements...</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                        <div className="text-6xl mb-4 opacity-30">🔬</div>
                                        <p className="text-center text-lg">Click "Run Research" to start</p>
                                        <p className="text-sm text-slate-500 mt-2">2-pass comparison: Original vs Refined</p>
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
