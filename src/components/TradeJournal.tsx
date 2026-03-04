import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DownloadIcon } from './icons/DownloadIcon';

const API_BASE = (window as any).__CTS_API_BASE || (import.meta as any).env?.VITE_API_BASE || '';

interface JournalEntry {
    id: number;
    symbol: string;
    direction: string;
    entryPrice: number;
    stopPrice: number | null;
    exitPrice: number | null;
    pnl: number | null;
    pnlPercent: number | null;
    exitReason: string | null;
    status: string;
    entryDate: string;
    exitDate: string | null;
    category: string;
    notes: string;
    slippagePercent: number | null;
    rMultiple: number | null;
    riskInr: number | null;
}

const TradeJournal: React.FC = () => {
    const [entries, setEntries] = useState<JournalEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
    const [expandedId, setExpandedId] = useState<number | null>(null);

    // Edit states
    const [editNotes, setEditNotes] = useState('');
    const [editSlippage, setEditSlippage] = useState<number | ''>('');
    const [isSaving, setIsSaving] = useState(false);

    const fetchJournal = useCallback(async () => {
        if (!API_BASE) {
            setLoading(false);
            return;
        }
        try {
            // Fetch both open and closed positions
            const [posRes, closedRes] = await Promise.all([
                fetch(`${API_BASE}/api/v5/dashboard/positions`),
                fetch(`${API_BASE}/api/v5/positions/history?limit=100`)
            ]);

            const posData = await posRes.json();
            const closedData = await closedRes.ok ? await closedRes.json() : { ok: false };

            const journal: JournalEntry[] = [];

            const mapPosition = (p: any, isClosed: boolean): JournalEntry => {
                const entry = parseFloat(p.entryPrice || p.entry || 0);
                const exit = p.exitPrice ? parseFloat(p.exitPrice) : null;
                const pnl = isClosed ? (p.realizedPnL ? parseFloat(p.realizedPnL) : (exit && entry ? exit - entry : null)) : (p.unrealizedPnL ? parseFloat(p.unrealizedPnL) : null);
                const pnlPct = isClosed ? (entry > 0 && pnl !== null ? (pnl / entry) * 100 : null) : (p.unrealizedPnLPct ? parseFloat(p.unrealizedPnLPct) : null);

                const stop = p.stopPrice ? parseFloat(p.stopPrice) : null;

                // Calculate dynamic R-Multiple if stop is present and it hasn't been saved in DB
                let calcRMultiple = p.rMultiple ? parseFloat(p.rMultiple) : null;
                if (calcRMultiple === null && pnl !== null && stop !== null && entry > 0) {
                    const absRiskPerShare = Math.abs(entry - stop);
                    if (absRiskPerShare > 0) {
                        const riskAmount = p.riskInr ? parseFloat(p.riskInr) : (absRiskPerShare * (p.quantity || 1));
                        calcRMultiple = pnl / riskAmount;
                    }
                }

                return {
                    id: p.id,
                    symbol: p.symbol,
                    direction: p.direction || 'LONG',
                    entryPrice: entry,
                    stopPrice: stop,
                    exitPrice: exit,
                    pnl,
                    pnlPercent: pnlPct,
                    exitReason: p.exitReason || (isClosed ? 'MANUAL' : null),
                    status: isClosed ? 'CLOSED' : 'OPEN',
                    entryDate: p.entryDate || p.createdAt || '',
                    exitDate: p.exitDate || p.updatedAt || '',
                    category: p.category || p.signal?.category || 'INTRADAY',
                    notes: p.notes || '',
                    slippagePercent: p.slippagePercent ? parseFloat(p.slippagePercent) : null,
                    rMultiple: calcRMultiple,
                    riskInr: p.riskInr ? parseFloat(p.riskInr) : null,
                };
            };

            if (posData.ok && posData.positions) {
                for (const p of posData.positions) journal.push(mapPosition(p, false));
            }

            if (closedData.ok && closedData.positions) {
                for (const p of closedData.positions) journal.push(mapPosition(p, true));
            }

            // Sort by entry date descending
            journal.sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime());

            setEntries(journal);
        } catch (err) {
            console.error('Failed to fetch journal:', err);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchJournal();
        const interval = setInterval(fetchJournal, 60000); // Refresh every 60s
        return () => clearInterval(interval);
    }, [fetchJournal]);

    const filtered = useMemo(() => entries.filter(e => {
        if (filter === 'open') return e.status === 'OPEN';
        if (filter === 'closed') return e.status === 'CLOSED';
        return true;
    }), [entries, filter]);

    const totalPnl = entries.filter(e => e.pnl !== null).reduce((sum, e) => sum + (e.pnl || 0), 0);
    const closedCount = entries.filter(e => e.status === 'CLOSED').length;
    const openCount = entries.filter(e => e.status === 'OPEN').length;
    const winCount = entries.filter(e => e.status === 'CLOSED' && e.pnl !== null && e.pnl > 0).length;

    const formatDate = (d: string) => {
        if (!d) return '—';
        try {
            return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } catch { return d.split('T')[0]; }
    };

    const handleExpandRow = (entry: JournalEntry) => {
        if (expandedId === entry.id) {
            setExpandedId(null);
        } else {
            setExpandedId(entry.id);
            setEditNotes(entry.notes);
            setEditSlippage(entry.slippagePercent !== null ? entry.slippagePercent : '');
        }
    };

    const handleSaveJournal = async (id: number) => {
        setIsSaving(true);
        try {
            const res = await fetch(`${API_BASE}/api/v5/positions/${id}/journal`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    notes: editNotes,
                    slippagePercent: editSlippage === '' ? null : Number(editSlippage)
                })
            });

            if (res.ok) {
                // Optimistic UI update
                setEntries(prev => prev.map(e => e.id === id ? {
                    ...e,
                    notes: editNotes,
                    slippagePercent: editSlippage === '' ? null : Number(editSlippage)
                } : e));
                setExpandedId(null);
                window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: 'Journal entry updated', kind: 'success' } }));
            } else {
                window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: 'Failed to update journal', kind: 'error' } }));
            }
        } catch (err) {
            window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: 'Network error updating journal', kind: 'error' } }));
        }
        setIsSaving(false);
    };

    const handleExportCSV = () => {
        const headers = ['ID', 'Symbol', 'Direction', 'Category', 'Status', 'Entry Date', 'Entry Price', 'Exit Date', 'Exit Price', 'PnL', 'PnL %', 'R-Multiple', 'Slippage %', 'Notes'];
        const rows = filtered.map(e => [
            e.id,
            e.symbol,
            e.direction,
            e.category,
            e.status,
            e.entryDate ? new Date(e.entryDate).toISOString() : '',
            e.entryPrice,
            e.exitDate ? new Date(e.exitDate).toISOString() : '',
            e.exitPrice || '',
            e.pnl || '',
            e.pnlPercent ? e.pnlPercent.toFixed(2) : '',
            e.rMultiple ? e.rMultiple.toFixed(2) : '',
            e.slippagePercent !== null ? e.slippagePercent : '',
            `"${(e.notes || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `trade_journal_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="bg-slate-800/50 rounded-lg border border-slate-700 shadow-xl overflow-hidden flex flex-col h-[calc(100vh-8rem)]">
            {/* Header */}
            <div className="p-6 border-b border-slate-700 bg-slate-900/50 flex items-center justify-between shrink-0">
                <div>
                    <h2 className="text-xl font-black text-slate-100 flex items-center gap-3">
                        <span className="text-2xl">📓</span> Trade Journal
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">
                        Track performance, log your emotional state, and analyze slippage to improve execution edge.
                    </p>
                </div>

                <div className="flex flex-col items-end">
                    <div className={`text-2xl font-black ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {totalPnl >= 0 ? '+' : ''}₹{Math.abs(totalPnl).toFixed(0)}
                    </div>
                    <div className="text-slate-500 text-xs">Net PNL (Filtered)</div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="p-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between shrink-0">
                <div className="flex gap-4 items-center">
                    <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700">
                        {(['all', 'open', 'closed'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${filter === f
                                    ? 'bg-cyan-600 text-white shadow-md'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                    }`}
                            >
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-4 text-sm px-4 border-l border-slate-700">
                        <div className="flex flex-col">
                            <span className="text-slate-500 text-xs uppercase tracking-wider">Open</span>
                            <span className="text-blue-400 font-bold">{openCount} Trades</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-slate-500 text-xs uppercase tracking-wider">Closed</span>
                            <span className="text-slate-200 font-bold">{closedCount} Trades</span>
                        </div>
                        {closedCount > 0 && (
                            <div className="flex flex-col">
                                <span className="text-slate-500 text-xs uppercase tracking-wider">Win Rate</span>
                                <span className="text-green-400 font-bold">{((winCount / closedCount) * 100).toFixed(1)}%</span>
                            </div>
                        )}
                    </div>
                </div>

                <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-600"
                >
                    <DownloadIcon className="w-4 h-4" />
                    Export CSV
                </button>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-auto bg-slate-900/30">
                {loading ? (
                    <div className="p-10 text-center text-slate-500 animate-pulse">Loading Journal Data...</div>
                ) : filtered.length === 0 ? (
                    <div className="p-20 text-center">
                        <div className="text-4xl mb-4">📭</div>
                        <h3 className="text-lg font-medium text-slate-300">No trades found</h3>
                        <p className="text-slate-500 mt-2">Change your filters or execute some trades to populate the journal.</p>
                    </div>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-800 text-slate-400 text-xs uppercase tracking-wider z-10 shadow-md">
                            <tr>
                                <th className="px-4 py-3 font-medium">Date</th>
                                <th className="px-4 py-3 font-medium">Symbol</th>
                                <th className="px-4 py-3 font-medium">Type</th>
                                <th className="px-4 py-3 font-medium text-right">Entry</th>
                                <th className="px-4 py-3 font-medium text-right">Exit</th>
                                <th className="px-4 py-3 font-medium text-right">PNL</th>
                                <th className="px-4 py-3 font-medium text-center">R-Mult</th>
                                <th className="px-4 py-3 font-medium text-center">Info</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {filtered.map(entry => (
                                <React.Fragment key={entry.id}>
                                    <tr
                                        onClick={() => handleExpandRow(entry)}
                                        className={`hover:bg-slate-700/30 cursor-pointer transition-colors ${expandedId === entry.id ? 'bg-slate-800/80' : ''}`}
                                    >
                                        <td className="px-4 py-3 text-sm text-slate-300 whitespace-nowrap">
                                            {formatDate(entry.entryDate)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-bold text-slate-200">{entry.symbol}</div>
                                            <div className="text-xs text-slate-500 truncate max-w-[120px]" title={entry.category}>
                                                {entry.category.replace(/_/g, ' ')}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`text-xs px-2 py-1 rounded font-bold ${entry.direction === 'LONG'
                                                ? 'bg-green-900/30 text-green-400 border border-green-800'
                                                : 'bg-red-900/30 text-red-400 border border-red-800'
                                                }`}>
                                                {entry.direction}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm">
                                            <div className="text-slate-300">₹{entry.entryPrice.toFixed(2)}</div>
                                            {entry.stopPrice && (
                                                <div className="text-xs text-slate-500">SL: ₹{entry.stopPrice.toFixed(2)}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm">
                                            {entry.status === 'OPEN' ? (
                                                <span className="text-blue-400 font-medium tracking-widest text-xs">LIVE</span>
                                            ) : (
                                                <>
                                                    <div className="text-slate-300">₹{entry.exitPrice?.toFixed(2)}</div>
                                                    <div className="text-xs text-slate-500">{formatDate(entry.exitDate || '')}</div>
                                                </>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {entry.pnl !== null ? (
                                                <>
                                                    <div className={`text-sm font-bold ${entry.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                        {entry.pnl >= 0 ? '+' : ''}₹{entry.pnl.toFixed(0)}
                                                    </div>
                                                    <div className={`text-xs ${entry.pnlPercent && entry.pnlPercent >= 0 ? 'text-green-500/70' : 'text-red-500/70'}`}>
                                                        {entry.pnlPercent !== null ? `${entry.pnlPercent > 0 ? '+' : ''}${entry.pnlPercent.toFixed(2)}%` : ''}
                                                    </div>
                                                </>
                                            ) : (
                                                <span className="text-slate-600">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {entry.rMultiple !== null ? (
                                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${entry.rMultiple >= 2 ? 'bg-green-500/20 text-green-400' :
                                                    entry.rMultiple > 0 ? 'bg-cyan-500/20 text-cyan-400' :
                                                        entry.rMultiple <= -1 ? 'bg-red-500/20 text-red-500' :
                                                            'bg-slate-500/20 text-slate-400'
                                                    }`}>
                                                    {entry.rMultiple > 0 ? '+' : ''}{entry.rMultiple.toFixed(2)}R
                                                </span>
                                            ) : (
                                                <span className="text-slate-600">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <div className="flex items-center justify-center gap-1 text-slate-500">
                                                {entry.notes && <span title="Has Notes">📝</span>}
                                                {entry.slippagePercent !== null && <span title={`Slippage: ${entry.slippagePercent}%`}>⚠️</span>}
                                                {!entry.notes && entry.slippagePercent === null && <span className="text-slate-700 opacity-50">✎</span>}
                                            </div>
                                        </td>
                                    </tr>

                                    {/* Expanded Edit Row */}
                                    {expandedId === entry.id && (
                                        <tr className="bg-slate-800/50 shadow-inner">
                                            <td colSpan={8} className="p-0">
                                                <div className="p-4 border-l-4 border-cyan-500 ml-4 my-2 mr-4 bg-slate-900 rounded-r-lg">
                                                    <h4 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                                                        <span>✏️ Edit Trade Metadata</span>
                                                        <span className="text-cyan-400">({entry.symbol})</span>
                                                    </h4>

                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                        <div className="col-span-2">
                                                            <label className="block text-xs font-medium text-slate-400 mb-1">Trade Notes & Lessons</label>
                                                            <textarea
                                                                className="w-full bg-slate-800 border border-slate-700 rounded-md p-3 text-sm text-slate-200 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 min-h-[100px]"
                                                                placeholder="Log your mindset, conviction level, or mistakes made..."
                                                                value={editNotes}
                                                                onChange={(e) => setEditNotes(e.target.value)}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-medium text-slate-400 mb-1">Measured Slippage (%)</label>
                                                            <div className="relative">
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    className="w-full bg-slate-800 border border-slate-700 rounded-md p-3 pl-4 pr-10 text-sm text-slate-200 focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
                                                                    placeholder="0.00"
                                                                    value={editSlippage}
                                                                    onChange={(e) => setEditSlippage(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                                                />
                                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium">%</span>
                                                            </div>
                                                            <p className="text-xs text-slate-500 mt-2">
                                                                Record the percentage difference between the signal entry price and your actual filled price.
                                                            </p>

                                                            <div className="mt-6 flex justify-end gap-3">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setExpandedId(null); }}
                                                                    className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
                                                                >
                                                                    Cancel
                                                                </button>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleSaveJournal(entry.id); }}
                                                                    disabled={isSaving}
                                                                    className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold rounded-md shadow-md transition-colors disabled:opacity-50"
                                                                >
                                                                    {isSaving ? 'Saving...' : 'Save Journal'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default TradeJournal;
