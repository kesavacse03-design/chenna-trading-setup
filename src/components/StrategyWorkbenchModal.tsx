import React, { useState, useEffect } from 'react';
import { StrategyLogic, AssignedExample, StrategySnapshotV1, BacktestResult, CategoryMetrics, CategoryEventReport, CandidateRank, CompositeOptimizationResponse, TradeDetail } from '../types';
import { getV1Snapshot, saveV1Snapshot } from '../lib/watchlistStorage';
import { XMarkIcon } from './icons/XMarkIcon';
// BrainIcon import removed (unused)
import { WrenchScrewdriverIcon } from './icons/WrenchScrewdriverIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { DocumentTextIcon } from './icons/DocumentTextIcon';
import { LightBulbIcon } from './icons/LightBulbIcon';
import SystemLearningsPanel from './SystemLearningsPanel';
import { startBacktest, getBacktestStatus, getBacktestResult, getTradesCsvUrl, optimizeComposite } from '../api';
import { loadCategoryEventReport } from '../lib/eventReports';

interface StrategyWorkbenchModalProps {
    isOpen: boolean;
    onClose: () => void;
    categoryKey: string;
    initialLogic: StrategyLogic;
    onSaveStrategy: (categoryKey: string, newLogic: StrategyLogic) => void;
}

const StrategyEditor = ({ logic, onLogicChange, onSave, onSanityCheck, isLoadingSanityCheck }: { logic: StrategyLogic, onLogicChange: (logic: StrategyLogic) => void, onSave: () => void, onSanityCheck: () => void, isLoadingSanityCheck: boolean }) => (
    <div className="p-6 rounded-xl bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-slate-600/50 shadow-2xl flex-1">
        <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-xl flex items-center text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                <DocumentTextIcon className="w-6 h-6 mr-2 text-cyan-400" />
                V1 Strategy Logic
            </h3>
            <div className="px-3 py-1 bg-cyan-500/20 border border-cyan-500/40 rounded-full text-xs text-cyan-300 font-medium flex items-center gap-1">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                Active
            </div>
        </div>

        <div className="space-y-4">
            <div>
                <label htmlFor="strategy-description" className="block text-sm font-semibold text-slate-200 mb-2 flex items-center">
                    <span className="w-2 h-2 bg-cyan-400 rounded-full mr-2"></span>
                    Description
                </label>
                <textarea
                    id="strategy-description"
                    aria-label="Strategy description"
                    title="Strategy description"
                    placeholder="Enter a clear description of your trading strategy..."
                    value={logic.description}
                    onChange={e => onLogicChange({ ...logic, description: e.target.value })}
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
                    aria-label="Strategy rules"
                    title="Strategy rules (one per line)"
                    placeholder="e.g., EMA(20) > EMA(50)&#10;RSI < 30&#10;Volume > 1.5x avg..."
                    value={Array.isArray(logic.rules) ? logic.rules.join('\n') : String(logic.rules || '')}
                    onChange={e => onLogicChange({ ...logic, rules: e.target.value.split('\n') })}
                    className="w-full bg-slate-900/60 rounded-lg p-3 text-sm font-mono h-36 resize-none border border-slate-600/50 focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all text-slate-100 placeholder-slate-500"
                />
            </div>
        </div>

        <div className="mt-6 flex justify-between items-center gap-3">
            <button
                onClick={onSanityCheck}
                disabled={!logic.description || (Array.isArray(logic.rules) && logic.rules.every(r => r === '')) || isLoadingSanityCheck}
                className="flex-1 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white text-sm font-bold py-3 px-5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-purple-500/50 hover:scale-[1.02] active:scale-95"
            >
                {isLoadingSanityCheck ? (
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
                onClick={onSave}
                disabled={!logic.description || (Array.isArray(logic.rules) && logic.rules.every(r => r === ''))}
                className="flex-1 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-white font-bold py-3 px-6 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-cyan-500/50 hover:scale-[1.02] active:scale-95"
            >
                Save Strategy
            </button>
        </div>
    </div>
);

// Removed unused AIInteractionPanel for V1 stub


// Minimal deterministic backtester stub removed; using backend job API instead

const StrategyWorkbenchModal: React.FC<StrategyWorkbenchModalProps> = ({ isOpen, onClose, categoryKey, initialLogic, onSaveStrategy }) => {

    const [editorLogic, setEditorLogic] = useState<StrategyLogic>(initialLogic);
    const [isLoading, setIsLoading] = useState(false);
    const [assigned, setAssigned] = useState<AssignedExample[]>([]);
    const [metrics, setMetrics] = useState<CategoryMetrics | null>(null);
    const [backtestResults, setBacktestResults] = useState<BacktestResult[]>([]);
    const [frozenV1, setFrozenV1] = useState<StrategySnapshotV1 | null>(null);
    const [missingData, setMissingData] = useState<string[]>([]);
    const [fetchingCount, setFetchingCount] = useState(0);
    const [fetchingTotal, setFetchingTotal] = useState(0);
    const [fetching, setFetching] = useState(false);
    const [skipped, setSkipped] = useState<AssignedExample[]>([]);
    const [testedCount, setTestedCount] = useState(0);
    const [runError, setRunError] = useState<string | null>(null);
    const [runSuccess, setRunSuccess] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [learnings, setLearnings] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const logRef = React.useRef<HTMLDivElement | null>(null);
    const resultsRef = React.useRef<HTMLDivElement | null>(null);
    const LOG_LIMIT = 50;
    const [downloadHref, setDownloadHref] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'candidates' | 'trades'>('overview');
    const [trades, setTrades] = useState<TradeDetail[]>([]);
    const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
    const [trSortKey, setTrSortKey] = useState<'symbol' | 'entryDate' | 'exitDate' | 'signal' | 'holdingDays' | 'entry' | 'exit' | 'rMultiple' | 'outcome'>('entryDate');
    const [trSortDir, setTrSortDir] = useState<'asc' | 'desc'>('asc');
    const [jobId, setJobId] = useState<string | null>(null);
    const [jobStatus, setJobStatus] = useState<'idle' | 'queued' | 'running' | 'done' | 'error' | 'cancelled'>('idle');
    const [sanityCheckResults, setSanityCheckResults] = useState<string[]>([]);
    const [optResult, setOptResult] = useState<CompositeOptimizationResponse | null>(null);
    const [autoPersist, setAutoPersist] = useState(true);
    const [sortKey, setSortKey] = useState<'accuracy' | 'expectancy' | 'netPnl' | 'drawdown'>('accuracy');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [eventReport, setEventReport] = useState<CategoryEventReport | null>(null);
    const [toast, setToast] = useState<{ msg: string; kind?: 'info' | 'success' | 'error' } | null>(null);
    const [showMissingDetails, setShowMissingDetails] = useState(false);

    // Load stocks from database API and other initialization when modal opens
    useEffect(() => {
        const loadStocks = async () => {
            if (!isOpen) return;

            try {
                setFetching(true);
                const { getCategoryStocks } = await import('../api');
                const stocks = await getCategoryStocks(categoryKey);

                const items: AssignedExample[] = stocks.map((s: any) => ({
                    symbol: s.symbol,
                    listedDate: s.listedDate || s.date || '',
                    categoryKey: categoryKey
                }));

                setAssigned(items);
                setFetchingTotal(items.length);

                // Check for missing OHLCV data in localStorage cache
                const miss = items.reduce<string[]>((acc, e) => {
                    const key = `ohlcv:${e.symbol}:${e.listedDate}`;
                    if (!localStorage.getItem(key)) {
                        acc.push(`${e.symbol} â€” ${e.listedDate || 'unknown date'}`);
                    }
                    return acc;
                }, []);
                setMissingData(miss);
            } catch (e) {
                console.error('[StrategyWorkbench] Failed to load category stocks from API', e);
                setAssigned([]);
                setMissingData([]);
            } finally {
                setFetching(false);
            }
        };

        if (isOpen) {
            setEditorLogic(initialLogic);
            setSanityCheckResults([]);

            // Load latest event report snapshot for this category
            loadCategoryEventReport(categoryKey).then(setEventReport).catch(() => setEventReport(null));

            // Load previous optimization result from localStorage
            try {
                const raw = localStorage.getItem(`optResult:${categoryKey}`);
                if (raw) setOptResult(JSON.parse(raw));
            } catch { }

            // Load frozen v1 snapshot
            try {
                const snap = getV1Snapshot(categoryKey);
                setFrozenV1(snap);
            } catch {
                setFrozenV1(null);
            }

            // Load stocks from API
            loadStocks();
        }
    }, [isOpen, categoryKey, initialLogic]);

    // Auto-scroll live log to bottom when logs update
    useEffect(() => {
        try {
            if (logRef.current) {
                logRef.current.scrollTop = logRef.current.scrollHeight;
            }
        } catch (_) { }
    }, [logs]);

    if (!isOpen) return null;

    const handleSanityCheck = async () => {
        setIsLoading(true);
        setSanityCheckResults([]);

        try {
            // Get API base from window config
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:5174';

            // Call backend validation API
            const response = await fetch(`${apiBase}/api/ai/validate-signal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    strategy: editorLogic,
                    categoryKey,
                    marketConditions: {
                        // We could fetch live data here, but for now use static check
                        timestamp: new Date().toISOString()
                    }
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
            } else {
                setSanityCheckResults([
                    `⚠️ Strategy validation found issues`,
                    `Confidence: ${(result.confidence * 100).toFixed(0)}%`,
                    '',
                    ...(result.issues || ['No specific issues reported'])
                ]);
            }
        } catch (error) {
            console.error('[Sanity Check] Error:', error);
            const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
            setSanityCheckResults([
                '❌ Failed to validate strategy',
                'Check that backend is running and try again',
                '',
                `Error: ${errorMsg}`
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveEditor = () => {
        if (!frozenV1) {
            const snapshot: StrategySnapshotV1 = {
                categoryKey,
                description: editorLogic.description,
                rules: Array.isArray(editorLogic.rules) ? editorLogic.rules : String(editorLogic.rules || '').split('\n'),
                params: { shortMA: 20, longMA: 50, stopPercent: 0.08, targetPercent: 0.12, volumeMultiplier: 1.5, versionTag: 'V1' },
                createdAt: new Date().toISOString(),
                immutable: true,
            };
            saveV1Snapshot(snapshot);
            setFrozenV1(snapshot);
        }
        onSaveStrategy(categoryKey, editorLogic);
        onClose();
    };

    // Batch prefetch via backend orchestrator (more robust than per-symbol OHLCV)
    const prefetchBatch = async (apiBase: string, items: AssignedExample[], mode: 'mock' | 'upstox'): Promise<{ ok: boolean; cached: number; errors: number }> => {
        try {
            const payload = {
                mode,
                items: items.map(i => ({ symbol: i.symbol, from: i.listedDate, to: i.listedDate, interval: 'day' }))
            };
            const r = await fetch(`${apiBase.replace(/\/$/, '')}/strategy/prefetch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!r.ok) return { ok: false, cached: 0, errors: items.length };
            const j = await r.json().catch(() => ({ ok: false, results: [] }));
            // Prefer server-aggregated counts when available
            if (typeof j?.cached === 'number' || typeof j?.errors === 'number') {
                return { ok: true, cached: Number(j.cached || 0), errors: Number(j.errors || 0) };
            }
            const results: any[] = Array.isArray(j?.results) ? j.results : [];
            let cached = 0, errors = 0;
            for (const it of results) {
                if (it?.status === 'cached' || it?.status === 'mocked') cached++; else if (it?.status === 'error' || it?.status === 'missing') errors++;
            }
            return { ok: true, cached, errors };
        } catch (_) {
            return { ok: false, cached: 0, errors: items.length };
        }
    };

    const handleRunBacktest = async () => {
        setRunError(null);
        setRunSuccess(null);
        setLogs([]);
        setIsLoading(true);
        try {
            // Prefetch step
            const apiBase = (window as any).__CTS_API_BASE || (import.meta as any).env?.VITE_API_BASE || '';
            // Detect backend + Upstox status to decide mode
            let mode: 'upstox' | 'mock' = 'mock';
            if (apiBase) {
                try {
                    const s = await fetch(`${apiBase.replace(/\/$/, '')}/auth/upstox/status`);
                    if (s.ok) {
                        const sj = await s.json().catch(() => ({ hasToken: false, expired: true }));
                        mode = (sj?.hasToken && !sj?.expired) ? 'upstox' : 'mock';
                    }
                } catch { /* default to mock */ }
            }
            setLogs(l => [`Mode selected: ${mode.toUpperCase()}`, ...l].slice(0, 200));
            let toFetch: AssignedExample[] = [];
            try {
                toFetch = assigned.filter(e => !localStorage.getItem(`ohlcv:${e.symbol}:${e.listedDate}`));
            } catch { }
            setFetching(true);
            setFetchingTotal(toFetch.length);
            setFetchingCount(0);
            setSkipped([]);
            // Only do prefetch when Upstox is active; mock mode will synthesize data at runtime.
            if (apiBase && toFetch.length && mode === 'upstox') {
                setLogs(l => [`Prefetching ${toFetch.length} example(s) via backendâ€¦`, ...l].slice(0, 200));
                const res = await prefetchBatch(apiBase, toFetch, 'upstox');
                setFetchingCount(toFetch.length);
                if (!res.ok) {
                    setSkipped(s => [...s, ...toFetch]);
                    setLogs(l => [`Prefetch failed on backend â€” continuing in run phase (mock fallback)`, ...l].slice(0, 200));
                } else {
                    // Align with backend/ops expectation: "Prefetch done cached 21, errors 0"
                    setLogs(l => [`Prefetch done cached ${res.cached}, errors ${res.errors}`, ...l].slice(0, 200));
                }
            } else if (toFetch.length && mode === 'mock') {
                // Inform user that mock data will be synthesized by the backtester
                setLogs(l => [`Skipping prefetch for ${toFetch.length} item(s) â€” using MOCK data generator`, ...l].slice(0, 200));
            }
            setFetching(false);
            // Start backend job (Phase F)
            if (!apiBase) throw new Error('API base not configured');
            const symbols = assigned.map(a => a.symbol);
            const from = assigned.reduce((min, e) => min && min < e.listedDate ? min : e.listedDate, assigned[0]?.listedDate || '');
            const to = assigned.reduce((max, e) => max && max > e.listedDate ? max : e.listedDate, assigned[0]?.listedDate || '');
            // New: Run composite optimizer with thresholds and candidate pool
            const pool = { ema_short: [5, 8, 13], ema_long: [34, 50, 89], rsi_period: [14], rsi_min: [15, 20, 25], rsi_max: [70, 80], atr_mult: [0.8, 1.0, 1.2], volumeFactor: [0.8, 1.0, 1.2], targetR: [1.0, 1.2, 1.5], patterns: ['none', 'engulfing', 'hammer'] };
            const limits = { maxCombos: 180, parallel: 4, timeoutSec: 900 };
            const threshold = { minAccuracyPct: 70, minExpectancy: 0, maxDrawdown: Number.POSITIVE_INFINITY };
            setLogs(l => [`Optimizer: composite sweep (${limits.maxCombos} max)â€¦`, ...l].slice(0, 200));
            const opt = await optimizeComposite({ symbols, from, to, interval: 'day', mode, categoryKey, pool, limits, threshold, autoPersist });
            setOptResult(opt);
            try { localStorage.setItem(`optResult:${categoryKey}`, JSON.stringify(opt)); } catch { }
            // Clear previous run messages
            setRunError(null); setRunSuccess(null);
            if (!opt?.ok) {
                // Optimizer reported an error; surface it but continue to show any partial results
                const msg = (opt && (opt as any).message) || (opt && (opt as any).errorMessage) || (opt && (opt as any).detail) || JSON.stringify(opt) || 'Optimizer failed';
                setRunError(String(msg));
                setLogs(l => [`Optimizer error: ${String(msg)}`, ...l].slice(0, 200));
            }
            // mark timedOut if backend indicated partial timed-out execution
            if (opt?.timedOut) {
                setLogs(l => [`Optimizer: timed out / partial results available`, ...l].slice(0, 200));
            }
            // If selection meets threshold, persist to V1 Strategy Logic via existing save flow
            if (opt?.ok && opt.selected && opt.persisted) {
                setRunSuccess(`Selected config meets threshold (â‰¥${threshold.minAccuracyPct}% acc). Saved as V1.`);
                // map to StrategyLogic minimal description and rules
                const desc = `Auto-selected Composite for ${categoryKey}`;
                const rule = `EMA(${opt.selected.config.ema_short},${opt.selected.config.ema_long}) + RSI[${opt.selected.config.rsi_min}-${opt.selected.config.rsi_max}] + ATRx${opt.selected.config.atr_mult}`;
                const newLogic = { description: desc, rules: [rule] } as StrategyLogic;
                onSaveStrategy(categoryKey, newLogic);
                setFrozenV1({ categoryKey, description: newLogic.description, rules: newLogic.rules, params: { shortMA: 20, longMA: 50, stopPercent: 0.08, targetPercent: 0.12, volumeMultiplier: 1.5, versionTag: 'V1' }, createdAt: new Date().toISOString(), immutable: true });
            } else if (opt?.ok && opt.selected && !opt.persisted) {
                setRunSuccess(`Threshold met but persistence deferred. Review snapshot at server.`);
            } else if (opt?.ok && (!opt.selected)) {
                setRunError(`No candidate met â‰¥${threshold.minAccuracyPct}% accuracy with positive expectancy. Showing top candidates.`);
            }
            // Display top candidate metrics in logs panel
            try {
                const lines = (opt.ranked || []).slice(0, 10).map((r, i) => {
                    const m = r.metrics || {} as any;
                    // don't coerce null/undefined to 0 â€” show a dash when not available
                    const rawWr = (m.winRate === null || m.winRate === undefined) ? null : m.winRate;
                    const accStr = (typeof rawWr === 'number') ? ((rawWr <= 1 ? rawWr * 100 : rawWr).toFixed(1) + '%') : 'â€”';
                    const exp = typeof m.avgReturn === 'number' ? m.avgReturn : 0;
                    const dd = typeof m.maxDrawdown === 'number' ? m.maxDrawdown : 0;
                    const pnl = typeof m.netPnl === 'number' ? m.netPnl : 0;
                    return `#${i + 1} acc=${accStr} exp=${exp.toFixed(3)} dd=${dd.toFixed(0)} pnl=${pnl.toFixed(0)} cfg=${JSON.stringify(r.config)}`;
                });
                setLogs(l => [...lines, ...l].slice(0, 200));
            } catch { }

            // Also kick off a run for the top candidate to generate CSV (optional)
            const best = (opt.ranked || [])[0];
            if (best && best.runId) {
                const csvUrl = getTradesCsvUrl(best.runId);
                if (csvUrl) setDownloadHref(resolveUrl(csvUrl) || null);
            }
            // Stop here; skip legacy job loop
            setIsLoading(false);
            return;
            // Legacy: start single backtest job (kept for fallback)
            const start = await startBacktest({ symbols, from, to, interval: 'day', mode, categoryKey, examples: assigned });
            if (!start?.ok || !start?.jobId) throw new Error('Invalid start response');
            const jid = start.jobId as string; setJobId(jid); setJobStatus('queued');
            // Poll status
            let done = false; let tries = 0;
            setLogs(l => [`Started job ${jid}`, ...l].slice(0, 200));
            while (!done && tries < 900) { // up to ~15 min at 1s
                tries++;
                await new Promise(r => setTimeout(r, 1000));
                let st: any = null;
                try { st = await getBacktestStatus(jid); } catch { st = null; }
                if (!st?.ok) continue;
                // update logs and progress
                const ls: string[] = Array.isArray(st.logs) ? st.logs : [];
                setLogs(ls);
                const prog = st.progress || {};
                const total = Number(prog.total || assigned.length) || assigned.length;
                const doneCount = Number(prog.done || 0) || 0;
                setTestedCount(doneCount);
                setJobStatus(st.status || 'running');
                // when done, fetch metrics via results endpoint and set download link
                if (st.status === 'done' && st.runId) {
                    done = true;
                    const results = await fetch(`${apiBase.replace(/\/$/, '')}/strategy/results/${encodeURIComponent(st.runId)}`).then(r => r.json()).catch(() => null);
                    const resObj = results?.results || results || null;
                    // Minimal adapter: map backend metrics to frontend-expected keys
                    const raw = resObj?.metrics || null;
                    let mapped = raw;
                    if (raw) {
                        const trades = Number(raw.trades || raw.tradesCount || 0);
                        const winRate = typeof raw.winRate === 'number' ? raw.winRate : (typeof raw.winPct === 'number' ? raw.winPct : 0);
                        const avgReturnPct = typeof raw.avgReturn === 'number' ? (raw.avgReturn * 100) : (typeof raw.avgReturnPct === 'number' ? raw.avgReturnPct : undefined);
                        const profitFactor = typeof raw.profitFactor === 'number' ? raw.profitFactor : undefined;
                        // maxDrawdown may be absolute; keep as pct only if provided, otherwise undefined
                        const maxDrawdownPct = typeof raw.maxDrawdownPct === 'number' ? raw.maxDrawdownPct : undefined;
                        const totalPnL = typeof raw.netPnl === 'number' ? raw.netPnl : (typeof raw.totalPnL === 'number' ? raw.totalPnL : undefined);
                        const passed = Math.round((winRate || 0) * trades);
                        const failed = trades - passed;
                        mapped = {
                            ...raw,
                            tested: trades,
                            winRate: winRate,
                            avgReturnPct,
                            profitFactor,
                            maxDrawdownPct,
                            totalPnL,
                            passed,
                            failed,
                        };
                    }
                    setMetrics(mapped || null);
                    // Fetch persisted job JSON for insights (shadow suggestions)
                    try {
                        const jr = await getBacktestResult(st.runId);
                        const jobObj = jr?.result || null;
                        const insights = Array.isArray(jobObj?.insights) ? jobObj.insights : [];
                        // Map insights to SystemLearningsPanel expected shape
                        const mappedLearnings = insights.map((ins: any, idx: number) => ({
                            tradeId: `${st.runId}_${ins.symbol || 'unknown'}_${idx}`,
                            ticker: ins.symbol || 'UNKNOWN',
                            timestamp: jobObj?.completedAt || jobObj?.createdAt || new Date().toISOString(),
                            shortMessage: ins.suggest || ins.failure || '',
                            confidence: ins.confidence, // if present
                            analysis: { failurePattern: ins.failure || '', v2Improvement: ins.suggest || '' },
                            raw: ins,
                        }));
                        setLearnings(mappedLearnings);
                    } catch (_) { setLearnings([]); }
                    setBacktestResults([]); // server returns detailed CSV; UI sticks to metrics + CSV download
                    const csvUrl = getTradesCsvUrl(st.runId) || `${apiBase.replace(/\/$/, '')}/strategy/trades/${encodeURIComponent(st.runId)}`;
                    setDownloadHref(resolveUrl(csvUrl) || null);
                    setRunSuccess(`Completed â€” processed ${doneCount} / ${total}`);
                    // auto-scroll to results area
                    try { setTimeout(() => { resultsRef.current && resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 150); } catch (_) { }
                } else if (st.status === 'cancelled') {
                    done = true;
                    setRunError('Backtest cancelled');
                } else if (st.status === 'error') {
                    done = true;
                    setRunError(st.error || 'Backtest job failed');
                }
            }
        } catch (e: any) {
            setRunError(e?.message || 'Backtest failed');
        } finally { setIsLoading(false); }
    };

    const handleCancel = async () => {
        try {
            const apiBase = (window as any).__CTS_API_BASE || (import.meta as any).env?.VITE_API_BASE || '';
            if (!apiBase || !jobId) return;
            await fetch(`${apiBase.replace(/\/$/, '')}/api/backtest/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId }) });
            setJobStatus('cancelled');
        } catch { }
    };

    // ---- Candidate sorting & manual promotion helpers (moved outside JSX) ----
    const sortedCandidates = React.useMemo(() => {
        if (!optResult || !optResult.ranked) return [] as CandidateRank[];
        const arr = [...optResult.ranked];
        arr.sort((a, b) => {
            const ma = a.metrics || {}; const mb = b.metrics || {};
            const getAcc = (m: any) => {
                const raw = typeof m.winRate === 'number' ? m.winRate : 0;
                // normalize backend 0..1 to 0..100 for comparisons
                return raw <= 1 ? (raw * 100) : raw;
            };
            const getExp = (m: any) => typeof m.avgReturn === 'number' ? m.avgReturn : 0;
            const getPnl = (m: any) => typeof m.netPnl === 'number' ? m.netPnl : 0;
            const getDD = (m: any) => typeof m.maxDrawdown === 'number' ? m.maxDrawdown : 0;
            let va = 0, vb = 0;
            if (sortKey === 'accuracy') { va = getAcc(ma); vb = getAcc(mb); }
            else if (sortKey === 'expectancy') { va = getExp(ma); vb = getExp(mb); }
            else if (sortKey === 'netPnl') { va = getPnl(ma); vb = getPnl(mb); }
            else if (sortKey === 'drawdown') { va = getDD(ma); vb = getDD(mb); }
            return sortDir === 'asc' ? (va - vb) : (vb - va);
        });
        return arr;
    }, [optResult, sortKey, sortDir]);

    const handlePromote = (cand: CandidateRank) => {
        const cfg = cand.config || {};
        const desc = `Manual promotion Composite for ${categoryKey}`;
        const rule = `EMA(${cfg.ema_short},${cfg.ema_long}) RSI[${cfg.rsi_min}-${cfg.rsi_max}] ATRx${cfg.atr_mult}`;
        const newLogic = { description: desc, rules: [rule] } as StrategyLogic;
        onSaveStrategy(categoryKey, newLogic);
        setFrozenV1({ categoryKey, description: newLogic.description, rules: newLogic.rules, params: { shortMA: 20, longMA: 50, stopPercent: 0.08, targetPercent: 0.12, volumeMultiplier: 1.5, versionTag: 'V1' }, createdAt: new Date().toISOString(), immutable: true });
        setRunSuccess('Promoted candidate to V1 manually');
    };

    const renderCandidateTable = () => {
        if (!optResult || !sortedCandidates.length) return <div className="text-xs text-slate-500">No candidates yet.</div>;
        return (
            <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-slate-400">Candidates ({sortedCandidates.length}{optResult.timedOut ? ' â€“ partial' : ''})</div>
                    <div className="flex gap-2 items-center">
                        <label className="flex items-center gap-1 text-[11px] text-slate-300"><input type="checkbox" checked={autoPersist} onChange={e => setAutoPersist(e.target.checked)} /> Auto-persist</label>
                        <select aria-label="Sort candidates by" title="Sort candidates by" value={sortKey} onChange={e => setSortKey(e.target.value as any)} className="bg-slate-700 text-xs rounded px-2 py-1 border border-slate-600">
                            <option value="accuracy">Accuracy</option>
                            <option value="expectancy">Expectancy</option>
                            <option value="netPnl">Net PnL</option>
                            <option value="drawdown">Drawdown</option>
                        </select>
                        <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} className="text-xs px-2 py-1 rounded bg-slate-700 border border-slate-600">{sortDir === 'asc' ? 'ASC' : 'DESC'}</button>
                    </div>
                </div>
                <div className="overflow-auto max-h-64">
                    <table className="w-full text-[11px] border-collapse">
                        <thead>
                            <tr className="bg-slate-700/40">
                                <th className="p-1 text-left">#</th>
                                <th className="p-1 text-left">Accuracy %</th>
                                <th className="p-1 text-left">Expectancy</th>
                                <th className="p-1 text-left">Net PnL</th>
                                <th className="p-1 text-left">Drawdown</th>
                                <th className="p-1 text-left">Params</th>
                                <th className="p-1 text-left">Exports</th>
                                <th className="p-1 text-left">Promote</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedCandidates.slice(0, 100).map((c, i) => {
                                const m = c.metrics || {} as any;
                                // Normalize accuracy: backend may return 0..1 or 0..100
                                const rawWr = (m.winRate === null || m.winRate === undefined) ? null : m.winRate;
                                const acc = (typeof rawWr === 'number') ? (rawWr <= 1 ? (rawWr * 100) : rawWr) : null;
                                const exp = typeof m.avgReturn === 'number' ? m.avgReturn : 0;
                                const pnl = typeof m.netPnl === 'number' ? m.netPnl : 0;
                                const dd = typeof m.maxDrawdown === 'number' ? m.maxDrawdown : 0;
                                // An absent accuracy should not be considered as meeting the threshold
                                const meets = (typeof acc === 'number') && acc >= (optResult.threshold?.minAccuracyPct || 70) && exp >= (optResult.threshold?.minExpectancy || 0) && dd <= (optResult.threshold?.maxDrawdown || Infinity);
                                return (
                                    <tr key={i} className="border-b border-slate-700/40 hover:bg-slate-700/30 cursor-pointer" onClick={() => { loadCandidateSeries(c); if (c.runId) { handleLoadTrades(c.runId); setSelectedRunId(c.runId); setDownloadHref(resolveUrl(c.tradesCsvUrl) || null); setActiveTab('trades'); showToast('Loaded trades for candidate', 'info'); } }}>
                                        <td className="p-1 text-slate-400">{i + 1}</td>
                                        <td className={`p-1 font-mono ${meets ? 'text-emerald-300' : 'text-slate-300'}`}>{typeof acc === 'number' ? acc.toFixed(1) : 'â€”'}</td>
                                        <td className={`p-1 font-mono ${exp > 0 ? 'text-emerald-300' : 'text-red-300'}`}>{exp.toFixed(3)}</td>
                                        <td className={`p-1 font-mono ${pnl >= 0 ? 'text-green-300' : 'text-red-300'}`}>{pnl.toFixed(0)}</td>
                                        <td className="p-1 font-mono text-yellow-300">{dd.toFixed(0)}</td>
                                        <td className="p-1 font-mono text-slate-200">{Object.entries(c.config || {}).map(([k, v]) => `${k}=${v}`).join(' ')}</td>
                                        <td className="p-1 space-x-1">
                                            <button onClick={(e) => { e.stopPropagation(); downloadCandCsv(resolveUrl(c.tradesCsvUrl)); }} className={`text-[10px] underline ${c.tradesCsvUrl ? 'text-emerald-300' : 'text-slate-500 cursor-not-allowed'}`} disabled={!c.tradesCsvUrl}>CSV</button>
                                            {c.resultsJsonUrl ? <a onClick={(e) => { e.stopPropagation(); /* allow opening in new tab with absolute URL */ }} className="underline text-cyan-300" href={resolveUrl(c.resultsJsonUrl) || undefined} target="_blank" rel="noreferrer">JSON</a> : <span className="text-slate-500">JSON</span>}
                                        </td>
                                        <td className="p-1">
                                            <button onClick={() => handlePromote(c)} className="bg-cyan-700 hover:bg-cyan-600 text-white px-2 py-0.5 rounded text-[10px]">Promote</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    // Simple chart utilities
    const [equity, setEquity] = useState<number[]>([]);
    const [drawdown, setDrawdown] = useState<number[]>([]);
    const loadCandidateSeries = async (cand: CandidateRank) => {
        try {
            setEquity([]); setDrawdown([]);
            const url = cand.resultsJsonUrl; if (!url) return;
            const res = await fetch(url); if (!res.ok) return;
            const j = await res.json().catch(() => null); if (!j) return;
            const curve: number[] = Array.isArray(j?.equityCurve) ? j.equityCurve : [];
            if (curve.length) {
                setEquity(curve);
                // derive drawdown series
                let peak = -Infinity; const dd: number[] = [];
                for (const v of curve) { peak = Math.max(peak, v); dd.push(peak - v); }
                setDrawdown(dd);
            }
        } catch { }
    };

    const handleLoadTrades = async (runId: string) => {
        try {
            setSelectedRunId(runId);
            setTrades([]);
            const apiBase = (window as any).__CTS_API_BASE || (import.meta as any).env?.VITE_API_BASE || '';
            if (!apiBase) return;
            const url = `${apiBase.replace(/\/$/, '')}/api/trades/${encodeURIComponent(runId)}`;
            const res = await fetch(url);
            if (!res.ok) return;
            const j = await res.json().catch(() => null);
            let list: TradeDetail[] = [];
            if (Array.isArray(j)) list = j as TradeDetail[];
            else if (Array.isArray(j?.trades)) list = j.trades as TradeDetail[];
            list = list.map(t => ({ ...t, holdingDays: typeof t.holdingDays === 'number' ? t.holdingDays : (typeof (t as any).barsHeld === 'number' ? (t as any).barsHeld : undefined) }));
            setTrades(list);
        } catch { }
    };

    // Resolve potentially-relative backend URLs to absolute using configured API base
    const resolveUrl = (u?: string | null) => {
        if (!u) return u || null;
        try {
            // if already absolute, return as-is
            const parsed = new URL(u, 'http://example.invalid');
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return u;
        } catch (_) { }
        const apiBase = (window as any).__CTS_API_BASE || (import.meta as any).env?.VITE_API_BASE || '';
        if (!apiBase) return u;
        return `${apiBase.replace(/\/$/, '')}${u.startsWith('/') ? '' : '/'}${u}`;
    };

    useEffect(() => {
        // Auto-load top-ranked trades when optimization completes
        try {
            const rid = optResult?.ranked?.[0]?.runId;
            if (rid) handleLoadTrades(rid);
        } catch { }
    }, [optResult]);
    const showToast = (msg: string, kind: 'info' | 'success' | 'error' = 'info') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 2500); };
    const triggerCsvDownload = async () => {
        const filename = 'strategy-results.csv';
        try {
            if (downloadHref) {
                const res = await fetch(downloadHref); if (!res.ok) throw new Error('Failed');
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
                setTimeout(() => URL.revokeObjectURL(url), 4000);
                showToast('Downloaded server CSV', 'success');
                return;
            }
            const headers = ['symbol', 'entryDate', 'exitDate', 'signal', 'holdingDays', 'entry', 'exit', 'rMultiple', 'outcome'];
            const rows = trades.map(t => [
                t.symbol,
                t.entryDate || '',
                t.exitDate || '',
                (t as any).signalType || (t as any).signal || '',
                typeof t.holdingDays === 'number' ? t.holdingDays : '',
                typeof t.entry === 'number' ? t.entry : '',
                typeof t.exit === 'number' ? t.exit : '',
                typeof t.rMultiple === 'number' ? t.rMultiple : '',
                t.outcome
            ].join(','));
            const blob = new Blob([headers.join(',') + '\n' + rows.join('\n')], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000);
            showToast('Downloaded CSV', 'success');
        } catch { showToast('CSV download error', 'error'); }
    };

    const downloadCandCsv = async (url?: string | null) => {
        const resolved = resolveUrl(url);
        if (!resolved) return showToast('CSV not available', 'error');
        try {
            const res = await fetch(resolved); if (!res.ok) throw new Error('Failed');
            const blob = await res.blob();
            const dl = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = dl; a.download = 'strategy-results.csv'; a.click();
            setTimeout(() => URL.revokeObjectURL(dl), 4000);
            showToast('Downloaded server CSV', 'success');
        } catch { showToast('CSV download error', 'error'); }
    };

    const handleSort = (key: typeof trSortKey) => {
        setTrSortKey(k => {
            if (k === key) { setTrSortDir(d => d === 'asc' ? 'desc' : 'asc'); return k; }
            setTrSortDir('asc');
            return key;
        });
    };

    const sortedTrades = React.useMemo(() => {
        const arr = [...trades];
        const get = (t: TradeDetail) => {
            switch (trSortKey) {
                case 'symbol': return t.symbol || '';
                case 'entryDate': return t.entryDate || '';
                case 'exitDate': return t.exitDate || '';
                case 'signal': return (t as any).signalType || (t as any).signal || '';
                case 'holdingDays': return typeof t.holdingDays === 'number' ? t.holdingDays : -1;
                case 'entry': return typeof t.entry === 'number' ? t.entry : Number.NaN;
                case 'exit': return typeof t.exit === 'number' ? t.exit : Number.NaN;
                case 'rMultiple': return typeof t.rMultiple === 'number' ? t.rMultiple : Number.NaN;
                case 'outcome': return t.outcome || '';
                default: return '';
            }
        };
        arr.sort((a, b) => {
            const va: any = get(a), vb: any = get(b);
            if (typeof va === 'number' && typeof vb === 'number') return trSortDir === 'asc' ? (va - vb) : (vb - va);
            const sa = String(va), sb = String(vb);
            return trSortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
        });
        return arr;
    }, [trades, trSortKey, trSortDir]);

    const Chart: React.FC<{ data: number[]; color: string; height?: number }> = ({ data, color, height = 60 }) => {
        if (!data.length) return <div className="text-[11px] text-slate-500">No data</div>;
        const w = 240; const h = height;
        const min = Math.min(...data), max = Math.max(...data);
        const scaleX = (i: number) => (i / (data.length - 1)) * w;
        const scaleY = (v: number) => h - ((v - min) / ((max - min) || 1)) * h;
        const d = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${scaleX(i).toFixed(1)},${scaleY(v).toFixed(1)}`).join(' ');
        return (
            <svg width={w} height={h} className="bg-slate-800 rounded border border-slate-700">
                <path d={d} fill="none" stroke={color} strokeWidth={1.5} />
            </svg>
        );
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-stretch z-50 animate-fade-in-down" onClick={onClose} role="dialog" aria-modal="true">
                <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full mx-4 my-6 flex flex-col h-[calc(100vh-3rem)]" onClick={(e) => e.stopPropagation()}>
                    <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-slate-700">
                        <h2 className="text-lg font-semibold text-cyan-300 flex items-center">
                            <WrenchScrewdriverIcon className="w-5 h-5 mr-3" />
                            Strategy Workbench: <span className="font-mono ml-2 text-white">{categoryKey.replace(/_/g, ' ')}</span>
                        </h2>
                        <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close"><XMarkIcon className="w-6 h-6" /></button>
                    </div>
                    <div className="flex-grow p-6 overflow-y-auto relative">
                        {toast && (
                            <div className={`absolute top-2 right-2 px-3 py-1 rounded text-xs shadow ${toast.kind === 'success' ? 'bg-emerald-700 text-white' : toast.kind === 'error' ? 'bg-red-700 text-white' : 'bg-slate-700 text-slate-200'}`}>{toast.msg}</div>
                        )}
                        <div className="flex flex-col lg:flex-row gap-6">
                            <div className="lg:w-1/2 flex flex-col">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs text-slate-400">
                                        {frozenV1 ? <span className="px-2 py-0.5 rounded bg-emerald-900/40 border border-emerald-700 text-emerald-300">V1 frozen â€” {new Date(frozenV1.createdAt).toLocaleString()}</span> : <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">V1 not saved</span>}
                                    </div>
                                    {missingData.length > 0 && (
                                        <div>
                                            <button onClick={() => setShowMissingDetails(d => !d)} className="text-xs text-amber-300 bg-amber-900/30 border border-amber-600/50 rounded px-2 py-0.5" title="Missing historical data cache; click to view details.">
                                                Missing data for {missingData.length} example(s)
                                            </button>
                                            {showMissingDetails && (
                                                <div className="mt-2 p-2 bg-amber-900/10 border border-amber-700 text-[11px] text-amber-100 rounded max-h-40 overflow-auto">
                                                    <ul className="list-disc pl-4 space-y-1">
                                                        {missingData.map((m, idx) => <li key={idx}>{m}</li>)}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <StrategyEditor
                                    logic={editorLogic}
                                    onLogicChange={setEditorLogic}
                                    onSave={handleSaveEditor}
                                    onSanityCheck={handleSanityCheck}
                                    isLoadingSanityCheck={isLoading}
                                />
                                {sanityCheckResults.length > 0 && (
                                    <div className="mt-5 p-5 bg-gradient-to-br from-purple-900/30 to-purple-800/20 border border-purple-500/40 rounded-xl shadow-lg animate-fade-in-down backdrop-blur-sm">
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
                                <div className="mt-3 p-4 rounded-lg bg-slate-800/70 border border-slate-700">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="font-semibold text-cyan-300 text-sm">Shadow Suggestions</h3>
                                        <button onClick={() => setShowSuggestions(s => !s)} className="text-xs text-slate-400 underline">{showSuggestions ? 'Hide' : 'Show'}</button>
                                    </div>
                                    {showSuggestions ? (
                                        <div className="space-y-2">
                                            {learnings.length > 0 ? (
                                                <div className="h-40 overflow-auto">
                                                    <SystemLearningsPanel learnings={learnings} />
                                                </div>
                                            ) : (
                                                <div className="text-slate-500 text-xs">No suggestions â€” Run more tests to generate suggestions.</div>
                                            )}
                                            <div className="mt-2">
                                                <button disabled className="bg-blue-700 text-white text-xs py-1 px-3 rounded opacity-60 cursor-not-allowed">Re-run backtest with top suggestion</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-slate-500 text-xs">Suggestions hidden</div>
                                    )}
                                </div>
                            </div>
                            <div className="lg:w-1/2 flex flex-col space-y-4">
                                <div className="flex items-center gap-2">
                                    {['overview', 'trades'].map((t) => (
                                        <button
                                            key={t}
                                            onClick={() => setActiveTab(t as any)}
                                            className={`text-xs px-3 py-1 rounded border ${activeTab === t ? 'bg-cyan-700 border-cyan-600 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}
                                            title={t === 'trades' ? 'Show loaded trades for a selected run' : 'Show overview panels'}
                                        >{t}</button>
                                    ))}
                                </div>
                                <div className="p-4 rounded-lg bg-slate-800/70 border border-slate-700">
                                    <h3 className="font-semibold text-cyan-300 mb-2 text-sm">Assigned examples</h3>
                                    <div className="max-h-48 overflow-auto text-xs divide-y divide-slate-700">
                                        {assigned.map((e, i) => (
                                            <div key={i} className="py-1 flex justify-between">
                                                <span className="font-mono text-slate-200">{e.symbol}</span>
                                                <span className="text-slate-400">{e.listedDate}</span>
                                            </div>
                                        ))}
                                        {assigned.length === 0 && <div className="py-4 text-slate-500">No examples imported for this category.</div>}
                                    </div>
                                    <div className="mt-3 flex items-center justify-between">
                                        <div className="text-xs text-slate-400 flex items-center gap-2">
                                            {fetching ? (
                                                <span>Fetching historical data â€” {fetchingCount} / {fetchingTotal} complete</span>
                                            ) : testedCount > 0 ? (
                                                <span>Backtesting â€” tested {testedCount} / {assigned.length}</span>
                                            ) : (
                                                <span>Ready</span>
                                            )}
                                            {jobStatus !== 'idle' && (
                                                jobStatus === 'queued' ? <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-600 text-slate-300">Queued</span>
                                                    : jobStatus === 'running' ? <span className="px-2 py-0.5 rounded bg-blue-900/40 border border-blue-700 text-blue-300">Running</span>
                                                        : jobStatus === 'done' ? <span className="px-2 py-0.5 rounded bg-emerald-900/40 border border-emerald-700 text-emerald-300">Done</span>
                                                            : jobStatus === 'cancelled' ? <span className="px-2 py-0.5 rounded bg-amber-900/40 border border-amber-700 text-amber-300">Cancelled</span>
                                                                : <span className="px-2 py-0.5 rounded bg-red-900/40 border border-red-700 text-red-300">Error</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button disabled={fetching || isLoading || jobStatus === 'running' || jobStatus === 'queued'} onClick={handleRunBacktest} className={`bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold py-1.5 px-3 rounded ${(fetching || isLoading || jobStatus === 'running' || jobStatus === 'queued') ? 'opacity-60 cursor-not-allowed' : ''}`}>
                                                Start
                                            </button>
                                            <button disabled={!(jobStatus === 'running' || jobStatus === 'queued')} onClick={handleCancel} className={`bg-amber-700 hover:bg-amber-600 text-white text-xs font-semibold py-1.5 px-3 rounded ${!(jobStatus === 'running' || jobStatus === 'queued') ? 'opacity-60 cursor-not-allowed' : ''}`}>
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                    {skipped.length > 0 && (
                                        <div className="mt-2 text-xs text-amber-300">Skipped {skipped.length} example(s) due to fetch errors.</div>
                                    )}
                                    {(fetching || isLoading) && (() => {
                                        // compute a percentage and map to a discrete Tailwind width bucket to avoid inline styles
                                        const percent = fetching && fetchingTotal > 0
                                            ? Math.round((fetchingCount / fetchingTotal) * 100)
                                            : (testedCount > 0 && assigned.length > 0)
                                                ? Math.round((testedCount / assigned.length) * 100)
                                                : 10;
                                        const bucket = Math.min(12, Math.max(0, Math.round((percent / 100) * 12)));
                                        const widthClasses = ['w-0', 'w-1/12', 'w-2/12', 'w-3/12', 'w-4/12', 'w-5/12', 'w-6/12', 'w-7/12', 'w-8/12', 'w-9/12', 'w-10/12', 'w-11/12', 'w-full'];
                                        const progressClass = widthClasses[bucket];
                                        return (
                                            <div className="mt-2 h-1 w-full bg-slate-700 rounded overflow-hidden">
                                                <div className={`h-full bg-emerald-500 ${progressClass}`} />
                                            </div>
                                        );
                                    })()}
                                    {runError && <div className="mt-2 text-xs text-red-400">{runError}</div>}
                                    {runSuccess && <div className="mt-2 text-xs text-emerald-400">{runSuccess}</div>}
                                </div>
                                <div className="p-4 rounded-lg bg-slate-900/70 border border-slate-800">
                                    <h4 className="font-semibold text-slate-300 mb-2 text-xs">Live log</h4>
                                    <div ref={logRef} className="max-h-32 overflow-auto text-[11px] space-y-1">
                                        {logs.slice(0, LOG_LIMIT).map((line, idx) => <div key={idx} className="text-slate-400">{line}</div>)}
                                        {logs.length === 0 && <div className="text-slate-600">No activity yet.</div>}
                                    </div>
                                </div>
                                <div className="p-4 rounded-lg bg-slate-800/70 border border-slate-700">
                                    {eventReport && typeof eventReport.accuracy === 'number' && eventReport.accuracy < 0.7 && (
                                        <div className="mb-2 px-2 py-1 rounded bg-red-900/40 border border-red-700 text-red-300 text-[11px]">Low accuracy {(eventReport.accuracy * 100).toFixed(1)}% â€” below 70% threshold.</div>
                                    )}
                                    <h3 className="font-semibold text-cyan-300 mb-2 text-sm">Results</h3>
                                    <div className="space-y-2 text-xs">
                                        {backtestResults.length > 0 ? backtestResults.slice(0, 50).map((r, i) => (
                                            <div key={i} className="p-2 bg-slate-900/60 rounded border border-slate-700 flex justify-between">
                                                <span className="font-mono text-slate-200">{r.example.symbol} â€” {r.example.listedDate}</span>
                                                <span className={r.outcome === 'PASSED' ? 'text-emerald-400' : 'text-red-400'}>{r.outcome === 'PASSED' ? 'PASSED' : 'FAILED'} â€” {r.reason}</span>
                                            </div>
                                        )) : (
                                            <div className="text-slate-500">No per-example results. See optimizer logs and aggregate metrics.</div>
                                        )}
                                        {/* Per-symbol metrics intentionally suppressed for category-first flow */}
                                    </div>
                                    {renderCandidateTable()}
                                    {optResult && sortedCandidates.length > 0 && (
                                        <div className="mt-3 p-3 bg-slate-900/60 border border-slate-700 rounded">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="text-xs text-slate-300">Visualization</div>
                                                <div className="text-[11px] text-slate-400">Select a row to preview equity/drawdown</div>
                                            </div>
                                            <div className="flex gap-3 items-start">
                                                <div className="space-y-2">
                                                    <div className="text-[11px] text-slate-400">Equity</div>
                                                    <Chart data={equity} color="#34d399" />
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="text-[11px] text-slate-400">Drawdown</div>
                                                    <Chart data={drawdown} color="#fbbf24" />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="p-4 rounded-lg bg-slate-800/70 border border-slate-700">
                                    <h3 className="font-semibold text-cyan-300 mb-2 text-sm">Aggregate metrics</h3>
                                    {/* Prefer enriched Category Event Report if available; fallback to live job metrics */}
                                    {eventReport ? (
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div>Events {eventReport.totalEvents} â€¢ Trades {eventReport.totalTrades}</div>
                                            <div>Accuracy {typeof eventReport.accuracy === 'number' ? (eventReport.accuracy * 100).toFixed(1) + '%' : 'â€”'}</div>
                                            <div>Total PnL {typeof eventReport.totalNetPnl === 'number' ? eventReport.totalNetPnl.toFixed(0) : 'â€”'}</div>
                                            <div>Avg R multiple {typeof eventReport.avgRMultiple === 'number' ? eventReport.avgRMultiple.toFixed(3) : 'â€”'}</div>
                                            <div>Expectancy {typeof eventReport.expectancy === 'number' ? eventReport.expectancy.toFixed(3) : 'â€”'}</div>
                                            <div>Max drawdown {typeof eventReport.maxDrawdown === 'number' ? eventReport.maxDrawdown.toFixed(0) : 'â€”'}</div>
                                            {eventReport.strategyConfig && (
                                                <div className="col-span-2 text-slate-400">Best config: <span className="font-mono text-slate-200">{Object.entries(eventReport.strategyConfig).map(([k, v]) => `${k}=${v}`).join(', ')}</span></div>
                                            )}
                                            <div className="col-span-2 mt-1 flex gap-2 items-center">
                                                <button onClick={triggerCsvDownload} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600">Download CSV</button>
                                                {downloadHref && <span className="text-[10px] text-slate-400">server link ready</span>}
                                            </div>
                                        </div>
                                    ) : metrics ? (
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div>V1 frozen â€” {metrics.tested} examples tested â€” win rate {typeof metrics.winRate === 'number' ? (metrics.winRate * 100).toFixed(1) + '%' : 'â€”'}</div>
                                            <div>Avg return {typeof metrics.avgReturnPct === 'number' ? metrics.avgReturnPct.toFixed(1) + '%' : 'â€”'}</div>
                                            <div>Profit factor {typeof metrics.profitFactor === 'number' ? metrics.profitFactor.toFixed(2) : 'â€”'}</div>
                                            <div>Max drawdown {typeof metrics.maxDrawdownPct === 'number' ? metrics.maxDrawdownPct.toFixed(1) + '%' : 'â€”'}</div>
                                            <div>{typeof metrics.passed === 'number' ? metrics.passed : 0} passed / {typeof metrics.failed === 'number' ? metrics.failed : 0} failed</div>
                                            <div className="col-span-2 mt-1"><button onClick={triggerCsvDownload} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600">Download CSV</button></div>
                                        </div>
                                    ) : (
                                        <div className="text-slate-500 text-xs">No metrics yet.</div>
                                    )}
                                </div>
                                {activeTab === 'trades' && (
                                    <div className="p-4 rounded-lg bg-slate-800/70 border border-slate-700">
                                        <h3 className="font-semibold text-cyan-300 mb-2 text-sm">Trades {selectedRunId ? `(run ${selectedRunId})` : ''}</h3>
                                        {trades.length === 0 && <div className="text-xs text-slate-500">No trades loaded yet. Click a candidate row to load its trades.</div>}
                                        {trades.length > 0 && (
                                            <div className="space-y-2">
                                                <div className="text-[11px] text-slate-400">{trades.length} trade(s). Expired excluded from success rate.</div>
                                                <div className="max-h-72 overflow-auto border border-slate-700 rounded">
                                                    <table className="w-full text-[11px] border-collapse">
                                                        <thead>
                                                            <tr className="bg-slate-700/40">
                                                                {[
                                                                    { k: 'symbol', label: 'symbol' },
                                                                    { k: 'entryDate', label: 'entryDate' },
                                                                    { k: 'exitDate', label: 'exitDate' },
                                                                    { k: 'signal', label: 'signal' },
                                                                    { k: 'holdingDays', label: 'holdingDays' },
                                                                    { k: 'entry', label: 'entry' },
                                                                    { k: 'exit', label: 'exit' },
                                                                    { k: 'rMultiple', label: 'rMultiple' },
                                                                    { k: 'outcome', label: 'outcome' }
                                                                ].map(h => (
                                                                    <th key={h.k} className="p-1 text-left capitalize">
                                                                        <button onClick={() => handleSort(h.k as any)} className="underline hover:text-white">{h.label}{trSortKey === h.k ? (trSortDir === 'asc' ? ' â–²' : ' â–¼') : ''}</button>
                                                                    </th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {sortedTrades.map((t, i) => (
                                                                <tr key={i} className={`border-b border-slate-700/40 ${t.outcome === 'expired' ? 'bg-amber-950/30' : t.outcome === 'win' ? 'bg-emerald-900/20' : t.outcome === 'loss' ? 'bg-red-900/20' : 'bg-slate-900/20'}`}>
                                                                    <td className="p-1 font-mono text-slate-200">{t.symbol}</td>
                                                                    <td className="p-1 font-mono text-slate-300">{t.entryDate}</td>
                                                                    <td className="p-1 font-mono text-slate-300">{t.exitDate}</td>
                                                                    <td className="p-1 text-slate-300">{t.signalType}</td>
                                                                    <td className="p-1 text-right font-mono text-slate-300">{typeof t.holdingDays === 'number' ? t.holdingDays : ''}</td>
                                                                    <td className="p-1 text-right font-mono text-slate-300">{typeof t.entry === 'number' ? t.entry.toFixed(2) : ''}</td>
                                                                    <td className="p-1 text-right font-mono text-slate-300">{typeof t.exit === 'number' ? t.exit.toFixed(2) : ''}</td>
                                                                    <td className={`p-1 text-right font-mono ${typeof t.rMultiple === 'number' && t.rMultiple >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{typeof t.rMultiple === 'number' ? t.rMultiple.toFixed(2) : ''}</td>
                                                                    <td className="p-1 text-slate-300">{t.outcome}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                {(() => { const nonExpired = trades.filter(t => t.outcome !== 'expired'); const wins = nonExpired.filter(t => t.outcome === 'win').length; const losses = nonExpired.filter(t => t.outcome === 'loss').length; const sr = wins + losses ? (wins / (wins + losses)) * 100 : 0; return <div className="text-xs text-slate-300">Success rate excl expired: <span className="font-mono text-emerald-300">{sr.toFixed(1)}%</span> â€” Wins {wins} / Losses {losses} / Expired {trades.length - nonExpired.length}</div>; })()}
                                                <div>
                                                    <button onClick={triggerCsvDownload} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600">Download CSV</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default StrategyWorkbenchModal;
