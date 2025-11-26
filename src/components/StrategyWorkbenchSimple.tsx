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
                    console.log('✅ V1 Strategy loaded (click "Promote V1" to use)');
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

    // Handle Promote V1
    const handlePromoteV1 = () => {
        if (!v1Strategy) return;

        const rulesText = [
            `📈 ENTRY: ${v1Strategy.rules.entry.logic}`,
            ``,
            `🎯 EXIT: Target +${v1Strategy.rules.exit.target}%, Stop -${v1Strategy.rules.exit.stop}%`,
            `⚡ RISK: ${v1Strategy.params?.positionSizing?.riskPerTrade || 1.5}% per trade`,
            `📊 ACCURACY: ${v1Strategy.metrics.accuracy}`,
            `🛡️ TRAPS: ${v1Strategy.rules.traps?.enabled ? 'ENABLED' : 'DISABLED'}`
        ].join('\n');

        setEditorLogic({
            description: v1Strategy.description,
            rules: rulesText.split('\n')
        });

        showToast('✅ V1 Strategy promoted to editor!', 'success');
    };

    // Handle CSV Download
    const handleDownloadCSV = async () => {
        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';

            // Request latest CSV for this category
            window.open(`${apiBase}/api/backtest/csv/${categoryKey}`, '_blank');
            showToast('📥 CSV downloaded!', 'success');
        } catch (error) {
            showToast('Failed to download CSV', 'error');
            console.error('CSV download error:', error);
        }
    };

    // Handle AI Sanity Check
    const handleSanityCheck = async () => {
        setIsValidating(true);
        setSanityCheckResults([]);

        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:5173';
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

    // Handle Run Backtest - Now triggers AUTO-STRATEGY GENERATION
    const handleRunBacktest = async () => {
        setIsRunningBacktest(true);
        setBacktestProgress(10);
        setEventReport(null);

        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';

            showToast('Running V1 strategy backtest...', 'info');
            setBacktestProgress(30);

            // Call V1 backtest API
            const response = await fetch(`${apiBase}/api/strategy/run-v1-backtest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryKey })
            });

            setBacktestProgress(70);

            const result = await response.json();

            if (!result.ok) {
                throw new Error(result.error || 'Failed to generate strategy');
            }

            setBacktestProgress(90);

            // DON'T update editor with backtest results to preserve user's strategy
            // Backtest results are only displayed in the results section below

            // Display backtest results
            if (result.backtest) {
                setEventReport({
                    categoryKey,
                    accuracy: result.backtest.accuracy,
                    totalTrades: result.backtest.totalTrades,
                    totalNetPnl: result.backtest.netPnl,
                    expectancy: result.backtest.expectancy,
                    maxDrawdown: result.backtest.maxDrawdown,
                    avgRMultiple: result.backtest.avgRMultiple
                });
            }

            setBacktestProgress(100);
            showToast(
                `Strategy generated! ${(result.backtest.accuracy * 100).toFixed(1)}% accuracy with ${result.backtest.totalTrades} trades`,
                'success'
            );

        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            showToast(`Generation failed: ${errorMsg}`, 'error');
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

                // Save V1 but DON'T auto-fill editor
                if (result.v1Strategy) {
                    setV1Strategy(result.v1Strategy);
                }

                showToast(`✅ Time-Travel Complete! Click "Promote V1" to use best strategy`, 'success');
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

                        {/* Strategy Editor */}
                        <div className="p-6 rounded-xl bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-slate-600/50 shadow-xl">
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="font-bold text-xl flex items-center text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                                    <DocumentTextIcon className="w-6 h-6 mr-2 text-cyan-400" />
                                    Strategy Definition
                                </h3>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="strategy-description" className="block text-sm font-semibold text-slate-200 mb-2 flex items-center">
                                        <span className="w-2 h-2 bg-cyan-400 rounded-full mr-2"></span>
                                        Description
                                    </label>
                                    <textarea
                                        id="strategy-description"
                                        placeholder="Enter a clear description of your trading strategy..."
                                        value={editorLogic.description}
                                        onChange={e => setEditorLogic({ ...editorLogic, description: e.target.value })}
                                        className="w-full bg-slate-900/60 rounded-lg p-3 text-sm h-20 resize-none border border-slate-600/50 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 transition-all text-slate-100 placeholder-slate-500"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="strategy-rules" className="block text-sm font-semibold text-slate-200 mb-2 flex items-center">
                                        <span className="w-2 h-2 bg-purple-400 rounded-full mr-2"></span>
                                        Trading Rules (one per line)
                                    </label>
                                    <textarea
                                        id="strategy-rules"
                                        placeholder="e.g., EMA(20) > EMA(50)&#10;RSI < 30&#10;Volume > 1.5x avg..."
                                        value={Array.isArray(editorLogic.rules) ? editorLogic.rules.join('\n') : String(editorLogic.rules || '')}
                                        onChange={e => setEditorLogic({ ...editorLogic, rules: e.target.value.split('\n') })}
                                        className="w-full bg-slate-900/60 rounded-lg p-3 text-sm font-mono h-36 resize-none border border-slate-600/50 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all text-slate-100 placeholder-slate-500"
                                    />
                                </div>
                            </div>

                        </div>

                        {/* AI Validation Results */}
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

                        {/* V1 Promote Section */}
                        {v1Strategy && (
                            <div className="p-5 bg-gradient-to-br from-emerald-900/20 to-green-900/20 border border-emerald-500/40 rounded-xl shadow-lg">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <h4 className="font-bold text-lg text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-green-300 flex items-center">
                                            <SparklesIcon className="w-5 h-5 mr-2 text-emerald-400" />
                                            ✨ V1 Strategy Available
                                        </h4>
                                        <p className="text-xs text-slate-400 mt-1">{v1Strategy.description}</p>
                                        <p className="text-xs text-emerald-400 mt-1">
                                            Accuracy: {v1Strategy.metrics?.accuracy || '100%'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={handlePromoteV1}
                                        className="ml-4 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white font-bold py-2 px-6 rounded-lg transition-all duration-200 shadow-lg hover:shadow-emerald-500/50 hover:scale-105 active:scale-95 flex items-center gap-2"
                                    >
                                        <SparklesIcon className="w-4 h-4" />
                                        Promote V1
                                    </button>
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

                        {/* Time-Travel Backtest Section */}
                        <div className="p-6 rounded-xl bg-gradient-to-br from-purple-900/30 to-indigo-900/30 border border-purple-500/40 shadow-xl">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-xl flex items-center text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
                                    <SparklesIcon className="w-6 h-6 mr-2 text-purple-400" />
                                    Time-Travel Backtest (200+ Logics)
                                </h3>
                            </div>

                            <p className="text-sm text-slate-300 mb-4">
                                Tests 200+ strategy combinations, detects all 10 institutional traps, and discovers what ACTUALLY works through time-travel validation.
                            </p>

                            {timeTravelResults && (
                                <div className="mb-4 p-4 bg-slate-800/60 rounded-lg space-y-3">
                                    <div className="text-sm font-bold text-purple-300">🏆 Top 3 Strategies:</div>
                                    {timeTravelResults.top3.map((strategy: any, idx: number) => (
                                        <div key={idx} className="text-xs text-slate-300 pl-4 border-l-2 border-purple-500/50">
                                            <div className="font-bold">#{idx + 1}: {strategy.logic}</div>
                                            <div className="text-slate-400">
                                                Win Rate: {strategy.metrics.winRate}% | Expectancy: {strategy.metrics.expectancy}% | Trades: {strategy.metrics.trades}
                                            </div>
                                        </div>
                                    ))}
                                    <div className="mt-3 pt-3 border-t border-purple-500/30 text-xs text-purple-300">
                                        ✨ V1 Strategy Created: {timeTravelResults.v1Strategy.expectedMetrics.accuracy} accuracy
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={handleTimeTravelBacktest}
                                disabled={isRunningTimeTravel}
                                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-4 px-6 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-purple-500/50 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                            >
                                {isRunningTimeTravel ? (
                                    <>
                                        <SpinnerIcon className="w-5 h-5 animate-spin" />
                                        Running Time-Travel Backtest... (5-10 min)
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-5 h-5" />
                                        🔮 Run Time-Travel Backtest
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
                                    onClick={handleDownloadCSV}
                                    className="mt-6 w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 shadow-lg hover:shadow-indigo-500/50 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                                >
                                    📥 Download CSV ({eventReport.totalTrades || 0} trades)
                                </button>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
};

export default StrategyWorkbenchSimple;
