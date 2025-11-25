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

    // Load event report on mount
    useEffect(() => {
        loadCategoryEventReport(categoryKey).then(report => {
            if (report) setEventReport(report);
        });
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

    // Handle Run Backtest
    const handleRunBacktest = async () => {
        setIsRunningBacktest(true);
        setBacktestProgress(0);
        setEventReport(null);

        try {
            // Start backtest
            const startResp = await startBacktest(categoryKey);
            if (!startResp.ok || !startResp.jobId) {
                throw new Error(startResp.error || 'Failed to start backtest');
            }

            const jobId = startResp.jobId;
            showToast('Backtest started...', 'info');

            // Poll for status
            let done = false;
            while (!done) {
                await new Promise(resolve => setTimeout(resolve, 1000));

                const statusResp = await getBacktestStatus(jobId);
                if (!statusResp.ok) break;

                if (statusResp.status === 'done') {
                    done = true;
                    const resultResp = await getBacktestResult(jobId);
                    if (resultResp.ok && resultResp.result) {
                        setEventReport(resultResp.result);
                        showToast('Backtest completed!', 'success');
                    }
                } else if (statusResp.status === 'error' || statusResp.status === 'cancelled') {
                    throw new Error(statusResp.message || 'Backtest failed');
                } else {
                    // Update progress
                    const progress = statusResp.progress && statusResp.total
                        ? (statusResp.progress / statusResp.total) * 100
                        : 10;
                    setBacktestProgress(Math.min(progress, 99));
                }
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            showToast(`Backtest failed: ${errorMsg}`, 'error');
        } finally {
            setIsRunningBacktest(false);
            setBacktestProgress(0);
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

                            <div className="mt-6 flex justify-between items-center gap-3">
                                <button
                                    onClick={handleSanityCheck}
                                    disabled={!editorLogic.description || (Array.isArray(editorLogic.rules) && editorLogic.rules.every(r => r === '')) || isValidating}
                                    className="flex-1 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white text-sm font-bold py-3 px-5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-purple-500/50 hover:scale-[1.02] active:scale-95"
                                >
                                    {isValidating ? (
                                        <>
                                            <SpinnerIcon className="w-5 h-5 mr-2 animate-spin" />
                                            Validating...
                                        </>
                                    ) : (
                                        <>
                                            <SparklesIcon className="w-5 h-5 mr-2" />
                                            AI Sanity Check
                                        </>
                                    )}
                                </button>

                                <button
                                    onClick={handleSave}
                                    disabled={!editorLogic.description || (Array.isArray(editorLogic.rules) && editorLogic.rules.every(r => r === '')) || isSaving}
                                    className="flex-1 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-cyan-500/50 hover:scale-[1.02] active:scale-95"
                                >
                                    {isSaving ? 'Saving...' : 'Save Strategy'}
                                </button>
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
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
};

export default StrategyWorkbenchSimple;
