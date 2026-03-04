import React, { useState, useEffect } from 'react';
import DashboardCard from './DashboardCard';

const API_BASE = 'http://localhost:3001/api';

interface Category {
    key: string;
    name: string;
    stockCount: number;
}

interface StrategyConfig {
    categoryKey: string;
    displayName: string;
    type: string;
    targetPercent: number;
    targetApprox: string | null;
    stopPercent: number;
    stopApprox: string | null;
    stopMethod: string;
    maxHoldDays: number;
    holdingPeriod: string;
    tradingDays: Array<{ day: string; weight: number }>;
    priceTiers: Array<{ name: string; minPrice: number; maxPrice: number; candlePattern: string }>;
    avoidMonths: string[];
    expectedSuccessRate: number;
}

interface BacktestProgress {
    id: string;
    status: 'pending' | 'running' | 'complete' | 'failed';
    progress: number;
    currentDate: string | null;
    totalSignals: number | null;
    totalTrades: number | null;
    errorMessage: string | null;
}

// Add Simulation Types
interface SimulationModeInfo {
    mode: string;
    description: string;
    params: any;
}

interface MonkeyStats {
    simulations: number;
    avgWinRate: number;
    avgNetR: number;
    bestCase: number;
    worstCase: number;
    percentiles: Record<string, number>;
    percentile95: number;
}

interface BacktestResults {
    run: {
        id: string;
        categoryKey: string;
        strategyVersion: string;
        startDate: string;
        endDate: string;
        startingCapital: number;
        status: string;
        totalDays: number;
        totalSignals: number;
        totalTrades: number;
        winningTrades: number;
        losingTrades: number;
        winRate: number;
        totalReturn: number;
        returnPercent: number;
        maxDrawdown: number;
        sharpeRatio: number;
        results: {
            monthlyReturns: Record<string, number>;
            finalCapital: number;
            peakCapital: number;
            tradesByTier: { tier1: number; tier2: number; tier3: number };
            skipReport?: any;
            openTrades?: number;
            totalStocksChecked?: number;
            monkeyStats?: MonkeyStats;
            modeInfo?: SimulationModeInfo;
        };
        completedAt: string;
        confidenceMetrics?: Record<string, { total: number, winRate: number, avgPnl: number }>;
    };
    trades: Array<{
        tradeNumber: number;
        symbol: string;
        tier: number;
        tierName: string;
        signalDate: string;
        entryDate: string;
        entryPrice: number;
        exitDate: string | null;
        exitPrice: number | null;
        exitReason: string | null;
        pnl: number | null;
        pnlPercent: number | null;
        outcome: string | null;
        // Quality
        confidence?: string;
        qualityScore?: number;
        qualityFactors?: any;
    }>;
}

interface TimeTravelBacktestModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const TimeTravelBacktestModal: React.FC<TimeTravelBacktestModalProps> = ({
    isOpen,
    onClose
}) => {
    const [phase, setPhase] = useState<'select' | 'config' | 'running' | 'results'>('select');
    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [strategyConfig, setStrategyConfig] = useState<StrategyConfig | null>(null);
    const [backtestId, setBacktestId] = useState<string | null>(null);
    const [progress, setProgress] = useState<BacktestProgress | null>(null);
    const [results, setResults] = useState<BacktestResults | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [runningMessage, setRunningMessage] = useState<string>('Processing...');
    const [showTradeLog, setShowTradeLog] = useState(false);

    // Configuration state - Include Thu/Fri trading days
    const [config, setConfig] = useState({
        startDate: '',
        endDate: '',
        startingCapital: 100000,
        positionSize: 10000, // Fixed position size (10k per trade)
        executionMode: 'perfect', // perfect, capital_lock, max_1_position, max_3_positions
        dataMode: '1minute' as '1minute' | '1day',
        applyQualityFilter: true,
        simulationMode: 'ALL' // ALL, TOP_N_BY_SCORE, MONKEY_RANDOM
    });

    // Strategy Logic Mapping
    const CATEGORY_TYPES: Record<string, { type: 'SWING' | 'INTRADAY', dataMode: '1minute' | '1day' }> = {
        // SWING (Daily candles)
        'SHORT_TERM_SWING_BO_DOWN': { type: 'SWING', dataMode: '1day' },
        'SHORT_TERM_SWING_BO_UP': { type: 'SWING', dataMode: '1day' },
        'LONG_TERM_SWING_BO_DOWN': { type: 'SWING', dataMode: '1day' },
        'LONG_TERM_SWING_BO_UP': { type: 'SWING', dataMode: '1day' },
        'MULTI_SUPPORT_BO': { type: 'SWING', dataMode: '1day' },
        'MULTI_RESISTANCE_BO': { type: 'SWING', dataMode: '1day' },
        'DOWNSIDE_LOM_SWING': { type: 'SWING', dataMode: '1day' },
        'UPSIDE_LOM_SWING': { type: 'SWING', dataMode: '1day' },
        'DAILY_CONTRACTION': { type: 'SWING', dataMode: '1day' },

        // INTRADAY (1-minute candles)
        'INTRADAY_BOOST': { type: 'INTRADAY', dataMode: '1minute' },
        'HIGH_POWERED_STOCKS': { type: 'INTRADAY', dataMode: '1minute' },
        'UPSIDE_LOM_INTRA': { type: 'INTRADAY', dataMode: '1minute' },
        'DOWNSIDE_LOM_INTRA': { type: 'INTRADAY', dataMode: '1minute' },
        'PRE_MARKET': { type: 'INTRADAY', dataMode: '1minute' },
    };

    // Initialize dates dynamically
    useEffect(() => {
        if (!isOpen) return;

        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const oneWeekAgo = new Date(today);
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        // Don't overwrite if already set (unless re-opening?)
        // For simplicity, reset on open
        setConfig(prev => ({
            ...prev,
            startDate: oneWeekAgo.toISOString().split('T')[0],
            endDate: yesterday.toISOString().split('T')[0]
        }));
    }, [isOpen]);

    const handleOptimalRange = async () => {
        if (!selectedCategory) return;

        try {
            setLoading(true);
            const res = await fetch(`${API_BASE}/backtest/optimal-range/${selectedCategory}`);
            const data = await res.json();

            if (data.startDate && data.endDate) {
                setConfig(prev => ({
                    ...prev,
                    startDate: data.startDate,
                    endDate: data.endDate
                }));
                // We could also show a toast here if we had a toast system hooked up
                console.log('Set optimal range:', data.note);
            }
        } catch (e) {
            console.error('Failed to get optimal range', e);
        } finally {
            setLoading(false);
        }
    };

    // State for Data Availability
    // const [useAllData, setUseAllData] = useState(false); // REMOVED in favor of dataMode
    const [dataAvailability, setDataAvailability] = useState<{
        stocksTotal: number;
        stocksWithData: number;
        dateRange: { start: string | null; end: string | null };
        tradingDays: number;
        dataQuality: string;
    } | null>(null);

    // Fetch categories on open
    useEffect(() => {
        if (isOpen) {
            fetchCategories();
        }
    }, [isOpen]);

    // Fetch strategy config when category selected
    useEffect(() => {
        if (selectedCategory) {
            fetchStrategyConfig(selectedCategory);
        }
    }, [selectedCategory]);

    const fetchCategories = async () => {
        try {
            // Fetch all categories
            const res = await fetch(`${API_BASE}/categories`);
            const data = await res.json();

            if (data.success && data.data) {
                // Fetch stock count for each category
                const categoriesWithCounts = await Promise.all(
                    data.data.map(async (cat: { key: string; name: string }) => {
                        try {
                            const stocksRes = await fetch(`${API_BASE}/categories/${cat.key}/stocks`);
                            const stocksData = await stocksRes.json();
                            return {
                                key: cat.key,
                                name: cat.name,
                                stockCount: stocksData.stocks?.length || 0
                            };
                        } catch {
                            return { key: cat.key, name: cat.name, stockCount: 0 };
                        }
                    })
                );

                // Filter to only categories with stocks
                setCategories(categoriesWithCounts.filter((c: Category) => c.stockCount > 0));
            } else if (data.categories) {
                // Fallback for old structure if any
                setCategories(data.categories);
            }
        } catch (e) {
            console.error('Failed to fetch categories:', e);
        }
    };

    const fetchStrategyConfig = async (categoryKey: string) => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/trading/category-config/${categoryKey}`);
            const data = await res.json();
            if (data.success && data.config) {
                setStrategyConfig(data.config);
            } else {
                setStrategyConfig(null);
            }
            // Also fetch data availability
            await fetchDataAvailability(categoryKey);
        } catch (e) {
            console.error('Failed to fetch strategy config:', e);
            setStrategyConfig(null);
        }
        setLoading(false);
    };

    const fetchDataAvailability = async (categoryKey: string) => {
        try {
            const res = await fetch(`${API_BASE}/backtest/data-availability/${categoryKey}`);
            const data = await res.json();
            if (data.success) {
                setDataAvailability(data.data);
            }
        } catch (e) {
            console.error('Failed to fetch data availability', e);
        }
    };

    const handleCategorySelect = (key: string) => {
        setSelectedCategory(key);
        setPhase('config');
        setConfig(prev => ({ ...prev, dataMode: CATEGORY_TYPES[key]?.dataMode || '1day' }));
    };

    const handleBacktest = async () => {
        if (!selectedCategory) return;

        try {
            setLoading(true);
            setError(null);

            if (!strategyConfig) {
                // Try to fetch it one last time or proceed with defaults?
                // For now, allow proceeding if config is null (defaults used)
                // But validation might be needed.
                console.log('No strategy config loaded, using defaults/hardcoded rules');
            }

            // Validation
            if (!config.startDate || !config.endDate) {
                setError('Please select a valid date range.');
                setLoading(false);
                return;
            }

            const start = new Date(config.startDate);
            const end = new Date(config.endDate);
            if (start > end) {
                setError('Start date must be before end date.');
                setLoading(false);
                return;
            }

            // Check max duration for 1-minute data
            const dayDiff = (end.getTime() - start.getTime()) / (1000 * 3600 * 24);
            if (config.dataMode === '1minute' && dayDiff > 35) {
                if (!window.confirm('Warning: 1-minute backtests over 30 days may be slow or hit data limits. Continue?')) {
                    setLoading(false);
                    return;
                }
            }

            const res = await fetch(`${API_BASE}/backtest/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    categoryKey: selectedCategory,
                    strategyVersion: 'V1.0',
                    startDate: config.startDate,
                    endDate: config.endDate,
                    startingCapital: config.startingCapital,
                    positionSizing: { type: 'fixed', amount: config.positionSize },
                    executionMode: config.executionMode,
                    dataMode: config.dataMode,
                    applyQualityFilter: config.applyQualityFilter
                })
            });

            const data = await res.json();

            if (data.success) {
                setBacktestId(data.backtestId);
                setPhase('running');
                // Poll for progress
                pollProgress(data.backtestId);
            } else {
                setError(data.error || 'Failed to start backtest');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const handleReplay = async () => {
        if (!selectedCategory) return;
        try {
            setLoading(true);
            setError(null);
            if (!config.startDate || !config.endDate) {
                setError('Please select a valid date range.');
                setLoading(false);
                return;
            }

            const res = await fetch(`${API_BASE}/v5/backtest/replay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category: selectedCategory,
                    startDate: config.startDate,
                    endDate: config.endDate,
                    mode: config.simulationMode,
                    options: {
                        pickCount: 3,
                        simCount: 1000
                    }
                })
            });

            const data = await res.json();
            if (data.ok) {
                const mappedTrades = data.signals.map((s: any, i: number) => ({
                    tradeNumber: i + 1,
                    symbol: s.symbol,
                    tier: 1,
                    tierName: 'Replay',
                    signalDate: s.signalDate,
                    entryDate: s.signalDate,
                    entryPrice: s.entryPrice,
                    exitDate: s.replayExitTime || null,
                    exitPrice: s.replayExitPrice || null,
                    exitReason: s.replayOutcome || '',
                    pnlPercent: s.replayExitPrice ? ((s.replayExitPrice - s.entryPrice) / s.entryPrice * (s.direction === 'SHORT' ? -1 : 1)) * 100 : 0,
                    outcome: s.replayOutcome === 'STOP_HIT' ? 'LOSS' : s.replayOutcome === 'EXPIRED' ? 'SKIP' : s.replayOutcome?.includes('T') ? 'WIN' : 'UNKNOWN'
                }));

                const winInt = data.summary.t1Hits + data.summary.t2Hits;
                const totalCompleted = winInt + data.summary.stopHits;

                const mappedResults: BacktestResults = {
                    run: {
                        id: 'replay-' + Date.now(),
                        categoryKey: selectedCategory,
                        strategyVersion: 'REPLAY',
                        startDate: config.startDate,
                        endDate: config.endDate,
                        startingCapital: 0,
                        status: 'complete',
                        totalDays: 0,
                        totalSignals: data.summary.total,
                        totalTrades: data.summary.traded || totalCompleted,
                        winningTrades: winInt,
                        losingTrades: data.summary.losers || data.summary.stopHits,
                        winRate: (data.summary.winRate) || (totalCompleted > 0 ? (winInt / totalCompleted) * 100 : 0),
                        totalReturn: data.summary.totalR || 0,
                        returnPercent: data.summary.totalR * 2000, // Estimate ₹2000 risk per trade
                        maxDrawdown: 0,
                        sharpeRatio: 0,
                        results: {
                            monthlyReturns: {},
                            finalCapital: 0,
                            peakCapital: 0,
                            tradesByTier: { tier1: 0, tier2: 0, tier3: 0 },
                            // Add monkey stats payload here if exists
                            monkeyStats: data.monkeyStats,
                            modeInfo: data.modeInfo
                        } as any,
                        completedAt: new Date().toISOString()
                    },
                    trades: mappedTrades
                };

                setResults(mappedResults);
                setPhase('results');
            } else {
                setError(data.error || 'Failed to replay signals');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const pollProgress = (id: string) => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${API_BASE}/backtest/status/${id}`);
                const data = await res.json();

                if (data.success) {
                    setProgress(data.progress);
                    if (data.progress.runningMessage) {
                        setRunningMessage(data.progress.runningMessage);
                    }

                    if (data.progress.status === 'complete') {
                        clearInterval(interval);
                        setResults(data.progress.results || data.results); // specific to backend structure
                        setPhase('results');
                        // Also fetch final results if needed
                        fetchResults(id);
                    } else if (data.progress.status === 'failed') {
                        clearInterval(interval);
                        setError(data.progress.errorMessage || 'Backtest failed');
                        setPhase('config');
                    }
                }
            } catch (e) {
                console.error('Polling error', e);
            }
        }, 1000);
    };

    const fetchResults = async (id: string) => {
        try {
            const res = await fetch(`${API_BASE}/backtest/results/${id}`);
            const data = await res.json();
            if (data.success) {
                setResults(data.data);
            }
        } catch (e) {
            console.error('Results fetch error', e);
        }
    };


    // Dynamic Strategy Rules Helper
    const getStrategyRules = (category: string) => {
        switch (category) {
            case 'DOWNSIDE_LOM_SWING':
                return {
                    title: '📉 STRATEGY: Swing Bearish Divergence',
                    rules: [
                        { icon: '📉', text: 'Daily RSI(14) Bearish Divergence (Price HH, RSI LH)' },
                        { icon: '📅', text: 'Entry on Thu/Fri only (Swing Setup)' },
                        { icon: '⚠️', text: 'RSI < 60 at High (Avoid strong momentum)' },
                        { icon: '🛑', text: 'Stop above divergence high' }
                    ],
                    color: 'red'
                };
            case 'UPSIDE_LOM_SWING':
                return {
                    title: '📈 STRATEGY: Swing Bullish Divergence',
                    rules: [
                        { icon: '📈', text: 'Daily RSI(14) Bullish Divergence (Price LL, RSI HL)' },
                        { icon: '📅', text: 'Entry on Thu/Fri only (Swing Setup)' },
                        { icon: '✅', text: 'RSI < 40 at Low (Oversold condition)' },
                        { icon: '🛑', text: 'Stop below divergence low' }
                    ],
                    color: 'green'
                };
            case 'SHORT_TERM_SWING_BO_UP':
                return {
                    title: '🚀 STRATEGY: Short-Term Breakout',
                    rules: [
                        { icon: '📈', text: 'Breakout above 5-Day High' },
                        { icon: '📊', text: 'Volume > 1.3x Average (20-day)' },
                        { icon: '📅', text: 'Entry on Thu/Fri only' },
                        { icon: '🎯', text: 'Target +2.0% | Stop -1.5%' }
                    ],
                    color: 'green'
                };
            case 'SHORT_TERM_SWING_BO_DOWN':
                return {
                    title: '📉 STRATEGY: Short-Term Breakdown',
                    rules: [
                        { icon: '📉', text: 'Breakdown below 5-Day Low' },
                        { icon: '📊', text: 'Volume > 1.3x Average (20-day)' },
                        { icon: '📅', text: 'Entry on Thu/Fri only' },
                        { icon: '🎯', text: 'Target -2.0% | Stop +1.5%' }
                    ],
                    color: 'red'
                };
            case 'LONG_TERM_SWING_BO_UP':
                return {
                    title: '🚀 STRATEGY: Long-Term Breakout',
                    rules: [
                        { icon: '📈', text: 'Breakout above 20-Day High' },
                        { icon: '📊', text: 'Volume > 1.5x Average' },
                        { icon: '📅', text: 'Entry on Thu/Fri only' },
                        { icon: '🎯', text: 'Target +4.0% | Stop -2.0%' }
                    ],
                    color: 'green'
                };
            case 'LONG_TERM_SWING_BO_DOWN':
                return {
                    title: '📉 STRATEGY: Long-Term Breakdown',
                    rules: [
                        { icon: '📉', text: 'Breakdown below 20-Day Low' },
                        { icon: '📉', text: 'Pre-Trend < -5% (Established Downtrend)' },
                        { icon: '📊', text: 'Volume > 1.5x Average' },
                        { icon: '🎯', text: 'Target -4.0% | Stop +2.0%' }
                    ],
                    color: 'red'
                };
            case 'MULTI_RESISTANCE_BO':
                return {
                    title: '🚀 STRATEGY: Multi-Day Resistance Breakout',
                    rules: [
                        { icon: '📈', text: 'Breakout above 2-5 Day High' },
                        { icon: '📊', text: 'Volume > 1.5x Average' },
                        { icon: '🕯️', text: 'Strong Bullish Candle (>30% Body)' },
                        { icon: '🎯', text: 'Target +2.5% | Stop -1.5%' }
                    ],
                    color: 'green'
                };
            case 'MULTI_SUPPORT_BO':
                return {
                    title: '📉 STRATEGY: Multi-Day Support Breakdown',
                    rules: [
                        { icon: '📉', text: 'Breakdown below 2-5 Day Low' },
                        { icon: '📊', text: 'Volume > 1.5x Average' },
                        { icon: '🕯️', text: 'Strong Bearish Candle (>30% Body)' },
                        { icon: '🎯', text: 'Target -2.5% | Stop +1.5%' }
                    ],
                    color: 'red'
                };
            case 'DAILY_CONTRACTION':
                return {
                    title: '⚡ STRATEGY: VCP/NR7 Contraction',
                    rules: [
                        { icon: '🧘', text: 'Pattern: Inside Day or NR7 (Daily)' },
                        { icon: '🌊', text: 'Hourly Trend: Price vs 20 EMA' },
                        { icon: '💥', text: 'Entry: Breakout of Prev Day Range' },
                        { icon: '🎯', text: 'Target +2.0% | Stop -1.0%' }
                    ],
                    color: 'blue'
                };
            case 'INTRADAY_BOOST':
            case 'HIGH_POWERED_STOCKS':
                return {
                    title: '⚡ STRATEGY: Intraday N-Pattern',
                    rules: [
                        { icon: '📊', text: 'Opening Range (9:15-9:30) < 2% Width' },
                        { icon: '🔄', text: 'Pullback (Higher Low) above OR Low' },
                        { icon: '🚀', text: 'Breakout above OR High + Volume > 2x' },
                        { icon: '⚡', text: 'Intraday Only (Exit 3:15 PM)' }
                    ],
                    color: 'purple'
                };
            case 'UPSIDE_LOM_INTRA':
                return {
                    title: '📈 STRATEGY: Intraday Bullish Reversal',
                    rules: [
                        { icon: '📉', text: '5-min RSI Bullish Divergence (Price LL, RSI HL)' },
                        { icon: '✅', text: 'Confirmation: Price close > 10 EMA' },
                        { icon: '🔋', text: 'Volume Contraction at bottom' },
                        { icon: '🎯', text: 'Target +1.5% | Stop below low' }
                    ],
                    color: 'green'
                };
            case 'DOWNSIDE_LOM_INTRA':
                return {
                    title: '📉 STRATEGY: Intraday Bearish Reversal',
                    rules: [
                        { icon: '📈', text: '5-min RSI Bearish Divergence (Price HH, RSI LH)' },
                        { icon: '✅', text: 'Confirmation: Price close < 10 EMA' },
                        { icon: '🔋', text: 'Volume Contraction at top' },
                        { icon: '🎯', text: 'Target -1.5% | Stop above high' }
                    ],
                    color: 'red'
                };
            case 'PRE_MARKET':
                return {
                    title: '🌅 STRATEGY: Gap Up Short (Gap Fill)',
                    rules: [
                        { icon: '📈', text: 'Gap Up ≥ 3% vs Prev Close' },
                        { icon: '📉', text: 'Break below Opening Range Low' },
                        { icon: '📊', text: 'Volume > 2x at Breakdown' },
                        { icon: '🎯', text: 'Target: Gap Fill (Prev Close)' }
                    ],
                    color: 'orange'
                };
            default:
                return {
                    title: `📋 STRATEGY: ${selectedCategory.replace(/_/g, ' ')}`,
                    rules: [
                        { icon: '✓', text: 'Check if trading day (Thu/Fri only)' },
                        { icon: '✓', text: 'Check price tier & candle pattern' },
                        { icon: '✓', text: 'Technical validation (Support/Resist)' },
                        { icon: '✓', text: 'Generate signal if conditions pass' }
                    ],
                    color: 'blue'
                };
        }
    };

    const downloadCSV = () => {
        if (!results?.trades?.length) return;
        const headers = ['#', 'Symbol', 'Signal Date', 'Entry Date', 'Entry Price', 'Exit Date', 'Exit Price', 'Exit Reason', 'PnL %', 'Outcome', 'Tier', 'Confidence'];
        const rows = results.trades.map(t => [
            t.tradeNumber, t.symbol, t.signalDate, t.entryDate, t.entryPrice,
            t.exitDate || '', t.exitPrice || '', t.exitReason || '',
            t.pnlPercent ?? '', t.outcome || '', t.tier, t.confidence || ''
        ].join(','));

        // Add summary section
        const summaryLines = [
            '', '', '--- SUMMARY ---',
            `Total Trades,${results.run.totalTrades}`,
            `Win Rate,${results.run.winRate?.toFixed(1)}%`,
            `Winning Trades,${results.run.winningTrades}`,
            `Losing Trades,${results.run.losingTrades}`,
            `Open Trades,${results.run.results?.openTrades || 0}`,
            `Total Return,${results.run.returnPercent?.toFixed(2)}%`,
            `Max Drawdown,${results.run.maxDrawdown?.toFixed(2)}%`,
            `Execution Mode,${config.executionMode}`
        ];

        // Add skip summary if available
        const skipReport = results.run.results?.skipReport;
        if (skipReport?.length) {
            summaryLines.push('', '--- SKIP REPORT SUMMARY ---');
            summaryLines.push(`Total Stocks Checked,${results.run.results?.totalStocksChecked || 0}`);
            summaryLines.push(`Total Skipped,${skipReport.length}`);
            const reasonCounts: Record<string, number> = {};
            skipReport.forEach((s: any) => {
                const reason = s.reason || 'Unknown';
                reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
            });
            Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).forEach(([reason, count]) => {
                summaryLines.push(`"${reason}",${count}`);
            });
        }

        const csv = [headers.join(','), ...rows, ...summaryLines].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backtest_${selectedCategory}_${config.startDate}_${config.endDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const downloadSkippedCSV = () => {
        const skipReport = results?.run?.results?.skipReport;
        if (!skipReport?.length) return;
        const headers = ['Date', 'Symbol', 'Reason', 'Tier', 'Pre-Trend'];
        const rows = skipReport.map((s: any) => [
            s.date || '',
            s.symbol || '',
            `"${(s.reason || '').replace(/"/g, '""')}"`,
            s.tier || '',
            s.preTrend != null ? `${s.preTrend}%` : ''
        ].join(','));
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `skip_report_${selectedCategory}_${config.startDate}_${config.endDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const resetModal = () => {
        setPhase('select');
        setSelectedCategory('');
        setStrategyConfig(null);
        setBacktestId(null);
        setProgress(null);
        setResults(null);
        setError(null);
        setDataAvailability(null);
        setShowTradeLog(false);
    };

    if (!isOpen) return null;

    const activeRules = getStrategyRules(selectedCategory);

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-slate-800 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-cyan-400">
                        ⏱️ Time-Travel Backtest
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">&times;</button>
                </div>

                {error && (
                    <div className="bg-red-900/30 border border-red-500/40 rounded-lg p-3 mb-4 text-red-400">
                        ❌ {error}
                    </div>
                )}

                {/* Phase 1: Category Selection */}
                {phase === 'select' && (
                    <div className="space-y-4">
                        <p className="text-slate-400 text-sm mb-4">
                            Select a category to backtest. The system will simulate trading day-by-day using historical data.
                        </p>

                        <div className="grid grid-cols-1 gap-3">
                            {categories.map(cat => (
                                <button
                                    key={cat.key}
                                    onClick={() => handleCategorySelect(cat.key)}
                                    className="flex justify-between items-center p-4 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg border border-slate-600 hover:border-cyan-500 transition-all text-left"
                                >
                                    <div>
                                        <div className="font-semibold text-white">{cat.name}</div>
                                        <div className="text-sm text-slate-400">{cat.key}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-cyan-400 font-bold">{cat.stockCount}</div>
                                        <div className="text-xs text-slate-400">stocks</div>
                                    </div>
                                </button>
                            ))}
                        </div>

                        {categories.length === 0 && (
                            <div className="text-center py-8 text-slate-500">
                                No categories with stocks found
                            </div>
                        )}
                    </div>
                )}

                {/* Phase 2: Configuration with Strategy Logic */}
                {phase === 'config' && (
                    <div className="space-y-6">
                        {/* Selected Category */}
                        <div className="flex items-center gap-2 pb-4 border-b border-slate-600">
                            <button
                                onClick={() => setPhase('select')}
                                className="text-slate-400 hover:text-white"
                            >
                                ← Back
                            </button>
                            <span className="text-white font-semibold">
                                {categories.find(c => c.key === selectedCategory)?.name || selectedCategory}
                            </span>
                        </div>


                        {/* Strategy Rules Display */}
                        {loading ? (
                            <div className="text-center py-4 text-slate-400">Loading strategy...</div>
                        ) : ['INTRADAY_BOOST', 'HIGH_POWERED_STOCKS'].includes(selectedCategory) ? (
                            /* V2.1 N-Pattern Detection Rules for Intraday */
                            <div className="bg-purple-900/20 border border-purple-500/40 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-purple-400 mb-3">
                                    📋 STRATEGY: N-Pattern Detection (Intraday Breakout)
                                </h3>

                                {/* Entry & Exit */}
                                <div className="grid grid-cols-3 gap-4 mb-4">
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-green-400">+1.5%</div>
                                        <div className="text-xs text-slate-400">Target</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-red-400">Dynamic</div>
                                        <div className="text-xs text-slate-400">Stop (Below Pullback)</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-yellow-400">Same Day</div>
                                        <div className="text-xs text-slate-400">Max Hold</div>
                                    </div>
                                </div>

                                {/* N-Pattern Formation */}
                                <div className="mb-4 bg-slate-800/50 rounded p-3">
                                    <div className="text-xs text-cyan-400 font-semibold mb-2">📊 N-PATTERN FORMATION</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="flex items-center gap-2">
                                            <span className="text-orange-400">1️⃣</span>
                                            <span className="text-slate-300">Opening Range (9:15-9:30)</span>
                                        </div>
                                        <div className="text-slate-400">Range &lt; 2% of price</div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-orange-400">2️⃣</span>
                                            <span className="text-slate-300">Pullback Phase (15-45 min)</span>
                                        </div>
                                        <div className="text-slate-400">Higher low above OR low</div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-orange-400">3️⃣</span>
                                            <span className="text-slate-300">Breakout Entry</span>
                                        </div>
                                        <div className="text-slate-400">Above OR high + 0.5%</div>
                                    </div>
                                </div>

                                {/* Enhanced Filters */}
                                <div className="mb-4 bg-slate-800/50 rounded p-3">
                                    <div className="text-xs text-green-400 font-semibold mb-2">✅ ENHANCED FILTERS (need 2/3)</div>
                                    <div className="space-y-1 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-slate-300">EMA Crossover</span>
                                            <span className="text-slate-400">9 EMA above 21 EMA</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-300">Breakout Strength</span>
                                            <span className="text-slate-400">&gt; 0.5% above OR high</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-300">Volume Confirmation</span>
                                            <span className="text-slate-400">&gt; 2x average volume</span>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        ) : selectedCategory === 'PRE_MARKET' ? (
                            /* Gap Up Short Strategy for PRE_MARKET */
                            <div className="bg-orange-900/20 border border-orange-500/40 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-orange-400 mb-3">
                                    📋 STRATEGY: Gap Up Short (Gap Fill)
                                </h3>

                                {/* Entry & Exit */}
                                <div className="grid grid-cols-3 gap-4 mb-4">
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-green-400">Gap Fill</div>
                                        <div className="text-xs text-slate-400">Target (Prev Close)</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-red-400">OR High</div>
                                        <div className="text-xs text-slate-400">Stop (+0.3%)</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-yellow-400">10:30 AM</div>
                                        <div className="text-xs text-slate-400">Hard Exit</div>
                                    </div>
                                </div>

                                {/* Gap Trading Rules */}
                                <div className="mb-4 bg-slate-800/50 rounded p-3">
                                    <div className="text-xs text-cyan-400 font-semibold mb-2">📊 GAP FILL STRATEGY (SHORT)</div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="flex items-center gap-2">
                                            <span className="text-orange-400">1️⃣</span>
                                            <span className="text-slate-300">Gap UP ≥3% at open</span>
                                        </div>
                                        <div className="text-slate-400">vs Previous Close</div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-orange-400">2️⃣</span>
                                            <span className="text-slate-300">Opening Range (1-min)</span>
                                        </div>
                                        <div className="text-slate-400">Wait for OR formation</div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-orange-400">3️⃣</span>
                                            <span className="text-slate-300">Break OR Low = SHORT</span>
                                        </div>
                                        <div className="text-slate-400">Conviction candle</div>
                                    </div>
                                </div>

                                {/* Filters */}
                                <div className="mb-4 bg-slate-800/50 rounded p-3">
                                    <div className="text-xs text-green-400 font-semibold mb-2">✅ FILTERS</div>
                                    <div className="space-y-1 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-slate-300">Gap Range</span>
                                            <span className="text-slate-400">3% - 10%</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-300">Volume at Entry</span>
                                            <span className="text-slate-400">&gt; 2x average</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-slate-300">Breakdown Candle</span>
                                            <span className="text-slate-400">Body &gt; 50%</span>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        ) : strategyConfig ? (
                            /* V1.0 Rules for other categories */
                            <div className="bg-purple-900/20 border border-purple-500/40 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-purple-400 mb-3">
                                    📋 STRATEGY: {strategyConfig.displayName || selectedCategory}
                                </h3>

                                {/* Entry & Exit */}
                                <div className="grid grid-cols-3 gap-4 mb-4">
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-green-400">
                                            {strategyConfig.stopMethod === 'ATR'
                                                ? `~${strategyConfig.targetApprox || strategyConfig.targetPercent}`
                                                : `+${strategyConfig.targetPercent}%`}
                                        </div>
                                        <div className="text-xs text-slate-400">
                                            {strategyConfig.stopMethod === 'ATR' ? 'Target (ATR-based)' : 'Target'}
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-red-400">
                                            {strategyConfig.stopMethod === 'ATR'
                                                ? `~${strategyConfig.stopApprox || strategyConfig.stopPercent}`
                                                : `${strategyConfig.stopPercent}%`}
                                        </div>
                                        <div className="text-xs text-slate-400">
                                            {strategyConfig.stopMethod === 'ATR' ? `Stop (${strategyConfig.stopPercent})` : 'Stop Loss'}
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-2xl font-bold text-yellow-400">
                                            {strategyConfig.holdingPeriod || `${strategyConfig.maxHoldDays}d`}
                                        </div>
                                        <div className="text-xs text-slate-400">Hold Period</div>
                                    </div>
                                </div>

                                {/* Trading Days */}
                                <div className="mb-4">
                                    <div className="text-xs text-slate-400 mb-2">Valid Trading Days:</div>
                                    <div className="flex gap-2">
                                        {strategyConfig.tradingDays?.map(d => (
                                            <span key={d.day} className={`px-2 py-1 rounded text-xs ${d.weight > 1 ? 'bg-green-500/30 text-green-400' : 'bg-slate-600 text-slate-300'}`}>
                                                {d.day} {d.weight > 1 && '⭐'}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Price Tiers */}
                                <div className="mb-4">
                                    <div className="text-xs text-slate-400 mb-2">Price Tiers:</div>
                                    <div className="space-y-1">
                                        {strategyConfig.priceTiers?.map((tier, i) => (
                                            <div key={i} className="flex justify-between text-xs">
                                                <span className="text-cyan-400">{tier.name}</span>
                                                <span className="text-slate-400">₹{tier.minPrice}-{tier.maxPrice}</span>
                                                <span className="text-orange-400">{tier.candlePattern}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Avoid Months */}
                                {strategyConfig.avoidMonths?.length > 0 && (
                                    <div className="text-xs">
                                        <span className="text-red-400">⚠️ Avoid:</span>
                                        <span className="text-slate-300 ml-2">{strategyConfig.avoidMonths.join(', ')}</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="bg-yellow-900/20 border border-yellow-500/40 rounded-lg p-4 text-yellow-400 text-sm">
                                ⚠️ No strategy configured for this category. Backtest will use default rules.
                            </div>
                        )}


                        {/* Dynamic Strategy Rules (How Signals Are Generated) */}
                        <div className={`bg-${activeRules.color}-900/20 border border-${activeRules.color}-500/40 rounded-lg p-4 mt-6`}>
                            <h3 className={`text-sm font-semibold text-${activeRules.color}-400 mb-3`}>
                                {activeRules.title}
                            </h3>
                            <div className="text-xs text-slate-300 space-y-2">
                                {activeRules.rules.map((rule, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <span className="text-lg">{rule.icon}</span>
                                        <span>{rule.text}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Date Range */}
                        <div className="bg-slate-700/50 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-slate-400 mb-3">📅 TIME PERIOD</h3>

                            {/* Data Mode Selection */}
                            {/* Data Mode Selection */}
                            <div className="mb-4">
                                <label className="block text-xs text-slate-400 mb-2">DATA PRECISION & RANGE</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {/* 1-Minute Candles Option */}
                                    <button
                                        onClick={() => setConfig({ ...config, dataMode: '1minute' })}
                                        disabled={CATEGORY_TYPES[selectedCategory]?.type === 'SWING'}
                                        className={`p-3 rounded-lg text-left transition-all border-2 ${config.dataMode === '1minute'
                                            ? 'bg-cyan-600/40 border-cyan-500'
                                            : CATEGORY_TYPES[selectedCategory]?.type === 'SWING'
                                                ? 'bg-slate-800/50 border-slate-700 opacity-50 cursor-not-allowed'
                                                : 'bg-slate-700/50 border-transparent hover:border-slate-600'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-lg">⚡</span>
                                            <div className={`font-bold text-sm ${CATEGORY_TYPES[selectedCategory]?.type === 'SWING' ? 'text-slate-500' : 'text-white'}`}>1-Minute Candles</div>
                                        </div>
                                        <div className="text-xs text-slate-400">
                                            Precise execution using minute-level data.
                                            <br />
                                            {CATEGORY_TYPES[selectedCategory]?.type === 'SWING' ? (
                                                <span className="text-red-400 font-bold">⛔ Not for Swing Strategies</span>
                                            ) : (
                                                <span className="text-yellow-400">Limited to last 30 days.</span>
                                            )}
                                        </div>
                                    </button>

                                    {/* 1-Day Candles Option */}
                                    <button
                                        onClick={() => setConfig({ ...config, dataMode: '1day' })}
                                        disabled={CATEGORY_TYPES[selectedCategory]?.type === 'INTRADAY'}
                                        className={`p-3 rounded-lg text-left transition-all border-2 ${config.dataMode === '1day'
                                            ? 'bg-purple-600/40 border-purple-500'
                                            : CATEGORY_TYPES[selectedCategory]?.type === 'INTRADAY'
                                                ? 'bg-slate-800/50 border-slate-700 opacity-50 cursor-not-allowed'
                                                : 'bg-slate-700/50 border-transparent hover:border-slate-600'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-lg">📅</span>
                                            <div className={`font-bold text-sm ${CATEGORY_TYPES[selectedCategory]?.type === 'INTRADAY' ? 'text-slate-500' : 'text-white'}`}>1-Day Candles</div>
                                        </div>
                                        <div className="text-xs text-slate-400">
                                            Approximate execution.
                                            <br />
                                            {CATEGORY_TYPES[selectedCategory]?.type === 'INTRADAY' ? (
                                                <span className="text-red-400 font-bold">⛔ Not for Intraday</span>
                                            ) : (
                                                <span className="text-green-400">Full history available.</span>
                                            )}
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Date Range Selection */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Start Date</label>
                                    <input
                                        type="date"
                                        value={config.startDate}
                                        onChange={e => setConfig({ ...config, startDate: e.target.value })}
                                        className="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2 text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">End Date</label>
                                    <input
                                        type="date"
                                        value={config.endDate}
                                        onChange={e => setConfig({ ...config, endDate: e.target.value })}
                                        className="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2 text-white"
                                    />
                                </div>
                            </div>

                            <div className="mt-2 text-xs text-gray-400 bg-[#252525] p-3 rounded border border-[#333]">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="font-bold text-gray-300">📊 Data Availability</h4>
                                    <button
                                        onClick={handleOptimalRange}
                                        disabled={loading}
                                        className="bg-blue-900/40 hover:bg-blue-900/60 text-blue-300 px-2 py-1 rounded text-xs border border-blue-800 transition-colors"
                                    >
                                        📅 Use Optimal 30-Day Range
                                    </button>
                                </div>
                                <p><strong>1-Minute Data:</strong> Last 30 days only (Upstox limit)</p>
                                <p><strong>Daily Data:</strong> Full history available</p>

                                {['INTRADAY_BOOST', 'HIGH_POWERED_STOCKS'].includes(selectedCategory) && (
                                    <div className="mt-1 text-yellow-500/80">
                                        💡 Intraday strategies require 1-minute data. Please select dates within the last 30 days.
                                    </div>
                                )}

                                {/* Data Availability Info */}
                                {dataAvailability && (
                                    <div className="mt-2 grid grid-cols-3 gap-2">
                                        <div className="text-center">
                                            <div className="text-sm font-bold text-cyan-400">{dataAvailability.stocksWithData}/{dataAvailability.stocksTotal}</div>
                                            <div className="text-[10px] text-slate-500">Stocks w/ Data</div>
                                        </div>
                                        <div className="text-center">
                                            <div className="text-sm font-bold text-slate-300">{dataAvailability.tradingDays}</div>
                                            <div className="text-[10px] text-slate-500">Trading Days</div>
                                        </div>
                                        <div className="text-center">
                                            <span className={`text-sm font-bold ${dataAvailability.dataQuality === 'GOOD' ? 'text-green-400' : dataAvailability.dataQuality === 'PARTIAL' ? 'text-yellow-400' : 'text-red-400'}`}>
                                                {dataAvailability.dataQuality}
                                            </span>
                                            <div className="text-[10px] text-slate-500">Quality</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Capital Settings */}
                        <div className="bg-slate-700/50 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-slate-400 mb-3">💰 CAPITAL SETTINGS</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Starting Capital</label>
                                    <input
                                        type="number"
                                        value={config.startingCapital}
                                        onChange={e => setConfig({ ...config, startingCapital: Number(e.target.value) })}
                                        className="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2 text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Position Size (₹)</label>
                                    <input
                                        type="number"
                                        value={config.positionSize}
                                        onChange={e => setConfig({ ...config, positionSize: Number(e.target.value) })}
                                        className="w-full bg-slate-600 border border-slate-500 rounded px-3 py-2 text-white"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Execution Mode */}
                        <div className="bg-slate-700/50 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-slate-400 mb-3">📊 EXECUTION MODE (Realistic Simulation)</h3>
                            <div className="grid grid-cols-2 gap-2">
                                {['INTRADAY_BOOST', 'HIGH_POWERED_STOCKS'].includes(selectedCategory) ? (
                                    /* Realistic execution modes for intraday */
                                    <>
                                        <button
                                            onClick={() => setConfig({ ...config, executionMode: 'perfect' })}
                                            className={`p-3 rounded-lg text-left transition-all ${config.executionMode === 'perfect'
                                                ? 'bg-cyan-600/40 border-2 border-cyan-500'
                                                : 'bg-slate-600/50 border-2 border-transparent hover:border-slate-500'
                                                }`}
                                        >
                                            <div className="font-semibold text-sm">✨ Take All Signals</div>
                                            <div className="text-xs text-slate-400">Unlimited capital, all signals executed</div>
                                        </button>
                                        <button
                                            onClick={() => setConfig({ ...config, executionMode: 'capital_lock' })}
                                            className={`p-3 rounded-lg text-left transition-all ${config.executionMode === 'capital_lock'
                                                ? 'bg-cyan-600/40 border-2 border-cyan-500'
                                                : 'bg-slate-600/50 border-2 border-transparent hover:border-slate-500'
                                                }`}
                                        >
                                            <div className="font-semibold text-sm">🔒 Capital Lock</div>
                                            <div className="text-xs text-slate-400">₹ locked until trade closes</div>
                                        </button>
                                        <button
                                            onClick={() => setConfig({ ...config, executionMode: 'max_1_position' })}
                                            className={`p-3 rounded-lg text-left transition-all ${config.executionMode === 'max_1_position'
                                                ? 'bg-cyan-600/40 border-2 border-cyan-500'
                                                : 'bg-slate-600/50 border-2 border-transparent hover:border-slate-500'
                                                }`}
                                        >
                                            <div className="font-semibold text-sm">1️⃣ Max 1 Position</div>
                                            <div className="text-xs text-slate-400">Only 1 trade at a time</div>
                                        </button>
                                        <button
                                            onClick={() => setConfig({ ...config, executionMode: 'max_3_positions' })}
                                            className={`p-3 rounded-lg text-left transition-all ${config.executionMode === 'max_3_positions'
                                                ? 'bg-cyan-600/40 border-2 border-cyan-500'
                                                : 'bg-slate-600/50 border-2 border-transparent hover:border-slate-500'
                                                }`}
                                        >
                                            <div className="font-semibold text-sm">3️⃣ Max 3 Positions</div>
                                            <div className="text-xs text-slate-400">Diversified intraday</div>
                                        </button>
                                    </>
                                ) : (
                                    /* Old execution modes for swing */
                                    [
                                        { value: 'perfect', label: '✨ Perfect', desc: 'Take all signals' },
                                        { value: 'conservative', label: '🛡️ Conservative', desc: 'Max 3 positions' },
                                        { value: 'tier1_only', label: '⭐ Tier 1 Only', desc: 'Only best signals' },
                                        { value: 'random_50', label: '🎲 Random 50%', desc: 'Test robustness' }
                                    ].map(mode => (
                                        <button
                                            key={mode.value}
                                            onClick={() => setConfig({ ...config, executionMode: mode.value })}
                                            className={`p-3 rounded-lg text-left transition-all ${config.executionMode === mode.value
                                                ? 'bg-cyan-600/40 border-2 border-cyan-500'
                                                : 'bg-slate-600/50 border-2 border-transparent hover:border-slate-500'
                                                }`}
                                        >
                                            <div className="font-semibold text-sm">{mode.label}</div>
                                            <div className="text-xs text-slate-400">{mode.desc}</div>
                                        </button>
                                    ))
                                )}
                            </div>

                            {/* Capital Lock Explanation */}
                            {config.executionMode === 'capital_lock' && (
                                <div className="mt-3 bg-orange-900/20 border border-orange-500/30 rounded p-2 text-xs text-orange-300">
                                    <strong>Capital Lock Mode:</strong> When you enter a position, that capital is locked.
                                    If another signal appears while capital is locked, it will be SKIPPED.
                                    This simulates real trading with limited funds.
                                </div>
                            )}
                            {config.executionMode === 'max_1_position' && (
                                <div className="mt-3 bg-yellow-900/20 border border-yellow-500/30 rounded p-2 text-xs text-yellow-300">
                                    <strong>Max 1 Position:</strong> Focus strategy - only 1 active trade at a time.
                                    New signals ignored until current trade closes at target/stop/EOD.
                                </div>
                            )}
                        </div>

                        {/* Quality Filter Toggle */}
                        <div className={`rounded-lg p-4 border ${config.applyQualityFilter ? 'bg-green-900/30 border-green-500/40' : 'bg-slate-700/50 border-slate-600'}`}>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.applyQualityFilter}
                                    onChange={e => setConfig({ ...config, applyQualityFilter: e.target.checked })}
                                    className="w-5 h-5 rounded border-slate-500 text-green-500 focus:ring-green-500 bg-slate-600"
                                />
                                <div>
                                    <div className="text-sm font-semibold text-white">🎯 Quality-First Mode {config.applyQualityFilter && <span className="text-green-400 text-xs ml-2">✓ RECOMMENDED</span>}</div>
                                    <div className="text-xs text-slate-400 mt-1">Skip LOW confidence, AVOID signals & AGAINST_TREND trades — focus on high-probability setups only</div>
                                    {!config.applyQualityFilter && <div className="text-xs text-yellow-400 mt-1">⚠️ Without quality filter, backtest includes all signals including low-quality ones</div>}
                                </div>
                            </label>
                        </div>

                        {/* Simulation Mode Toggle For Fast Replay */}
                        <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                            <h4 className="text-sm font-semibold mb-3">🎮 Fast Replay Simulation Mode</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <button
                                    onClick={() => setConfig({ ...config, simulationMode: 'ALL' })}
                                    className={`p-3 rounded-lg text-left transition-all ${config.simulationMode === 'ALL'
                                        ? 'bg-purple-600/40 border-2 border-purple-500'
                                        : 'bg-slate-800/50 border-2 border-transparent hover:border-slate-500'
                                        }`}
                                >
                                    <div className="font-semibold text-sm">🎯 Take All Signals</div>
                                    <div className="text-xs text-slate-400 mt-1">Simulate taking every single trade</div>
                                </button>
                                <button
                                    onClick={() => setConfig({ ...config, simulationMode: 'TOP_N_BY_SCORE' })}
                                    className={`p-3 rounded-lg text-left transition-all ${config.simulationMode === 'TOP_N_BY_SCORE'
                                        ? 'bg-purple-600/40 border-2 border-purple-500'
                                        : 'bg-slate-800/50 border-2 border-transparent hover:border-slate-500'
                                        }`}
                                >
                                    <div className="font-semibold text-sm">🏆 Top 3 by Score</div>
                                    <div className="text-xs text-slate-400 mt-1">Only take highest confidence picks daily</div>
                                </button>
                                <button
                                    onClick={() => setConfig({ ...config, simulationMode: 'MONKEY_RANDOM' })}
                                    className={`p-3 rounded-lg text-left transition-all ${config.simulationMode === 'MONKEY_RANDOM'
                                        ? 'bg-purple-600/40 border-2 border-purple-500'
                                        : 'bg-slate-800/50 border-2 border-transparent hover:border-slate-500'
                                        }`}
                                >
                                    <div className="font-semibold text-sm">🐒 Monkey Random</div>
                                    <div className="text-xs text-slate-400 mt-1">1000 random picks to measure luck factor</div>
                                </button>
                            </div>
                        </div>

                        {/* Start Button */}
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleBacktest}
                                disabled={loading}
                                className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 rounded-lg font-semibold text-lg transition-all disabled:opacity-50"
                            >
                                {loading ? '⏳ Preparing...' : '▶️ Start Time-Travel Backtest (Legacy Engine)'}
                            </button>
                            <button
                                onClick={handleReplay}
                                disabled={loading}
                                className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-lg font-semibold text-lg transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(168,85,247,0.4)]"
                            >
                                {loading ? '⏳ Replaying...' : '📺 Start V2 Fast Replay (1-Min Precision)'}
                            </button>
                        </div>
                    </div>
                )
                }

                {/* Phase 3: Running */}
                {
                    phase === 'running' && (
                        <div className="space-y-6">
                            <div className="bg-slate-700/50 rounded-lg p-6 text-center">
                                <h3 className="text-lg font-semibold mb-4">🚀 Simulation In Progress</h3>

                                {/* V1.0 progress (polling-based) */}
                                {backtestId && progress ? (
                                    <>
                                        <div className="text-3xl font-bold text-cyan-400 mb-2">
                                            {progress?.progress?.toFixed(1) || 0}%
                                        </div>
                                        <div className="w-full bg-slate-600 rounded-full h-3 mb-4">
                                            <div
                                                className="bg-gradient-to-r from-cyan-500 to-blue-500 h-3 rounded-full transition-all"
                                                style={{ width: `${progress?.progress || 0}%` }}
                                            />
                                        </div>
                                        {progress?.currentDate && (
                                            <div className="text-sm text-slate-400 mb-2">
                                                Simulating: {new Date(progress.currentDate).toLocaleDateString()}
                                            </div>
                                        )}
                                        <div className="grid grid-cols-2 gap-4 mt-4">
                                            <div className="bg-slate-600/50 rounded-lg p-3">
                                                <div className="text-2xl font-bold text-yellow-400">{progress?.totalSignals || 0}</div>
                                                <div className="text-xs text-slate-400">Signals Generated</div>
                                            </div>
                                            <div className="bg-slate-600/50 rounded-lg p-3">
                                                <div className="text-2xl font-bold text-green-400">{progress?.totalTrades || 0}</div>
                                                <div className="text-xs text-slate-400">Trades Executed</div>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    /* V2.1 / PRE_MARKET progress (indeterminate) */
                                    <>
                                        <div className="text-sm text-slate-300 mb-4">{runningMessage}</div>
                                        <div className="w-full bg-slate-600 rounded-full h-3 mb-4 overflow-hidden">
                                            <div
                                                className="bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 h-3 rounded-full"
                                                style={{
                                                    width: '40%',
                                                    animation: 'indeterminate 1.5s ease-in-out infinite'
                                                }}
                                            />
                                        </div>
                                        <style>{`
                                            @keyframes indeterminate {
                                                0% { transform: translateX(-100%); }
                                                100% { transform: translateX(350%); }
                                            }
                                        `}</style>
                                        <div className="grid grid-cols-3 gap-3 mt-4">
                                            <div className="bg-slate-600/50 rounded-lg p-3">
                                                <div className="text-lg font-bold text-cyan-400">📊</div>
                                                <div className="text-xs text-slate-400 mt-1">Fetching candle data</div>
                                            </div>
                                            <div className="bg-slate-600/50 rounded-lg p-3">
                                                <div className="text-lg font-bold text-purple-400">🔍</div>
                                                <div className="text-xs text-slate-400 mt-1">Scanning patterns</div>
                                            </div>
                                            <div className="bg-slate-600/50 rounded-lg p-3">
                                                <div className="text-lg font-bold text-green-400">📈</div>
                                                <div className="text-xs text-slate-400 mt-1">Simulating trades</div>
                                            </div>
                                        </div>
                                        <div className="text-xs text-slate-500 mt-4">
                                            This may take 30-60 seconds depending on the date range and number of stocks.
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )
                }

                {/* Phase 4: Results */}
                {
                    phase === 'results' && results && (
                        <div className="space-y-6">
                            {/* Summary */}
                            <div className={`bg-gradient-to-r ${results.run.returnPercent >= 0 ? 'from-green-900/30 to-cyan-900/30 border-green-500/40' : 'from-red-900/30 to-orange-900/30 border-red-500/40'} border rounded-lg p-6`}>
                                <h3 className="text-lg font-semibold mb-2">
                                    {results.run.totalTrades > 0 ? '✅ Backtest Complete!' : '⚠️ No Trades Generated'}
                                    {config.executionMode === 'perfect' && (
                                        <span className="ml-2 text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">Statistical Mode</span>
                                    )}
                                </h3>
                                <div className="text-sm text-slate-400 mb-3">
                                    📁 <span className="text-cyan-400 font-semibold">{results.run.categoryKey}</span>
                                    <span className="mx-2">•</span>
                                    {results.run.startDate?.split('T')[0]} → {results.run.endDate?.split('T')[0]}
                                    <span className="mx-2">•</span>
                                    {results.run.totalDays} trading days
                                </div>
                                {config.applyQualityFilter && (
                                    <div className="text-xs text-green-400 mb-3 flex items-center gap-2">
                                        <span className="bg-green-500/20 border border-green-500/30 px-2 py-0.5 rounded-full">🎯 Quality Filter ON</span>
                                        <span className="text-slate-400">Showing only HIGH & MEDIUM confidence trades</span>
                                    </div>
                                )}
                                {!config.applyQualityFilter && results.run.confidenceMetrics && (
                                    <div className="text-xs text-yellow-400 mb-3">
                                        ⚠️ Includes all signals —
                                        {(results.run.confidenceMetrics?.LOW?.total || 0) + (results.run.confidenceMetrics?.AVOID?.total || 0)} LOW/AVOID trades may be dragging down results
                                    </div>
                                )}
                                {results.run.results?.monkeyStats && (
                                    <div className="mt-4 bg-purple-900/30 border border-purple-500/40 rounded-lg p-4">
                                        <h4 className="text-sm font-semibold text-purple-300 mb-3 flex items-center justify-between">
                                            <span>🐒 Monkey Random Simulation ({results.run.results.monkeyStats.simulations} runs)</span>
                                        </h4>
                                        <div className="grid grid-cols-4 gap-4">
                                            <div className="bg-slate-800/50 rounded-md p-3 border border-slate-700">
                                                <div className="text-xs text-slate-400 mb-1">Average R</div>
                                                <div className={`text-lg font-bold ${results.run.results.monkeyStats.avgNetR > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    {results.run.results.monkeyStats.avgNetR > 0 ? '+' : ''}{results.run.results.monkeyStats.avgNetR}R
                                                </div>
                                            </div>
                                            <div className="bg-slate-800/50 rounded-md p-3 border border-slate-700">
                                                <div className="text-xs text-slate-400 mb-1">Best Case Luck</div>
                                                <div className="text-lg font-bold text-green-400">
                                                    +{results.run.results.monkeyStats.bestCase}R
                                                </div>
                                            </div>
                                            <div className="bg-slate-800/50 rounded-md p-3 border border-slate-700">
                                                <div className="text-xs text-slate-400 mb-1">Worst Case Luck</div>
                                                <div className="text-lg font-bold text-red-400">
                                                    {results.run.results.monkeyStats.worstCase}R
                                                </div>
                                            </div>
                                            <div className="bg-slate-800/50 rounded-md p-3 border border-slate-700">
                                                <div className="text-xs text-slate-400 mb-1">Top 5% Luck</div>
                                                <div className="text-lg font-bold text-cyan-400">
                                                    +{results.run.results.monkeyStats.percentile95}R
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <DashboardCard title="Total R Multiple" className="bg-slate-800/50">
                                    <div className={`mt-2 text-3xl font-bold ${results.run.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        {results.run.totalReturn > 0 ? '+' : ''}{results.run.totalReturn}R
                                    </div>
                                    <div className="text-xs text-slate-400 mt-1">
                                        {results.run.results?.modeInfo ? `Mode: ${results.run.results.modeInfo.mode}` : `Est. ₹${results.run.returnPercent.toLocaleString()}`}
                                    </div>
                                </DashboardCard>

                                <DashboardCard title="Win Rate (Trades)" className="bg-slate-800/50">
                                    <div className={`mt-2 text-3xl font-bold ${results.run.winRate >= 50 ? 'text-green-400' : results.run.winRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                                        {results.run.winRate.toFixed(1)}%
                                    </div>
                                    <div className="text-xs text-slate-400 mt-1">
                                        {results.run.winningTrades}W / {results.run.losingTrades}L
                                    </div>
                                </DashboardCard>

                                <DashboardCard title="Total Signals" className="bg-slate-800/50">
                                    <div className="mt-2 text-3xl font-bold text-blue-400">
                                        {results.run.totalSignals}
                                    </div>
                                    <div className="text-xs text-slate-400 mt-1">Generated in period</div>
                                </DashboardCard>

                                <DashboardCard title="Trades Simulated" className="bg-slate-800/50">
                                    <div className="mt-2 text-3xl font-bold text-purple-400">
                                        {results.run.totalTrades}
                                    </div>
                                    <div className="text-xs text-slate-400 mt-1">
                                        {results.run.totalTrades < results.run.totalSignals ? 'Filtered by mode' : 'All signals taken'}
                                    </div>
                                </DashboardCard>
                            </div>

                            {/* Warning if 0 trades */}
                            {results.run.totalTrades === 0 && (
                                <div className="bg-yellow-900/30 border border-yellow-500/40 rounded-lg p-4 text-yellow-400 text-sm">
                                    <strong>Why 0 trades?</strong> Possible reasons:
                                    <ul className="mt-2 list-disc list-inside text-xs">
                                        <li>No stocks passed technical validation (not at support, no breakdown pattern)</li>
                                        <li>All stocks had GREEN candles when strategy required RED candles</li>
                                        <li>Gap% was outside the required threshold range</li>
                                        <li>Volume was below the minimum required threshold</li>
                                        <li>Try extending the date range or check strategy filters</li>
                                    </ul>
                                </div>
                            )}


                            {/* Statistical Mode Metrics */}
                            {results.trades && results.trades.length > 0 && (() => {
                                const closedTrades = results.trades.filter((t: any) => t.outcome === 'WIN' || t.outcome === 'LOSS');
                                const winners = closedTrades.filter((t: any) => t.outcome === 'WIN');
                                const losers = closedTrades.filter((t: any) => t.outcome === 'LOSS');
                                const avgWin = winners.length > 0 ? winners.reduce((s: number, t: any) => s + (t.pnlPercent || 0), 0) / winners.length : 0;
                                const avgLoss = losers.length > 0 ? losers.reduce((s: number, t: any) => s + (t.pnlPercent || 0), 0) / losers.length : 0;
                                const totalWinPnl = winners.reduce((s: number, t: any) => s + Math.abs(t.pnlPercent || 0), 0);
                                const totalLossPnl = losers.reduce((s: number, t: any) => s + Math.abs(t.pnlPercent || 0), 0);
                                const profitFactor = totalLossPnl > 0 ? totalWinPnl / totalLossPnl : totalWinPnl > 0 ? Infinity : 0;
                                const expectedValue = closedTrades.length > 0 ? closedTrades.reduce((s: number, t: any) => s + (t.pnlPercent || 0), 0) / closedTrades.length : 0;
                                return (
                                    <div className="bg-slate-700/50 rounded-lg p-4">
                                        <h3 className="text-sm font-semibold text-slate-400 mb-3">📈 STRATEGY EDGE METRICS</h3>
                                        <div className="grid grid-cols-4 gap-4 text-center">
                                            <div className="bg-green-900/20 rounded-lg p-3">
                                                <div className="text-xl font-bold text-green-400">+{avgWin.toFixed(1)}%</div>
                                                <div className="text-xs text-slate-400">Avg Win</div>
                                            </div>
                                            <div className="bg-red-900/20 rounded-lg p-3">
                                                <div className="text-xl font-bold text-red-400">{avgLoss.toFixed(1)}%</div>
                                                <div className="text-xs text-slate-400">Avg Loss</div>
                                            </div>
                                            <div className="bg-cyan-900/20 rounded-lg p-3">
                                                <div className={`text-xl font-bold ${profitFactor >= 1.5 ? 'text-green-400' : profitFactor >= 1 ? 'text-yellow-400' : 'text-red-400'}`}>
                                                    {profitFactor === Infinity ? '∞' : profitFactor.toFixed(2)}
                                                </div>
                                                <div className="text-xs text-slate-400">Profit Factor</div>
                                            </div>
                                            <div className="bg-purple-900/20 rounded-lg p-3">
                                                <div className={`text-xl font-bold ${expectedValue >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    {expectedValue >= 0 ? '+' : ''}{expectedValue.toFixed(1)}%
                                                </div>
                                                <div className="text-xs text-slate-400">Expected/Trade</div>
                                            </div>
                                        </div>
                                        <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-center">
                                            <div className="text-slate-400">
                                                <span className="text-green-400 font-bold">{winners.length}</span> wins
                                            </div>
                                            <div className="text-slate-400">
                                                <span className="text-red-400 font-bold">{losers.length}</span> losses
                                            </div>
                                            <div className="text-slate-400">
                                                <span className="text-orange-400 font-bold">{results.trades.length - closedTrades.length}</span> still open
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Signal Analysis - Skip Report Summary */}
                            {results.run.results?.skipReport && results.run.results.skipReport.length > 0 && (() => {
                                const skipReport = results.run.results.skipReport;
                                const totalChecked = results.run.results.totalStocksChecked || 0;
                                const totalSignals = results.run.totalSignals || 0;
                                const totalSkipped = skipReport.length;
                                // Count skip reasons
                                const reasonCounts: Record<string, number> = {};
                                skipReport.forEach((s: any) => {
                                    const reason = s.reason || 'Unknown';
                                    // Normalize similar reasons
                                    const normalized = reason.length > 60 ? reason.substring(0, 57) + '...' : reason;
                                    reasonCounts[normalized] = (reasonCounts[normalized] || 0) + 1;
                                });
                                const sortedReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
                                return (
                                    <div className="bg-slate-700/50 rounded-lg p-4">
                                        <h3 className="text-sm font-semibold text-slate-400 mb-3">🔍 SIGNAL ANALYSIS</h3>
                                        <div className="grid grid-cols-3 gap-4 text-center mb-4">
                                            <div className="bg-blue-900/20 rounded-lg p-3">
                                                <div className="text-xl font-bold text-blue-400">{totalChecked}</div>
                                                <div className="text-xs text-slate-400">Stocks Checked</div>
                                            </div>
                                            <div className="bg-green-900/20 rounded-lg p-3">
                                                <div className="text-xl font-bold text-green-400">{totalSignals}</div>
                                                <div className="text-xs text-slate-400">
                                                    Signals ({totalChecked > 0 ? ((totalSignals / totalChecked) * 100).toFixed(0) : 0}%)
                                                </div>
                                            </div>
                                            <div className="bg-orange-900/20 rounded-lg p-3">
                                                <div className="text-xl font-bold text-orange-400">{totalSkipped}</div>
                                                <div className="text-xs text-slate-400">
                                                    Skipped ({totalChecked > 0 ? ((totalSkipped / totalChecked) * 100).toFixed(0) : 0}%)
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-xs text-slate-400 mb-2 font-semibold">TOP SKIP REASONS:</div>
                                        <div className="space-y-1">
                                            {sortedReasons.map(([reason, count], idx) => (
                                                <div key={idx} className="flex justify-between text-xs">
                                                    <span className="text-slate-300 truncate mr-2">• {reason}</span>
                                                    <span className="text-orange-400 font-mono whitespace-nowrap">{count} stocks</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Detailed Stats */}
                            <div className="bg-slate-700/50 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-slate-400 mb-3">📊 DETAILED STATISTICS</h3>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    {config.executionMode !== 'perfect' && (
                                        <>
                                            <div className="flex justify-between">
                                                <span className="text-slate-400">Starting Capital</span>
                                                <span className="font-mono">₹{results.run.startingCapital?.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-400">Final Capital</span>
                                                <span className={`font-mono ${(results.run.results?.finalCapital || results.run.startingCapital) >= results.run.startingCapital ? 'text-green-400' : 'text-red-400'}`}>
                                                    ₹{(results.run.results?.finalCapital || results.run.startingCapital)?.toLocaleString()}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Days Simulated</span>
                                        <span className="font-mono">{results.run.totalDays || 0}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Total Signals</span>
                                        <span className="font-mono">{results.run.totalSignals || 0}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Max Drawdown</span>
                                        <span className="font-mono text-red-400">-{results.run.maxDrawdown?.toFixed(1) || 0}%</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Sharpe Ratio</span>
                                        <span className="font-mono">{results.run.sharpeRatio?.toFixed(2) || 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Winning Trades</span>
                                        <span className="font-mono text-green-400">{results.run.winningTrades || 0}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400">Losing Trades</span>
                                        <span className="font-mono text-red-400">{results.run.losingTrades || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Confidence Metrics */}
                            {results.run.confidenceMetrics && (
                                <div className="bg-slate-700/50 rounded-lg p-4">
                                    <h3 className="text-sm font-semibold text-slate-400 mb-3">🎯 WIN RATE BY CONFIDENCE</h3>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead>
                                                <tr className="text-slate-400 border-b border-slate-600/50 text-xs">
                                                    <th className="pb-2 font-medium">Confidence</th>
                                                    <th className="pb-2 text-right font-medium">Trades</th>
                                                    <th className="pb-2 text-right font-medium">Win Rate</th>
                                                    <th className="pb-2 text-right font-medium">Avg PnL</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-700/50">
                                                {Object.entries(results.run.confidenceMetrics).map(([key, metric]) => (
                                                    metric.total > 0 && (
                                                        <tr key={key} className="text-sm">
                                                            <td className="py-2.5 font-semibold">
                                                                <span className={`px-2 py-0.5 rounded text-[11px] font-bold tracking-wider ${key === 'HIGH' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                                                    key === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                                                        'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                                                    }`}>
                                                                    {key}
                                                                </span>
                                                            </td>
                                                            <td className="py-2.5 text-right font-mono text-slate-300">{metric.total}</td>
                                                            <td className={`py-2.5 text-right font-mono font-bold ${metric.winRate >= 50 ? 'text-green-400' : 'text-slate-400'}`}>
                                                                {metric.winRate.toFixed(1)}%
                                                            </td>
                                                            <td className={`py-2.5 text-right font-mono font-bold ${metric.avgPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                {metric.avgPnl >= 0 ? '+' : ''}{metric.avgPnl.toFixed(2)}%
                                                            </td>
                                                        </tr>
                                                    )
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Trades by Tier */}
                            <div className="bg-slate-700/50 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-slate-400 mb-3">📈 TRADES BY TIER</h3>
                                <div className="grid grid-cols-3 gap-4 text-center">
                                    <div className="bg-green-900/30 rounded-lg p-3">
                                        <div className="text-2xl font-bold text-green-400">
                                            {results.run.results?.tradesByTier?.tier1 || 0}
                                        </div>
                                        <div className="text-xs text-slate-400">Tier 1 (Premium)</div>
                                    </div>
                                    <div className="bg-yellow-900/30 rounded-lg p-3">
                                        <div className="text-2xl font-bold text-yellow-400">
                                            {results.run.results?.tradesByTier?.tier2 || 0}
                                        </div>
                                        <div className="text-xs text-slate-400">Tier 2 (Standard)</div>
                                    </div>
                                    <div className="bg-orange-900/30 rounded-lg p-3">
                                        <div className="text-2xl font-bold text-orange-400">
                                            {results.run.results?.tradesByTier?.tier3 || 0}
                                        </div>
                                        <div className="text-xs text-slate-400">Tier 3 (Caution)</div>
                                    </div>
                                </div>
                            </div>

                            {/* Trade Log Table */}
                            {results.trades && results.trades.length > 0 && (
                                <div className="bg-slate-700/50 rounded-lg p-4">
                                    <div className="flex justify-between items-center mb-3">
                                        <h3 className="text-sm font-semibold text-slate-400">📋 TRADE LOG</h3>
                                        <button
                                            onClick={() => setShowTradeLog(!showTradeLog)}
                                            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                                        >
                                            {showTradeLog ? '▲ Collapse' : `▼ Show ${results.trades.length} trades`}
                                        </button>
                                    </div>
                                    {showTradeLog && (
                                        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                                            <table className="w-full text-xs text-left">
                                                <thead className="sticky top-0 bg-slate-800">
                                                    <tr className="text-slate-400 border-b border-slate-600/50">
                                                        <th className="pb-2 pr-2 font-medium">#</th>
                                                        <th className="pb-2 pr-2 font-medium">Date</th>
                                                        <th className="pb-2 pr-2 font-medium">Symbol</th>
                                                        <th className="pb-2 pr-2 text-right font-medium">Entry</th>
                                                        <th className="pb-2 pr-2 text-right font-medium">Exit</th>
                                                        <th className="pb-2 pr-2 font-medium">Reason</th>
                                                        <th className="pb-2 pr-2 text-right font-medium">P&L%</th>
                                                        <th className="pb-2 pr-2 font-medium">Result</th>
                                                        <th className="pb-2 font-medium">Quality</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-700/30">
                                                    {results.trades.map((t: any, i: number) => (
                                                        <tr key={i} className={`${t.outcome === 'WIN' ? 'bg-green-900/10' : t.outcome === 'LOSS' ? 'bg-red-900/10' : ''} hover:bg-slate-600/30 transition-colors`}>
                                                            <td className="py-1.5 pr-2 text-slate-500 font-mono">{i + 1}</td>
                                                            <td className="py-1.5 pr-2 text-slate-300 font-mono">{t.entryDate || t.signalDate}</td>
                                                            <td className="py-1.5 pr-2 text-white font-semibold">{t.symbol}</td>
                                                            <td className="py-1.5 pr-2 text-right text-slate-300 font-mono">₹{Number(t.entryPrice)?.toFixed(2)}</td>
                                                            <td className="py-1.5 pr-2 text-right text-slate-300 font-mono">{t.exitPrice ? `₹${Number(t.exitPrice)?.toFixed(2)}` : '-'}</td>
                                                            <td className="py-1.5 pr-2 text-slate-400">{t.exitReason || '-'}</td>
                                                            <td className={`py-1.5 pr-2 text-right font-mono font-bold ${(t.pnlPercent || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                                {(t.pnlPercent || 0) >= 0 ? '+' : ''}{Number(t.pnlPercent || 0).toFixed(2)}%
                                                            </td>
                                                            <td className="py-1.5 pr-2">
                                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.outcome === 'WIN' ? 'bg-green-500/20 text-green-400' : t.outcome === 'LOSS' ? 'bg-red-500/20 text-red-400' : 'bg-slate-500/20 text-slate-400'}`}>
                                                                    {t.outcome || 'OPEN'}
                                                                </span>
                                                            </td>
                                                            <td className="py-1.5">
                                                                {t.confidence && (
                                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.confidence === 'HIGH' ? 'bg-green-500/20 text-green-400' :
                                                                        t.confidence === 'MEDIUM' ? 'bg-yellow-500/20 text-yellow-400' :
                                                                            'bg-orange-500/20 text-orange-400'
                                                                        }`}>
                                                                        {t.confidence}
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3 flex-wrap">
                                <button
                                    onClick={downloadCSV}
                                    className="flex-1 py-2 bg-green-600 hover:bg-green-500 rounded-lg transition-all text-sm"
                                >
                                    📥 Download CSV
                                </button>
                                {results.run.results?.skipReport && (
                                    <button
                                        onClick={downloadSkippedCSV}
                                        className="flex-1 py-2 bg-orange-900/50 hover:bg-orange-800/50 border border-orange-500/30 rounded-lg text-sm text-orange-200 font-medium transition-colors"
                                    >
                                        ⚠️ Skip Report
                                    </button>
                                )}
                                <button
                                    onClick={() => { setPhase('config'); setError(null); }}
                                    className="flex-1 py-2 bg-purple-600/50 hover:bg-purple-500/50 border border-purple-500/30 rounded-lg text-sm transition-all"
                                >
                                    ⚙️ Tweak & Re-run
                                </button>
                                <button
                                    onClick={resetModal}
                                    className="flex-1 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg transition-all text-sm"
                                >
                                    🔄 New Test
                                </button>
                                <button
                                    onClick={onClose}
                                    className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-all text-sm"
                                >
                                    ✅ Done
                                </button>
                            </div>
                        </div>
                    )
                }
            </div >
        </div >
    );
};

export default TimeTravelBacktestModal;
