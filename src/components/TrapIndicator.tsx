import { useState, useEffect } from 'react';
import { SparklesIcon } from './icons/SparklesIcon';
import { ExclamationTriangleIcon } from './icons/ExclamationTriangleIcon';

interface TrapWarning {
    type: string;
    name: string;
    description: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
}

interface TrapIndicatorProps {
    symbol: string;
    candles?: any[];
    categoryKey?: string;
    className?: string;
}

export function TrapIndicator({ symbol, candles, categoryKey, className = '' }: TrapIndicatorProps) {
    const [traps, setTraps] = useState<TrapWarning[]>([]);
    const [loading, setLoading] = useState(false);
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        if (candles && candles.length >= 30) {
            checkForTraps();
        }
    }, [symbol, candles]);

    const checkForTraps = async () => {
        if (!candles || candles.length < 30) return;

        setLoading(true);
        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            const response = await fetch(`${apiBase}/api/traps/check/${symbol}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ candles, categoryKey })
            });

            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const data = await response.json();
            if (data.ok && data.detected) {
                setTraps(data.traps);
            } else {
                setTraps([]);
            }
            setChecked(true);
        } catch (error) {
            console.error('[TrapIndicator] Error:', error);
            setTraps([]);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className={`inline-flex items-center text-xs text-gray-400 ${className}`}>
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-cyan-400 mr-1"></div>
                Checking traps...
            </div>
        );
    }

    if (!checked || traps.length === 0) {
        return (
            <div className={`inline-flex items-center text-xs text-green-400 ${className}`}>
                ✓ No traps detected
            </div>
        );
    }

    const critical = traps.filter(t => t.severity === 'CRITICAL');
    const high = traps.filter(t => t.severity === 'HIGH');

    return (
        <div className={`${className}`}>
            <div className="flex items-center space-x-2">
                {critical.length > 0 && (
                    <div className="inline-flex items-center bg-red-500/20 border border-red-500 rounded px-2 py-1 text-xs text-red-300">
                        <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
                        {critical.length} CRITICAL TRAP{critical.length > 1 ? 'S' : ''}
                    </div>
                )}
                {high.length > 0 && critical.length === 0 && (
                    <div className="inline-flex items-center bg-yellow-500/20 border border-yellow-500 rounded px-2 py-1 text-xs text-yellow-300">
                        <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
                        {high.length} HIGH RISK
                    </div>
                )}
            </div>

            {traps.length > 0 && (
                <div className="mt-2 space-y-1">
                    <div className="text-xs font-semibold text-gray-300">Detected Traps:</div>
                    {traps.slice(0, 3).map((trap, idx) => (
                        <div key={idx} className="text-xs text-gray-400 flex items-start">
                            <span className={`mr-1 ${trap.severity === 'CRITICAL' ? 'text-red-400' :
                                    trap.severity === 'HIGH' ? 'text-yellow-400' :
                                        'text-orange-400'
                                }`}>•</span>
                            <span>{trap.name}: {trap.description}</span>
                        </div>
                    ))}
                    {traps.length > 3 && (
                        <div className="text-xs text-gray-500">
                            +{traps.length - 3} more...
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// Compact version for inline use
export function TrapBadge({ trapCount, severity }: { trapCount: number; severity?: string }) {
    if (trapCount === 0) return null;

    const color = severity === 'CRITICAL' ? 'red' : severity === 'HIGH' ? 'yellow' : 'orange';

    return (
        <span className={`inline-flex items-center bg-${color}-500/20 border border-${color}-500 rounded px-2 py-0.5 text-xs text-${color}-300`}>
            ⚠️ {trapCount} trap{trapCount > 1 ? 's' : ''}
        </span>
    );
}
