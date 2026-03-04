import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:3001/api';

interface StrategyParameter {
    value: number | string;
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
    label: string;
}

interface StrategyConfig {
    id: string;
    name: string;
    description: string;
    type: string;
    version: string;
    status: string;
    parameters: Record<string, StrategyParameter>;
    signalFlow: { step: number; time: string; action: string; filter: string }[];
    backtestStats: {
        lastRun: string | null;
        winRate: number;
        totalTrades: number;
        avgPnL: number;
    } | null;
    enabled: boolean;
}

interface StrategyLogicModalProps {
    isOpen: boolean;
    onClose: () => void;
    categoryKey?: string; // Optional: if null, show selector? For now assume passed.
}

const StrategyLogicModal: React.FC<StrategyLogicModalProps> = ({ isOpen, onClose, categoryKey = 'INTRADAY_BOOST' }) => {
    const [config, setConfig] = useState<StrategyConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [editMode, setEditMode] = useState(false);
    const [editedParams, setEditedParams] = useState<Record<string, any>>({});
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'LOGIC' | 'STATS'>('LOGIC');

    // Fetch config on open
    useEffect(() => {
        if (isOpen && categoryKey) {
            fetchConfig();
        }
    }, [isOpen, categoryKey]);

    const fetchConfig = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/strategy/config/${categoryKey}`);
            const data = await res.json();
            if (data.success) {
                setConfig(data.config);
                // Initialize edited params
                const params: Record<string, any> = {};
                Object.entries(data.config.parameters).forEach(([key, param]: [string, any]) => {
                    params[key] = param.value;
                });
                setEditedParams(params);
            }
        } catch (error) {
            console.error('Failed to fetch strategy config:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await fetch(`${API_BASE}/strategy/config/${categoryKey}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ parameters: editedParams })
            });
            setEditMode(false);
            fetchConfig(); // Refresh
        } catch (error) {
            console.error('Failed to save config:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleParamChange = (key: string, value: any) => {
        setEditedParams(prev => ({
            ...prev,
            [key]: value
        }));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-slate-800 rounded-lg max-w-2xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="px-6 py-4 bg-slate-900/50 border-b border-slate-700 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                            ⚡ Strategy Logic
                        </h2>
                        <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                            <span className="font-mono text-slate-300">{categoryKey}</span>
                            <span className="bg-slate-700 px-1.5 rounded text-slate-400">•</span>
                            <span>{config?.version || 'V2.1'}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl transition-colors">&times;</button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-700 bg-slate-800/50">
                    <button
                        onClick={() => setActiveTab('LOGIC')}
                        className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'LOGIC' ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-900/10' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        ⚙️ Configuration
                    </button>
                    <button
                        onClick={() => setActiveTab('STATS')}
                        className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'STATS' ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-900/10' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        📊 Performance
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
                        </div>
                    ) : config ? (
                        <>
                            {/* LOGIC TAB */}
                            {activeTab === 'LOGIC' && (
                                <div className="space-y-6">
                                    {/* Edit Mode Toggle */}
                                    <div className="flex justify-end">
                                        {!editMode ? (
                                            <button
                                                onClick={() => setEditMode(true)}
                                                className="text-xs flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors"
                                            >
                                                ✏️ Edit Parameters
                                            </button>
                                        ) : (
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => { setEditMode(false); setEditedParams(Object.fromEntries(Object.entries(config.parameters).map(([k, v]) => [k, v.value]))); }}
                                                    className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleSave}
                                                    disabled={saving}
                                                    className="text-xs px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-white font-semibold transition-colors disabled:opacity-50"
                                                >
                                                    {saving ? 'Saving...' : '💾 Save Changes'}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Parameters Grid */}
                                    <div className="grid grid-cols-2 gap-4">
                                        {Object.entries(config.parameters).map(([key, param]) => (
                                            <div key={key} className={`bg-slate-700/30 p-3 rounded-lg border ${editMode ? 'border-slate-600' : 'border-transparent'}`}>
                                                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
                                                    {param.label}
                                                </label>

                                                {editMode ? (
                                                    param.options ? (
                                                        <select
                                                            value={editedParams[key]}
                                                            onChange={e => handleParamChange(key, e.target.value)}
                                                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:border-cyan-500 focus:outline-none"
                                                        >
                                                            {param.options.map(opt => (
                                                                <option key={opt} value={opt}>{opt}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <input
                                                            type="number"
                                                            value={editedParams[key]}
                                                            onChange={e => handleParamChange(key, parseFloat(e.target.value))}
                                                            step={param.step}
                                                            min={param.min}
                                                            max={param.max}
                                                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:border-cyan-500 focus:outline-none"
                                                        />
                                                    )
                                                ) : (
                                                    <div className="text-lg font-mono font-medium text-white">
                                                        {param.value}
                                                        {key.toLowerCase().includes('percent') && <span className="text-slate-500 text-sm ml-0.5">%</span>}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Signal Flow Visualization */}
                                    <div className="mt-8">
                                        <h3 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-wider">Signal Generation Flow</h3>
                                        <div className="relative border-l-2 border-slate-700 ml-3 space-y-6 pb-2">
                                            {config.signalFlow.map((step, idx) => (
                                                <div key={idx} className="relative pl-6">
                                                    <div className="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full bg-slate-800 border-2 border-cyan-500/50"></div>
                                                    <div className="flex items-start justify-between group">
                                                        <div>
                                                            <div className="text-xs font-mono text-cyan-400 mb-0.5">{step.time}</div>
                                                            <div className="text-sm font-semibold text-slate-200">{step.action}</div>
                                                            <div className="text-xs text-slate-500 mt-1 bg-slate-800/50 p-1.5 rounded inline-block border border-slate-700/50">
                                                                Filter: <span className="font-mono text-slate-400">{step.filter}</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-3xl font-bold text-slate-800 select-none group-hover:text-slate-800/80 transition-colors">
                                                            0{step.step}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* STATS TAB */}
                            {activeTab === 'STATS' && (
                                <div className="space-y-6">
                                    <div className="bg-slate-700/30 rounded-lg p-6 border border-slate-700/50">
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <h3 className="text-lg font-bold text-purple-400">Backtest Performance</h3>
                                                <div className="text-xs text-slate-500 mt-1">
                                                    Last run: {config.backtestStats?.lastRun || 'Never'}
                                                </div>
                                            </div>
                                            <div className="bg-purple-500/10 text-purple-400 px-3 py-1 rounded-full text-xs font-bold border border-purple-500/20">
                                                {config.status}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-6 text-center">
                                            <div className="p-4 bg-slate-800/50 rounded-lg">
                                                <div className="text-slate-400 text-xs uppercase mb-1">Win Rate</div>
                                                <div className="text-2xl font-bold text-green-400">{config.backtestStats?.winRate || 0}%</div>
                                            </div>
                                            <div className="p-4 bg-slate-800/50 rounded-lg">
                                                <div className="text-slate-400 text-xs uppercase mb-1">Avg P&L</div>
                                                <div className={`text-2xl font-bold ${config.backtestStats?.avgPnL && config.backtestStats.avgPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    {config.backtestStats?.avgPnL && config.backtestStats.avgPnL > 0 ? '+' : ''}
                                                    {config.backtestStats?.avgPnL || 0}%
                                                </div>
                                            </div>
                                            <div className="p-4 bg-slate-800/50 rounded-lg">
                                                <div className="text-slate-400 text-xs uppercase mb-1">Total Trades</div>
                                                <div className="text-2xl font-bold text-slate-200">{config.backtestStats?.totalTrades || 0}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-blue-900/10 border border-blue-500/20 rounded-lg p-4 flex items-start gap-3">
                                        <div className="text-blue-400 text-xl">💡</div>
                                        <div>
                                            <h4 className="text-sm font-semibold text-blue-300">Strategy Insight</h4>
                                            <p className="text-xs text-blue-200/70 mt-1 leading-relaxed">
                                                This strategy performs best in trending markets with high volatility.
                                                The "Strict" mode filters out choppy movements, while "Relaxed" mode captures more opportunities but with slightly higher risk.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center py-12 text-slate-500">
                            Failed to load configuration.
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-900/50 border-t border-slate-700 text-center">
                    <button
                        onClick={onClose}
                        className="w-full py-2 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 text-sm font-semibold transition-colors"
                    >
                        Close Panel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default StrategyLogicModal;
