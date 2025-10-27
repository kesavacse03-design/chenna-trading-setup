import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import ActiveTradesDashboard from './components/ActiveTradesDashboard';
import AnalysisHub from './components/AnalysisHub';
import { Trade, Notification, SystemHealthState, GroupedWatchlist, StrategyState, StrategyLogic, ImportWatchlistPayload } from './types';
import CredentialsManager from './components/CredentialsManager';
import PortfolioStats from './components/PortfolioStats';
import DailySummary from './components/DailySummary';
import SystemHealth from './components/SystemHealth';
import { CogIcon } from './components/icons/CogIcon';
import NotificationBar from './components/NotificationBar';
import StrategyWorkbenchModal from './components/StrategyWorkbenchModal';
import IntelligencePanel from './components/StrategyReportsPanel';
import TradesDashboard from './components/TradesDashboard';
import * as api from './api';
import { startTicker, stopTicker } from './utils/ticker';
import { PREPOPULATED_WATCHLIST, DEFAULT_STRATEGY_LOGIC } from './constants';

const App: React.FC = () => {
  // --- STATE MANAGEMENT ---
  const [trades, setTrades] = useState<Trade[]>([]);
  const [completedTrades, setCompletedTrades] = useState<Trade[]>([]);
  const [watchlist, setWatchlist] = useState<GroupedWatchlist>(PREPOPULATED_WATCHLIST);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationMessage, setNotificationMessage] = useState("System Initialized in Preview Mode.");
  const [healthState, setHealthState] = useState<SystemHealthState | null>(null);
  const [strategyState, setStrategyState] = useState<StrategyState>({});
  
  // Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWorkbenchOpen, setIsWorkbenchOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  
  // Loading State
  const [isLoading, setIsLoading] = useState(true);
  
  const totalCapital = 1000000;

  // --- DATA HYDRATION & SIMULATION TICKER ---
  const refreshAllStateFromStorage = useCallback(async () => {
    setWatchlist(await api.getWatchlist());
    setStrategyState(await api.getStrategies());
    setTrades(await api.getActiveTrades());
    setCompletedTrades(await api.getCompletedTrades());
    setNotifications(await api.getNotifications());
    setHealthState(await api.getHealth());
  }, []);

  useEffect(() => {
    const initialize = async () => {
      await refreshAllStateFromStorage();
      setIsLoading(false);
    };
    initialize();
    
    const tickerCallback = async () => {
      await api.evaluateOpenTradesAndNotify();
      // After evaluation, refresh trades and notifications to reflect changes
      setTrades(await api.getActiveTrades());
      setCompletedTrades(await api.getCompletedTrades());
      setNotifications(await api.getNotifications());
    };

    startTicker(tickerCallback, 2500); // Tick every 2.5 seconds
    
    return () => stopTicker();
  }, [refreshAllStateFromStorage]);
  
  // --- EVENT HANDLERS ---
  const handleWatchlistUpdate = async (payload: ImportWatchlistPayload) => {
    try {
      const result = await api.importWatchlist(payload);
      setNotificationMessage(result.message);
      setWatchlist(await api.getWatchlist()); // Refresh from storage
    } catch (error: any) {
      setNotificationMessage(`Import failed: ${error.message}`);
    }
  };

  const handleManageStrategy = (categoryKey: string) => {
    setSelectedCategory(categoryKey);
    setIsWorkbenchOpen(true);
  };

  const handleSaveStrategy = async (categoryKey: string, newLogic: StrategyLogic) => {
    const newStrategies = await api.saveStrategy(categoryKey, newLogic);
    setStrategyState(newStrategies);
    setNotificationMessage(`Strategy for ${categoryKey} saved.`);
  };

  const handleClearNotification = async (id: number) => {
    const updatedNotifications = await api.clearNotification(id);
    setNotifications(updatedNotifications);
  };
  
  // --- RENDER ---
  if (isLoading) {
    return <div className="flex h-screen items-center justify-center bg-slate-950 text-cyan-400">Loading Chenna Trading System...</div>;
  }

  return (
    <>
      <div className="bg-cyan-900/50 text-cyan-200 text-center text-xs py-1 border-b border-cyan-400/30">
        <b>Preview Mode: all data simulated. No network calls are made.</b>
      </div>
      <NotificationBar message={notificationMessage} />
      
      <div className="min-h-screen p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex justify-between items-start">
            <Header />
            <div className="flex space-x-2">
                <button onClick={() => setIsSettingsOpen(true)} className="p-2 bg-slate-800/50 hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-300 rounded-full transition-colors" title="Configure Backend">
                    <CogIcon className="w-5 h-5" />
                </button>
            </div>
        </div>
        
        <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6 flex flex-col">
            <div className="flex-shrink-0 h-96">
                {/* FIX: Removed the non-existent 'onCloseTrade' prop. */}
                <ActiveTradesDashboard trades={trades} />
            </div>
            <div className="flex-grow min-h-[30rem]">
                <AnalysisHub 
                  watchlist={watchlist} 
                  onWatchlistUpdate={handleWatchlistUpdate}
                  onManageStrategy={handleManageStrategy}
                />
            </div>
          </div>

          <div className="lg:col-span-1 space-y-6">
            <PortfolioStats activeTrades={trades} totalCapital={totalCapital} />
            <DailySummary completedTrades={completedTrades} />
            <SystemHealth healthState={healthState} />
            <TradesDashboard trades={completedTrades} />
            <IntelligencePanel 
                reports={[]} // Backtest reports can be added to mock later
                notifications={notifications}
                onViewReport={() => {}}
                onClearNotification={handleClearNotification}
            />
          </div>
        </main>
      </div>
      
      <CredentialsManager isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {isWorkbenchOpen && (
         <StrategyWorkbenchModal 
            isOpen={isWorkbenchOpen}
            onClose={() => setIsWorkbenchOpen(false)}
            categoryKey={selectedCategory}
            initialLogic={strategyState[selectedCategory]?.[0]?.logic || DEFAULT_STRATEGY_LOGIC}
            onSaveStrategy={handleSaveStrategy}
         />
      )}
    </>
  );
};

export default App;