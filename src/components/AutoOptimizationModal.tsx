// Auto-Optimization Modal Component
// Connects to advanced optimizer backend for automatic strategy generation

import React, { useState, useEffect } from 'react';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { SparklesIcon } from './icons/SparklesIcon';

interface OptimizationModalProps {
    isOpen: boolean;
    onClose: () => void;
    categoryKey: string;
    onComplete: (result: any) => void;
}

interface OptimizationProgress {
    phase: string;
    progress: number;
    total: number;
    message: string;
}

const AutoOptimizationModal: React.FC<OptimizationModalProps> = ({
    isOpen,
    onClose,
    categoryKey,
    onComplete
}) => {
    const [jobId, setJobId] = useState<string | null>(null);
    const [status, setStatus] = useState<'idle' | 'running' | 'complete' | 'error'>('idle');
    const [progress, setProgress] = useState<OptimizationProgress>({
        phase: 'IDLE',
        progress: 0,
        total: 0,
        message: 'Ready to start'
    });
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) {
            // Reset state when modal closes
            setJobId(null);
            setStatus('idle');
            setProgress({
                phase: 'IDLE',
                progress: 0,
                total: 0,
                message: 'Ready to start'
            });
            setResult(null);
            setError(null);
        }
    }, [isOpen]);

    const startOptimization = async () => {
        try {
            setStatus('running');
            setError(null);

            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';

            // Start optimization job
            const startRes = await fetch(`${apiBase}/api/optimize/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: categoryKey })
            });

            if (!startRes.ok) {
                throw new Error('Failed to start optimization');
            }

            const startData = await startRes.json();
            setJobId(startData.jobId);

            // Poll for status
            pollStatus(startData.jobId, apiBase);

        } catch (err: any) {
            setError(err.message || 'Failed to start optimization');
            setStatus('error');
        }
    };

    const pollStatus = async (jid: string, apiBase: string) => {
        let attempts = 0;
        const maxAttempts = 600; // 10 minutes with 1s interval

        const poll = async () => {
            try {
                const statusRes = await fetch(`${apiBase}/api/optimize/status/${jid}`);
                if (!statusRes.ok) {
                    throw new Error('Failed to fetch status');
                }

                const statusData = await statusRes.json();

                setProgress({
                    phase: statusData.phase || 'RUNNING',
                    progress: statusData.progress || 0,
                    total: statusData.total || 0,
                    message: statusData.message || 'Processing...'
                });

                if (statusData.status === 'COMPLETE') {
                    // Fetch results
                    const resultsRes = await fetch(`${apiBase}/api/optimize/results/${jid}`);
                    if (resultsRes.ok) {
                        const resultsData = await resultsRes.json();
                        setResult(resultsData.result);
                        setStatus('complete');
                        onComplete(resultsData.result);
                    }
                    return;
                }

                if (statusData.status === 'ERROR') {
                    setError('Optimization failed');
                    setStatus('error');
                    return;
                }

                // Continue polling
                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(poll, 1000);
                } else {
                    setError('Optimization timeout');
                    setStatus('error');
                }

            } catch (err: any) {
                setError(err.message || 'Status check failed');
                setStatus('error');
            }
        };

        poll();
    };

    if (!isOpen) return null;

    const progressPercent = progress.total > 0
        ? Math.round((progress.progress / progress.total) * 100)
        : 0;

    return (
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-[60]"
            onClick={onClose}
        >
            <div
                className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-2xl mx-4 p-6"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold text-cyan-300 flex items-center">
                        <SparklesIcon className="w-6 h-6 mr-3" />
                        Auto-Optimization
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white text-2xl leading-none"
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div className="space-y-4">

                    {/* Category Info */}
                    <div className="bg-slate-800/50 rounded p-4 border border-slate-700">
                        <div className="text-sm text-slate-400">Category:</div>
                        <div className="text-lg font-mono text-white">{categoryKey}</div>
                    </div>

                    {/* Status */}
                    {status === 'idle' && (
                        <div className="text-center py-8">
                            <p className="text-slate-300 mb-6">
                                Click Start to automatically test 60+ parameter combinations and find the best trading strategy.
                            </p>
                            <button
                                onClick={startOptimization}
                                className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-8 rounded-lg flex items-center justify-center mx-auto"
                            >
                                <SparklesIcon className="w-5 h-5 mr-2" />
                                Start Auto-Optimization
                            </button>
                        </div>
                    )}

                    {status === 'running' && (
                        <div className="space-y-4">
                            {/* Progress Bar */}
                            <div>
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-slate-400">{progress.phase}</span>
                                    <span className="text-cyan-300">{progressPercent}%</span>
                                </div>
                                <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                                    <div
                                        className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-300 ease-out"
                                        style={{ width: `${progressPercent}%` }}
                                    />
                                </div>
                            </div>

                            {/* Message */}
                            <div className="bg-slate-800/50 rounded p-4 border border-slate-700">
                                <div className="flex items-center text-slate-300">
                                    <SpinnerIcon className="w-5 h-5 mr-3 text-cyan-400" />
                                    <span>{progress.message}</span>
                                </div>
                            </div>

                            {/* Progress Details */}
                            <div className="text-xs text-slate-500 text-center">
                                {progress.progress} / {progress.total} completed
                            </div>
                        </div>
                    )}

                    {status === 'complete' && result && (
                        <div className="space-y-4">
                            {/* Success Message */}
                            <div className="bg-emerald-900/30 border border-emerald-700 rounded p-4 text-center">
                                <div className="text-emerald-300 text-lg font-semibold mb-2">
                                    ✓ Optimization Complete!
                                </div>
                                <div className="text-slate-300 text-sm">
                                    Found optimal strategy configuration
                                </div>
                            </div>

                            {/* Results */}
                            <div className="bg-slate-800/50 rounded p-4 border border-slate-700 space-y-3">
                                <h3 className="font-semibold text-cyan-300 mb-3">Best Strategy:</h3>

                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <div className="text-slate-400">Accuracy</div>
                                        <div className="text-2xl font-bold text-emerald-300">
                                            {result.accuracy?.toFixed(2)}%
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-slate-400">Total Trades</div>
                                        <div className="text-2xl font-bold text-white">
                                            {result.totalTrades}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-slate-400">Wins / Losses</div>
                                        <div className="text-lg text-white">
                                            {result.winningTrades} / {result.losingTrades}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-slate-400">Avg P&L</div>
                                        <div className={`text-lg font-semibold ${result.avgPnl > 0 ? 'text-emerald-300' : 'text-red-300'
                                            }`}>
                                            {result.avgPnl?.toFixed(2)}%
                                        </div>
                                    </div>
                                </div>

                                {/* Parameters */}
                                <div className="mt-4 pt-4 border-t border-slate-700">
                                    <div className="text-xs text-slate-400 mb-2">Parameters:</div>
                                    <div className="font-mono text-xs text-slate-300 bg-slate-900/50 p-2 rounded">
                                        <div>RSI: {result.params?.rsiMin}-{result.params?.rsiMax}</div>
                                        <div>Volume: {result.params?.volume}x</div>
                                        <div>EMA: {(result.params?.ema * 100).toFixed(0)}%</div>
                                        <div>R:R: 1:{result.params?.rr}</div>
                                        <div>Patterns: {result.params?.patterns?.join(', ')}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={onClose}
                                    className="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-6 rounded-lg"
                                >
                                    Close
                                </button>
                                <button
                                    onClick={() => {
                                        // Apply strategy logic here
                                        onClose();
                                    }}
                                    className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-6 rounded-lg"
                                >
                                    Apply Strategy
                                </button>
                            </div>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="space-y-4">
                            <div className="bg-red-900/30 border border-red-700 rounded p-4 text-center">
                                <div className="text-red-300 text-lg font-semibold mb-2">
                                    ✗ Optimization Failed
                                </div>
                                <div className="text-slate-300 text-sm">
                                    {error || 'An unknown error occurred'}
                                </div>
                            </div>

                            <div className="flex justify-center">
                                <button
                                    onClick={() => {
                                        setStatus('idle');
                                        setError(null);
                                    }}
                                    className="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-6 rounded-lg"
                                >
                                    Try Again
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};

export default AutoOptimizationModal;
