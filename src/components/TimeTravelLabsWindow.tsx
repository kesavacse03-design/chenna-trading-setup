import React, { useState, useEffect } from 'react';
import { XMarkIcon } from './icons/XMarkIcon';
import { BeakerIcon } from './icons/BeakerIcon';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { ShadowReportPanel } from './ShadowReportPanel';
import { ResearchBacktestModal } from './ResearchBacktestModal';

// Helper to safely convert metrics to numbers (prevents .toFixed() TypeError)
function safeNumber(value: any, fallback = 0): number {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'number' && !isNaN(value)) return value;
    if (typeof value === 'object' && value !== null && 'value' in value) return safeNumber(value.value, fallback);
    const parsed = parseFloat(value);
    return isNaN(parsed) ? fallback : parsed;
}

interface TimeTravelLabsWindowProps {
    isOpen: boolean;
    onClose: () => void;
    categoryKey: string;
}

interface LabsResult {
    runId: string;
    ttVersion: string;
    accuracy: number;
    recommendedLogic: {
        entry: Record<string, any>;
        exit: Record<string, any>;
        trapAvoidance: string[];
    };
    metrics: {
        pnl: number;
        drawdown: number;
        winRate: number;
        expectancy: number;
    };
    cacheStatus: {
        cached: number;
        uncached: number;
        total: number;
    };
    promotionAllowed: boolean;
    v1Exists: boolean;
    message?: string;
}

export const TimeTravelLabsWindow: React.FC<TimeTravelLabsWindowProps> = ({
    isOpen,
    onClose,
    categoryKey
}) => {
    const [isRunning, setIsRunning] = useState(false);
    const [result, setResult] = useState<LabsResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [cacheStatus, setCacheStatus] = useState<{ cached: number; uncached: number; total: number } | null>(null);
    const [previousVersions, setPreviousVersions] = useState<any[]>([]);
    const [selectedVersion, setSelectedVersion] = useState<any | null>(null);

    // Quick Mode controls - user can test on subset of oldest stocks
    const [quickMode, setQuickMode] = useState(false);
    const [stockCount, setStockCount] = useState(10);
    const [forceRefresh, setForceRefresh] = useState(false);

    // Research Backtest Modal (replaces inline backtest)
    const [showResearchModal, setShowResearchModal] = useState(false);

    // Load cache status AND previous results when window opens
    useEffect(() => {
        if (isOpen) {
            loadCacheStatus();
            loadPreviousTTVersions();
            loadLatestResult(); // Load previous result if available
            setError(null);
            setLogs([]);
        }
    }, [isOpen, categoryKey]);

    // Load the latest Labs result from saved files on backend
    const loadLatestResult = async () => {
        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            const response = await fetch(`${apiBase}/api/labs/latest/${categoryKey}`);
            const data = await response.json();

            console.log('[Labs] API response:', data);

            if (data.ok && data.hasResult && data.result) {
                console.log(`[Labs] Loaded previous result from ${data.fileName}`);

                // Transform the result to match LabsResult interface
                const loadedResult = data.result;
                const topStrategy = loadedResult.top3Strategies?.[0] || loadedResult.summary?.topStrategy;
                const winRate = loadedResult.summary?.topWinRate || topStrategy?.metrics?.winRate || 0;

                setResult({
                    runId: loadedResult.runId || data.fileName,
                    ttVersion: loadedResult.runId?.replace(`tt_${categoryKey}_`, 'TT-') || 'TT-Previous',
                    accuracy: winRate / 100, // Convert percentage to decimal
                    recommendedLogic: loadedResult.v1Strategy || {
                        entry: {
                            logic: topStrategy?.name?.name || topStrategy?.name || 'Unknown',
                            description: 'Best performing logic from top-ranked strategy'
                        },
                        exit: topStrategy?.name?.exit || topStrategy?.exit || { target: 2.5, stop: 1.5 },
                        trapAvoidance: []
                    },
                    metrics: {
                        pnl: topStrategy?.metrics?.avgPnl || 0,
                        drawdown: topStrategy?.metrics?.maxDrawdown || 0,
                        winRate: winRate,
                        expectancy: topStrategy?.metrics?.expectancy || 0
                    },
                    cacheStatus: loadedResult.cacheStatus || { cached: 0, uncached: 0, total: 0 },
                    promotionAllowed: winRate >= 70,
                    v1Exists: true,
                    message: `Previous Labs result loaded`,
                    // ✅ Institutional output fields
                    thesis: loadedResult.v1Strategy?.thesis || null,
                    categoryIntent: loadedResult.v1Strategy?.categoryIntent || null,
                    confirmations: loadedResult.v1Strategy?.confirmations || [],
                    invalidations: loadedResult.v1Strategy?.invalidations || [],
                    expectedBehavior: loadedResult.v1Strategy?.expectedBehavior || null
                } as any);
                setLogs([
                    `📖 Loaded previous Labs result from ${data.fileName}`,
                    `✅ Version: ${loadedResult.runId || data.fileName}`,
                    `📊 Accuracy: ${winRate}%`,
                    `🎯 Strategy: ${topStrategy?.name?.name || topStrategy?.name || 'Unknown'}`
                ]);
            } else {
                // No previous result - show empty state
                console.log('[Labs] No previous result found:', data.error || 'No data');
                setResult(null);
                setLogs([]);
            }
        } catch (err) {
            console.error('[Labs] Failed to load latest result:', err);
            setResult(null);
        }
    };

    const loadCacheStatus = async () => {
        // TODO: Backend endpoint /api/labs/cache-status/:categoryKey not implemented yet
        // Commenting out to prevent 404 errors
        /*
        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            const response = await fetch(`${apiBase}/api/labs/cache-status/${categoryKey}`);
            const data = await response.json();

            if (data.ok) {
                setCacheStatus({
                    cached: data.cached,
                    uncached: data.uncached,
                    total: data.totalStocks
                });
            }
        } catch (err) {
            console.error('[Labs] Failed to load cache status:', err);
        }
        */
    };

    const loadPreviousTTVersions = async () => {
        // TODO: Backend endpoint /api/labs/runs/:categoryKey not implemented yet
        // Commenting out to prevent 404 errors
        /*
        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            const response = await fetch(`${apiBase}/api/labs/runs/${categoryKey}`);
            const data = await response.json();

            if (data.ok && data.runs && data.runs.length > 0) {
                setPreviousVersions(data.runs);
                setSelectedVersion(data.runs[0]); // Select most recent by default
                console.log(`[Labs] Loaded ${data.runs.length} previous TT versions`);
            }
        } catch (err) {
            console.error('[Labs] Failed to load previous versions:', err);
        }
        */
    };

    const handleDeleteVersion = async (runId: string, ttVersion: string) => {
        if (!window.confirm(`Delete ${ttVersion}? This cannot be undone.`)) return;

        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            const response = await fetch(`${apiBase}/api/labs/run/${runId}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (data.ok) {
                setLogs(prev => [...prev, `🗑️ Deleted ${data.deleted}`]);
                // Reload previous versions list
                await loadPreviousTTVersions();
                // Clear selected version if it was the deleted one
                if (selectedVersion?.id === runId) {
                    setSelectedVersion(null);
                }
            } else {
                throw new Error(data.error);
            }
        } catch (err: any) {
            alert(`Failed to delete: ${err.message}`);
            console.error('[Labs] Delete error:', err);
        }
    };

    const handleViewVersion = (version: any) => {
        setSelectedVersion(version);
        // Format and display as result
        setResult({
            runId: version.id,
            ttVersion: version.ttVersion,
            accuracy: parseFloat(version.accuracy) / 100,
            recommendedLogic: version.recommendedLogic || {
                entry: version.entryConditions || {},
                exit: version.exitConditions || {},
                trapAvoidance: version.trapRules ? Object.keys(version.trapRules) : []
            },
            metrics: version.performanceMetrics || {
                pnl: 0,
                drawdown: 0,
                winRate: 0,
                expectancy: 0
            },
            cacheStatus: version.cacheStatus || { cached: 0, uncached: 0, total: 0 },
            promotionAllowed: parseFloat(version.accuracy) >= 70,
            v1Exists: false,  // Will be checked if user tries to promote
            message: `Viewing ${version.ttVersion}`
        });
        setLogs(prev => [...prev, `📖 Viewing ${version.ttVersion} history`]);
    };

    const handleRunLabs = async () => {
        setIsRunning(true);
        setError(null);
        setLogs(['🔬 Starting Time-Travel Labs research...']);

        try {
            // Get stocks from category
            const { getCategoryStocks } = await import('../api');
            const stocks = await getCategoryStocks(categoryKey);

            setLogs(prev => [...prev, `📊 Loaded ${stocks.length} stocks from ${categoryKey}`]);

            // Call Labs API
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            setLogs(prev => [...prev, '🧪 Testing 220+ technical combinations...']);

            const response = await fetch(`${apiBase}/api/strategy/time-travel-backtest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoryKey,
                    quickMode,      // User's quick mode setting
                    stockCount,     // Number of oldest stocks to test
                    forceRefresh    // Clear cache and run fresh
                })
            });

            const data = await response.json().catch(jsonErr => {
                console.error('[Labs] JSON parse failed:', jsonErr);
                throw new Error('Invalid response from server. Please check backend logs.');
            });


            if (data.ok) {
                // Defensive transformation - handle varying backend response structures
                console.log('[Labs] Backend response:', data);

                // Check if we have v1Strategy data
                const hasV1 = data.v1Strategy && typeof data.v1Strategy === 'object';
                const v1 = hasV1 ? data.v1Strategy : null;

                // Also check top3 for metrics if v1 metrics are strings
                const top3 = data.top3?.[0];
                const top3Metrics = top3?.metrics || {};

                // Parse percentage strings like "0.0%" to numbers
                const parsePercent = (val: any): number => {
                    if (typeof val === 'number') return val / 100;
                    if (typeof val === 'string') {
                        const num = parseFloat(val.replace('%', '').replace(' days', ''));
                        return isNaN(num) ? 0 : num / 100;
                    }
                    return 0;
                };

                const transformedResult: LabsResult = {
                    runId: data.runId || `TT-${Date.now()}`,
                    ttVersion: data.stats?.ttVersion || 'TT-V1',
                    accuracy: parsePercent(v1?.expectedMetrics?.accuracy) || safeNumber(top3Metrics.winRate) / 100 || 0,
                    recommendedLogic: {
                        entry: v1?.entryRules || top3?.logic || { info: 'No entry conditions available' },
                        exit: v1?.exitRules || { target: 2.5, stop: 1.5 },
                        trapAvoidance: v1?.trapFilters ? [
                            v1.trapFilters.enabled ? 'Trap filtering enabled' : 'Trap filtering disabled',
                            v1.trapFilters.skipOnTraps ? 'Skip trades on trap detection' : null,
                            v1.trapFilters.minConfidence ? `Min confidence: ${v1.trapFilters.minConfidence}` : null
                        ].filter(Boolean) as string[] : ['No trap avoidance rules configured']
                    },
                    metrics: {
                        pnl: safeNumber(top3Metrics.avgPnl) * safeNumber(top3Metrics.tradeCount) || 0,
                        drawdown: safeNumber(top3Metrics.maxDrawdown) || 0,
                        winRate: safeNumber(top3Metrics.winRate) / 100 || parsePercent(v1?.expectedMetrics?.accuracy) || 0,
                        expectancy: safeNumber(top3Metrics.expectancy) || parsePercent(v1?.expectedMetrics?.expectancy) || 0
                    },
                    cacheStatus: {
                        cached: 0,
                        uncached: 0,
                        total: data.stats?.totalStocks || 0
                    },
                    promotionAllowed: hasV1,
                    v1Exists: hasV1,
                    message: data.message || 'Time-Travel backtest completed',
                    // ✅ Institutional output fields
                    thesis: v1?.thesis || null,
                    categoryIntent: v1?.categoryIntent || null,
                    confirmations: v1?.confirmations || [],
                    invalidations: v1?.invalidations || [],
                    expectedBehavior: v1?.expectedBehavior || null
                } as any;

                console.log('[Labs] Transformed result:', transformedResult);
                setResult(transformedResult);

                setLogs(prev => [
                    ...prev,
                    `✅ Labs completed!`,
                    `📈 Accuracy: ${(safeNumber(transformedResult.accuracy) * 100).toFixed(1)}%`,
                    `📊 Win Rate: ${(safeNumber(transformedResult.metrics.winRate) * 100).toFixed(1)}%`,
                    `💰 Expected P&L: ₹${safeNumber(transformedResult.metrics.pnl).toFixed(0)}`,
                    `📉 Max Drawdown: ₹${safeNumber(transformedResult.metrics.drawdown).toFixed(0)}`,
                    safeNumber(transformedResult.accuracy) >= 0.70 ? '✅ Meets 70% threshold!' : '⚠️ Below 70% threshold'
                ]);

                // Reload previous versions list to include the new one
                await loadPreviousTTVersions();
            } else {
                throw new Error(data.error || 'Labs run failed');
            }
        } catch (err: any) {
            console.error('[Labs] Error:', err);
            setError(err.message || 'Failed to run Time-Travel Labs');
            setLogs(prev => [...prev, `❌ Error: ${err.message || 'Unknown error'}`]);
        } finally {
            setIsRunning(false);
        }
    };

    const handlePromote = async (targetVersion: string) => {
        if (!result) return;

        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';

            // Confirmation message
            const isOverride = targetVersion === 'V1' && result.v1Exists;
            const confirmMessage = isOverride
                ? '⚠️ This will OVERRIDE the existing V1 strategy. Continue?'
                : `Create ${targetVersion} strategy from ${result.ttVersion}?`;

            if (!window.confirm(confirmMessage)) return;

            setLogs(prev => [...prev, `🔄 Promoting ${result.ttVersion} to ${targetVersion}...`]);

            // Use the working promote-strategy endpoint
            // Note: TimeTravelEngine already saves V1 on each Labs run,
            // so this just ensures it's marked as promoted
            const response = await fetch(`${apiBase}/api/categories/${categoryKey}/promote-strategy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // No strategyId needed - endpoint will find V1 automatically
                })
            });

            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('[Labs] Non-JSON response:', text.substring(0, 200));
                throw new Error('Server returned non-JSON response. Check backend logs.');
            }

            const data = await response.json();

            if (data.ok) {
                setLogs(prev => [...prev, `✅ ${targetVersion} promoted successfully!`]);
                alert(`✅ ${targetVersion} is now the active strategy! You can use it in Strategy Workbench.`);
                onClose();
            } else {
                throw new Error(data.error || 'Promotion failed');
            }
        } catch (err: any) {
            setError(err.message);
            setLogs(prev => [...prev, `❌ Promotion error: ${err.message}`]);
            alert(`❌ Promotion failed: ${err.message}`);
        }
    };

    // NOTE: Backtest functionality moved to ResearchBacktestModal

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-gradient-to-br from-slate-900 via-emerald-900/20 to-slate-900 border border-emerald-500/30 rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-emerald-500/20">
                    <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 flex items-center gap-3">
                        <BeakerIcon className="w-8 h-8 text-emerald-400" />
                        Time-Travel Labs: {categoryKey.replace(/_/g, ' ')}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
                        aria-label="Close"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 flex gap-6 p-6 overflow-hidden">
                    {/* Left Panel: Progress & Actions */}
                    <div className="w-1/3 space-y-4 flex flex-col">
                        {/* Cache Status */}
                        {cacheStatus && (
                            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-emerald-500/20">
                                <h3 className="text-emerald-300 font-semibold mb-3 flex items-center gap-2">
                                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                                    Cache Status
                                </h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Total Stocks:</span>
                                        <span className="text-slate-200 font-mono">{cacheStatus.total}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Cached:</span>
                                        <span className="text-green-400 font-mono">{cacheStatus.cached}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">To Research:</span>
                                        <span className="text-amber-400 font-mono">{cacheStatus.uncached}</span>
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-slate-700">
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">Hit Rate:</span>
                                            <span className="text-cyan-400 font-mono">
                                                {cacheStatus.total > 0 ? ((cacheStatus.cached / cacheStatus.total) * 100).toFixed(0) : 0}%
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Research Progress */}
                        {result && (
                            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-emerald-500/20">
                                <h3 className="text-emerald-300 font-semibold mb-3">Research Results</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Version:</span>
                                        <span className="text-emerald-300 font-mono">{result.ttVersion}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Accuracy:</span>
                                        <span className={`font-mono ${safeNumber(result.accuracy) >= 0.70 ? 'text-green-400' : 'text-yellow-400'}`}>
                                            {(safeNumber(result.accuracy) * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Threshold:</span>
                                        <span className="text-slate-300 font-mono">≥70%</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Expectancy:</span>
                                        <span className="text-cyan-400 font-mono">₹{safeNumber(result.metrics.expectancy).toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Max DD:</span>
                                        <span className="text-red-400 font-mono">₹{safeNumber(result.metrics.drawdown).toFixed(0)}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Quick Mode Controls */}
                        <div className="bg-slate-800/50 rounded-lg p-4 mb-4">
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-slate-300 text-sm font-medium">Quick Mode</label>
                                <button
                                    onClick={() => setQuickMode(!quickMode)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${quickMode ? 'bg-emerald-600' : 'bg-slate-600'
                                        }`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${quickMode ? 'translate-x-6' : 'translate-x-1'
                                        }`} />
                                </button>
                            </div>
                            {quickMode && (
                                <div className="flex items-center gap-3">
                                    <label className="text-slate-400 text-sm">Stocks to test:</label>
                                    <input
                                        type="number"
                                        value={stockCount}
                                        onChange={(e) => setStockCount(Math.max(1, parseInt(e.target.value) || 10))}
                                        min={1}
                                        className="w-20 bg-slate-700 text-white px-3 py-1 rounded border border-slate-600 focus:border-emerald-500 focus:outline-none text-center"
                                    />
                                    <span className="text-slate-500 text-xs">(oldest first)</span>
                                </div>
                            )}
                            <div className="text-xs text-slate-500 mt-2">
                                {quickMode
                                    ? `⚡ Quick: ${stockCount} oldest stocks`
                                    : '🔬 Full: All stocks (60-90 min)'
                                }
                            </div>

                            {/* Force Refresh Toggle */}
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700">
                                <span className="text-slate-300 text-sm">🗑️ Force Refresh</span>
                                <button
                                    onClick={() => setForceRefresh(!forceRefresh)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${forceRefresh ? 'bg-red-600' : 'bg-slate-600'
                                        }`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${forceRefresh ? 'translate-x-6' : 'translate-x-1'
                                        }`} />
                                </button>
                            </div>
                            {forceRefresh && (
                                <div className="text-xs text-red-400 mt-1">
                                    ⚠️ Cache will be cleared - full backtest will run
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="space-y-2">
                            <button
                                onClick={handleRunLabs}
                                disabled={isRunning}
                                className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold py-3 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-emerald-500/50"
                            >
                                {isRunning ? (
                                    <>
                                        <SpinnerIcon className="w-5 h-5 animate-spin" />
                                        Running Labs...
                                    </>
                                ) : (
                                    <>
                                        <BeakerIcon className="w-5 h-5" />
                                        Run Time-Travel Labs
                                    </>
                                )}
                            </button>
                            {/* Run Research Backtest - Opens Modal */}
                            <button
                                onClick={() => setShowResearchModal(true)}
                                disabled={isRunning}
                                className="w-full bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 text-white font-bold py-3 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-purple-500/50 border border-purple-400/30"
                            >
                                🔬 Research Backtest + Shadow
                                <span className="text-xs bg-purple-900/50 px-2 py-0.5 rounded-full">Scientific</span>
                            </button>

                            {/* Promotion Buttons - ALWAYS VISIBLE FOR TESTING */}
                            {result && (
                                <div className="space-y-2">
                                    {result.accuracy < 0.70 && (
                                        <div className="text-amber-300 text-xs mb-2">
                                            ⚠️ Accuracy below 70% - test mode enabled
                                        </div>
                                    )}
                                    {!result.v1Exists ? (
                                        // No V1 exists - show single promote to V1 button
                                        <button
                                            onClick={() => handlePromote('V1')}
                                            className="w-full bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-white font-bold py-3 px-4 rounded-lg transition-all shadow-lg hover:shadow-cyan-500/50"
                                        >
                                            🚀 Promote to V1
                                        </button>
                                    ) : (
                                        // V1 exists - show override or create V2
                                        <>
                                            <button
                                                onClick={() => handlePromote('V1')}
                                                className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold py-3 px-4 rounded-lg transition-all shadow-lg hover:shadow-amber-500/50"
                                            >
                                                ⚠️ Override V1
                                            </button>
                                            <button
                                                onClick={() => handlePromote('V2')}
                                                className="w-full bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-white font-bold py-3 px-4 rounded-lg transition-all shadow-lg hover:shadow-cyan-500/50"
                                            >
                                                ➕ Create V2
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Live Log */}
                        <div className="flex-1 bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-emerald-500/20 overflow-hidden flex flex-col min-h-0">
                            <h3 className="text-emerald-300 font-semibold mb-3">Live Log</h3>
                            <div className="flex-1 space-y-1 text-xs font-mono overflow-y-auto text-slate-300 custom-scrollbar">
                                {logs.map((log, i) => (
                                    <div key={i} className="leading-tight">{log}</div>
                                ))}
                                {logs.length === 0 && (
                                    <div className="text-slate-500 italic">No activity yet...</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* NOTE: Shadow Report now displays in ResearchBacktestModal */}

                    {/* Right Panel: Strategy Logic & Results */}
                    <div className="flex-1 bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-emerald-500/20 overflow-y-auto custom-scrollbar">
                        <h3 className="text-emerald-300 font-semibold mb-4 flex items-center justify-between">
                            <span>Recommended Strategy Logic</span>
                            {previousVersions.length > 0 && (
                                <span className="text-cyan-400 text-sm font-normal">
                                    {previousVersions.length} TT version{previousVersions.length > 1 ? 's' : ''} found
                                </span>
                            )}
                        </h3>

                        {!result ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                <BeakerIcon className="w-24 h-24 mb-4 opacity-20" />
                                <p className="text-center text-sm">
                                    Run Time-Travel Labs to discover optimal strategy.<br />
                                    Testing 220+ technical combinations...
                                </p>
                                {previousVersions.length > 0 && (
                                    <div className="mt-6 w-full">
                                        <h4 className="text-emerald-300 font-semibold mb-3">Previous TT Versions</h4>
                                        <div className="space-y-2">
                                            {previousVersions.slice(0, 5).map((version: any) => (
                                                <div
                                                    key={version.id}
                                                    className={`bg-slate-700/30 rounded-lg p-3 text-sm transition-colors ${selectedVersion?.id === version.id ? 'ring-2 ring-cyan-500 bg-slate-700/50' : 'hover:bg-slate-700/40'
                                                        }`}
                                                >
                                                    <div
                                                        className="flex justify-between items-center mb-1 cursor-pointer"
                                                        onClick={() => handleViewVersion(version)}
                                                    >
                                                        <span className="text-emerald-300 font-mono">{version.ttVersion}</span>
                                                        <span className={`font-mono ${parseFloat(version.accuracy) >= 70 ? 'text-green-400' : 'text-yellow-400'}`}>
                                                            {(parseFloat(version.accuracy)).toFixed(1)}%
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <div
                                                            className="text-slate-400 text-xs cursor-pointer hover:text-slate-300"
                                                            onClick={() => handleViewVersion(version)}
                                                        >
                                                            {version.tradesTested} trades • {new Date(version.createdAt).toLocaleDateString()}
                                                        </div>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteVersion(version.id, version.ttVersion);
                                                            }}
                                                            className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-900/20 transition-colors"
                                                            title="Delete this TT version"
                                                        >
                                                            🗑️ Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* ✅ Category Thesis */}
                                {(result as any).thesis && (
                                    <div className="mb-4">
                                        <h4 className="text-purple-300 font-semibold mb-2">🎯 Category Thesis</h4>
                                        <div className="bg-purple-900/30 rounded-lg p-4 border border-purple-500/30">
                                            <p className="text-sm text-purple-200">{(result as any).thesis}</p>
                                            {(result as any).categoryIntent && (
                                                <p className="text-xs text-purple-400 mt-2">Intent: {(result as any).categoryIntent}</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* ✅ Confirmation Rules */}
                                {(result as any).confirmations && (result as any).confirmations.length > 0 && (
                                    <div className="mb-4">
                                        <h4 className="text-green-300 font-semibold mb-2">✅ Confirmation Rules (Top 5)</h4>
                                        <div className="bg-green-900/30 rounded-lg p-3 border border-green-500/30">
                                            {(result as any).confirmations.map((conf: any, i: number) => (
                                                <div key={i} className="flex items-start gap-2 text-sm py-1">
                                                    <span className="text-green-400 font-bold">#{conf.rank}</span>
                                                    <span className="text-green-200">{conf.description || conf.rule}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ✅ Invalidation Rules */}
                                {(result as any).invalidations && (result as any).invalidations.length > 0 && (
                                    <div className="mb-4">
                                        <h4 className="text-red-300 font-semibold mb-2">❌ Invalidation Rules</h4>
                                        <div className="bg-red-900/30 rounded-lg p-3 border border-red-500/30">
                                            {(result as any).invalidations.map((inv: any, i: number) => (
                                                <div key={i} className="text-sm text-red-200 py-1">• {inv.rule}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ✅ Expected Behavior */}
                                {(result as any).expectedBehavior && (
                                    <div className="mb-4">
                                        <h4 className="text-amber-300 font-semibold mb-2">📊 Expected Behavior</h4>
                                        <div className="bg-amber-900/30 rounded-lg p-3 border border-amber-500/30 grid grid-cols-2 gap-2 text-sm">
                                            <div><span className="text-amber-400">Holding:</span> <span className="text-amber-200">{(result as any).expectedBehavior.avgHoldingTime}</span></div>
                                            <div><span className="text-amber-400">Move:</span> <span className="text-amber-200">{(result as any).expectedBehavior.avgMove}</span></div>
                                            <div><span className="text-amber-400">Win Rate:</span> <span className="text-amber-200">{(result as any).expectedBehavior.winRate}</span></div>
                                            <div><span className="text-amber-400">Drawdown:</span> <span className="text-amber-200">{(result as any).expectedBehavior.avgDrawdown}</span></div>
                                        </div>
                                    </div>
                                )}

                                {/* Entry Conditions */}
                                <div>
                                    <h4 className="text-cyan-300 font-semibold mb-2 flex items-center gap-2">
                                        📥 Entry Conditions
                                    </h4>
                                    <div className="bg-slate-700/30 rounded-lg p-4">
                                        <pre className="text-xs text-slate-200 whitespace-pre-wrap font-mono">
                                            {JSON.stringify(result.recommendedLogic.entry, null, 2)}
                                        </pre>
                                    </div>
                                </div>

                                {/* Exit Conditions */}
                                <div>
                                    <h4 className="text-amber-300 font-semibold mb-2 flex items-center gap-2">
                                        📤 Exit Conditions
                                    </h4>
                                    <div className="bg-slate-700/30 rounded-lg p-4">
                                        <pre className="text-xs text-slate-200 whitespace-pre-wrap font-mono">
                                            {JSON.stringify(result.recommendedLogic.exit, null, 2)}
                                        </pre>
                                    </div>
                                </div>

                                {/* Trap Avoidance Rules */}
                                {result.recommendedLogic.trapAvoidance && result.recommendedLogic.trapAvoidance.length > 0 && (
                                    <div>
                                        <h4 className="text-red-300 font-semibold mb-2 flex items-center gap-2">
                                            🛡️ Trap Avoidance Rules
                                        </h4>
                                        <div className="bg-slate-700/30 rounded-lg p-4">
                                            <ul className="text-xs text-slate-200 space-y-1">
                                                {result.recommendedLogic.trapAvoidance.map((rule, i) => (
                                                    <li key={i}>• {rule}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                )}

                                {/* Performance Metrics */}
                                <div>
                                    <h4 className="text-emerald-300 font-semibold mb-2 flex items-center gap-2">
                                        📊 Performance Metrics
                                    </h4>
                                    <div className="bg-slate-700/30 rounded-lg p-4 grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <div className="text-slate-400 text-xs mb-1">Win Rate</div>
                                            <div className="text-green-400 font-mono">{(safeNumber(result.metrics.winRate) * 100).toFixed(1)}%</div>
                                        </div>
                                        <div>
                                            <div className="text-slate-400 text-xs mb-1">Expectancy</div>
                                            <div className="text-cyan-400 font-mono">₹{safeNumber(result.metrics.expectancy).toFixed(2)}</div>
                                        </div>
                                        <div>
                                            <div className="text-slate-400 text-xs mb-1">Total P&L</div>
                                            <div className="text-green-400 font-mono">₹{safeNumber(result.metrics.pnl).toFixed(0)}</div>
                                        </div>
                                        <div>
                                            <div className="text-slate-400 text-xs mb-1">Max Drawdown</div>
                                            <div className="text-red-400 font-mono">₹{safeNumber(result.metrics.drawdown).toFixed(0)}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Error Display */}
                                {error && (
                                    <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4">
                                        <p className="text-red-300 text-sm font-semibold">Error</p>
                                        <p className="text-red-200/70 text-xs mt-1">{error}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Research Backtest Modal */}
            <ResearchBacktestModal
                isOpen={showResearchModal}
                onClose={() => setShowResearchModal(false)}
                categoryKey={categoryKey}
            />
        </div>
    );
};
