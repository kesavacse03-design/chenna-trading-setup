import React, { useEffect, useState } from 'react';

const API_BASE = 'http://localhost:3001/api/v5';

interface IBStock {
    symbol: string;
    sector: string | null;
    phase: string;
    orHigh: number | null;
    orLow: number | null;
    orRangePct: string | null;
    currentPrice: number | null;
    approachDirection: string | null;
    approachDistance: string | null;
    breakoutDirection: string | null;
    breakoutPrice: number | null;
    breakoutTime: string | null;
    signalId: number | null;
    urgency: number;
}

interface WatchlistStatus {
    lastUpdate: string | null;
    total: number;
    summary: {
        forming: number;
        approaching: number;
        breakout: number;
        signal: number;
        watching: number;
        noBreakout: number;
    };
    stocks: IBStock[];
}

const phaseConfig: Record<string, { label: string; color: string; bg: string; pulse?: boolean }> = {
    FORMING: { label: 'OR Forming', color: 'text-blue-400', bg: 'bg-blue-500/10' },
    APPROACHING: { label: '⚡ Approaching', color: 'text-amber-400', bg: 'bg-amber-500/15', pulse: true },
    BREAKOUT: { label: '🔥 Breakout!', color: 'text-red-400', bg: 'bg-red-500/15', pulse: true },
    RETEST_ZONE: { label: '🎯 Retest Zone', color: 'text-green-400', bg: 'bg-green-500/15', pulse: true },
    SIGNAL: { label: '✅ Signal', color: 'text-green-400', bg: 'bg-green-500/10' },
    WATCHING: { label: 'Inside OR', color: 'text-slate-400', bg: 'bg-slate-500/10' },
    NO_DATA: { label: 'No Data', color: 'text-slate-600', bg: 'bg-slate-700/20' },
    NO_PRICE: { label: 'No Price', color: 'text-slate-600', bg: 'bg-slate-700/20' },
    NO_BREAKOUT: { label: 'No BO', color: 'text-slate-600', bg: 'bg-slate-700/20' },
};

const IBWatchlist: React.FC = () => {
    const [data, setData] = useState<WatchlistStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [collapsed, setCollapsed] = useState(false);

    const fetchWatchlist = async () => {
        try {
            const res = await fetch(`${API_BASE}/watchlist/intraday`);
            const json = await res.json();
            if (json.ok) {
                setData(json);
            }
        } catch (e) {
            console.error('Watchlist fetch failed:', e);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchWatchlist();
        const interval = setInterval(fetchWatchlist, 15000); // Refresh every 15s
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <div className="bg-slate-900/60 rounded-lg border border-slate-700/50 p-4">
                <div className="text-slate-400 text-sm animate-pulse">Loading IB Watchlist...</div>
            </div>
        );
    }

    if (!data || data.total === 0) {
        return (
            <div className="bg-slate-900/60 rounded-lg border border-slate-700/50 p-4">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span>📋</span>
                    <span>No IB stocks loaded for today</span>
                </div>
            </div>
        );
    }

    const { summary } = data;

    return (
        <div className="bg-slate-900/60 rounded-lg border border-slate-700/50 overflow-hidden">
            {/* Header */}
            <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-800/40 transition-colors"
                onClick={() => setCollapsed(!collapsed)}
            >
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        📋 IB Watchlist
                        <span className="text-xs font-normal text-slate-500">({data.total} stocks)</span>
                    </h3>

                    {/* Phase summary pills */}
                    <div className="flex items-center gap-1.5">
                        {summary.approaching > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold animate-pulse">
                                ⚡ {summary.approaching} Approaching
                            </span>
                        )}
                        {summary.breakout > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold animate-pulse">
                                🔥 {summary.breakout} Breakout
                            </span>
                        )}
                        {summary.signal > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-[10px] font-bold">
                                ✅ {summary.signal} Signal
                            </span>
                        )}
                        {summary.watching > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400 text-[10px] font-medium">
                                👁 {summary.watching} Watching
                            </span>
                        )}
                        {summary.forming > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-medium">
                                ⏳ {summary.forming} Forming
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {data.lastUpdate && (
                        <span className="text-[10px] text-slate-600">
                            Updated: {new Date(data.lastUpdate).toLocaleTimeString('en-IN', {
                                timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
                            })}
                        </span>
                    )}
                    <span className="text-slate-500 text-xs">{collapsed ? '▼' : '▲'}</span>
                </div>
            </div>

            {/* Stock Table */}
            {!collapsed && (
                <div className="border-t border-slate-700/50">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-slate-800/50">
                            <tr className="text-slate-500">
                                <th className="px-3 py-2 font-medium">Symbol</th>
                                <th className="px-3 py-2 font-medium text-center">Phase</th>
                                <th className="px-3 py-2 font-medium text-right">CMP</th>
                                <th className="px-3 py-2 font-medium text-right">OR High</th>
                                <th className="px-3 py-2 font-medium text-right">OR Low</th>
                                <th className="px-3 py-2 font-medium text-right">OR %</th>
                                <th className="px-3 py-2 font-medium text-center">Direction</th>
                                <th className="px-3 py-2 font-medium">Info</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.stocks.map((stock) => {
                                const phase = phaseConfig[stock.phase] || phaseConfig.NO_DATA;
                                return (
                                    <tr
                                        key={stock.symbol}
                                        className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${phase.pulse ? 'animate-pulse-subtle' : ''}`}
                                    >
                                        <td className="px-3 py-2">
                                            <span className="font-semibold text-white">{stock.symbol}</span>
                                            {stock.sector && (
                                                <span className="ml-1 text-[10px] text-slate-600">{stock.sector}</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${phase.bg} ${phase.color}`}>
                                                {phase.label}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-300">
                                            {stock.currentPrice ? `₹${stock.currentPrice.toFixed(1)}` : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-emerald-400">
                                            {stock.orHigh ? `₹${stock.orHigh.toFixed(1)}` : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-red-400">
                                            {stock.orLow ? `₹${stock.orLow.toFixed(1)}` : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-400">
                                            {stock.orRangePct ? `${stock.orRangePct}%` : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            {stock.breakoutDirection === 'LONG' && (
                                                <span className="text-green-400 font-bold">▲ LONG</span>
                                            )}
                                            {stock.breakoutDirection === 'SHORT' && (
                                                <span className="text-red-400 font-bold">▼ SHORT</span>
                                            )}
                                            {stock.approachDirection === 'LONG' && !stock.breakoutDirection && (
                                                <span className="text-amber-300">→ {stock.approachDistance}</span>
                                            )}
                                            {stock.approachDirection === 'SHORT' && !stock.breakoutDirection && (
                                                <span className="text-amber-300">→ {stock.approachDistance}</span>
                                            )}
                                            {!stock.breakoutDirection && !stock.approachDirection && (
                                                <span className="text-slate-600">—</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-slate-500 text-[10px]">
                                            {stock.breakoutTime && `BO at ${stock.breakoutTime}`}
                                            {stock.signalId && ` • Signal #${stock.signalId}`}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default IBWatchlist;
