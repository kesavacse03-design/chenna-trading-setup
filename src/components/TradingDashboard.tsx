import React, { useState, useEffect, useCallback } from 'react';
import DashboardCard from './DashboardCard';
import TimeTravelBacktestModal from './TimeTravelBacktestModal';
import IBWatchlist from './IBWatchlist';

import APIUsageWidget from './APIUsageWidget';
import StrategyLogicModal from './StrategyLogicModal';
import SettingsModal, { Settings } from './SettingsModal';

// Types
interface TradingSignal {
    id: number;
    signalId: string;
    categoryKey: string;
    type: string; // direction: LONG or SHORT
    direction?: string; // actual direction field from DB
    macd1hState?: string; // fallback direction
    symbol: string;
    signalDate: string;
    entryPrice: number;
    targetPrice: number; // T1 (legacy)
    t1Price?: number;    // T1 target
    t2Price?: number;    // T2 target
    niftyClose?: number; // T2 fallback (schema mapped)
    stopPrice: number;
    confidenceScore: number;
    tier: number;
    tierName: string;
    suggestedPositionSize: number;
    suggestedQuantity: number;
    userAction: string | null;
    entryChecklist: null;
    category?: string; // signal category (INTRADAY_BOOST etc.)
    meta?: any; // JSON meta field (entry ranges, etc.)
    lifecycle?: { daysTracked: number; maxDays: number; pctUsed: number; isExpiring: boolean; type: string };
    // NEW: Live trading fields
    signalTime: string | null;     // '10:21 AM'
    ageMinutes: number | null;     // minutes since signal fired
    ltp: number | null;            // current live price
    distancePct: number | null;    // % from entry
    opportunityStatus: string;     // LIVE/PARTIAL/GONE/WAITING/UNKNOWN
    entryType: string;             // RUNNER/RETEST/RETEST_FAILED
}

interface Position {
    id: string;
    symbol: string;
    categoryKey: string;
    entryPrice: number;
    createdAt: string;
    quantity: number;
    positionValue: number;
    targetPrice: number;
    stopPrice: number;
    status: string;
    daysRemaining: number;
    daysHeld: number;
    currentPnL: number;
    currentPnLPercent: number;
}

interface DashboardSummary {
    date: string;
    marketState: {
        day: string;
        month: string;
        isValidSwingDay: boolean;
        isAvoidMonth: boolean;
        tradingStatus: string;
    };
    signals: {
        total: number;
        taken: number;
        skipped: number;
        pending: number;
    };
    positions: {
        total: number;
        totalExposure: number;
        day3Alerts: number;
    };
}

// AI Analysis Types
interface AIPick {
    symbol: string;
    rank: number;
    confidence: string;
    reasoning: string;
    riskFactors?: string;
    suggestedSize?: string;
}

interface AIAvoid {
    symbol: string;
    reasoning: string;
}

interface AIAnalysisData {
    date: string;
    marketAnalysis: string;
    topPicks: AIPick[];
    mediumTier?: AIPick[];
    avoid: AIAvoid[];
}

const API_BASE = 'http://localhost:3001/api/v5'; // Point to new V5 system

// Signals Watchlist Component

const SignalsWatchlist: React.FC<{
    signals: TradingSignal[];
    marketPhase: MarketPhase;
    onMarkEntered: (signal: TradingSignal) => void;
    onSkip: (signal: TradingSignal, reason: string) => void;
    onOpenSettings: () => void;
}> = ({ signals, marketPhase, onMarkEntered, onSkip, onOpenSettings }) => {

    // --- Opportunity Status Display ---
    const getStatusDisplay = (status: string) => {
        switch (status) {
            case 'LIVE': return { icon: '🟢', label: 'LIVE', color: 'text-green-400', bg: 'bg-green-500/20' };
            case 'PARTIAL': return { icon: '🟡', label: 'PARTIAL', color: 'text-yellow-400', bg: 'bg-yellow-500/20' };
            case 'GONE': return { icon: '🔴', label: 'GONE', color: 'text-red-400', bg: 'bg-red-500/20' };
            case 'WAITING': return { icon: '⏳', label: 'WAITING', color: 'text-blue-400', bg: 'bg-blue-500/20' };
            case 'EXPIRED': return { icon: '⏰', label: 'EXPIRED', color: 'text-slate-500', bg: 'bg-slate-500/20' };
            case 'T1_HIT': return { icon: '🎯', label: 'T1 HIT', color: 'text-emerald-400', bg: 'bg-emerald-500/20' };
            case 'T2_HIT': return { icon: '🔥', label: 'T2 HIT', color: 'text-emerald-300', bg: 'bg-emerald-500/30' };
            case 'STOPPED': return { icon: '🛑', label: 'STOP HIT', color: 'text-red-500', bg: 'bg-red-500/20' };
            default: return { icon: '❓', label: '—', color: 'text-slate-500', bg: 'bg-slate-500/20' };
        }
    };

    // --- Signal Age Color ---
    const getAgeColor = (mins: number | null) => {
        if (mins === null) return 'text-slate-500';
        if (mins < 15) return 'text-green-400';   // Fresh, tradeable
        if (mins < 45) return 'text-yellow-400';  // May still work
        return 'text-red-400';                    // Likely gone
    };

    const formatAge = (mins: number | null) => {
        if (mins === null) return '—';
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${h}h ${m}m ago`;
    };

    // --- Recency-Weighted Ranking ---
    const getRecencyMultiplier = (mins: number | null) => {
        if (mins === null) return 1.0;
        if (mins < 5) return 1.5;
        if (mins < 15) return 1.2;
        if (mins < 30) return 1.0;
        if (mins < 60) return 0.7;
        return 0.3;
    };

    // Filter out acted-upon signals, sort by priority (score × recency), exclude GONE
    const activeSignals = signals
        .filter(s => !s.userAction)
        .map(s => ({
            ...s,
            priority: (s.confidenceScore * 100) * getRecencyMultiplier(s.ageMinutes)
        }))
        .sort((a, b) => {
            // GONE signals go to the bottom
            if (a.opportunityStatus === 'GONE' && b.opportunityStatus !== 'GONE') return 1;
            if (b.opportunityStatus === 'GONE' && a.opportunityStatus !== 'GONE') return -1;
            return b.priority - a.priority;
        });

    return (
        <DashboardCard
            title="📊 Live Signals"
            className="overflow-hidden"
            action={
                <div className="flex gap-2">
                    <span className="text-xs text-slate-400 self-center">
                        {activeSignals.filter(s => s.opportunityStatus === 'LIVE' || s.opportunityStatus === 'WAITING').length} tradeable
                    </span>
                    <button
                        onClick={onOpenSettings}
                        className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded flex items-center gap-2 transition-colors border border-slate-600"
                    >
                        ⚙️
                    </button>
                </div>
            }
        >
            <div className="overflow-x-auto">
                {activeSignals.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="text-4xl mb-3">📊</div>
                        <div className="text-slate-400 font-medium text-sm mb-1">
                            {marketPhase === 'CLOSED' || marketPhase === 'PRE_MARKET'
                                ? 'Market Closed — No Active Signals'
                                : marketPhase === 'OR_FORMING'
                                    ? 'Opening Range Forming — Scanning...'
                                    : 'No Signals Yet'}
                        </div>
                        <div className="text-slate-600 text-xs">
                            {marketPhase === 'CLOSED' || marketPhase === 'PRE_MARKET'
                                ? 'Use the date filter above to review past trading days'
                                : 'Signals will appear as IB stocks break their Opening Range'}
                        </div>
                    </div>
                ) : (
                    <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-slate-800/95 backdrop-blur-sm z-10">
                            <tr className="border-b border-slate-600">
                                <th className="px-2 py-1.5 font-semibold text-slate-400 w-8">#</th>
                                <th className="px-2 py-1.5 font-semibold text-slate-400">Symbol</th>
                                <th className="px-2 py-1.5 font-semibold text-slate-400">Cat</th>
                                <th className="px-2 py-1.5 font-semibold text-slate-400 text-center">Dir</th>
                                <th className="px-2 py-1.5 font-semibold text-slate-400">Signal Time</th>
                                <th className="px-2 py-1.5 font-semibold text-slate-400 text-center">Status</th>
                                <th className="px-2 py-1.5 font-semibold text-slate-400 text-right">Entry</th>
                                <th className="px-2 py-1.5 font-semibold text-slate-400 text-right">Current</th>
                                <th className="px-2 py-1.5 font-semibold text-slate-400 text-right">Dist</th>
                                <th className="px-2 py-1.5 font-semibold text-slate-400 text-right">Stop</th>
                                <th className="px-2 py-1.5 font-semibold text-slate-400 text-right">T1</th>
                                <th className="px-2 py-1.5 font-semibold text-slate-400 text-right">T2</th>
                                <th className="px-2 py-1.5 font-semibold text-slate-400 text-center">Score</th>
                                <th className="px-2 py-1.5 font-semibold text-slate-400 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activeSignals.map((signal, index) => {
                                const isTop3 = index < 3 && signal.opportunityStatus !== 'GONE';
                                const statusInfo = getStatusDisplay(signal.opportunityStatus);
                                const isLong = (signal.direction || signal.type || signal.macd1hState) === 'LONG';
                                const isTradeable = signal.opportunityStatus === 'LIVE' || signal.opportunityStatus === 'PARTIAL' || signal.opportunityStatus === 'WAITING';
                                const isGone = signal.opportunityStatus === 'GONE';

                                return (
                                    <tr
                                        key={signal.signalId || signal.id}
                                        className={`border-b transition-colors ${isGone ? 'border-slate-800 opacity-40 hover:opacity-60' :
                                            isTop3 ? 'border-cyan-500/30 bg-cyan-950/20 hover:bg-cyan-900/20' :
                                                'border-slate-700/50 hover:bg-slate-800/40'
                                            }`}
                                    >
                                        {/* Rank */}
                                        <td className="px-2 py-1.5 font-mono font-bold text-center">
                                            {isTop3 ? <span className="text-cyan-400 text-sm">#{index + 1}</span> : <span className="text-slate-600">{index + 1}</span>}
                                        </td>

                                        {/* Symbol + Type badge */}
                                        <td className="px-2 py-1.5">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-mono font-bold text-sm text-slate-100">{signal.symbol}</span>
                                                <span className={`px-1 py-0.5 text-[10px] font-bold rounded ${signal.entryType === 'RUNNER' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                                    {signal.entryType || 'RETEST'}
                                                </span>
                                                {/* AI Rank Badges */}
                                                {(() => {
                                                    const meta = signal.meta as any;
                                                    if (!meta?.aiConfidence) return null;
                                                    const rank = meta.aiRank;
                                                    const size = meta.aiSize;

                                                    if (meta.aiAvoid) {
                                                        return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-500/30 text-red-400 border border-red-500/50" title={meta.aiReason}>⚠ SKIP</span>;
                                                    }
                                                    if (rank === 1) return <><span className="text-base" title={meta.aiReason}>🥇</span><span className="px-1 py-0.5 text-[10px] font-bold rounded bg-emerald-500/30 text-emerald-300">{size}</span></>;
                                                    if (rank === 2) return <><span className="text-base" title={meta.aiReason}>🥈</span><span className="px-1 py-0.5 text-[10px] font-bold rounded bg-emerald-500/30 text-emerald-300">{size}</span></>;
                                                    if (rank === 3) return <><span className="text-base" title={meta.aiReason}>🥉</span><span className="px-1 py-0.5 text-[10px] font-bold rounded bg-emerald-500/30 text-emerald-300">{size}</span></>;
                                                    if (rank > 0 && rank < 50) return <><span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-green-500/25 text-green-400 border border-green-500/40" title={meta.aiReason}>#{rank} TOP</span><span className="px-1 py-0.5 text-[10px] font-bold rounded bg-emerald-500/30 text-emerald-300">{size}</span></>;
                                                    if (rank === 50) return <><span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-yellow-500/25 text-yellow-400 border border-yellow-500/40" title={meta.aiReason}>MED</span><span className="px-1 py-0.5 text-[10px] font-bold rounded bg-yellow-500/20 text-yellow-300">{size}</span></>;
                                                    return null;
                                                })()}
                                            </div>
                                        </td>

                                        {/* Category badge */}
                                        <td className="px-2 py-1.5">
                                            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded whitespace-nowrap ${signal.categoryKey?.includes('INTRADAY') ? 'bg-yellow-500/20 text-yellow-400' :
                                                signal.categoryKey?.includes('ST_SWING') && signal.categoryKey?.includes('UP') ? 'bg-blue-500/20 text-blue-400' :
                                                    signal.categoryKey?.includes('LT_SWING') && signal.categoryKey?.includes('UP') ? 'bg-green-500/20 text-green-400' :
                                                        signal.categoryKey?.includes('DOWN') ? 'bg-red-500/20 text-red-400' :
                                                            'bg-slate-500/20 text-slate-400'
                                                }`}>
                                                {signal.categoryKey === 'INTRADAY_BOOST' ? '🟡 INTRA' :
                                                    signal.categoryKey === 'SHORT_TERM_SWING_BO_UP' ? '🔵 ST↑' :
                                                        signal.categoryKey === 'LONG_TERM_SWING_BO_UP' ? '🟢 LT↑' :
                                                            signal.categoryKey === 'SHORT_TERM_SWING_BO_DOWN' ? '🔴 ST↓' :
                                                                signal.categoryKey?.slice(0, 6) || '—'}
                                            </span>
                                        </td>

                                        {/* Direction */}
                                        <td className="px-2 py-1.5 text-center">
                                            <span className={`font-bold text-sm ${isLong ? 'text-green-400' : 'text-red-400'}`}>
                                                {isLong ? '▲ LONG' : '▼ SHORT'}
                                            </span>
                                        </td>

                                        {/* Signal Time + Age */}
                                        <td className="px-2 py-1.5">
                                            <div className="flex flex-col">
                                                <span className="text-slate-300 text-xs">{signal.signalTime || '—'}</span>
                                                <span className={`text-[10px] ${getAgeColor(signal.ageMinutes)}`}>
                                                    {formatAge(signal.ageMinutes)}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Opportunity Status */}
                                        <td className="px-2 py-1.5 text-center">
                                            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${statusInfo.bg} ${statusInfo.color}`}>
                                                {statusInfo.icon} {statusInfo.label}
                                            </span>
                                        </td>

                                        {/* Entry Price */}
                                        <td className="px-2 py-1.5 text-right font-mono">
                                            <div className="text-slate-200">₹{signal.entryPrice.toFixed(1)}</div>
                                            {(signal.meta as any)?.entryRangeMin && (signal.meta as any)?.entryRangeMax && (
                                                <div className="text-[10px] text-slate-500 mt-0.5">
                                                    {isLong ? `Max: ₹${(signal.meta as any).entryRangeMax.toFixed(1)}` : `Min: ₹${(signal.meta as any).entryRangeMin.toFixed(1)}`}
                                                </div>
                                            )}
                                        </td>

                                        {/* Current (LTP) */}
                                        <td className="px-2 py-1.5 text-right font-mono">
                                            {signal.ltp ? (() => {
                                                const min = (signal.meta as any)?.entryRangeMin;
                                                const max = (signal.meta as any)?.entryRangeMax;

                                                let colorClass = signal.distancePct !== null && signal.distancePct >= 0 ? 'text-green-400' : 'text-red-400';

                                                if (min && max) {
                                                    if (isLong) {
                                                        if (signal.ltp < min) colorClass = 'text-cyan-400'; // better than entry
                                                        else if (signal.ltp <= max) colorClass = 'text-green-400'; // within buffer
                                                        else colorClass = 'text-red-400'; // too far
                                                    } else {
                                                        if (signal.ltp > max) colorClass = 'text-cyan-400'; // better than entry
                                                        else if (signal.ltp >= min) colorClass = 'text-green-400'; // within buffer
                                                        else colorClass = 'text-red-400'; // too far
                                                    }
                                                }

                                                return (
                                                    <span className={colorClass}>
                                                        ₹{signal.ltp.toFixed(1)}
                                                    </span>
                                                );
                                            })() : <span className="text-slate-600">—</span>}
                                        </td>

                                        {/* Distance % */}
                                        <td className="px-2 py-1.5 text-right font-mono">
                                            {signal.distancePct !== null ? (
                                                <span className={signal.distancePct >= 0 ? 'text-green-400' : 'text-red-400'}>
                                                    {signal.distancePct > 0 ? '+' : ''}{signal.distancePct.toFixed(2)}%
                                                </span>
                                            ) : <span className="text-slate-600">—</span>}
                                        </td>

                                        {/* Stop */}
                                        <td className="px-2 py-1.5 text-right font-mono text-red-400/70">
                                            ₹{signal.stopPrice.toFixed(1)}
                                        </td>

                                        {/* T1 Target */}
                                        <td className="px-2 py-1.5 text-right font-mono text-green-400/70">
                                            {(signal.t1Price || signal.targetPrice) > 0 ? `₹${(signal.t1Price || signal.targetPrice).toFixed(1)}` : '—'}
                                        </td>

                                        {/* T2 Target */}
                                        <td className="px-2 py-1.5 text-right font-mono text-green-400/50">
                                            {signal.t2Price && Number(signal.t2Price) > 0 ? `₹${Number(signal.t2Price).toFixed(1)}` : '—'}
                                        </td>

                                        {/* Score */}
                                        <td className="px-2 py-1.5 text-center">
                                            {(() => {
                                                const score = signal.confidenceScore >= 1 ? signal.confidenceScore : signal.confidenceScore * 100;
                                                const scoreNum = Math.round(score);
                                                const colorClass = scoreNum >= 65
                                                    ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-[0_0_6px_rgba(16,185,129,0.3)]'
                                                    : scoreNum >= 40
                                                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                                        : 'bg-slate-700/50 text-slate-400 border-slate-600/40';
                                                return (
                                                    <span className={`inline-block px-2 py-0.5 text-xs font-bold font-mono rounded-full border ${colorClass}`}>
                                                        {scoreNum}
                                                    </span>
                                                );
                                            })()}
                                        </td>

                                        {/* Action */}
                                        <td className="px-2 py-1.5 text-center">
                                            {isTradeable ? (
                                                <div className="flex gap-1 justify-center">
                                                    <button
                                                        disabled={marketPhase !== 'ACTIVE_TRADING'}
                                                        onClick={() => onMarkEntered(signal)}
                                                        className={`px-2 py-1 text-xs rounded transition-all font-semibold ${marketPhase !== 'ACTIVE_TRADING'
                                                            ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                                                            : isTop3
                                                                ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                                                                : 'bg-emerald-600/80 hover:bg-emerald-500 text-white'
                                                            }`}
                                                    >
                                                        {marketPhase !== 'ACTIVE_TRADING' ? 'Disabled' : (isTop3 ? '⭐ Enter' : '✅ Enter')}
                                                    </button>
                                                    <button
                                                        onClick={() => onSkip(signal, 'MANUAL_SKIP')}
                                                        className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                                                        title="Skip Trade"
                                                    >
                                                        Skip
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    disabled
                                                    className="px-2 py-1 text-xs rounded bg-slate-700/50 text-slate-500 cursor-not-allowed w-full"
                                                >
                                                    {signal.opportunityStatus === 'GONE' ? 'Missed' : signal.userAction === 'REJECTED' ? 'Skipped' : 'Done'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </DashboardCard>
    );
};

// Active Positions Component
const ActivePositions: React.FC<{
    positions: Position[];
    onClose: (position: Position) => void;
}> = ({ positions, onClose }) => {
    const getPnLColor = (pnl: number) => pnl >= 0 ? 'text-green-400' : 'text-red-400';
    const getDayColor = (daysHeld: number) => {
        if (daysHeld >= 3) return 'text-red-400 font-bold';
        if (daysHeld >= 2) return 'text-yellow-400';
        return 'text-slate-300';
    };

    // Format category for display
    const formatCategory = (categoryKey: string | null) => {
        if (!categoryKey) return 'UNKNOWN';

        // Map known category keys to shorter display names
        const categoryMap: Record<string, string> = {
            'INTRADAY_BOOST': 'INTRADAY_BOOST',
            'HIGH_POWERED_STOCKS': 'HIGH_POWERED',
            'SHORT_TERM_SWING_BO_DOWN': 'SWING_BO_DOWN',
            'SHORT_TERM_SWING_BO_UP': 'SWING_BO_UP',
            '50_DAY_HIGH_BREAKOUT': '50D_HIGH_BO',
            'DOWNSIDE_LOM_SWING': 'LOM_SWING_DN',
            'UPSIDE_LOM_SWING': 'LOM_SWING_UP',
            'DOWNSIDE_LOM_INTRA': 'LOM_INTRA_DN',
            'UPSIDE_LOM_INTRA': 'LOM_INTRA_UP'
        };

        return categoryMap[categoryKey] || categoryKey.replace(/_/g, ' ').slice(0, 20);
    };

    // Get category badge color
    const getCategoryColor = (categoryKey: string | null) => {
        if (!categoryKey) return 'bg-slate-500/30 text-slate-400';
        if (categoryKey.includes('INTRADAY') || categoryKey.includes('INTRA'))
            return 'bg-orange-500/30 text-orange-400';
        if (categoryKey.includes('HIGH_POWERED'))
            return 'bg-cyan-500/30 text-cyan-400';
        return 'bg-purple-500/30 text-purple-400';
    };

    return (
        <DashboardCard title="📈 Active Positions" className="overflow-hidden">
            <div className="overflow-y-auto max-h-96">
                {positions.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                        No active positions
                    </div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 bg-slate-800/80 backdrop-blur-sm z-10">
                            <tr className="border-b border-slate-600">
                                <th className="p-2 font-semibold text-slate-400">Symbol</th>
                                <th className="p-2 font-semibold text-slate-400">Category</th>
                                <th className="p-2 font-semibold text-slate-400 text-right">Time</th>
                                <th className="p-2 font-semibold text-slate-400 text-right">Entry</th>
                                <th className="p-2 font-semibold text-slate-400 text-right">Target</th>
                                <th className="p-2 font-semibold text-slate-400 text-right">Stop</th>
                                <th className="p-2 font-semibold text-slate-400 text-center">Day</th>
                                <th className="p-2 font-semibold text-slate-400 text-right">P&L</th>
                                <th className="p-2 font-semibold text-slate-400 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {positions.map(pos => (
                                <tr key={pos.id} className="border-b border-slate-700 hover:bg-slate-800/60">
                                    <td className="p-2 font-mono font-semibold">{pos.symbol}</td>
                                    <td className="p-2">
                                        <span className={`px-2 py-1 rounded text-xs font-semibold ${getCategoryColor(pos.categoryKey)}`}>
                                            {formatCategory(pos.categoryKey)}
                                        </span>
                                    </td>
                                    <td className="p-2 text-right font-mono text-slate-400">
                                        {new Date(pos.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td className="p-2 text-right font-mono">₹{Number(pos.entryPrice).toFixed(2)}</td>
                                    <td className="p-2 text-right font-mono text-green-400">₹{Number(pos.targetPrice).toFixed(2)}</td>
                                    <td className="p-2 text-right font-mono text-red-400">₹{Number(pos.stopPrice).toFixed(2)}</td>
                                    <td className={`p-2 text-center font-mono ${getDayColor(pos.daysHeld)}`}>
                                        D{pos.daysHeld}
                                    </td>
                                    <td className={`p-2 text-right font-mono ${getPnLColor(Number(pos.currentPnL))}`}>
                                        {Number(pos.currentPnL) >= 0 ? '+' : ''}₹{Number(pos.currentPnL).toFixed(0)}
                                    </td>
                                    <td className="p-2 text-center">
                                        <button
                                            onClick={() => onClose(pos)}
                                            className="px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 rounded transition-colors"
                                        >
                                            🎯 Close
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </DashboardCard>
    );
};

// Position Entry Modal — Smart Position Sizing
const DEFAULT_MAX_RISK = 1500;
const DEFAULT_MAX_POSITION = 15000;

const PositionEntryModal: React.FC<{
    signal: TradingSignal;
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { entryPrice: number; quantity: number; notes: string }) => void;
}> = ({ signal, isOpen, onClose, onSubmit }) => {
    const [userEntry, setUserEntry] = useState(signal.entryPrice);
    const [maxRisk, setMaxRisk] = useState(DEFAULT_MAX_RISK);
    const [maxPosition, setMaxPosition] = useState(DEFAULT_MAX_POSITION);
    const [manualShares, setManualShares] = useState<number | null>(null); // null = auto mode
    const [notes, setNotes] = useState('');

    useEffect(() => {
        setUserEntry(signal.entryPrice);
        setMaxRisk(DEFAULT_MAX_RISK);
        setMaxPosition(DEFAULT_MAX_POSITION);
        setManualShares(null);
        setNotes('');
    }, [signal]);

    if (!isOpen) return null;

    const isLong = (signal.direction || signal.type || signal.macd1hState) === 'LONG';
    const t1 = signal.t1Price || signal.targetPrice || 0;
    const t2 = signal.t2Price && Number(signal.t2Price) > 0 ? Number(signal.t2Price) : 0;

    // Core calculations
    const riskPerShare = Math.abs(userEntry - signal.stopPrice);
    const riskBasedQty = riskPerShare > 0 ? Math.floor(maxRisk / riskPerShare) : 0;
    const posCapQty = userEntry > 0 ? Math.floor(maxPosition / userEntry) : 0;

    // Auto qty = min(risk-based, position-capped)
    const autoQty = Math.min(riskBasedQty, posCapQty);
    const isPositionCapped = riskBasedQty > posCapQty;

    // Final qty — manual override or auto
    const finalQty = manualShares !== null ? manualShares : autoQty;

    // Derived values
    const positionValue = userEntry * finalQty;
    const leverage = signal.categoryKey?.includes('INTRADAY') ? 5 : 1;
    const requiredMargin = Math.ceil(positionValue / leverage);
    const actualRisk = riskPerShare * finalQty;
    const rewardPerShare = t1 > 0 ? Math.abs(t1 - userEntry) : riskPerShare;
    const rrRatio = riskPerShare > 0 ? (rewardPerShare / riskPerShare).toFixed(1) : '—';

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl border border-slate-700 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-bold text-white">ENTER TRADE</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="font-mono font-bold text-xl text-slate-100">{signal.symbol}</span>
                            <span className={`px-2 py-0.5 text-xs font-bold rounded ${isLong ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                {isLong ? '▲ LONG' : '▼ SHORT'}
                            </span>
                            <span className="px-2 py-0.5 text-xs font-bold rounded bg-blue-500/20 text-blue-400">
                                {signal.entryType || 'RETEST'}
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">✕</button>
                </div>

                {/* Signal Prices */}
                <div className="bg-slate-900/50 rounded-lg p-3 mb-4 space-y-1.5 text-sm">
                    <div className="flex justify-between">
                        <span className="text-slate-400">System Entry:</span>
                        <span className="font-mono text-slate-300">₹{signal.entryPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-400">Stop Loss:</span>
                        <span className="font-mono text-red-400">₹{signal.stopPrice.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-400">Target T1:</span>
                        <span className="font-mono text-green-400">{t1 > 0 ? `₹${t1.toFixed(2)}` : '—'}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-slate-400">Target T2:</span>
                        <span className="font-mono text-green-400/70">{t2 > 0 ? `₹${t2.toFixed(2)}` : '—'}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-700 pt-1.5">
                        <span className="text-slate-400">R:R Ratio:</span>
                        <span className="font-mono text-yellow-400">1:{rrRatio}</span>
                    </div>
                </div>

                {/* Your Entry */}
                <div className="mb-3">
                    <label className="block text-xs text-slate-400 mb-1 font-semibold">YOUR ENTRY PRICE (₹)</label>
                    <input
                        type="number"
                        value={userEntry}
                        onChange={(e) => { setUserEntry(parseFloat(e.target.value) || 0); setManualShares(null); }}
                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono text-lg focus:border-cyan-500 focus:outline-none"
                        step="0.05"
                    />
                    {Math.abs(userEntry - signal.entryPrice) > 0.01 && (
                        <p className="text-xs text-yellow-400 mt-1">
                            {userEntry > signal.entryPrice ? `+₹${(userEntry - signal.entryPrice).toFixed(2)} above` : `₹${(signal.entryPrice - userEntry).toFixed(2)} below`} system entry
                        </p>
                    )}
                </div>

                {/* ── Position Sizing ── */}
                <div className="border-t border-slate-700 pt-3 mb-3">
                    <h3 className="text-xs font-bold text-slate-400 mb-2 tracking-wider">POSITION SIZING</h3>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                        <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">Max Risk (₹)</label>
                            <input
                                type="number"
                                value={maxRisk}
                                onChange={(e) => { setMaxRisk(parseFloat(e.target.value) || 0); setManualShares(null); }}
                                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white font-mono text-sm focus:border-cyan-500 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">Max Position (₹)</label>
                            <input
                                type="number"
                                value={maxPosition}
                                onChange={(e) => { setMaxPosition(parseFloat(e.target.value) || 0); setManualShares(null); }}
                                className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white font-mono text-sm focus:border-cyan-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    {/* Calculated results */}
                    <div className="bg-slate-900/50 rounded-lg p-3 space-y-1.5 text-sm">
                        <div className="flex justify-between">
                            <span className="text-slate-400">Risk/Share:</span>
                            <span className="font-mono text-orange-400">₹{riskPerShare.toFixed(2)}</span>
                        </div>

                        {/* Show cap warning */}
                        {isPositionCapped && (
                            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded px-2 py-1.5 text-xs">
                                <p className="text-yellow-400 font-semibold">⚠️ Position cap applied</p>
                                <p className="text-yellow-400/70">Risk-based: {riskBasedQty} shares (₹{(riskBasedQty * userEntry).toLocaleString('en-IN')})</p>
                                <p className="text-yellow-400/70">Capped to: {posCapQty} shares (₹{maxPosition.toLocaleString('en-IN')} limit)</p>
                            </div>
                        )}

                        <div className="flex justify-between font-semibold">
                            <span className="text-slate-300">Quantity:</span>
                            <span className="font-mono text-cyan-400">{autoQty} shares</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Position Value:</span>
                            <span className="font-mono text-slate-400/70">₹{positionValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Required Margin:</span>
                            <span className="font-mono text-indigo-400 font-bold">
                                ₹{requiredMargin.toLocaleString('en-IN')}
                                {leverage > 1 && <span className="text-[10px] text-indigo-400/70 ml-1">({leverage}x Lev.)</span>}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Actual Risk:</span>
                            <span className="font-mono text-red-400">₹{(riskPerShare * autoQty).toFixed(0)}</span>
                        </div>
                    </div>
                </div>

                {/* Manual Override */}
                <div className="mb-3">
                    <label className="block text-[10px] text-slate-500 mb-0.5">OR enter shares manually:</label>
                    <div className="flex items-center gap-2">
                        <input
                            type="number"
                            value={manualShares !== null ? manualShares : ''}
                            placeholder={String(autoQty)}
                            onChange={(e) => {
                                const v = e.target.value;
                                setManualShares(v === '' ? null : Math.max(0, parseInt(v) || 0));
                            }}
                            className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-white font-mono text-sm focus:border-cyan-500 focus:outline-none"
                        />
                        {manualShares !== null && (
                            <button onClick={() => setManualShares(null)} className="text-xs text-slate-500 hover:text-cyan-400">Reset</button>
                        )}
                    </div>
                    {manualShares !== null && (
                        <p className="text-xs text-slate-500 mt-1">
                            {manualShares} shares | Margin: ₹{requiredMargin.toLocaleString('en-IN')} | Risk: ₹{actualRisk.toFixed(0)}
                        </p>
                    )}
                </div>

                {/* Notes */}
                <div className="mb-4">
                    <label className="block text-xs text-slate-400 mb-1">NOTES (optional)</label>
                    <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                        placeholder="Why are you taking this trade?"
                    />
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-slate-300">
                        Cancel
                    </button>
                    <button
                        onClick={() => onSubmit({ entryPrice: userEntry, quantity: finalQty, notes })}
                        disabled={finalQty < 1}
                        className={`flex-1 px-4 py-2.5 rounded-lg font-bold transition-all ${finalQty < 1 ? 'bg-slate-600 text-slate-500 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-500/20'}`}
                    >
                        ✅ Confirm Entry
                    </button>
                </div>
            </div>
        </div>
    );
};


export type MarketPhase = 'PRE_MARKET' | 'OR_FORMING' | 'ACTIVE_TRADING' | 'MONITORING' | 'CLOSED';

export const getMarketPhase = (): MarketPhase => {
    const now = new Date();
    const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const h = istTime.getHours();
    const m = istTime.getMinutes();
    const t = h * 60 + m; // minutes since midnight

    if (t < 9 * 60 + 15) return 'PRE_MARKET';
    if (t < 9 * 60 + 45) return 'OR_FORMING';
    if (t < 12 * 60) return 'ACTIVE_TRADING';
    if (t < 15 * 60 + 30) return 'MONITORING';
    return 'CLOSED';
};

// HealthStatusBar — persistent top bar showing system health
const HealthStatusBar: React.FC<{ activeSignalsCount?: number; openPositionsCount?: number }> = ({ activeSignalsCount = 0, openPositionsCount = 0 }) => {
    const [health, setHealth] = useState<any>(null);

    useEffect(() => {
        const fetchHealth = () => {
            fetch(`${API_BASE}/health`)
                .then(r => r.ok ? r.json() : null)
                .then(d => { if (d?.ok) setHealth(d); })
                .catch(() => { });
        };
        fetchHealth();
        const interval = setInterval(fetchHealth, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, []);

    if (!health) return null;

    const getStatusDot = (status: string) => {
        if (status === 'connected' || status === 'running') return '🟢';
        if (status === 'expiring') return '🟡';
        return '🔴';
    };

    const isExpired = health.upstox?.status === 'expired';
    const totalTracked = activeSignalsCount + openPositionsCount;

    return (
        <>
            {/* Critical overlay when token expired */}
            {isExpired && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div className="bg-slate-800 border-2 border-red-500 rounded-xl p-8 max-w-lg mx-4 text-center shadow-2xl">
                        <div className="text-4xl mb-3">⚠️</div>
                        <h2 className="text-xl font-bold text-red-400 mb-2">UPSTOX TOKEN EXPIRED</h2>
                        <p className="text-slate-400 mb-1">All data is STALE. Live prices and signals are NOT updating.</p>
                        <p className="text-slate-500 text-sm mb-1">Token age: {health.upstox.tokenAge || 'unknown'}</p>
                        {health.upstox.lastError && (
                            <p className="text-red-400/70 text-xs mb-4 font-mono">Error: {health.upstox.lastError}</p>
                        )}
                        <a
                            href="https://api.upstox.com/v2/login/authorization/dialog"
                            target="_blank"
                            className="inline-block px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-colors"
                        >
                            🔑 Re-Login to Upstox
                        </a>
                        <button
                            onClick={() => setHealth({ ...health, upstox: { ...health.upstox, status: 'unknown' } })}
                            className="block mx-auto mt-3 text-sm text-slate-500 hover:text-slate-300"
                        >
                            Dismiss (use stale data)
                        </button>
                    </div>
                </div>
            )}

            {/* Critical overlay when API Limit is exhausted */}
            {health.upstox?.limitCritical && !isExpired && (
                <div className="fixed inset-0 bg-red-900/60 backdrop-blur-sm z-50 flex items-start justify-center pt-32">
                    <div className="bg-slate-900 border-2 border-red-500 rounded-xl p-8 max-w-2xl mx-4 text-center shadow-[0_0_50px_rgba(239,68,68,0.4)] animate-pulse">
                        <div className="text-5xl mb-3">🛑</div>
                        <h2 className="text-2xl font-black text-red-500 mb-2 tracking-tight">UPSTOX API RATE LIMIT CRITICAL</h2>
                        <p className="text-slate-300 font-medium mb-2 text-lg">
                            You have made <span className="text-red-400 font-bold">{health.upstox.apiCalls}</span> API calls today. The daily limit is {health.upstox.dailyLimit || 10000}.
                        </p>
                        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                            Continuing to scan will result in an upstream 429 Too Many Requests ban or silent data failures. It is highly recommended to stop the scanner immediately and wait until tomorrow.
                        </p>
                        <button
                            onClick={() => setHealth({ ...health, upstox: { ...health.upstox, limitCritical: false } })}
                            className="inline-block px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors shadow-lg"
                        >
                            I Understand — Dismiss Warning
                        </button>
                    </div>
                </div>
            )}

            {/* Compact status bar */}
            <div className="bg-slate-800/60 rounded-lg px-4 py-2 mb-3 flex items-center justify-between text-xs border border-slate-700/50">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1">
                        {getStatusDot(health.upstox?.status)} <span className="text-slate-400">Upstox:</span>
                        <span className={health.upstox?.status === 'connected' ? 'text-green-400' : health.upstox?.status === 'expiring' ? 'text-yellow-400' : 'text-red-400'}>
                            {health.upstox?.status?.toUpperCase()}
                        </span>
                        <span className={`font-mono ${health.upstox?.limitCritical ? 'text-red-400 font-bold animate-pulse' : 'text-slate-500'}`}>
                            ({health.upstox?.apiCalls || 0}/{health.upstox?.dailyLimit || 10000})
                        </span>
                    </span>
                    <span className="flex items-center gap-1">
                        {getStatusDot(health.database?.status)} <span className="text-slate-400">DB:</span>
                        <span className="text-green-400">{health.database?.status === 'connected' ? 'OK' : 'DOWN'}</span>
                    </span>
                    <span className="flex items-center gap-1">
                        {getStatusDot(health.livePrice?.status)} <span className="text-slate-400">Prices:</span>
                        {health.livePrice?.status === 'running' ? (
                            <span className="text-green-400">Tracking: {totalTracked} stocks | {openPositionsCount} open positions</span>
                        ) : (
                            <button
                                onClick={() => {
                                    // Stop first (clear stale state), then start fresh
                                    fetch('http://localhost:3001/api/livePrice/stop')
                                        .then(() => fetch('http://localhost:3001/api/livePrice/start'))
                                        .then(() => {
                                            setTimeout(() => {
                                                fetch(`${API_BASE}/health`)
                                                    .then(r => r.json())
                                                    .then(d => { if (d?.ok) setHealth(d); });
                                            }, 5000);
                                        });
                                }}
                                className="text-yellow-400 hover:text-green-400 underline cursor-pointer font-semibold"
                            >
                                OFF — Click to Start ▶
                            </button>
                        )}
                    </span>
                </div>
                <div className="flex items-center gap-3 text-slate-500">
                    <span>{health.market?.isOpen ? '🟢 Market Open' : '🔴 Market Closed'}</span>
                    <span>{health.market?.currentTimeIST}</span>
                </div>
            </div>
        </>
    );
};

// StrategyLogicModal is now imported from separate component file

// Market Status Header
const MarketStatusHeader: React.FC<{
    summary: DashboardSummary | null;
    onRefresh: () => void;
    onRunEod: () => void;
    isRunningEod: boolean;
}> = ({ summary, onRefresh, onRunEod, isRunningEod }) => {
    if (!summary) return null;

    const { signals, positions } = summary;
    const phase = getMarketPhase();

    const phaseConfig: Record<MarketPhase, { text: string; subtext: string; styling: string; icon: string }> = {
        PRE_MARKET: { text: 'PRE-MARKET', subtext: 'System is initializing. Waiting for market open.', styling: 'bg-gradient-to-r from-yellow-900/40 to-slate-800 border-yellow-500/40 text-yellow-400', icon: '🌅' },
        OR_FORMING: { text: 'OPENING RANGE FORMING', subtext: 'Scanning gap and open setups. Wait for OR candles.', styling: 'bg-gradient-to-r from-blue-900/40 to-slate-800 border-blue-500/40 text-blue-400', icon: '⏳' },
        ACTIVE_TRADING: { text: 'ACTIVE TRADING WINDOW', subtext: 'All intraday and swing strategies are live and firing.', styling: 'bg-gradient-to-r from-green-900/40 to-slate-800 border-green-500/40 text-green-400', icon: '🟢' },
        MONITORING: { text: 'MONITORING MODE', subtext: 'No new entries allowed. Managing open positions only.', styling: 'bg-gradient-to-r from-orange-900/40 to-slate-800 border-orange-500/40 text-orange-400', icon: '🛡️' },
        CLOSED: { text: 'MARKET CLOSED', subtext: 'Trading session ended. Run EOD Analysis to update journals.', styling: 'bg-gradient-to-r from-red-900/40 to-slate-800 border-red-500/40 text-red-400', icon: '🔴' }
    };

    const currentPhase = phaseConfig[phase];

    return (
        <div className="mb-6 space-y-4">
            {/* Prominent Phase Banner */}
            <div className={`p-5 rounded-xl border-2 shadow-lg flex items-center justify-between ${currentPhase.styling}`}>
                <div className="flex items-center gap-4">
                    <span className="text-4xl">{currentPhase.icon}</span>
                    <div>
                        <h2 className="text-2xl font-black tracking-tight">{currentPhase.text}</h2>
                        <p className="opacity-80 text-sm mt-1">{currentPhase.subtext}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {phase === 'CLOSED' && (
                        <button
                            onClick={onRunEod}
                            disabled={isRunningEod}
                            className={`px-5 py-2.5 font-bold rounded-lg shadow-lg transition-all text-white ${isRunningEod ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30'
                                }`}
                        >
                            {isRunningEod ? '⏳ Running...' : '📊 Run EOD Analysis'}
                        </button>
                    )}
                    <button
                        onClick={onRefresh}
                        className="px-5 py-2.5 bg-slate-900/50 hover:bg-slate-900/80 rounded-lg transition-colors font-semibold"
                    >
                        🔄 Refresh View
                    </button>
                </div>
            </div>

            {/* Core Stats Row */}
            <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50 grid grid-cols-4 gap-6">
                <div>
                    <div className="text-slate-400 text-sm font-semibold mb-1">Total Signals (Today)</div>
                    <div className="font-mono text-3xl font-bold">{signals.total} <span className="text-lg text-slate-500 font-normal ml-1">({signals.pending} pending)</span></div>
                </div>
                <div>
                    <div className="text-slate-400 text-sm font-semibold mb-1">Active Positions</div>
                    <div className="font-mono text-3xl font-bold">{positions.total}</div>
                </div>
                <div>
                    <div className="text-slate-400 text-sm font-semibold mb-1">Day 3 Alerts</div>
                    <div className={`font-mono text-3xl font-bold ${positions.day3Alerts > 0 ? 'text-red-400' : 'text-slate-200'}`}>
                        {positions.day3Alerts}
                    </div>
                </div>
                <div>
                    <div className="text-slate-400 text-sm font-semibold mb-1">Capital Exposure</div>
                    <div className="font-mono text-3xl font-bold">₹{(positions.totalExposure / 1000).toFixed(0)}K</div>
                </div>
            </div>
        </div>
    );
};

// Top Alerts Panel — ENTRY alerts only, one per stock, max 2h old
const TopAlertsPanel: React.FC<{
    alerts: any[];
    onMarkRead: (id: number) => void;
}> = ({ alerts, onMarkRead }) => {
    const [expanded, setExpanded] = useState(false);

    if (!alerts || alerts.length === 0) return null;

    const now = Date.now();
    const TWO_HOURS = 120 * 60 * 1000;

    // Only ENTRY alerts, < 2h old
    const entryAlerts = alerts
        .filter(a => a.alertType === 'ENTRY' && (now - new Date(a.createdAt).getTime()) < TWO_HOURS);

    // Deduplicate: keep latest per stock
    const bySymbol = new Map<string, any>();
    for (const a of entryAlerts) {
        const existing = bySymbol.get(a.symbol);
        if (!existing || new Date(a.createdAt) > new Date(existing.createdAt)) {
            bySymbol.set(a.symbol, a);
        }
    }
    const uniqueAlerts = Array.from(bySymbol.values())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (uniqueAlerts.length === 0) return null;

    const formatAge = (ms: number) => {
        const totalMin = Math.floor(ms / 60000);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        return h > 0 ? `${h}h ${m}m ago` : `${m}m ago`;
    };

    return (
        <div className="bg-slate-800/40 rounded-lg border border-slate-700/50 mb-3">
            {/* Compact summary bar */}
            <div
                className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-slate-700/20"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span className="font-semibold text-slate-300">🔔 {uniqueAlerts.length} Entr{uniqueAlerts.length === 1 ? 'y' : 'ies'}:</span>
                    </span>
                    <span className="text-slate-400">
                        {uniqueAlerts.slice(0, 3).map(a => a.symbol).join(', ')}
                        {uniqueAlerts.length > 3 && ` +${uniqueAlerts.length - 3} more`}
                    </span>
                </div>
                <span className="text-slate-500 text-xs">{expanded ? '▲ Collapse' : '▼ Expand'}</span>
            </div>

            {/* Expanded: one line per stock */}
            {expanded && (
                <div className="border-t border-slate-700/50 px-3 py-2 max-h-48 overflow-y-auto">
                    {uniqueAlerts.map(a => {
                        const age = now - new Date(a.createdAt).getTime();
                        const dir = a.direction || a.meta?.direction || '';
                        const isLong = dir === 'LONG';
                        return (
                            <div key={a.id} className="flex items-center justify-between py-1.5 px-2 hover:bg-slate-700/30 rounded text-xs">
                                <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-sm text-slate-200">{a.symbol}</span>
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/30 text-green-400">ENTRY</span>
                                    <span className={`text-[10px] font-bold ${isLong ? 'text-green-400' : 'text-red-400'}`}>
                                        {isLong ? '▲LONG' : '▼SHORT'}
                                    </span>
                                    <span className="text-slate-400 font-mono">@ ₹{Number(a.price).toFixed(1)}</span>
                                    <span className="text-slate-600">{formatAge(age)}</span>
                                </div>
                                <button onClick={() => onMarkRead(a.id)} className="text-slate-600 hover:text-slate-300 text-xs px-1.5">✕</button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// Main Trading Dashboard
const TradingDashboard: React.FC = () => {
    const [signals, setSignals] = useState<TradingSignal[]>([]);
    const [positions, setPositions] = useState<Position[]>([]);
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSignal, setSelectedSignal] = useState<TradingSignal | null>(null);
    const [showEntryModal, setShowEntryModal] = useState(false);
    const [showLogicModal, setShowLogicModal] = useState(false);
    const [showEodModal, setShowEodModal] = useState(false);
    const [eodResults, setEodResults] = useState<any>(null);
    const [isRunningEod, setIsRunningEod] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generateStatus, setGenerateStatus] = useState('');
    const [scannerStatus, setScannerStatus] = useState<any>(null);

    // Date filter state — defaults to today (YYYY-MM-DD)
    const getTodayStr = () => {
        const now = new Date();
        const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000 - now.getTimezoneOffset() * 60 * 1000));
        return ist.toISOString().split('T')[0];
    };
    const getYesterdayStr = () => {
        const now = new Date();
        now.setDate(now.getDate() - 1);
        const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000 - now.getTimezoneOffset() * 60 * 1000));
        return ist.toISOString().split('T')[0];
    };
    const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());

    const [showBacktestModal, setShowBacktestModal] = useState(false);

    // AI Analysis State
    const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisData | null>(null);
    const [showAIPanel, setShowAIPanel] = useState(false);
    const [aiJsonInput, setAiJsonInput] = useState('');
    const [aiLoading, setAiLoading] = useState(false);

    // Settings State
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [settings, setSettings] = useState<Settings>({ autoSkipLow: false, autoSkipAgainstTrend: false });

    // Load settings on mount
    useEffect(() => {
        fetch(`${API_BASE}/signals/settings`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data?.ok && data.autoSkip) setSettings(data.autoSkip);
            })
            .catch(() => {/* settings endpoint may not exist — use defaults */ });
    }, []);

    const handleToggleSetting = async (key: keyof Settings) => {
        const newSettings = { ...settings, [key]: !settings[key] };
        setSettings(newSettings); // Optimistic
        try {
            await fetch(`${API_BASE}/signals/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSettings)
            });
        } catch (err) {
            console.error('Failed to save settings:', err);
            setSettings(settings); // Revert
        }
    };

    const handleRunEod = async () => {
        setIsRunningEod(true);
        try {
            const res = await fetch(`${API_BASE}/simulate/eod`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await res.json();
            if (data.ok) {
                setEodResults(data);
                setShowEodModal(true);
            } else {
                alert('EOD Analysis Failed: ' + data.error);
            }
        } catch (err) {
            console.error('Error running EOD:', err);
            alert('Failed to run EOD analysis.');
        } finally {
            setIsRunningEod(false);
            fetchData();
        }
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const isToday = selectedDate === getTodayStr();
            // Updated to V5 Endpoints
            const signalsUrl = isToday
                ? `${API_BASE}/dashboard/signals`
                : `${API_BASE}/dashboard/signals?date=${selectedDate}`;
            const [dashRes, signalsRes, positionsRes, alertsRes] = await Promise.all([
                fetch(`${API_BASE}/dashboard/summary`),
                fetch(signalsUrl),
                fetch(`${API_BASE}/dashboard/positions`),
                fetch(`${API_BASE}/alerts/active`)
            ]);

            const [dashData, signalsData, positionsData, alertsData] = await Promise.all([
                dashRes.json(),
                signalsRes.json(),
                positionsRes.json(),
                alertsRes.json()
            ]);

            if (dashData.ok) {
                // Adapt V5 dashboard payload to expected format (if slightly different)
                setSummary({
                    date: dashData.summary?.date || new Date().toISOString(),
                    marketState: { day: 'Open', month: 'Valid', isValidSwingDay: true, isAvoidMonth: false, tradingStatus: 'ACTIVE' },
                    signals: { total: dashData.summary?.today?.pendingSignals || 0, taken: 0, skipped: 0, pending: dashData.summary?.today?.pendingSignals || 0 },
                    positions: { total: dashData.summary?.today?.openPositions || 0, totalExposure: 0, day3Alerts: 0 }
                });
            }
            if (signalsData.ok) {
                const sigs = signalsData.signals || {};
                const allRaw = [...(sigs.CONFIRMED || []), ...(sigs.PENDING || [])];
                // Map V5 API shape → TradingSignal UI shape
                const mapped: TradingSignal[] = allRaw.map((s: any) => ({
                    id: s.id,
                    signalId: s.signalId || s.id?.toString(),
                    categoryKey: s.category || s.categoryKey || 'INTRADAY_BOOST',
                    type: s.direction || s.macd1hState || 'LONG',
                    symbol: s.symbol,
                    signalDate: s.signalDate || s.createdAt,
                    entryPrice: Number(s.entryPrice || s.signalClose || 0),
                    targetPrice: Number(s.t1Price || s.targetPrice || 0),
                    stopPrice: Number(s.stopPrice || s.suggestedStop || 0),
                    confidenceScore: (s.confidenceScore || 0) / 100, // V5 uses 0-100, UI uses 0-1
                    tier: s.confidenceTier ? parseInt(s.confidenceTier.replace('TIER_', '')) : (s.tier || 3),
                    tierName: s.confidenceTier || `TIER_${s.tier || 3}`,
                    suggestedPositionSize: s.suggestedPositionSize || 0,
                    suggestedQuantity: s.suggestedQuantity || 0,
                    userAction: s.userAction || null,
                    entryChecklist: null,
                    // Live trading fields from enriched backend
                    signalTime: s.signalTime || s.confirmedAt || s.createdAt || null,
                    ageMinutes: s.ageMinutes ?? null,
                    ltp: s.ltp ?? null,
                    distancePct: s.distancePct ?? null,
                    opportunityStatus: s.opportunityStatus || 'UNKNOWN',
                    entryType: s.entryType || 'RETEST',
                }));
                // We will merge AI analysis data into signals metadata down below
                setSignals(mapped);
            }
            if (positionsData.ok) setPositions(positionsData.positions || []);
            if (alertsData.ok) setAlerts(alertsData.alerts || []);

            // AI analysis is only loaded when user clicks 🧠 AI Rank — not auto-fetched

        } catch (error) {
            console.error('Failed to fetch V5 trading data:', error);
        }
        setLoading(false);
    }, [selectedDate]);

    // Clear AI analysis ONLY when user changes the date (not on every 30s poll)
    useEffect(() => {
        setAiAnalysis(null);
    }, [selectedDate]);

    useEffect(() => {
        fetchData();
        // Auto-poll every 30 seconds during market hours for real-time updates
        const interval = setInterval(() => {
            fetchData();
            // Also fetch scanner status
            fetch(`${API_BASE}/scanner/status`)
                .then(r => r.json())
                .then(d => { if (d.ok) setScannerStatus(d); })
                .catch(() => { });
        }, 30 * 1000);
        // Initial scanner status fetch
        fetch(`${API_BASE}/scanner/status`)
            .then(r => r.json())
            .then(d => { if (d.ok) setScannerStatus(d); })
            .catch(() => { });
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleMarkEntered = (signal: TradingSignal) => {
        setSelectedSignal(signal);
        setShowEntryModal(true);
    };

    const handleSkip = async (signal: TradingSignal, reason: string) => {
        try {
            await fetch(`${API_BASE}/signals/${signal.signalId}/action`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'SKIPPED', skipReason: reason }),
            });
            fetchData();
        } catch (error) {
            console.error('Failed to skip signal:', error);
        }
    };

    const handlePositionEntry = async (_data: { entryPrice: number; quantity: number; notes: string }) => {
        if (!selectedSignal) return;

        try {
            // Update to use V5 positions logic
            await fetch(`${API_BASE}/positions/open`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    signalId: selectedSignal.id, // V5 uses integer id here mapped differently.
                    symbol: selectedSignal.symbol,
                    // Additional V5 mapped params if required, defaulting to backend resolver.
                }),
            });
            setShowEntryModal(false);
            setSelectedSignal(null);
            fetchData();
        } catch (error) {
            console.error('Failed to create V5 position:', error);
        }
    };

    const handleClosePosition = async (position: Position) => {
        const exitPrice = prompt(`Enter exit price for ${position.symbol}:`, position.entryPrice.toString());
        if (!exitPrice) return;

        try {
            await fetch(`${API_BASE}/positions/${position.id}/close`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    exitPrice: parseFloat(exitPrice),
                    exitReason: 'MANUAL',
                }),
            });
            fetchData();
        } catch (error) {
            console.error('Failed to close position:', error);
        }
    };

    const handleGenerateSignals = async () => {
        setIsGenerating(true);
        setGenerateStatus('Force scanning...');
        try {
            const res = await fetch(`${API_BASE}/scanner/force-scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = await res.json();
            if (data.ok) {
                setGenerateStatus(`✅ Scan #${data.cycleCount} complete`);
            } else {
                setGenerateStatus(`❌ Error: ${data.error}`);
            }
            fetchData();
        } catch (error) {
            console.error('Failed to force scan:', error);
            setGenerateStatus('❌ Failed to connect to backend');
        }
        setTimeout(() => { setIsGenerating(false); setGenerateStatus(''); }, 5000);
    };

    const handleDismissAlert = async (id: number) => {
        try {
            await fetch(`${API_BASE}/alerts/${id}/read`, { method: 'PUT' });
            fetchData(); // Refresh list to remove it
        } catch (e) {
            console.error(e);
        }
    };

    // --- AI Analysis Handlers ---

    // 1. Auto-analyze signals using Gemini Flash API
    const handleAutoAnalyze = async () => {
        try {
            setAiLoading(true);
            const dateStr = selectedDate || getTodayStr();
            const res = await fetch(`${API_BASE}/ai-analysis/auto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: dateStr })
            });
            const data = await res.json();
            if (data.ok && data.analysis) {
                setAiAnalysis(data.analysis);
                const topCount = data.analysis.topPicks?.length || 0;
                const avoidCount = data.analysis.avoid?.length || 0;
                const source = data.source === 'cache' ? '(cached)' : '(Gemini Flash)';
                alert(`✅ AI Analysis Complete ${source}\n\n🟢 ${topCount} Top Picks\n🔴 ${avoidCount} Avoid\n\n${data.analysis.marketAnalysis || ''}`);
            } else {
                alert('❌ ' + (data.error || 'Analysis failed'));
            }
        } catch (e) {
            console.error('AI analysis failed', e);
            alert('Failed to run AI analysis: ' + (e instanceof Error ? e.message : 'Unknown error'));
        } finally {
            setAiLoading(false);
        }
    };

    // 1b. Fallback: Copy signals to clipboard for manual paste
    const handleCopySignalsForAI = async () => {
        try {
            setAiLoading(true);
            const dateStr = selectedDate || getTodayStr();
            const res = await fetch(`${API_BASE}/signals/export-for-analysis?date=${dateStr}`);
            const data = await res.json();
            if (data.ok && data.data) {
                await navigator.clipboard.writeText(data.data.promptText);
                alert(`✅ Copied ${data.data.signalCount} signals to clipboard!\n\nPaste this into Gemini/ChatGPT/Claude.`);
                setShowAIPanel(true);
            } else {
                alert('No signals available to export.');
            }
        } catch (e) {
            console.error('Export failed', e);
        } finally {
            setAiLoading(false);
        }
    };

    // 2. Save structured JSON from AI back to system
    const handleSaveAIAnalysis = async () => {
        if (!aiJsonInput.trim()) return;

        try {
            setAiLoading(true);
            const parsed = JSON.parse(aiJsonInput); // validate JSON

            const dateStr = selectedDate || getTodayStr();
            const res = await fetch(`${API_BASE}/ai-analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: dateStr, analysis: parsed })
            });

            const data = await res.json();
            if (data.ok) {
                setAiAnalysis(parsed);
                setAiJsonInput('');
                setShowAIPanel(false);
                alert('✅ AI Analysis Saved.');
                // Note: The UI will enrich signals in the render phase
            } else {
                alert('Error: ' + data.error);
            }
        } catch (e) {
            alert('❌ Invalid JSON format. Please paste exactly what the AI returned.');
        } finally {
            setAiLoading(false);
        }
    };

    // 3. Inject AI rankings into signals dynamically
    const getEnrichedSignals = () => {
        if (!aiAnalysis) return signals;

        // Helper: AI JSON may have "COLPAL SHORT" or just "COLPAL" — extract ticker
        const extractTicker = (s: string) => s?.split(' ')[0]?.toUpperCase() || '';

        return signals.map(sig => {
            let aiRank = 0;
            let aiReason = '';
            let aiAvoid = false;
            let aiConfidence = '';
            let aiSize = '';

            const pick = aiAnalysis.topPicks?.find((p: any) => extractTicker(p.symbol) === sig.symbol);
            if (pick) {
                aiRank = pick.rank;
                aiReason = pick.reasoning;
                aiConfidence = pick.confidence || 'HIGH';
                aiSize = pick.suggestedSize || 'FULL';
            }

            const medium = aiAnalysis.mediumTier?.find((m: any) => extractTicker(m.symbol) === sig.symbol);
            if (medium) {
                aiRank = 50; // medium tier
                aiReason = medium.reasoning;
                aiConfidence = medium.confidence || 'MEDIUM';
                aiSize = medium.suggestedSize || 'HALF';
            }

            const avoid = aiAnalysis.avoid?.find((a: any) => extractTicker(a.symbol) === sig.symbol);
            if (avoid) {
                aiAvoid = true;
                aiReason = avoid.reasoning;
                aiConfidence = 'AVOID';
                aiSize = 'SKIP';
            }

            return {
                ...sig,
                meta: {
                    ...sig.meta,
                    aiRank,
                    aiAvoid,
                    aiReason,
                    aiConfidence,
                    aiSize
                }
            };
        }).sort((a, b) => {
            // Top picks first, then medium, then normal by score, then avoids last
            const aRank = a.meta?.aiRank || 99;
            const bRank = b.meta?.aiRank || 99;

            if (a.meta?.aiAvoid && !b.meta?.aiAvoid) return 1;
            if (!a.meta?.aiAvoid && b.meta?.aiAvoid) return -1;

            if (aRank !== bRank) return aRank - bRank;
            return b.confidenceScore - a.confidenceScore;
        });
    };

    const displaySignals = getEnrichedSignals();

    if (loading && !summary) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-slate-400">Loading trading dashboard...</div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">🎯 Trading Dashboard</h1>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowLogicModal(true)}
                        className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded transition-colors"
                    >
                        📋 View Logic
                    </button>
                    <button
                        onClick={() => setShowBacktestModal(true)}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded transition-colors"
                    >
                        ⏱️ Backtest
                    </button>
                    <button
                        onClick={handleGenerateSignals}
                        disabled={isGenerating}
                        className={`px-4 py-2 rounded transition-colors ${isGenerating ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500'}`}
                        title="System auto-scans every 2 minutes. Use this for an immediate scan."
                    >
                        {isGenerating ? '⏳ Scanning...' : '⚡ Force Scan Now'}
                    </button>
                    <button
                        onClick={handleAutoAnalyze}
                        disabled={aiLoading}
                        className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded font-bold shadow-[0_0_10px_rgba(16,185,129,0.3)] flex items-center gap-2"
                        title="Auto-analyze signals using AI (OpenAI/Gemini)"
                    >
                        {aiLoading ? '⏳ Analyzing...' : '🧠 AI Rank'}
                    </button>
                    <button
                        onClick={handleCopySignalsForAI}
                        disabled={aiLoading}
                        className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                        title="Copy prompt to clipboard — paste into Claude, ChatGPT, or Gemini manually"
                    >
                        📋 Copy Prompt
                    </button>
                </div>
                {generateStatus && (
                    <div className="text-sm text-blue-300 mt-1 animate-pulse">{generateStatus}</div>
                )}
                {/* Scanner Status Indicator */}
                {scannerStatus && (
                    <div className="flex items-center gap-3 mt-1 text-xs">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${scannerStatus.status === 'RUNNING' ? 'bg-green-900/50 text-green-400' :
                            scannerStatus.status === 'ERROR' ? 'bg-red-900/50 text-red-400' :
                                'bg-yellow-900/50 text-yellow-400'
                            }`}>
                            <span className={`w-2 h-2 rounded-full ${scannerStatus.status === 'RUNNING' ? 'bg-green-400 animate-pulse' :
                                scannerStatus.status === 'ERROR' ? 'bg-red-400' :
                                    'bg-yellow-400'
                                }`}></span>
                            Auto-Scanner: {scannerStatus.status}
                        </span>
                        <span className="text-slate-500">
                            {scannerStatus.lastScanTime ? `Last: ${scannerStatus.lastScanTime}` : 'No scans yet'}
                            {scannerStatus.cycleCount > 0 ? ` · #${scannerStatus.cycleCount}` : ''}
                        </span>
                        <span className="text-slate-600">{scannerStatus.marketPhase}</span>
                    </div>
                )}
            </div>

            <div className="flex justify-end mb-2">
                <APIUsageWidget />
            </div>
            <HealthStatusBar activeSignalsCount={signals.filter(s => !s.userAction).length} openPositionsCount={positions.length} />
            <MarketStatusHeader
                summary={summary}
                onRefresh={fetchData}
                onRunEod={handleRunEod}
                isRunningEod={isRunningEod}
            />

            {/* Live Alerts Panel */}
            <TopAlertsPanel alerts={alerts} onMarkRead={handleDismissAlert} />

            {/* AI Analysis Paste Panel */}
            {showAIPanel && (
                <div className="bg-emerald-900/20 border border-emerald-500/40 rounded-lg p-5">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                            🧠 AI Analyst Input
                        </h3>
                        <button onClick={() => setShowAIPanel(false)} className="text-slate-400 hover:text-white">✕</button>
                    </div>

                    {aiAnalysis ? (
                        <div className="mb-4 bg-slate-800/80 p-4 rounded text-sm text-slate-300 border border-slate-700">
                            <div className="text-emerald-400 font-bold mb-2">✓ AI Analysis Active</div>
                            <p className="italic text-xs mb-3 text-slate-400">"{aiAnalysis.marketAnalysis}"</p>
                            <div className="flex flex-wrap gap-3 mb-2">
                                <div className="bg-green-900/30 px-2 py-1 rounded border border-green-500/30">
                                    <strong className="text-green-400">🎯 Top Picks:</strong>{' '}
                                    {aiAnalysis.topPicks?.map((p: any) => p.symbol?.split(' ')[0]).join(', ') || 'None'}
                                </div>
                                <div className="bg-yellow-900/30 px-2 py-1 rounded border border-yellow-500/30">
                                    <strong className="text-yellow-400">🟡 Medium:</strong> {aiAnalysis.mediumTier?.length || 0}
                                </div>
                                <div className="bg-red-900/30 px-2 py-1 rounded border border-red-500/30">
                                    <strong className="text-red-400">⚠ Avoid:</strong> {aiAnalysis.avoid?.length || 0}
                                </div>
                            </div>
                            <button
                                onClick={() => setAiAnalysis(null)}
                                className="mt-3 text-xs px-3 py-1 bg-red-900/30 text-red-400 hover:bg-red-900/60 rounded"
                            >
                                Clear Analysis
                            </button>
                        </div>
                    ) : (
                        <>
                            <p className="text-sm text-slate-400 mb-3">
                                1. The signals have been copied to your clipboard. <br />
                                2. Paste them into ChatGPT or Claude. <br />
                                3. Copy the resulting JSON and paste it below.
                            </p>
                            <textarea
                                value={aiJsonInput}
                                onChange={e => setAiJsonInput(e.target.value)}
                                placeholder='{\n  "date": "2025-03-02",\n  "marketAnalysis": "...",\n  "topPicks": [...]\n}'
                                className="w-full h-40 bg-slate-900 font-mono text-sm p-3 rounded border border-emerald-500/30 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 mb-3"
                            />
                            <button
                                onClick={handleSaveAIAnalysis}
                                disabled={!aiJsonInput || aiLoading}
                                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded font-bold"
                            >
                                {aiLoading ? 'Saving...' : 'Save JSON Analysis'}
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Stacked layout - signals full width on top, positions full width below */}
            <div className="space-y-4">

                {/* Date Filter Bar */}
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/60 rounded-lg border border-slate-700/50">
                    <span className="text-xs text-slate-400 font-medium mr-1">📅 Signals for:</span>
                    <button
                        onClick={() => setSelectedDate(getTodayStr())}
                        className={`px-3 py-1 text-xs rounded-md font-semibold transition-all ${selectedDate === getTodayStr()
                            ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/20'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                    >
                        Today
                    </button>
                    <button
                        onClick={() => setSelectedDate(getYesterdayStr())}
                        className={`px-3 py-1 text-xs rounded-md font-semibold transition-all ${selectedDate === getYesterdayStr()
                            ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/20'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}
                    >
                        Yesterday
                    </button>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="px-2 py-1 text-xs rounded-md bg-slate-700 text-slate-200 border border-slate-600 focus:border-cyan-500 focus:outline-none"
                    />
                    {selectedDate !== getTodayStr() && (
                        <span className="text-xs text-amber-400 font-medium ml-2">
                            ⏰ Viewing: {selectedDate}
                        </span>
                    )}
                </div>

                <SignalsWatchlist
                    signals={displaySignals} // Using enriched signals
                    marketPhase={getMarketPhase()}
                    onMarkEntered={handleMarkEntered}
                    onSkip={handleSkip}
                    onOpenSettings={() => setShowSettingsModal(true)}
                />

                {/* IB Watchlist — during market hours only */}
                {(['OR_FORMING', 'ACTIVE_TRADING', 'MONITORING'] as MarketPhase[]).includes(getMarketPhase()) && (
                    <IBWatchlist />
                )}

                <ActivePositions
                    positions={positions}
                    onClose={handleClosePosition}
                />

                {/* Live Monitoring Panel */}

            </div>

            {/* Strategy Logic Modal */}
            <StrategyLogicModal
                isOpen={showLogicModal}
                onClose={() => setShowLogicModal(false)}
            />

            {/* Time-Travel Backtest Modal */}
            <TimeTravelBacktestModal
                isOpen={showBacktestModal}
                onClose={() => setShowBacktestModal(false)}
            />

            {selectedSignal && (
                <PositionEntryModal
                    signal={selectedSignal}
                    isOpen={showEntryModal}
                    onClose={() => {
                        setShowEntryModal(false);
                        setSelectedSignal(null);
                    }}
                    onSubmit={handlePositionEntry}
                />
            )}

            <SettingsModal
                isOpen={showSettingsModal}
                onClose={() => setShowSettingsModal(false)}
                settings={settings}
                onToggle={handleToggleSetting}
            />

            {/* EOD Results Modal Inline Component */}
            {showEodModal && eodResults && eodResults.report && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                📊 EOD Analysis Results
                                <span className="text-sm font-normal text-slate-400">
                                    {new Date(eodResults.report.date).toLocaleDateString()}
                                </span>
                            </h2>
                            <button onClick={() => setShowEodModal(false)} className="text-slate-400 hover:text-white">✕</button>
                        </div>

                        <div className="grid grid-cols-4 gap-4 mb-6">
                            <div className="bg-slate-800 p-4 rounded-lg text-center border border-slate-700">
                                <div className="text-slate-400 mb-1 text-sm">Win Rate</div>
                                <div className={`text-2xl font-bold ${eodResults.report.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                                    {eodResults.report.winRate}%
                                </div>
                            </div>
                            <div className="bg-slate-800 p-4 rounded-lg text-center border border-slate-700">
                                <div className="text-slate-400 mb-1 text-sm">Net R</div>
                                <div className={`text-2xl font-bold ${eodResults.report.netR > 0 ? 'text-green-400' : eodResults.report.netR < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                                    {eodResults.report.netR > 0 ? '+' : ''}{eodResults.report.netR}R
                                </div>
                            </div>
                            <div className="bg-slate-800 p-4 rounded-lg text-center border border-slate-700">
                                <div className="text-slate-400 mb-1 text-sm">Top 3 Net R</div>
                                <div className={`text-2xl font-bold ${eodResults.report.topNNetR > 0 ? 'text-green-400' : eodResults.report.topNNetR < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                                    {eodResults.report.topNNetR > 0 ? '+' : ''}{eodResults.report.topNNetR}R
                                </div>
                            </div>
                            <div className="bg-slate-800 p-4 rounded-lg text-center border border-slate-700">
                                <div className="text-slate-400 mb-1 text-sm">W:L (Confirmed)</div>
                                <div className="text-xl font-bold text-slate-300">
                                    {eodResults.report.wins} : {eodResults.report.losses} <span className="text-sm font-normal text-slate-500">/ {eodResults.report.confirmed}</span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700 mb-2">
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Signal Breakdown</h3>
                            <div className="space-y-2">
                                {eodResults.details && eodResults.details.map((s: any, i: number) => (
                                    <div key={i} className={`flex items-center justify-between p-2 rounded text-sm ${s.outcome === 'WIN' ? 'bg-green-500/10 border border-green-500/20' :
                                        s.outcome === 'LOSS' ? 'bg-red-500/10 border border-red-500/20' :
                                            'bg-slate-800/80 border border-slate-700'
                                        }`}>
                                        <div className="flex items-center gap-4">
                                            <span className="font-mono font-bold w-20">{s.symbol}</span>
                                            <span className={`px-2 py-0.5 rounded text-xs ${s.dir === 'LONG' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                                {s.dir}
                                            </span>
                                            <span className="text-slate-400">Score: {s.score}</span>
                                            <span>Ent: ₹{s.entry}</span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <span className={`font-bold ${s.outcome === 'WIN' ? 'text-green-400' : s.outcome === 'LOSS' ? 'text-red-400' : 'text-slate-400'}`}>
                                                {s.outcome}
                                            </span>
                                            <span className="font-mono text-right w-16 text-slate-300">
                                                {s.netR > 0 ? '+' : ''}{s.netR.toFixed(2)}R
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TradingDashboard;
