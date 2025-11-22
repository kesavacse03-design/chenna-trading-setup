import { startBacktest, subscribeToBacktest, getTradesCsvUrl } from '../api';

export interface BacktestSSEConfig {
    apiBase: string;
    assigned: Array<{ symbol: string; listedDate: string; categoryKey: string }>;
    mode: 'mock' | 'upstox';
    categoryKey: string;
}

export interface BacktestSSECallbacks {
    onJobStart?: (jobId: string) => void;
    onLog?: (msg: string) => void;
    onProgress?: (done: number, total: number) => void;
    onMetrics?: (metrics: any) => void;
    onLearnings?: (learnings: any[]) => void;
    onDownloadReady?: (csvUrl: string | null) => void;
    onComplete?: (success: string) => void;
    onError?: (error: string) => void;
    onStatusChange?: (status: string) => void;
}

/**
 * Execute a backtest using SSE for real-time updates
 * Returns an unsubscribe function to clean up the SSE connection
 */
export async function executeBacktestSSE(
    config: BacktestSSEConfig,
    callbacks: BacktestSSECallbacks
): Promise<() => void> {
    const { apiBase, assigned, mode, categoryKey } = config;
    const {
        onJobStart,
        onLog,
        onProgress,
        onMetrics,
        onLearnings,
        onDownloadReady,
        onComplete,
        onError,
        onStatusChange
    } = callbacks;

    try {
        // Prepare backtest configuration
        const symbols = assigned.map(a => a.symbol);
        const from = assigned.reduce((min, e) => min && min < e.listedDate ? min : e.listedDate, assigned[0]?.listedDate || '');
        const to = assigned.reduce((max, e) => max && max > e.listedDate ? max : e.listedDate, assigned[0]?.listedDate || '');

        // Start the backtest
        const start = await startBacktest({
            symbols,
            from,
            to,
            interval: 'day',
            mode,
            categoryKey,
            examples: assigned
        });

        if (!start?.ok || !start?.jobId) {
            throw new Error(start?.error || 'Invalid start response');
        }

        const jid = start.jobId as string;
        onJobStart?.(jid);
        onStatusChange?.('running');
        onLog?.(`Started job ${jid} — streaming real-time updates...`);

        // Subscribe to SSE
        const unsubscribe = subscribeToBacktest(jid, {
            onLog: (msg) => {
                onLog?.(msg);
            },
            onProgress: (prog) => {
                const { done, total } = prog;
                onProgress?.(done || 0, total || assigned.length);
            },
            onComplete: async (result) => {
                onStatusChange?.('done');
                const runId = result?.runId || jid;

                // Process metrics
                const raw = result?.metrics || null;
                let mapped = raw;
                if (raw) {
                    const trades = Number(raw.trades || 0);
                    const winRate = typeof raw.winRate === 'number' ? raw.winRate : 0;
                    const avgReturnPct = typeof raw.avgReturn === 'number' ? (raw.avgReturn * 100) : undefined;
                    const profitFactor = typeof raw.profitFactor === 'number' ? raw.profitFactor : undefined;
                    const maxDrawdownPct = typeof raw.maxDrawdownPct === 'number' ? raw.maxDrawdownPct : undefined;
                    const totalPnL = typeof raw.netPnl === 'number' ? raw.netPnl : undefined;
                    const passed = Math.round((winRate || 0) * trades);
                    const failed = trades - passed;
                    mapped = {
                        ...raw,
                        tested: trades,
                        winRate,
                        avgReturnPct,
                        profitFactor,
                        maxDrawdownPct,
                        totalPnL,
                        passed,
                        failed,
                    };
                }
                onMetrics?.(mapped || null);

                // Set learnings if available
                if (result?.insights && Array.isArray(result.insights)) {
                    const mappedLearnings = result.insights.map((ins: any, idx: number) => ({
                        tradeId: `${runId}_${ins.symbol || 'unknown'}_${idx}`,
                        ticker: ins.symbol || 'UNKNOWN',
                        timestamp: result?.completedAt || new Date().toISOString(),
                        shortMessage: ins.suggest || ins.failure || '',
                        confidence: ins.confidence,
                        analysis: { failurePattern: ins.failure || '', v2Improvement: ins.suggest || '' },
                        raw: ins,
                    }));
                    onLearnings?.(mappedLearnings);
                }

                // Get CSV download URL
                const csvUrl = getTradesCsvUrl(runId);
                onDownloadReady?.(csvUrl || null);

                onComplete?.(`Completed — processed ${mapped?.tested || 0} trades`);
                unsubscribe();
            },
            onError: (err) => {
                onStatusChange?.('error');
                onError?.(String(err));
                unsubscribe();
            }
        });

        return unsubscribe;
    } catch (e: any) {
        onError?.(e?.message || 'Backtest failed');
        return () => { }; // Return no-op cleanup function
    }
}
