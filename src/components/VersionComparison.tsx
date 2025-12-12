import React, { useState, useEffect } from 'react';
import { XMarkIcon } from './icons/XMarkIcon';

interface VersionComparisonProps {
    categoryKey: string;
    version1Id: number | string;
    version2Id: number | string;
    onClose: () => void;
}

export function VersionComparison({ categoryKey, version1Id, version2Id, onClose }: VersionComparisonProps) {
    const [comparison, setComparison] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadComparison();
    }, [categoryKey, version1Id, version2Id]);

    const loadComparison = async () => {
        setLoading(true);
        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            const response = await fetch(
                `${apiBase}/api/versions/compare/${categoryKey}?v1=${version1Id}&v2=${version2Id}`
            );

            if (response.ok) {
                const data = await response.json();
                setComparison(data);
            }
        } catch (error) {
            console.error('Failed to load comparison:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-slate-800 p-6 rounded-xl">
                    <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
                </div>
            </div>
        );
    }

    if (!comparison) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 rounded-xl max-w-6xl w-full max-h-[90vh] overflow-auto">
                {/* Header */}
                <div className="sticky top-0 bg-slate-900 p-6 border-b border-slate-700 flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
                        Version Comparison
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6">
                    {/* Side-by-Side Comparison */}
                    <div className="grid grid-cols-2 gap-6 mb-6">
                        {/* Version 1 */}
                        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                            <h3 className="text-lg font-bold text-blue-400 mb-3">
                                V{comparison.version1.versionNumber}
                            </h3>
                            <div className="space-y-2">
                                <div className="text-sm text-slate-400">Parameters:</div>
                                <pre className="text-xs bg-slate-900 p-3 rounded overflow-auto max-h-96">
                                    {JSON.stringify(comparison.version1.params, null, 2)}
                                </pre>
                                {comparison.version1.metrics && (
                                    <div className="mt-4 space-y-1">
                                        <div className="text-sm font-bold text-slate-300">Metrics:</div>
                                        <div className="text-xs text-slate-400">
                                            Expected Gain: {((comparison.version1.metrics.expectedGain || 0) * 100).toFixed(1)}%
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Version 2 */}
                        <div className="bg-slate-800 rounded-lg p-4 border border-green-700">
                            <h3 className="text-lg font-bold text-green-400 mb-3">
                                V{comparison.version2.versionNumber}
                            </h3>
                            <div className="space-y-2">
                                <div className="text-sm text-slate-400">Parameters:</div>
                                <pre className="text-xs bg-slate-900 p-3 rounded overflow-auto max-h-96">
                                    {JSON.stringify(comparison.version2.params, null, 2)}
                                </pre>
                                {comparison.version2.metrics && (
                                    <div className="mt-4 space-y-1">
                                        <div className="text-sm font-bold text-slate-300">Metrics:</div>
                                        <div className="text-xs text-slate-400">
                                            Expected Gain: {((comparison.version2.metrics.expectedGain || 0) * 100).toFixed(1)}%
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Diff Summary */}
                    {comparison.diff && (
                        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                            <h3 className="text-lg font-bold text-yellow-400 mb-3">Changes Summary</h3>

                            {/* Changed params */}
                            {comparison.diff.changed && comparison.diff.changed.length > 0 && (
                                <div className="mb-4">
                                    <div className="text-sm font-bold text-amber-300 mb-2">Modified:</div>
                                    <div className="space-y-1">
                                        {comparison.diff.changed.map((change: any, idx: number) => (
                                            <div key={idx} className="flex items-center text-sm">
                                                <span className="text-slate-400 w-32">{change.param}:</span>
                                                <span className="text-red-400 line-through mr-2">
                                                    {JSON.stringify(change.from)}
                                                </span>
                                                →
                                                <span className="text-green-400 ml-2">
                                                    {JSON.stringify(change.to)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Added params */}
                            {comparison.diff.added && comparison.diff.added.length > 0 && (
                                <div className="mb-4">
                                    <div className="text-sm font-bold text-green-300 mb-2">Added:</div>
                                    <div className="space-y-1">
                                        {comparison.diff.added.map((add: any, idx: number) => (
                                            <div key={idx} className="flex items-center text-sm">
                                                <span className="text-slate-400 w-32">{add.param}:</span>
                                                <span className="text-green-400">
                                                    {JSON.stringify(add.value)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Removed params */}
                            {comparison.diff.removed && comparison.diff.removed.length > 0 && (
                                <div>
                                    <div className="text-sm font-bold text-red-300 mb-2">Removed:</div>
                                    <div className="space-y-1">
                                        {comparison.diff.removed.map((rem: any, idx: number) => (
                                            <div key={idx} className="flex items-center text-sm">
                                                <span className="text-slate-400 w-32">{rem.param}:</span>
                                                <span className="text-red-400 line-through">
                                                    {JSON.stringify(rem.value)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* No changes */}
                            {(!comparison.diff.changed || comparison.diff.changed.length === 0) &&
                                (!comparison.diff.added || comparison.diff.added.length === 0) &&
                                (!comparison.diff.removed || comparison.diff.removed.length === 0) && (
                                    <div className="text-sm text-slate-400 text-center py-4">
                                        No parameter changes detected
                                    </div>
                                )}
                        </div>
                    )}

                    {/* Close Button */}
                    <div className="mt-6 flex justify-end">
                        <button
                            onClick={onClose}
                            className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded-lg transition"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
