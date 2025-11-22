import React from 'react';
import DashboardCard from './DashboardCard';
import { CircleIcon } from './icons/CircleIcon';
import { SystemHealthState, HealthStatusAPI } from '../types';

interface SystemHealthProps {
    healthState: SystemHealthState | null;
}

const HealthItem: React.FC<{ item: HealthStatusAPI }> = ({ item }) => {
    const statusClasses = {
        ok: 'text-green-400',
        warning: 'text-yellow-400',
        error: 'text-red-400'
    };

    return (
        <div className="flex items-center justify-between p-2 bg-slate-800/50 rounded-md">
            <div className="flex items-center">
                <CircleIcon className={`w-3 h-3 ${statusClasses[item.status]}`} />
                <p className="text-sm text-slate-300 ml-3">{item.service}</p>
            </div>
            <p className="text-xs text-slate-400">{item.message}</p>
        </div>
    );
};


const SystemHealth: React.FC<SystemHealthProps> = ({ healthState }) => {
    
    if (!healthState) {
        return (
            <DashboardCard title="System Health">
                <div className="flex flex-col justify-center h-full items-center">
                    <p className="text-slate-500">Initializing...</p>
                </div>
            </DashboardCard>
        );
    }
    
    return (
        <DashboardCard title="System Health">
            <div className="flex flex-col justify-center h-full">
                <div className="space-y-2">
                    {healthState.components.map(item => <HealthItem key={item.service} item={item} />)}
                </div>
            </div>
        </DashboardCard>
    );
};

export default SystemHealth;
