import React, { useState, useEffect } from 'react';
import { SparklesIcon } from './icons/SparklesIcon';

interface NotificationBarProps {
    message: string;
}

const NotificationBar: React.FC<NotificationBarProps> = ({ message }) => {
    const [visible, setVisible] = useState(false);
    const [currentMessage, setCurrentMessage] = useState(message);

    useEffect(() => {
        if (message) {
            setVisible(false); // Hide to reset animation
            setTimeout(() => {
                setCurrentMessage(message);
                setVisible(true);
            }, 100); // Short delay to allow CSS to reset
        }
    }, [message]);
    
    if (!visible) return null;

    return (
        <div className="notification-bar bg-slate-800/80 backdrop-blur-md border-b border-cyan-500/30 shadow-lg animate-fade-in-down">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-center h-10">
                    <SparklesIcon className="w-5 h-5 text-cyan-400 mr-3 flex-shrink-0" />
                    <p className="text-sm font-medium text-slate-300 truncate">
                        <span className="font-bold text-cyan-400">AI Status:</span> {currentMessage}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default NotificationBar;