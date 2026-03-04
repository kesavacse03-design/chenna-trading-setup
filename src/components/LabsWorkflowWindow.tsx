import React, { useState, useEffect } from 'react';
import { ResearchBacktestModal } from './ResearchBacktestModal';

interface LabsWorkflowWindowProps {
    isOpen: boolean;
    onClose: () => void;
    categoryKey: string;
}

interface StepStatus {
    completed: boolean;
    running: boolean;
    data: any;
}

export const LabsWorkflowWindow: React.FC<LabsWorkflowWindowProps> = ({
    isOpen,
    onClose,
    categoryKey
}) => {
    // Step states
    const [step1, setStep1] = useState<StepStatus>({ completed: false, running: false, data: null });
    const [step2, setStep2] = useState<StepStatus>({ completed: false, running: false, data: null });
    const [step3, setStep3] = useState<StepStatus>({ completed: false, running: false, data: null });
    const [activeStep, setActiveStep] = useState(1);
    const [logs, setLogs] = useState<string[]>([]);
    const [showResearchModal, setShowResearchModal] = useState(false);

    // Quick Mode controls
    const [quickMode, setQuickMode] = useState(true);
    const [stockCount, setStockCount] = useState(20);

    // Load previous Labs result on open
    useEffect(() => {
        if (isOpen) {
            loadPreviousResult();
        }
    }, [isOpen, categoryKey]);

    const loadPreviousResult = async () => {
        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            const response = await fetch(`${apiBase}/api/labs/latest/${categoryKey}`);
            const data = await response.json();

            if (data.ok && data.hasResult) {
                setStep1({ completed: true, running: false, data: data.result });
                setLogs([`📖 Loaded previous Labs result: ${data.fileName}`]);
            }
        } catch (err) {
            console.error('Failed to load previous result:', err);
        }
    };

    // NEW: Run complete Labs 4-Step pipeline
    const runFullPipeline = async () => {
        // Reset all steps
        setStep1({ completed: false, running: true, data: null });
        setStep2({ completed: false, running: false, data: null });
        setStep3({ completed: false, running: false, data: null });
        setActiveStep(1);
        setLogs([
            '🔬 LABS ENGINE - TRUE TRADER 4-STEP PIPELINE',
            `📌 Category: ${categoryKey}`,
            ''
        ]);

        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';

            // Call /labs/run endpoint
            const response = await fetch(`${apiBase}/api/labs/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryKey })
            });

            const data = await response.json();
            if (!data.ok) throw new Error(data.error);

            const result = data.data;

            // Update logs with 4-STEP pipeline progress
            setLogs(prev => [...prev,
            '═'.repeat(50),
                '📊 STEP 1: TRUTH EXTRACTION',
            '─'.repeat(40),
            `   Stocks Analyzed: ${result.steps?.truth?.analyzed || 0}`,
            `   ✅ Success: ${result.steps?.truth?.successCount || 0} (${result.steps?.truth?.successRate?.toFixed(1) || 0}%)`,
            `   ❌ Failure: ${result.steps?.truth?.failureCount || 0}`,
            `   ⏳ No Move: ${result.steps?.truth?.noMoveCount || 0}`,
                '',
                '📊 STEP 2: BEHAVIOR CLUSTERING',
            '─'.repeat(40),
            ...(result.clusters?.map((c: any) =>
                `   ${c.action === 'AVOID' ? '❌' : c.riskRating === 'LOW' ? '✅' : '⚠️'} ${c.name}: ${c.stockCount} stocks (${c.successRate?.toFixed(1)}% success)`
            ) || ['   No clusters found']),
                '',
                '📊 STEP 3: MARKET REGIME MAPPING',
            '─'.repeat(40),
            `   ✅ Favorable: ${result.marketConditions?.favorable?.description || 'N/A'}`,
            `   ⚠️  Selective: ${result.marketConditions?.selective?.description || 'N/A'}`,
            `   ❌ Hostile: ${result.marketConditions?.hostile?.description || 'N/A'}`,
                '',
                '📊 STEP 4: FAILURE INTELLIGENCE',
            '─'.repeat(40),
            ...(result.failurePatterns?.slice(0, 5).map((p: any) =>
                `   ⛔ ${p.name}: ${p.failureRate?.toFixed(0)}% fail → ${p.action}`
            ) || ['   No failure patterns found']),
                ''
            ]);

            // Set step data for display
            setStep1({
                completed: true, running: false, data: {
                    signature: result.signature,
                    truthResult: result.steps?.truth
                }
            });
            setActiveStep(2);
            setStep2({
                completed: true, running: false, data: {
                    clusters: result.clusters,
                    marketConditions: result.marketConditions,
                    failurePatterns: result.failurePatterns,
                    finalRules: result.finalRules
                }
            });
            setActiveStep(3);
            setStep3({ completed: true, running: false, data: result.finalRules });

            // Final summary
            const successRate = result.signature?.successRate || 0;
            const bestCluster = result.clusters?.[0];
            setLogs(prev => [...prev,
            '═'.repeat(50),
                '✅ LABS 4-STEP PIPELINE COMPLETE!',
            '═'.repeat(50),
            `📊 Success Rate: ${successRate.toFixed(1)}%`,
            `🎯 Best Cluster: ${bestCluster?.name || 'N/A'} (${bestCluster?.successRate?.toFixed(1) || 0}%)`,
            `⛔ Avoid Patterns: ${result.failurePatterns?.length || 0}`,
            `📋 Final Rules Generated: ${result.finalRules?.avoidCriteria?.length || 0} avoid criteria`,
                ''
            ]);

        } catch (err: any) {
            setStep1({ completed: false, running: false, data: null });
            setLogs(prev => [...prev, `❌ Error: ${err.message}`]);
        }
    };

    // Step 1: Discover Category Signature (Find what's COMMON)
    const runStep1 = async () => {
        setStep1({ ...step1, running: true });
        setActiveStep(1);
        setLogs(['🔬 Step 1: Discovering Category Signature...',
            '   Finding what is COMMON across all stocks at addedDate', '']);

        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            // NEW: Use discover-signature endpoint that finds COMMON patterns
            const response = await fetch(`${apiBase}/api/labs/discover-signature`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoryKey,
                    quickMode,
                    stockCount: quickMode ? stockCount : 999
                })
            });

            const data = await response.json();
            if (!data.ok) throw new Error(data.error);

            setStep1({ completed: true, running: false, data });
            setLogs(prev => [...prev,
                '✅ Category Signature Discovered!',
            `   Stocks analyzed: ${data.stocksAnalyzed}`,
            `   Signature patterns: ${data.signature?.length || 0}`,
                ''
            ]);

        } catch (err: any) {
            setStep1({ completed: false, running: false, data: null });
            setLogs(prev => [...prev, `❌ Error: ${err.message}`]);
        }
    };

    // Step 2: Test & Learn (Intelligent Backtest using signature from Step 1)
    const runStep2 = async () => {
        setStep2({ ...step2, running: true });
        setActiveStep(2);
        setLogs(prev => [...prev, '🧠 Step 2: Running Intelligent Backtest...',
            '   Using signature discovered in Step 1', '']);

        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';

            // Get signature from Step 1 (new format)
            const signature = step1.data?.signature || [];
            // Convert signature characteristics to patterns for backtest
            const signaturePatterns = signature.slice(0, 3).map((s: any) =>
                `${s.characteristic}:${s.value}`
            );

            const response = await fetch(`${apiBase}/api/labs/intelligent-backtest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoryKey,
                    patterns: signaturePatterns.length > 0 ? signaturePatterns : ['VolumeSpike'],
                    signature: signature, // Pass full signature for context
                    maxIterations: 5,
                    targetWinRate: 60
                })
            });

            const data = await response.json();
            if (!data.ok) throw new Error(data.error);

            setStep2({ completed: true, running: false, data: data.result });

            const finalWinRate = data.result?.finalResult?.winRate || '0';
            const improvements = data.result?.improvements?.length || 0;

            setLogs(prev => [...prev,
                '✅ Intelligent Backtest complete!',
            `   Signature tested: ${signaturePatterns.length} characteristics`,
            `   Final Win Rate: ${finalWinRate}%`,
            `   Improvements learned: ${improvements}`,
                ''
            ]);

        } catch (err: any) {
            setStep2({ completed: false, running: false, data: null });
            setLogs(prev => [...prev, `❌ Error: ${err.message}`]);
        }
    };

    // Step 3: Compare All Strategies
    const runStep3 = async () => {
        setStep3({ ...step3, running: true });
        setActiveStep(3);
        setLogs(prev => [...prev, '📊 Step 3: Comparing all strategies...', '']);

        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            const response = await fetch(`${apiBase}/api/labs/multi-strategy-backtest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryKey })
            });

            const data = await response.json();
            if (!data.ok) throw new Error(data.error);

            setStep3({ completed: true, running: false, data: data.result });

            setLogs(prev => [...prev,
                '✅ Multi-Strategy comparison complete!',
            `   Strategies tested: ${data.result?.strategiesCompared || 0}`,
                '',
                '🏆 Top Strategies:',
            ...(data.result?.strategyResults?.slice(0, 3).map((sr: any, i: number) =>
                `   ${i + 1}. ${sr.pattern}: ${sr.winRate}% win rate`
            ) || []),
                ''
            ]);

        } catch (err: any) {
            setStep3({ completed: false, running: false, data: null });
            setLogs(prev => [...prev, `❌ Error: ${err.message}`]);
        }
    };

    // Download Trade Details as CSV for Excel analysis
    const downloadCSV = () => {
        const trades = step2.data?.finalResult?.tradeDetails;
        if (!trades || trades.length === 0) return;

        // CSV headers - TRUE TRADER BRAIN includes Entry Reason
        const headers = [
            'Symbol', 'AddedDate', 'EntryDate', 'EntryReason', 'EntryPatterns',
            'EntryPrice', 'StopLoss', 'Target',
            'ExitDate', 'ExitPrice', 'ExitReason', 'Outcome', 'DaysHeld', 'PnL%',
            'MaxDrawdown', 'MaxProfit', 'FailureReasons'
        ];

        // CSV rows with entry reason
        const rows = trades.map((t: any) => [
            t.symbol,
            t.addedDate?.split('T')[0] || '',
            t.entryDate?.split('T')[0] || '',
            t.entryReason || '',
            (t.entryPatterns || []).join('; '),
            t.entryPrice || '',
            t.stopLoss || '',
            t.target || '',
            t.exitDate?.split('T')[0] || '',
            t.exitPrice || '',
            t.exitReason || '',
            t.outcome || '',
            t.daysHeld || '',
            t.pnlPercent || '',
            t.maxDrawdown || '',
            t.maxProfit || '',
            (t.failureReasons || []).join('; ')
        ]);

        // Create CSV content
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map((v: any) => `"${v}"`).join(','))
        ].join('\n');

        // Download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${categoryKey}_trades_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // Clear old cache to fix date ordering issues
    const clearCache = async () => {
        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            const response = await fetch(`${apiBase}/api/labs/clear-cache`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.ok) {
                setLogs(prev => [...prev, `🗑️ Cache cleared: ${data.filesDeleted} files deleted`, '']);
                alert(`Cache cleared! ${data.filesDeleted} files deleted. Fresh data will be fetched on next run.`);
            } else {
                setLogs(prev => [...prev, `❌ Cache clear failed: ${data.error}`]);
            }
        } catch (err: any) {
            setLogs(prev => [...prev, `❌ Error: ${err.message}`]);
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-cyan-500/30 rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col">

                    {/* Header */}
                    <div className="flex items-center justify-between p-5 border-b border-cyan-500/20 bg-gradient-to-r from-cyan-900/20 to-transparent">
                        <div>
                            <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
                                🔬 Labs Workflow
                            </h2>
                            <p className="text-sm text-slate-400 mt-1">
                                {categoryKey.replace(/_/g, ' ')} • Discover → Test → Compare
                            </p>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
                    </div>

                    {/* Step Indicators */}
                    <div className="flex items-center justify-center gap-4 py-4 border-b border-slate-700 bg-slate-800/30">
                        {[
                            { num: 1, label: 'Discover Patterns', icon: '🔬' },
                            { num: 2, label: 'Test & Learn', icon: '🧠' },
                            { num: 3, label: 'Compare All', icon: '📊' }
                        ].map((s, i) => {
                            const stepState = [step1, step2, step3][i];
                            const isActive = activeStep === s.num;
                            const isCompleted = stepState.completed;
                            const isRunning = stepState.running;

                            return (
                                <div key={s.num} className="flex items-center">
                                    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${isActive ? 'bg-cyan-900/50 border border-cyan-500/50' :
                                        isCompleted ? 'bg-emerald-900/30 border border-emerald-500/30' :
                                            'bg-slate-800 border border-slate-600'
                                        }`}>
                                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${isCompleted ? 'bg-emerald-500 text-white' :
                                            isRunning ? 'bg-cyan-500 text-white animate-pulse' :
                                                isActive ? 'bg-cyan-600 text-white' :
                                                    'bg-slate-600 text-slate-300'
                                            }`}>
                                            {isCompleted ? '✓' : isRunning ? '⏳' : s.num}
                                        </span>
                                        <span className={`text-sm font-medium ${isActive || isCompleted ? 'text-white' : 'text-slate-400'
                                            }`}>
                                            {s.icon} {s.label}
                                        </span>
                                    </div>
                                    {i < 2 && <span className="text-slate-600 mx-3">→</span>}
                                </div>
                            );
                        })}
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 flex overflow-hidden">
                        {/* Left: Action Buttons - SIMPLIFIED 2 STEPS */}
                        <div className="w-80 p-4 border-r border-slate-700 flex flex-col gap-4">

                            {/* STEP 1: CATEGORY DEFINITION */}
                            <div className="bg-gradient-to-r from-cyan-900/50 to-slate-800/50 rounded-xl p-4 border border-cyan-500/30">
                                <h3 className="text-cyan-400 font-bold mb-2 flex items-center gap-2">
                                    📊 Step 1: Category Definition
                                </h3>
                                <p className="text-xs text-slate-400 mb-3">
                                    Observe what is COMMON across all stocks on their addedDate
                                </p>
                                <button
                                    onClick={runStep1}
                                    disabled={step1.running}
                                    className="w-full py-3 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-white font-bold rounded-lg disabled:opacity-50 transition"
                                >
                                    {step1.running ? '⏳ Discovering...' : step1.completed ? '🔄 Re-discover' : '▶ Discover Definition'}
                                </button>
                                {step1.completed && (
                                    <div className="mt-2 text-xs text-emerald-400">
                                        ✓ {step1.data?.commonPatterns?.length || step1.data?.signature?.length || 0} patterns found
                                    </div>
                                )}
                            </div>

                            {/* STEP 2: BACKTEST + LEARN */}
                            <div className={`bg-gradient-to-r from-emerald-900/50 to-slate-800/50 rounded-xl p-4 border ${step1.completed ? 'border-emerald-500/30' : 'border-slate-700 opacity-50'}`}>
                                <h3 className="text-emerald-400 font-bold mb-2 flex items-center gap-2">
                                    🧠 Step 2: Backtest + Learn
                                </h3>
                                <p className="text-xs text-slate-400 mb-3">
                                    Time-travel simulation, learn from failures, find what works
                                </p>
                                <button
                                    onClick={runFullPipeline}
                                    disabled={!step1.completed || step1.running}
                                    className="w-full py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold rounded-lg disabled:opacity-50 transition"
                                >
                                    {step1.running ? '⏳ Waiting...' : step2.completed ? '🔄 Re-run Backtest' : '▶ Run Backtest + Learn'}
                                </button>
                                {step2.completed && step2.data?.finalStrategy && (
                                    <div className="mt-2 text-xs text-emerald-400">
                                        ✓ Win Rate: {step2.data.finalStrategy.winRate?.toFixed(1) || '0'}%
                                    </div>
                                )}
                            </div>

                            {/* Clear Cache Button - small at bottom */}
                            <button
                                onClick={clearCache}
                                className="w-full py-1.5 bg-slate-700 hover:bg-red-700 text-slate-400 hover:text-white text-xs rounded-lg transition border border-slate-600 hover:border-red-500"
                            >
                                🗑️ Clear Old Cache
                            </button>
                        </div>

                        {/* Right: Results & Logs */}
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {/* Results Panel */}
                            <div className="flex-1 p-4 overflow-y-auto">
                                {step2.completed && step2.data?.clusters ? (
                                    // NEW 4-STEP LABS RESULTS
                                    <div className="space-y-4">
                                        {/* SIGNATURE */}
                                        <div className="bg-slate-800/50 rounded-lg p-4 border border-cyan-500/30">
                                            <h3 className="text-lg font-semibold text-cyan-400 mb-2">📊 Category Signature</h3>
                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="text-center p-2 bg-slate-700/50 rounded">
                                                    <div className="text-2xl font-bold text-emerald-400">
                                                        {step1.data?.signature?.successRate?.toFixed(1) || 0}%
                                                    </div>
                                                    <div className="text-xs text-slate-400">Success Rate</div>
                                                </div>
                                                <div className="text-center p-2 bg-slate-700/50 rounded">
                                                    <div className="text-2xl font-bold text-cyan-400">
                                                        {step1.data?.truthResult?.analyzed || 0}
                                                    </div>
                                                    <div className="text-xs text-slate-400">Stocks Analyzed</div>
                                                </div>
                                                <div className="text-center p-2 bg-slate-700/50 rounded">
                                                    <div className="text-2xl font-bold text-amber-400">
                                                        {step1.data?.signature?.avgHoldingDays?.toFixed(1) || 0}
                                                    </div>
                                                    <div className="text-xs text-slate-400">Avg Days</div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* CLUSTERS */}
                                        <div className="bg-slate-800/50 rounded-lg p-4 border border-emerald-500/30">
                                            <h3 className="text-lg font-semibold text-emerald-400 mb-2">🎯 Behavior Clusters</h3>
                                            <div className="space-y-2">
                                                {step2.data.clusters?.map((cluster: any, i: number) => (
                                                    <div key={i} className={`flex items-center justify-between p-2 rounded ${cluster.action === 'AVOID' ? 'bg-red-900/30 border border-red-500/30' :
                                                            cluster.riskRating === 'LOW' ? 'bg-emerald-900/30 border border-emerald-500/30' :
                                                                'bg-yellow-900/30 border border-yellow-500/30'
                                                        }`}>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-lg">
                                                                {cluster.action === 'AVOID' ? '❌' : cluster.riskRating === 'LOW' ? '✅' : '⚠️'}
                                                            </span>
                                                            <span className="font-medium text-white">{cluster.name}</span>
                                                            <span className="text-xs text-slate-400">({cluster.stockCount} stocks)</span>
                                                        </div>
                                                        <div className={`font-bold ${cluster.successRate >= 60 ? 'text-emerald-400' :
                                                                cluster.successRate >= 45 ? 'text-yellow-400' : 'text-red-400'
                                                            }`}>
                                                            {cluster.successRate?.toFixed(1)}%
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* MARKET CONDITIONS */}
                                        <div className="bg-slate-800/50 rounded-lg p-4 border border-purple-500/30">
                                            <h3 className="text-lg font-semibold text-purple-400 mb-2">🚦 Market Conditions</h3>
                                            <div className="space-y-2 text-sm">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-emerald-400">✅ Favorable:</span>
                                                    <span className="text-slate-300">{step2.data.marketConditions?.favorable?.description || 'N/A'}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-yellow-400">⚠️ Selective:</span>
                                                    <span className="text-slate-300">{step2.data.marketConditions?.selective?.description || 'N/A'}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-red-400">❌ Hostile:</span>
                                                    <span className="text-slate-300">{step2.data.marketConditions?.hostile?.description || 'N/A'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* FAILURE PATTERNS */}
                                        {step2.data.failurePatterns?.length > 0 && (
                                            <div className="bg-slate-800/50 rounded-lg p-4 border border-red-500/30">
                                                <h3 className="text-lg font-semibold text-red-400 mb-2">⛔ Failure Intelligence</h3>
                                                <div className="space-y-2">
                                                    {step2.data.failurePatterns?.map((pattern: any, i: number) => (
                                                        <div key={i} className="flex items-center justify-between p-2 bg-red-900/20 rounded border border-red-500/20">
                                                            <div>
                                                                <span className="font-medium text-white">{pattern.name}</span>
                                                                <p className="text-xs text-slate-400">{pattern.description}</p>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-red-400 font-bold">{pattern.failureRate?.toFixed(0)}%</div>
                                                                <div className={`text-xs ${pattern.action === 'HARD_AVOID' ? 'text-red-400' : 'text-yellow-400'}`}>
                                                                    {pattern.action}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : step2.completed && step2.data ? (
                                    // Step 2 Results: Before/After
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-semibold text-emerald-400">🧠 Learning Results</h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
                                                <h4 className="text-slate-400 text-sm mb-2">Before Learning</h4>
                                                <div className="text-2xl font-bold text-white">
                                                    {step2.data.iterations?.[0]?.winRate || '0%'}
                                                </div>
                                                <div className="text-xs text-slate-500">Win Rate</div>
                                            </div>
                                            <div className="bg-emerald-900/30 rounded-lg p-4 border border-emerald-500/30">
                                                <h4 className="text-emerald-400 text-sm mb-2">After Learning</h4>
                                                <div className="text-2xl font-bold text-emerald-400">
                                                    {step2.data.finalResult?.winRate || '0%'}
                                                </div>
                                                <div className="text-xs text-emerald-400/70">Win Rate</div>
                                            </div>
                                        </div>

                                        {step2.data.improvements?.length > 0 && (
                                            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-600">
                                                <h4 className="text-sm font-semibold text-cyan-400 mb-2">🎓 Improvements Learned</h4>
                                                <div className="flex flex-wrap gap-2">
                                                    {step2.data.improvements.map((imp: any, i: number) => (
                                                        <span key={i} className="px-3 py-1 bg-cyan-900/40 border border-cyan-500/30 rounded-full text-xs text-cyan-300">
                                                            ✓ {typeof imp === 'string' ? imp : (imp?.filter || imp?.reason || JSON.stringify(imp))}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* 🧠 Trade Buckets - Primary / Secondary / Avoid */}
                                        {step2.data.tradeBuckets && (
                                            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-600 mt-4">
                                                <h4 className="text-sm font-semibold text-purple-400 mb-3">🧠 Trade Rejection Brain</h4>

                                                {/* Stats Row */}
                                                <div className="grid grid-cols-3 gap-2 mb-4">
                                                    <div className="bg-emerald-900/30 rounded p-2 text-center border border-emerald-500/30">
                                                        <div className="text-lg font-bold text-emerald-400">{step2.data.tradeBuckets.stats?.primaryCount || 0}</div>
                                                        <div className="text-[10px] text-emerald-400/70">PRIMARY</div>
                                                    </div>
                                                    <div className="bg-amber-900/30 rounded p-2 text-center border border-amber-500/30">
                                                        <div className="text-lg font-bold text-amber-400">{step2.data.tradeBuckets.stats?.secondaryCount || 0}</div>
                                                        <div className="text-[10px] text-amber-400/70">SECONDARY</div>
                                                    </div>
                                                    <div className="bg-red-900/30 rounded p-2 text-center border border-red-500/30">
                                                        <div className="text-lg font-bold text-red-400">{step2.data.tradeBuckets.stats?.avoidCount || 0}</div>
                                                        <div className="text-[10px] text-red-400/70">AVOID</div>
                                                    </div>
                                                </div>

                                                {/* Avoid List */}
                                                {step2.data.tradeBuckets.avoid?.length > 0 && (
                                                    <div className="mb-3">
                                                        <h5 className="text-xs text-red-400 mb-1">❌ Avoid List (DO NOT TRADE)</h5>
                                                        <div className="flex flex-wrap gap-1">
                                                            {step2.data.tradeBuckets.avoid.slice(0, 8).map((t: any, i: number) => (
                                                                <span key={i} className="px-2 py-0.5 bg-red-900/40 border border-red-500/30 rounded text-[10px] text-red-300" title={t.reason}>
                                                                    {t.symbol}
                                                                </span>
                                                            ))}
                                                            {step2.data.tradeBuckets.avoid.length > 8 && (
                                                                <span className="text-[10px] text-red-400/70">+{step2.data.tradeBuckets.avoid.length - 8} more</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Primary Signals */}
                                                {step2.data.tradeBuckets.primary?.length > 0 && (
                                                    <div>
                                                        <h5 className="text-xs text-emerald-400 mb-1">✅ Primary Signals (Low Risk)</h5>
                                                        <div className="flex flex-wrap gap-1">
                                                            {step2.data.tradeBuckets.primary.slice(0, 10).map((t: any, i: number) => (
                                                                <span key={i} className="px-2 py-0.5 bg-emerald-900/40 border border-emerald-500/30 rounded text-[10px] text-emerald-300">
                                                                    {t.symbol}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Trade Details Section - Proof of Real Trading */}
                                        {step2.data.finalResult?.tradeDetails?.length > 0 && (
                                            <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-600 mt-4">
                                                <div className="flex items-center justify-between mb-3">
                                                    <h4 className="text-sm font-semibold text-amber-400">📋 Trade Details ({step2.data.finalResult.trades} trades)</h4>
                                                    <button
                                                        onClick={downloadCSV}
                                                        className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white text-xs rounded flex items-center gap-1"
                                                    >
                                                        📥 Download CSV
                                                    </button>
                                                </div>
                                                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                                                    <table className="w-full text-xs">
                                                        <thead className="bg-slate-700/50 sticky top-0">
                                                            <tr className="text-slate-400">
                                                                <th className="px-2 py-1 text-left">Symbol</th>
                                                                <th className="px-2 py-1 text-left">Entry Date</th>
                                                                <th className="px-2 py-1 text-left">Entry Reason</th>
                                                                <th className="px-2 py-1 text-right">Entry ₹</th>
                                                                <th className="px-2 py-1 text-right">Exit ₹</th>
                                                                <th className="px-2 py-1 text-center">Exit Reason</th>
                                                                <th className="px-2 py-1 text-right">PnL%</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {step2.data.finalResult.tradeDetails.slice(0, 20).map((trade: any, i: number) => (
                                                                <tr key={i} className={`border-b border-slate-700/50 ${trade.outcome === 'WIN' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                    <td className="px-2 py-1 text-white font-medium">{trade.symbol}</td>
                                                                    <td className="px-2 py-1 text-slate-300">{trade.entryDate?.split('T')[0]}</td>
                                                                    <td className="px-2 py-1 text-cyan-400 text-[10px]" title={(trade.entryPatterns || []).join(', ')}>
                                                                        {trade.entryReason || 'Unknown'}
                                                                    </td>
                                                                    <td className="px-2 py-1 text-right text-slate-300">₹{trade.entryPrice}</td>
                                                                    <td className="px-2 py-1 text-right text-slate-300">₹{trade.exitPrice}</td>
                                                                    <td className="px-2 py-1 text-center">
                                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${trade.exitReason === 'TARGET_HIT' ? 'bg-emerald-900/50 text-emerald-400' :
                                                                            trade.exitReason === 'STOP_HIT' ? 'bg-red-900/50 text-red-400' :
                                                                                'bg-amber-900/50 text-amber-400'
                                                                            }`}>
                                                                            {trade.exitReason}
                                                                        </span>
                                                                    </td>
                                                                    <td className={`px-2 py-1 text-right font-bold`}>
                                                                        {trade.pnlPercent}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                <div className="mt-2 text-[10px] text-slate-500">
                                                    Entry: Close on addedDate | Stop: 2×ATR | Target: 3×ATR or +5% | Max Hold: 10 days
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : step1.completed && step1.data ? (
                                    // Step 1 Results: Category Signature
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-semibold text-cyan-400">📊 Category Signature</h3>
                                        <div className="text-sm text-slate-400 mb-2">
                                            Analyzed {step1.data.stocksAnalyzed} stocks • Found {step1.data.signature?.length || 0} common patterns
                                        </div>

                                        {/* Signature Patterns (>50% coverage) */}
                                        <div className="space-y-2">
                                            <h4 className="text-sm font-medium text-slate-300">Common Characteristics (&gt;50% of stocks):</h4>
                                            {step1.data.signature?.slice(0, 10).map((sig: any, i: number) => (
                                                <div key={i} className="bg-slate-800/50 rounded-lg p-3 border border-slate-600 flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-xs px-2 py-0.5 rounded ${sig.coverage >= 80 ? 'bg-emerald-900/50 text-emerald-400' : sig.coverage >= 60 ? 'bg-yellow-900/50 text-yellow-400' : 'bg-slate-700 text-slate-300'}`}>
                                                            {sig.coverage}%
                                                        </span>
                                                        <span className="text-white">{sig.characteristicLabel || sig.characteristic}</span>
                                                    </div>
                                                    <div className="text-cyan-400 font-mono text-sm">
                                                        = {sig.value}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* What This Means */}
                                        {step1.data.signature?.length > 0 && (
                                            <div className="bg-slate-800/30 rounded-lg p-4 border border-cyan-500/30 mt-4">
                                                <h4 className="text-sm font-semibold text-cyan-400 mb-2">💡 Category Definition</h4>
                                                <div className="text-sm text-slate-300">
                                                    Stocks in <span className="text-cyan-400 font-medium">{categoryKey}</span> typically show:
                                                    <ul className="mt-2 space-y-1">
                                                        {step1.data.signature.slice(0, 5).map((sig: any, i: number) => (
                                                            <li key={i}>• {sig.characteristicLabel}: <span className="text-cyan-400">{sig.value}</span></li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    // Empty State
                                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                        <div className="text-6xl mb-4 opacity-30">🔬</div>
                                        <p className="text-lg">Start with Step 1</p>
                                        <p className="text-sm text-slate-500 mt-2">Discover patterns in this category</p>
                                    </div>
                                )}
                            </div>

                            {/* Activity Log */}
                            <div className="h-40 border-t border-slate-700 bg-slate-800/30">
                                <div className="px-4 py-2 border-b border-slate-700">
                                    <h3 className="text-xs font-semibold text-slate-400 uppercase">Activity Log</h3>
                                </div>
                                <div className="p-3 h-[calc(100%-32px)] overflow-y-auto">
                                    <div className="space-y-0.5 text-xs font-mono">
                                        {logs.map((log, i) => (
                                            <div key={i} className={
                                                log.startsWith('✅') ? 'text-emerald-400' :
                                                    log.startsWith('❌') ? 'text-red-400' :
                                                        log.startsWith('🏆') ? 'text-yellow-400' :
                                                            'text-slate-400'
                                            }>{log}</div>
                                        ))}
                                        {logs.length === 0 && <span className="text-slate-600">Ready to start...</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Research Modal */}
            <ResearchBacktestModal
                isOpen={showResearchModal}
                onClose={() => setShowResearchModal(false)}
                categoryKey={categoryKey}
            />
        </>
    );
};

export default LabsWorkflowWindow;
