import React from 'react';
import { Notification } from '../types';
import { XCircleIcon } from './icons/XCircleIcon';

interface NotificationsPanelProps {
    notifications: Notification[];
    onClearNotification: (id: number) => void;
}

const NotificationsPanel: React.FC<NotificationsPanelProps> = ({ notifications, onClearNotification }) => {

    const getTypeClasses = (type: Notification['type']) => {
        switch(type) {
            case 'success': return 'border-l-green-500 bg-green-500/10';
            case 'error': return 'border-l-red-500 bg-red-500/10';
            case 'info':
            default: return 'border-l-cyan-500 bg-cyan-500/10';
        }
    };

    return (
        <div className="h-full flex flex-col">
            <h3 className="text-sm font-semibold text-cyan-300 mb-2 px-2">System Notifications Log</h3>
            <div className="flex-grow overflow-y-auto pr-2 space-y-2">
                {notifications.length > 0 ? notifications.map(n => (
                    <div 
                        key={n.id} 
                        className={`p-2 border-l-4 rounded-r-md animate-fade-in-down ${getTypeClasses(n.type)} flex justify-between items-start group`}
                    >
                        <div>
                            <p className="text-xs text-slate-300">{n.message}</p>
                            <p className="text-right text-xs text-slate-500 font-mono mt-1">
                                {n.timestamp.toLocaleTimeString()}
                            </p>
                        </div>
                        <button 
                            onClick={() => onClearNotification(n.id)}
                            className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                            title="Clear notification"
                        >
                            <XCircleIcon className="w-4 h-4" />
                        </button>
                    </div>
                )) : (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-slate-500 text-sm">No system notifications yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationsPanel;
