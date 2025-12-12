import { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

interface PortfolioSimulationProps {
    trades: any[];
    initialCapital?: number;
    className?: string;
}

export function PortfolioSimulation({ trades, initialCapital = 100000, className = '' }: PortfolioSimulationProps) {
    const [portfolioData, setPortfolioData] = useState<any>(null);
    const [monthlyData, setMonthlyData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (trades && trades.length > 0) {
            runSimulation();
        }
    }, [trades, initialCapital]);

    const runSimulation = async () => {
        setLoading(true);
        try {
            const apiBase = (window as any).__CTS_API_BASE || 'http://localhost:3001';
            const response = await fetch(`${apiBase}/api/portfolio/simulate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trades, initialCapital })
            });

            if (!response.ok) throw new Error(`API error: ${response.status}`);

            const data = await response.json();
            if (data.ok) {
                setPortfolioData(data.portfolio);
                setMonthlyData(data.monthlyPnL || []);
            }
        } catch (error) {
            console.error('[PortfolioSim] Error:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className={`bg-slate-800 rounded-lg p-6 ${className}`}>
                <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-slate-700 rounded w-1/3"></div>
                    <div className="h-64 bg-slate-700 rounded"></div>
                </div>
            </div>
        );
    }

    if (!portfolioData) {
        return (
            <div className={`bg-slate-800 rounded-lg p-6 text-center text-gray-500 ${className}`}>
                No simulation data available
            </div>
        );
    }

    // Prepare chart data
    const chartData = {
        labels: portfolioData.equityCurve.map((point: any, idx: number) => `Trade ${idx + 1}`),
        datasets: [
            {
                label: 'Portfolio Value',
                data: portfolioData.equityCurve.map((point: any) => point.equity),
                borderColor: portfolioData.currentCapital >= initialCapital ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
                backgroundColor: portfolioData.currentCapital >= initialCapital
                    ? 'rgba(34, 197, 94, 0.1)'
                    : 'rgba(239, 68, 68, 0.1)',
                fill: true,
                tension: 0.4
            }
        ]
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                padding: 12,
                titleColor: '#fff',
                bodyColor: '#fff',
                callbacks: {
                    label: (context: any) => {
                        return `₹${context.parsed.y.toLocaleString()}`;
                    }
                }
            }
        },
        scales: {
            y: {
                ticks: {
                    color: '#9ca3af',
                    callback: (value: any) => `₹${(value / 1000).toFixed(0)}K`
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)'
                }
            },
            x: {
                ticks: {
                    color: '#9ca3af',
                    maxRotation: 0,
                    autoSkip: true,
                    maxTicksLimit: 10
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)'
                }
            }
        }
    };

    const totalReturn = portfolioData.metrics.totalReturn;
    const isProfit = totalReturn >= 0;

    return (
        <div className={`bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-6 ${className}`}>
            <h3 className="text-lg font-bold text-cyan-300 mb-4">Portfolio Simulation</h3>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700">
                    <div className="text-xs text-gray-400 mb-1">Total Return</div>
                    <div className={`text-xl font-bold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                        {isProfit ? '+' : ''}{totalReturn.toFixed(2)}%
                    </div>
                </div>

                <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700">
                    <div className="text-xs text-gray-400 mb-1">Sharpe Ratio</div>
                    <div className="text-xl font-bold text-cyan-300">
                        {portfolioData.metrics.sharpeRatio.toFixed(2)}
                    </div>
                </div>

                <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700">
                    <div className="text-xs text-gray-400 mb-1">Max Drawdown</div>
                    <div className="text-xl font-bold text-orange-400">
                        {portfolioData.metrics.maxDrawdown.toFixed(2)}%
                    </div>
                </div>

                <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700">
                    <div className="text-xs text-gray-400 mb-1">Win Rate</div>
                    <div className="text-xl font-bold text-blue-300">
                        {portfolioData.metrics.winRate.toFixed(1)}%
                    </div>
                </div>
            </div>

            {/* Equity Curve */}
            <div className="bg-slate-900/50 rounded-lg p-4 mb-6" style={{ height: '300px' }}>
                <Line data={chartData} options={chartOptions} />
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                    <div className="flex justify-between">
                        <span className="text-gray-400">Initial Capital:</span>
                        <span className="text-white font-semibold">₹{initialCapital.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">Final Capital:</span>
                        <span className={`font-semibold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                            ₹{Math.round(portfolioData.currentCapital).toLocaleString()}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">Total P&L:</span>
                        <span className={`font-semibold ${isProfit ? 'text-green-400' : 'text-red-400'}`}>
                            {isProfit ? '+' : ''}₹{Math.round(portfolioData.currentCapital - initialCapital).toLocaleString()}
                        </span>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between">
                        <span className="text-gray-400">Total Trades:</span>
                        <span className="text-white font-semibold">{portfolioData.metrics.totalTrades}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">Winning:</span>
                        <span className="text-green-400 font-semibold">{portfolioData.metrics.winningTrades}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-400">Losing:</span>
                        <span className="text-red-400 font-semibold">{portfolioData.metrics.losingTrades}</span>
                    </div>
                </div>
            </div>

            {/* Monthly P&L Table */}
            {monthlyData.length > 0 && (
                <div className="mt-6">
                    <h4 className="text-sm font-semibold text-gray-300 mb-3">Monthly Performance</h4>
                    <div className="bg-slate-900/50 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-800 sticky top-0">
                                <tr>
                                    <th className="px-3 py-2 text-left text-gray-400">Month</th>
                                    <th className="px-3 py-2 text-right text-gray-400">Trades</th>
                                    <th className="px-3 py-2 text-right text-gray-400">P&L%</th>
                                    <th className="px-3 py-2 text-right text-gray-400">Win Rate</th>
                                </tr>
                            </thead>
                            <tbody>
                                {monthlyData.map((month, idx) => (
                                    <tr key={idx} className="border-t border-slate-700">
                                        <td className="px-3 py-2 text-gray-300">{month.month}</td>
                                        <td className="px-3 py-2 text-right text-gray-400">{month.trades}</td>
                                        <td className={`px-3 py-2 text-right font-semibold ${month.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'
                                            }`}>
                                            {month.totalPnL >= 0 ? '+' : ''}{month.totalPnL.toFixed(2)}%
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-400">
                                            {month.winRate.toFixed(0)}%
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
