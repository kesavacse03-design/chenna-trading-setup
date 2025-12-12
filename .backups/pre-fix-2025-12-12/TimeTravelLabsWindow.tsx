import React, { useState, useEffect } from 'react';
import { XMarkIcon } from './icons/XMarkIcon';
import { BeakerIcon } from './icons/BeakerIcon';
import { SpinnerIcon } from './icons/SpinnerIcon';

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

    // Load cache status AND previous TT versions when window opens
    useEffect(() => {
        if (isOpen) {
            loadCacheStatus();
            loadPreviousTTVersions();
            setResult(null);
            setError(null);
            setLogs([]);
        }
    }, [isOpen, categoryKey]);

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
                    categoryKey
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
                const v1Logic = hasV1 ? data.v1Strategy.logic : null;
                const v1Metrics = hasV1 ? data.v1Strategy.expectedMetrics : null;

                const transformedResult: LabsResult = {
                    runId: data.runId || `TT-${Date.now()}`,
                    ttVersion: data.stats?.ttVersion || 'TT-V1',
                    accuracy: v1Metrics?.accuracy || v1Metrics?.winRate || 0,
                    recommendedLogic: {
                        entry: (v1Logic?.entry && typeof v1Logic.entry === 'object') ? v1Logic.entry : { info: 'No entry conditions available' },
                        exit: (v1Logic?.exit && typeof v1Logic.exit === 'object') ? v1Logic.exit : { info: 'No exit conditions available' },
                        trapAvoidance: Array.isArray(v1Logic?.traps) ? v1Logic.traps :
                            Array.isArray(v1Logic?.trapAvoidance) ? v1Logic.trapAvoidance :
                                ['No trap avoidance rules configured']
                    },
                    metrics: {
                        pnl: v1Metrics?.pnl || 0,
                        drawdown: v1Metrics?.drawdown || v1Metrics?.maxDrawdown || 0,
                        winRate: v1Metrics?.winRate || 0,
                        expectancy: v1Metrics?.expectancy || 0
                    },
                    cacheStatus: {
                        cached: 0,
                        uncached: 0,
                        total: data.stats?.totalStocks || 0
                    },
                    promotionAllowed: hasV1,
                    v1Exists: hasV1,
                    message: data.message || 'Time-Travel backtest completed'
                };

                console.log('[Labs] Transformed result:', transformedResult);
                setResult(transformedResult);

                setLogs(prev => [
                    ...prev,
                    `✅ Labs completed!`,
                    `📈 Accuracy: ${(transformedResult.accuracy * 100).toFixed(1)}%`,
                    `📊 Win Rate: ${(transformedResult.metrics.winRate * 100).toFixed(1)}%`,
                    `💰 Expected P&L: ₹${transformedResult.metrics.pnl.toFixed(0)}`,
                    `📉 Max Drawdown: ₹${transformedResult.metrics.drawdown.toFixed(0)}`,
                    transformedResult.accuracy >= 0.70 ? '✅ Meets 70% threshold!' : '⚠️ Below 70% threshold'
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

            const response = await fetch(`${apiBase}/api/labs/promote-to-strategy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    labsRunId: result.runId,
                    categoryKey,
                    targetVersion
                })
            });

            const data = await response.json();

            if (data.ok) {
                const action = data.overrode ? 'Updated' : 'Created';
                setLogs(prev => [...prev, `✅ ${action} ${data.version} successfully!`]);
                alert(`✅ ${action} ${data.version}! You can now use it in Strategy Workbench.`);
                onClose();
            } else {
                throw new Error(data.error);
            }
        } catch (err: any) {
            setError(err.message);
            setLogs(prev => [...prev, `❌ Promotion error: ${err.message}`]);
            alert(`❌ Promotion failed: ${err.message}`);
        }
    };

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
                                        <span className={`font-mono ${result.accuracy >= 0.70 ? 'text-green-400' : 'text-yellow-400'}`}>
                                            {(result.accuracy * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Threshold:</span>
                                        <span className="text-slate-300 font-mono">≥70%</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Expectancy:</span>
                                        <span className="text-cyan-400 font-mono">₹{result.metrics.expectancy.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Max DD:</span>
                                        <span className="text-red-400 font-mono">₹{result.metrics.drawdown.toFixed(0)}</span>
                                    </div>
                                </div>
                            </div>
                        )}

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
                                            <div className="text-green-400 font-mono">{(result.metrics.winRate * 100).toFixed(1)}%</div>
                                        </div>
                                        <div>
                                            <div className="text-slate-400 text-xs mb-1">Expectancy</div>
                                            <div className="text-cyan-400 font-mono">₹{result.metrics.expectancy.toFixed(2)}</div>
                                        </div>
                                        <div>
                                            <div className="text-slate-400 text-xs mb-1">Total P&L</div>
                                            <div className="text-green-400 font-mono">₹{result.metrics.pnl.toFixed(0)}</div>
                                        </div>
                                        <div>
                                            <div className="text-slate-400 text-xs mb-1">Max Drawdown</div>
                                            <div className="text-red-400 font-mono">₹{result.metrics.drawdown.toFixed(0)}</div>
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
        </div>
    );
};
