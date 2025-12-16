import React, { useState, useEffect } from 'react';
import { StrategyLogic, CategoryEventReport } from '../types';
import { XMarkIcon } from './icons/XMarkIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { DocumentTextIcon } from './icons/DocumentTextIcon';
import { LightBulbIcon } from './icons/LightBulbIcon';
import { WrenchScrewdriverIcon } from './icons/WrenchScrewdriverIcon';
import { BarChartIcon } from './icons/BarChartIcon';
import { startBacktest, getBacktestStatus, getBacktestResult } from '../api';
import { loadCategoryEventReport } from '../lib/eventReports';

interface StrategyWorkbenchSimpleProps {
    isOpen: boolean;
    onClose: () => void;
    categoryKey: string;
    initialLogic: StrategyLogic;
    onSaveStrategy: (categoryKey: string, newLogic: StrategyLogic) => void;
}

const StrategyWorkbenchSimple: React.FC<StrategyWorkbenchSimpleProps> = ({
    isOpen,
    onClose,
    categoryKey,
    initialLogic,
    onSaveStrategy
}) => {
    // State
    const [editorLogic, setEditorLogic] = useState<StrategyLogic>(initialLogic);
    const [sanityCheckResults, setSanityCheckResults] = useState<string[]>([]);
    const [isValidating, setIsValidating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isRunningBacktest, setIsRunningBacktest] = useState(false);
    const [backtestProgress, setBacktestProgress] = useState(0);
    const [eventReport, setEventReport] = useState<CategoryEventReport | null>(null);
    const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' | 'info' } | null>(null);
    const [isRunningTimeTravel, setIsRunningTimeTravel] = useState(false);
    const [timeTravelResults, setTimeTravelResults] = useState<any>(null);
    const [v1Strategy, setV1Strategy] = useState<any>(null);
    const [isLoadingV1, setIsLoadingV1] = useState(false);

    // Load event report on mount
    useEffect(() => {
        loadCategoryEventReport(categoryKey).then(report => {
            if (report) setEventReport(report);
        });
    }, [categoryKey]);

    // Load V1 strategy on mount
    useEffect(() => {
        const loadV1Strategy = async () => {
            setIsLoadingV1(true);
            try {
                const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
                const response = await fetch(`${apiBase}/api/categories/${categoryKey}/v1-strategy`);

                if (response.ok) {
                    const data = await response.json();
                    setV1Strategy(data.strategy);
                    console.log('✅ V1 Strategy loaded:', data.strategy);
                } else {
                    console.log('⚠️ No V1 strategy found - run Time-Travel first');
                }
            } catch (error) {
                console.error('❌ Failed to load V1:', error);
            } finally {
                setIsLoadingV1(false);
            }
        };

        loadV1Strategy();
    }, [categoryKey]);

    // Toast helper
    const showToast = (msg: string, kind: 'success' | 'error' | 'info' = 'info') => {
        setToast({ msg, kind });
        setTimeout(() => setToast(null), 3000);
    };

    // Handle AI Sanity Check
    const handleSanityCheck = async () => {
        setIsValidating(true);
        setSanityCheckResults([]);

        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:5174';
            const response = await fetch(`${apiBase}/api/ai/validate-signal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    strategy: editorLogic,
                    categoryKey,
                    marketConditions: { timestamp: new Date().toISOString() }
                })
            });

            const result = await response.json();

            if (result.ok && result.passed) {
                setSanityCheckResults([
                    `✅ Strategy validated successfully!`,
                    `Confidence: ${(result.confidence * 100).toFixed(0)}%`,
                    '',
                    ...(result.suggestions || [])
                ]);
                showToast('Strategy validation passed!', 'success');
            } else {
                setSanityCheckResults([
                    `⚠️ Strategy validation found issues`,
                    `Confidence: ${(result.confidence * 100).toFixed(0)}%`,
                    '',
                    ...(result.issues || ['No specific issues reported'])
                ]);
                showToast('Validation found issues', 'info');
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            setSanityCheckResults([
                '❌ Failed to validate strategy',
                'Check that backend is running and try again',
                '',
                `Error: ${errorMsg}`
            ]);
            showToast('Validation failed', 'error');
        } finally {
            setIsValidating(false);
        }
    };

    // Handle Save Strategy
    const handleSave = async () => {
        setIsSaving(true);
        try {
            onSaveStrategy(categoryKey, editorLogic);
            showToast('Strategy saved successfully!', 'success');
        } catch (error) {
            showToast('Failed to save strategy', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    // Handle Run Backtest - Now triggers REALISTIC TRADING SIMULATION
    const handleRunBacktest = async () => {
        setIsRunningBacktest(true);
        setBacktestProgress(10);
        setEventReport(null);

        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';

            showToast('🎯 Running Realistic Trading Simulation (6 phases)...', 'info');
            setBacktestProgress(30);

            // Call Realistic Simulation API (includes signal delays, partial exits, lifecycle states)
            const response = await fetch(`${apiBase}/api/strategy/realistic-simulation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryKey, backtestMode: true })
            });

            setBacktestProgress(70);

            const result = await response.json();

            if (!result.ok) {
                throw new Error(result.error || 'Failed to run realistic simulation');
            }

            setBacktestProgress(90);

            // Update editor with strategy info
            if (editorLogic) {
                setEditorLogic({
                    ...editorLogic,
                    description: `Realistic Simulation - ${result.summary.executedTrades} trades, ${result.summary.winRate}% win rate`
                });
            }

            // Display backtest results from realistic simulation
            const summary = result.summary;
            setEventReport({
                categoryKey,
                accuracy: parseFloat(summary.winRate) / 100,
                totalTrades: summary.executedTrades,
                totalNetPnl: parseFloat(summary.avgPnl) * summary.executedTrades,
                expectancy: parseFloat(summary.avgPnl) / 100,
                maxDrawdown: summary.losses,
                avgRMultiple: summary.executedTrades > 0 ? (summary.wins - summary.losses) / summary.executedTrades : 0,
                // New realistic simulation stats
                invalidatedSignals: summary.invalidatedSignals,
                totalSignals: summary.totalSignalsGenerated
            });

            // Store CSV path for download
            if (result.files?.json) {
                (window as any).__LAST_REALISTIC_RESULTS = result.files.json;
            }

            setBacktestProgress(100);
            showToast(
                `✅ Realistic Sim Complete! ${summary.winRate}% win rate, ${summary.executedTrades} trades (${summary.invalidatedSignals} invalidated by delay)`,
                'success'
            );

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            showToast(`Simulation failed: ${errorMsg}`, 'error');
        } finally {
            setIsRunningBacktest(false);
            setBacktestProgress(0);
        }
    };

    // Handle Time-Travel Backtest
    const handleTimeTravelBacktest = async () => {
        console.log('🔮 [Time-Travel] Button clicked!');
        console.log(`   Category Key: "${categoryKey}"`);

        setIsRunningTimeTravel(true);
        setTimeTravelResults(null);
        showToast('🔮 Starting Time-Travel Backtest... Testing 200+ logics!', 'info');

        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            const url = `${apiBase}/api/strategy/time-travel-backtest`;

            console.log(`🌐 [Time-Travel] API URL: ${url}`);
            console.log(`📤 [Time-Travel] Sending request with body:`, { categoryKey });

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryKey })
            });

            console.log(`📥 [Time-Travel] Response status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ [Time-Travel] API error response:`, errorText);
                throw new Error(`API error: ${response.statusText}`);
            }

            const result = await response.json();
            console.log(`✅ [Time-Travel] Got result:`, result);

            if (result.ok) {
                setTimeTravelResults(result);

                // ✅ AUTO-POPULATE V1 STRATEGY INTO TEXT BOXES
                if (result.v1Strategy) {
                    const v1 = result.v1Strategy;

                    // Build trading rules text
                    const rulesText = [
                        `📈 ENTRY: ${v1.entryRules.logic}`,
                        ``,
                        `🎯 EXIT RULES:`,
                        `  • Target: +${v1.exitRules.target}%`,
                        `  • Stop Loss: -${v1.exitRules.stop}%`,
                        `  • Max Holding: 10 days`,
                        ``,
                        `⚡ POSITION SIZING:`,
                        `  • Risk per trade: ${v1.positionSizing.riskPerTrade}%`,
                        `  • Max positions: ${v1.positionSizing.maxPositions}`,
                        ``,
                        `📊 EXPECTED METRICS:`,
                        `  • Accuracy: ${v1.expectedMetrics.accuracy}`,
                        `  • Expectancy: ${v1.expectedMetrics.expectancy}`,
                        `  • Avg Holding: ${v1.expectedMetrics.avgHolding}`,
                        ``,
                        `🛡️ INSTITUTIONAL TRAP FILTER: ${v1.trapFilters.enabled ? 'ENABLED' : 'DISABLED'}`
                    ].join('\n');

                    // Populate editor
                    setEditorLogic({
                        description: v1.name + ` - ${v1.entryRules.description}`,
                        rules: rulesText.split('\n'),
                        entry: v1.entryRules.logic,
                        target: v1.exitRules.target,
                        stopLoss: v1.exitRules.stop
                    });

                    console.log('✅ V1 Strategy auto-populated into editor text boxes!');
                }

                showToast(`✅ Time-Travel Complete! V1 Strategy loaded into editor`, 'success');
            } else {
                throw new Error(result.error || 'Unknown error');
            }
        } catch (error: any) {
            console.error('❌ [Time-Travel] Backtest error:', error);
            console.error('❌ [Time-Travel] Error stack:', error.stack);
            showToast(`❌ Error: ${error.message}`, 'error');
        } finally {
            console.log('🏁 [Time-Travel] Request completed (success or error)');
            setIsRunningTimeTravel(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-stretch z-50 animate-fade-in-down" onClick={onClose} role="dialog" aria-modal="true">
            <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full mx-4 my-6 flex flex-col h-[calc(100vh-3rem)] max-w-6xl" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex-shrink-0 flex justify-between items-center p-6 border-b border-slate-700">
                    <div>
                        <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 flex items-center">
                            <WrenchScrewdriverIcon className="w-7 h-7 mr-3 text-cyan-400" />
                            Strategy Workbench
                        </h2>
                        <div className="mt-2 px-3 py-1 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-400/40 rounded-full inline-block">
                            <span className="text-sm font-mono font-bold text-cyan-300">{categoryKey.replace(/_/g, ' ')}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-all hover:rotate-90 duration-300" aria-label="Close workbench">
                        <XMarkIcon className="w-7 h-7" />
                    </button>
                </div>

                {/* Toast */}
                {toast && (
                    <div className={`absolute top-20 right-6 px-4 py-2 rounded-lg text-sm shadow-lg z-10 ${toast.kind === 'success' ? 'bg-emerald-700 text-white' :
                        toast.kind === 'error' ? 'bg-red-700 text-white' :
                            'bg-slate-700text-slate-200'
                        }`}>
                        {toast.msg}
                    </div>
                )}

                {/* Main Content */}
                <div className="flex-grow p-6 overflow-y-auto">
                    <div className="max-w-4xl mx-auto space-y-6">

                        {/* V1 Strategy Status Panel - Shows promoted strategy from Labs */}
                        {v1Strategy ? (
                            <div className="p-5 rounded-xl bg-gradient-to-br from-emerald-900/40 to-green-900/30 border border-emerald-500/40 shadow-xl mb-6">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="font-bold text-lg flex items-center text-emerald-300">
                                        ✅ Active Strategy: <span className="ml-2 px-2 py-0.5 bg-emerald-600 rounded text-white text-sm">{v1Strategy.version || 'V1'}</span>
                                    </h3>
                                    <span className="text-xs text-emerald-400/70">
                                        ID: {v1Strategy.id} | Updated: {v1Strategy.updatedAt ? new Date(v1Strategy.updatedAt).toLocaleDateString() : 'Recently'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div className="bg-slate-900/60 rounded-lg p-3 border border-emerald-500/20">
                                        <div className="text-xs text-emerald-400 font-semibold mb-2">📈 ENTRY RULES</div>
                                        <div className="text-slate-200 font-mono text-xs whitespace-pre-wrap">
                                            {typeof v1Strategy.rules === 'object' && v1Strategy.rules?.entry?.logic
                                                ? v1Strategy.rules.entry.logic
                                                : typeof v1Strategy.rules === 'object'
                                                    ? JSON.stringify(v1Strategy.rules, null, 2).substring(0, 200)
                                                    : String(v1Strategy.rules || 'No rules defined')}
                                        </div>
                                    </div>

                                    <div className="bg-slate-900/60 rounded-lg p-3 border border-emerald-500/20">
                                        <div className="text-xs text-emerald-400 font-semibold mb-2">🎯 EXIT RULES</div>
                                        <div className="text-slate-200 font-mono text-xs">
                                            {v1Strategy.params?.target && <div>Target: +{v1Strategy.params.target}%</div>}
                                            {v1Strategy.params?.stop && <div>Stop: -{v1Strategy.params.stop}%</div>}
                                            {!v1Strategy.params?.target && (
                                                <div className="whitespace-pre-wrap">{JSON.stringify(v1Strategy.params, null, 2).substring(0, 100)}</div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {v1Strategy.metrics && (
                                    <div className="mt-3 flex gap-4 text-xs">
                                        <span className="text-emerald-400">Accuracy: {v1Strategy.metrics.accuracy || '—'}</span>
                                        <span className="text-cyan-400">Expectancy: {v1Strategy.metrics.expectancy || '—'}</span>
                                    </div>
                                )}
                            </div>
                        ) : isLoadingV1 ? (
                            <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-600/50 flex items-center gap-3 mb-6">
                                <SpinnerIcon className="w-5 h-5 animate-spin text-cyan-400" />
                                <span className="text-slate-400">Loading V1 strategy...</span>
                            </div>
                        ) : (
                            <div className="p-4 rounded-xl bg-amber-900/30 border border-amber-500/40 text-amber-300 text-sm mb-6">
                                ⚠️ No V1 strategy found for this category. Run Time-Travel Labs first to generate one.
                            </div>
                        )}

                        {/* Run Backtest Section - Strategy is displayed in V1 panel above */}
                        {sanityCheckResults.length > 0 && (
                            <div className="p-5 bg-gradient-to-br from-purple-900/30 to-purple-800/20 border border-purple-500/40 rounded-xl shadow-lg animate-fade-in-down backdrop-blur-sm">
                                <div className="flex items-center gap-2 mb-3">
                                    <LightBulbIcon className="w-5 h-5 text-yellow-400 animate-pulse" />
                                    <h4 className="font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-pink-300">AI Validation Results</h4>
                                </div>
                                <div className="bg-slate-900/60 rounded-lg p-4 border border-purple-500/20">
                                    <ul className="text-sm text-slate-200 space-y-2">
                                        {sanityCheckResults.map((s, i) => (
                                            <li key={i} className="flex items-start gap-3">
                                                <span className="text-purple-400 mt-0.5 font-bold">•</span>
                                                <span className="flex-1">{s}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}

                        {/* Run Backtest Section */}
                        <div className="p-6 rounded-xl bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-slate-600/50 shadow-xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-xl flex items-center text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-green-500">
                                    <WrenchScrewdriverIcon className="w-6 h-6 mr-2 text-emerald-400" />
                                    Run Backtest
                                </h3>
                            </div>

                            {isRunningBacktest && backtestProgress > 0 && (
                                <div className="mb-4 space-y-2">
                                    <div className="text-sm text-slate-400">Progress: {backtestProgress.toFixed(0)}%</div>
                                    <div className="h-2 w-full bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-emerald-500 to-green-500 transition-all duration-300"
                                            style={{ width: `${backtestProgress}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={handleRunBacktest}
                                disabled={isRunningBacktest || !editorLogic.description}
                                className="w-full bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold py-4 px-6 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-emerald-500/50 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                            >
                                {isRunningBacktest ? (
                                    <>
                                        <SpinnerIcon className="w-5 h-5 animate-spin" />
                                        Running Backtest...
                                    </>
                                ) : (
                                    <>
                                        <WrenchScrewdriverIcon className="w-5 h-5" />
                                        Run Backtest
                                    </>
                                )}
                            </button>
                        </div>


                        {/* Results Display */}
                        {eventReport && (
                            <div className="p-6 rounded-xl bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-slate-600/50 shadow-xl">
                                <h3 className="font-bold text-xl flex items-center text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-4">
                                    <BarChartIcon className="w-6 h-6 mr-2 text-cyan-400" />
                                    Backtest Results
                                </h3>

                                {typeof eventReport.accuracy === 'number' && eventReport.accuracy < 0.7 && (
                                    <div className="mb-4 px-4 py-2 rounded-lg bg-red-900/30 border border-red-700/50 text-red-300 text-sm">
                                        ⚠️ Low accuracy {(eventReport.accuracy * 100).toFixed(1)}% — below 70% threshold
                                    </div>
                                )}

                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-700/50">
                                        <div className="text-xs text-slate-400 mb-1">Accuracy</div>
                                        <div className="text-2xl font-bold text-emerald-400">
                                            {typeof eventReport.accuracy === 'number' ? (eventReport.accuracy * 100).toFixed(1) + '%' : '—'}
                                        </div>
                                    </div>

                                    <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-700/50">
                                        <div className="text-xs text-slate-400 mb-1">Total Trades</div>
                                        <div className="text-2xl font-bold text-cyan-400">{eventReport.totalTrades || 0}</div>
                                    </div>

                                    <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-700/50">
                                        <div className="text-xs text-slate-400 mb-1">Net P&L</div>
                                        <div className={`text-2xl font-bold ${typeof eventReport.totalNetPnl === 'number' && eventReport.totalNetPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            ₹{typeof eventReport.totalNetPnl === 'number' ? eventReport.totalNetPnl.toFixed(0) : '—'}
                                        </div>
                                    </div>

                                    <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-700/50">
                                        <div className="text-xs text-slate-400 mb-1">Expectancy</div>
                                        <div className={`text-2xl font-bold ${typeof eventReport.expectancy === 'number' && eventReport.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {typeof eventReport.expectancy === 'number' ? eventReport.expectancy.toFixed(3) : '—'}
                                        </div>
                                    </div>

                                    <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-700/50">
                                        <div className="text-xs text-slate-400 mb-1">Max Drawdown</div>
                                        <div className="text-2xl font-bold text-yellow-400">
                                            {typeof eventReport.maxDrawdown === 'number' ? eventReport.maxDrawdown.toFixed(0) : '—'}
                                        </div>
                                    </div>

                                    <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-700/50">
                                        <div className="text-xs text-slate-400 mb-1">Avg R Multiple</div>
                                        <div className="text-2xl font-bold text-purple-400">
                                            {typeof eventReport.avgRMultiple === 'number' ? eventReport.avgRMultiple.toFixed(2) : '—'}
                                        </div>
                                    </div>
                                </div>

                                {/* CSV Download Button */}
                                <button
                                    onClick={async () => {
                                        if (!eventReport) {
                                            showToast('No backtest results available', 'error');
                                            return;
                                        }

                                        try {
                                            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
                                            showToast('Downloading realistic simulation CSV...', 'info');

                                            // Get latest realistic simulation CSV
                                            const response = await fetch(`${apiBase}/api/backtest/csv/realistic_${categoryKey}`);

                                            if (!response.ok) {
                                                throw new Error('CSV file not found. Run backtest first.');
                                            }

                                            // Download the CSV file
                                            const blob = await response.blob();
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `${categoryKey}_trades_${new Date().toISOString().split('T')[0]}.csv`;
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);
                                            URL.revokeObjectURL(url);

                                            showToast(`CSV downloaded! ${eventReport.totalTrades || 0} trades with full details`, 'success');
                                        } catch (error: any) {
                                            console.error('[CSV Download] Error:', error);
                                            showToast(`Failed to download CSV: ${error.message}`, 'error');
                                        }
                                    }}
                                    className="mt-6 w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 shadow-lg hover:shadow-indigo-500/50 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                                >
                                    📥 Download CSV ({eventReport.totalTrades || 0} trades)
                                </button>
                            </div>
                        )}

                        {/* Shadow Learner AI */}
                        <div className="p-6 rounded-xl bg-gradient-to-br from-purple-900/30 to-indigo-900/30 border border-purple-500/40 shadow-xl">
                            <h3 className="font-bold text-xl flex items-center text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500 mb-4">
                                <SparklesIcon className="w-6 h-6 mr-2 text-purple-400" />
                                🧠 Shadow Learner AI
                            </h3>
                            <p className="text-sm text-slate-300 mb-4">
                                AI learns from backtest outcomes and discovers patterns to improve strategy performance.
                            </p>

                            <div className="space-y-3 text-sm text-slate-300">
                                <div className="flex items-start gap-3">
                                    <span className="text-purple-400 mt-1">📊</span>
                                    <div>
                                        <strong className="text-purple-300">Pattern Recognition:</strong>
                                        <p className="text-slate-400 text-xs mt-1">Analyzes winning vs. losing trades to identify entry/exit patterns that maximize R-multiple.</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <span className="text-purple-400 mt-1">🎯</span>
                                    <div>
                                        <strong className="text-purple-300">Parameter Optimization:</strong>
                                        <p className="text-slate-400 text-xs mt-1">Suggests optimal RSI, EMA, and Bollinger Band parameters based on historical performance.</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <span className="text-purple-400 mt-1">🚫</span>
                                    <div>
                                        <strong className="text-purple-300">Trap Avoidance Learning:</strong>
                                        <p className="text-slate-400 text-xs mt-1">Identifies which institutional traps caused losses and refines detection logic.</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <span className="text-purple-400 mt-1">💡</span>
                                    <div>
                                        <strong className="text-purple-300">Continuous Improvement:</strong>
                                        <p className="text-slate-400 text-xs mt-1">Each backtest refines the model, creating progressively better strategies over time.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 p-3 bg-slate-900/60 rounded-lg border border-purple-500/20">
                                <div className="text-xs text-purple-300 font-semibold mb-1">💎 AI Insight</div>
                                <div className="text-xs text-slate-400">
                                    {eventReport ?
                                        `Based on ${eventReport.totalTrades} trades, the AI suggests focusing on higher R-multiple setups (>2.0) and stricter trap detection for ${categoryKey.replace(/_/g, ' ')}.`
                                        : 'Run a backtest to receive AI-powered insights and recommendations.'}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default StrategyWorkbenchSimple;
