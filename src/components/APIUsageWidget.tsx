import React, { useState, useEffect } from 'react';

const APIUsageWidget: React.FC = () => {
    const [usage, setUsage] = useState({
        requestsToday: 0,
        dailyLimit: 1000,
        emergencyMode: false
    });

    // Hardcoded to match TradingDashboard.tsx for consistency
    const API_BASE = 'http://localhost:3001/api/trading';

    useEffect(() => {
        const fetchUsage = async () => {
            try {
                const res = await fetch(`${API_BASE}/api-usage`);
                const data = await res.json();
                if (data.success && data.usage) {
                    setUsage(data.usage);
                }
            } catch (err) {
                console.error("Failed to fetch API usage", err);
            }
        };

        fetchUsage();
        const interval = setInterval(fetchUsage, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, []);

    const percent = Math.min((usage.requestsToday / usage.dailyLimit) * 100, 100);
    let color = 'bg-emerald-500';
    if (percent > 80) color = 'bg-red-500';
    else if (percent > 50) color = 'bg-amber-500';

    return (
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-3 shadow-sm min-w-[200px]">
            <div className="flex justify-between items-center mb-1">
                <div className="text-xs text-slate-400 font-medium tracking-wider uppercase">API Usage</div>
                <div className={`text-xs font-bold ${percent > 90 ? 'text-red-400' : 'text-slate-300'}`}>
                    {usage.requestsToday} / {usage.dailyLimit}
                </div>
            </div>

            <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${color}`}
                    style={{ width: `${percent}%` }}
                />
            </div>

            {usage.emergencyMode && (
                <div className="mt-2 text-[10px] text-red-500 bg-red-500/10 px-2 py-1 rounded text-center font-bold animate-pulse">
                    🛑 EMERGENCY MODE ON
                </div>
            )}

            {!usage.emergencyMode && percent > 90 && (
                <div className="mt-1 text-[10px] text-red-400 text-right">
                    Limit nearing!
                </div>
            )}
        </div>
    );
};

export default APIUsageWidget;
