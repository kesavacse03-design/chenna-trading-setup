import React, { useState, useEffect } from 'react';
import { BeakerIcon } from './icons/BeakerIcon';
import { SpinnerIcon } from './icons/SpinnerIcon';

interface ShadowStats {
    totalOutcomes: number;
    patternsDiscovered: number;
    improvementsPending: number;
    recentAdaptations: number;
}

interface Pattern {
    id: string;
    patternType: string;
    confidence: number;
    sampleSize: number;
    pattern: any;
    discoveredAt: string;
}

interface Improvement {
    id: string;
    status: string;
    expectedGain: number;
    improvedParams: any;
    notes?: string;
    createdAt: string;
}

export const ShadowLearnerDashboard: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const [stats, setStats] = useState<ShadowStats | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [patterns, setPatterns] = useState<Pattern[]>([]);
    const [improvements, setImprovements] = useState<Improvement[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadDashboardStats();
        }
    }, [isOpen]);

    const loadDashboardStats = async () => {
        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            const response = await fetch(`${apiBase}/api/shadow/dashboard`);
            const data = await response.json();
            if (data.ok) {
                setStats({
                    totalOutcomes: data.totalOutcomes,
                    patternsDiscovered: data.patternsDiscovered,
                    improvementsPending: data.improvementsPending,
                    recentAdaptations: data.recentAdaptations
                });
            }
        } catch (error) {
            console.error('Failed to load dashboard stats:', error);
        }
    };

    const loadCategoryInsights = async (categoryKey: string) => {
        setLoading(true);
        setSelectedCategory(categoryKey);

        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';

            // Load patterns
            const patternsRes = await fetch(`${apiBase}/api/shadow/patterns/${categoryKey}`);
            const patternsData = await patternsRes.json();
            if (patternsData.ok) setPatterns(patternsData.patterns);

            // Load improvements
            const improvementsRes = await fetch(`${apiBase}/api/shadow/improvements/${categoryKey}`);
            const improvementsData = await improvementsRes.json();
            if (improvementsData.ok) setImprovements(improvementsData.improvements);

        } catch (error) {
            console.error('Failed to load category insights:', error);
        } finally {
            setLoading(false);
        }
    };

    const triggerLearning = async () => {
        if (!selectedCategory) return;

        setLoading(true);
        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            const response = await fetch(`${apiBase}/api/shadow/trigger/${selectedCategory}`, {
                method: 'POST'
            });
            const data = await response.json();

            if (data.ok) {
                alert(`✅ Learning cycle complete!\nPatterns: ${data.result.patternsDiscovered}\nSuggestions: ${data.result.suggestionCount}`);
                await loadCategoryInsights(selectedCategory);
                await loadDashboardStats();
            }
        } catch (error) {
            alert('❌ Failed to trigger learning cycle');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 border border-purple-500/30 rounded-2xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-purple-500/20">
                    <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 flex items-center gap-3">
                        <BeakerIcon className="w-8 h-8 text-purple-400" />
                        Shadow Learner AI
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        ✕
                    </button>
                </div>

                <div className="flex-1 flex gap-6 p-6 overflow-hidden">

                    {/* Left: Stats & Controls */}
                    <div className="w-1/3 space-y-4">

                        {/* Global Stats */}
                        {stats && (
                            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-purple-500/20">
                                <h3 className="text-purple-300 font-semibold mb-3 flex items-center gap-2">
                                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                                    AI Learning Stats
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-slate-900/50 rounded-lg p-3">
                                        <div className="text-xs text-slate-400 mb-1">Outcomes Tracked</div>
                                        <div className="text-2xl font-bold text-purple-400">{stats.totalOutcomes}</div>
                                    </div>
                                    <div className="bg-slate-900/50 rounded-lg p-3">
                                        <div className="text-xs text-slate-400 mb-1">Patterns Found</div>
                                        <div className="text-2xl font-bold text-cyan-400">{stats.patternsDiscovered}</div>
                                    </div>
                                    <div className="bg-slate-900/50 rounded-lg p-3">
                                        <div className="text-xs text-slate-400 mb-1">Pending</div>
                                        <div className="text-2xl font-bold text-amber-400">{stats.improvementsPending}</div>
                                    </div>
                                    <div className="bg-slate-900/50 rounded-lg p-3">
                                        <div className="text-xs text-slate-400 mb-1">Auto-Applied</div>
                                        <div className="text-2xl font-bold text-green-400">{stats.recentAdaptations}</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Category Selector */}
                        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-purple-500/20">
                            <h3 className="text-purple-300 font-semibold mb-3">Select Category</h3>
                            <input
                                type="text"
                                placeholder="e.g., DOWNSIDE_LOM_SWING"
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="w-full bg-slate-900/50 border border-purple-500/30 rounded-lg px-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-400"
                            />
                            <div className="mt-3 space-y-2">
                                <button
                                    onClick={() => loadCategoryInsights(selectedCategory)}
                                    disabled={!selectedCategory || loading}
                                    className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white font-semibold py-2 px-4 rounded-lg disabled:opacity-50 transition-all"
                                >
                                    {loading ? <SpinnerIcon className="w-4 h-4 animate-spin inline" /> : '🔍 View Insights'}
                                </button>
                                <button
                                    onClick={triggerLearning}
                                    disabled={!selectedCategory || loading}
                                    className="w-full bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-white font-semibold py-2 px-4 rounded-lg disabled:opacity-50 transition-all"
                                >
                                    🧠 Trigger Learning
                                </button>
                            </div>
                        </div>

                        {/* Improvements Count */}
                        {improvements.length > 0 && (
                            <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/30 border border-amber-500/30 rounded-xl p-4">
                                <div className="text-amber-300 font-semibold mb-1">{improvements.length} Improvements Pending</div>
                                <p className="text-xs text-slate-400">Review and approve optimizations</p>
                            </div>
                        )}
                    </div>

                    {/* Right: Patterns & Improvements */}
                    <div className="flex-1 space-y-4 overflow-y-auto">

                        {/* Discovered Patterns */}
                        {patterns.length > 0 && (
                            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-purple-500/20">
                                <h3 className="text-purple-300 font-semibold mb-3">🔮 Discovered Patterns</h3>
                                <div className="space-y-2">
                                    {patterns.map((pattern) => (
                                        <div key={pattern.id} className="bg-slate-900/50 rounded-lg p-3 border border-purple-500/10">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm font-semibold text-purple-300 capitalize">
                                                    {pattern.patternType.replace('_', ' ')}
                                                </span>
                                                <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-1 rounded">
                                                    {(pattern.confidence * 100).toFixed(0)}% confidence
                                                </span>
                                            </div>
                                            <div className="text-xs text-slate-400">
                                                Sample size: {pattern.sampleSize} outcomes
                                            </div>
                                            {pattern.pattern.details && (
                                                <div className="mt-2 text-xs text-cyan-300">
                                                    {JSON.stringify(pattern.pattern.details).substring(0, 100)}...
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Pending Improvements */}
                        {improvements.length > 0 && (
                            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-amber-500/20">
                                <h3 className="text-amber-300 font-semibold mb-3">⚡ Strategy Improvements</h3>
                                <div className="space-y-2">
                                    {improvements.map((improvement) => (
                                        <div key={improvement.id} className="bg-slate-900/50 rounded-lg p-3 border border-amber-500/10">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm font-semibold text-amber-300">
                                                    {improvement.status === 'pending' ? '⏸️' : improvement.status === 'applied' ? '✅' : '❌'}
                                                    {improvement.status.toUpperCase()}
                                                </span>
                                                <span className="text-xs text-green-400">
                                                    +{(improvement.expectedGain * 100).toFixed(1)}% expected
                                                </span>
                                            </div>
                                            {improvement.notes && (
                                                <div className="text-xs text-slate-400 mt-1">{improvement.notes}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Empty State */}
                        {patterns.length === 0 && improvements.length === 0 && selectedCategory && !loading && (
                            <div className="text-center text-slate-500 py-12">
                                <BeakerIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                                <p className="text-lg">No patterns discovered yet</p>
                                <p className="text-sm mt-2">Run more backtests to gather data</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
