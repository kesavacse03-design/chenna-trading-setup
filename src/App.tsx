import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import ActiveTradesDashboard from './components/ActiveTradesDashboard';
import AnalysisHub from './components/AnalysisHub';
import { Trade, Notification, SystemHealthState, GroupedWatchlist, StrategyState, StrategyLogic, ImportWatchlistPayload } from './types';
import CredentialsManager from './components/CredentialsManager';
import PortfolioStats from './components/PortfolioStats';
import DailySummary from './components/DailySummary';
import SystemHealth from './components/SystemHealth';
import HealthMap from './components/HealthMap';
import HealthModal from './components/HealthModal';
import { CogIcon } from './components/icons/CogIcon';
import NotificationBar from './components/NotificationBar';
import StrategyWorkbenchSimple from './components/StrategyWorkbenchSimple';
import IntelligencePanel from './components/StrategyReportsPanel';
import AIInsightsPanel from './components/AIInsightsPanel';
import TradesDashboard from './components/TradesDashboard';
import * as api from './api';
import { startTicker, stopTicker } from './utils/ticker';
import { runSyncQueue } from './utils/sync';
import { normalizeAndMapCategory, migrateLocalStorageAddCategoryMeta } from './utils/categoryMap';
import { PREPOPULATED_WATCHLIST, DEFAULT_STRATEGY_LOGIC } from './constants';

// Lazy-load small auth widget for Upstox
const UpstoxAuthWidget = React.lazy(() => import('./components/UpstoxAuthWidget'));

const App: React.FC = () => {
  // --- STATE MANAGEMENT ---
  const [trades, setTrades] = useState<Trade[]>([]);
  const [completedTrades, setCompletedTrades] = useState<Trade[]>([]);
  const [watchlist, setWatchlist] = useState<GroupedWatchlist>(PREPOPULATED_WATCHLIST);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationMessage, setNotificationMessage] = useState("System Initialized.");
  const [healthState, setHealthState] = useState<SystemHealthState | null>(null);
  const [strategyState, setStrategyState] = useState<StrategyState>({});

  // Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWorkbenchOpen, setIsWorkbenchOpen] = useState(false);
  const [isHealthOpen, setIsHealthOpen] = useState(false);
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
      // Ensure the app doesn't get stuck on the loading screen: race with a short timeout.
      const timeout = new Promise<void>(resolve => setTimeout(resolve, 2500));
      try {
        await Promise.race([
          (async () => { await refreshAllStateFromStorage(); })(),
          timeout,
        ]);
      } catch (e) {
        // Non-fatal in preview mode; proceed to render UI
        console.warn('Startup hydrate failed; continuing in preview mode', e);
      }
      // run canonical migration (ensure categoryRaw/categoryKey exist)
      try { migrateLocalStorageAddCategoryMeta(); } catch (_) { }
      // one-time migration: ensure existing cts_stocks entries have categoryRaw and categoryKey
      try {
        const raw = localStorage.getItem('cts_stocks');
        if (raw) {
          const list = JSON.parse(raw);
          let changed = false;
          for (const it of list) {
            if (!it.categoryRaw || !it.categoryKey) {
              const { categoryKey, categoryRaw } = normalizeAndMapCategory(it.category || it.categoryRaw || '');
              it.categoryRaw = it.categoryRaw || categoryRaw;
              it.categoryKey = it.categoryKey || categoryKey;
              changed = true;
            }
          }
          if (changed) {
            try { localStorage.setItem('cts_stocks', JSON.stringify(list)); console.log('[migrate] cts_stocks updated with categoryKey/categoryRaw'); } catch (_) { }
          }
        }
      } catch (e) { console.warn('Migration failed', e); }
      // attempt to reconcile pending cts_stocks items on startup (non-blocking)
      try {
        // notify that background sync has started
        window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: 'Reconciling pending changes…', kind: 'info' } }));
        void runSyncQueue((m, k) => {
          window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: m, kind: k } }));
        }).catch(() => {
          window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: 'Background sync encountered an error', kind: 'error' } }));
        });
      } catch (_) { }
      setIsLoading(false);
    };
    initialize();
    const onApiChanged = () => { void refreshAllStateFromStorage(); };
    window.addEventListener('cts:api-changed', onApiChanged as EventListener);

    const tickerCallback = async () => {
      await api.evaluateOpenTradesAndNotify();
      // After evaluation, refresh trades and notifications to reflect changes
      setTrades(await api.getActiveTrades());
      setCompletedTrades(await api.getCompletedTrades());
      setNotifications(await api.getNotifications());
    };

    // Start the ticker with a small delay and a relaxed interval to keep dev fast and cool
    setTimeout(() => startTicker(tickerCallback, 3500), 500);

    return () => { stopTicker(); window.removeEventListener('cts:api-changed', onApiChanged as EventListener); };
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

  const apiBase = (window as any).__CTS_API_BASE || (import.meta as any).env?.VITE_API_BASE || '';

  const bannerText = (() => {
    if (!apiBase) return 'Preview Mode: all data simulated. No network calls are made.';
    if (!healthState) return 'Live Mode (initializing)';
    const up = healthState.components.find(c => c.service === 'Upstox API');
    if (up && up.status === 'ok') return 'Live Mode active';
    if (up && up.status === 'error') return 'Live Mode (Upstox disconnected)';
    return 'Live Mode (partial)';
  })();

  return (
    <>
      <div className={`text-center text-xs py-1 border-b ${apiBase ? 'bg-blue-700/40 text-white border-blue-400/30' : 'bg-cyan-900/50 text-cyan-200 border-cyan-400/30'}`}>
        <b>{bannerText}</b>
      </div>
      <NotificationBar message={notificationMessage} />

      <div className="min-h-screen p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex justify-between items-start">
          <Header />
          <div className="flex space-x-2 items-center">
            {/* Upstox login + status */}
            <div className="hidden sm:block">
              {apiBase && <div className="mr-2" />}
            </div>
            { /* Show widget only when an API base is configured */}
            {apiBase ? (
              <React.Suspense fallback={<span className="text-xs text-slate-500">Upstox…</span>}>
                <UpstoxAuthWidget />
              </React.Suspense>
            ) : null}
            <button
              onClick={() => setIsHealthOpen(true)}
              className="px-3 py-1.5 text-[0.7rem] bg-emerald-600/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 rounded-full mr-1 transition-colors"
              title="Open System Health Map"
            >
              Health
            </button>
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
            <AIInsightsPanel />
            <PortfolioStats activeTrades={trades} totalCapital={totalCapital} />
            <DailySummary completedTrades={completedTrades} />
            <SystemHealth healthState={healthState} />
            <HealthMap />
            <TradesDashboard trades={completedTrades} />
            <IntelligencePanel
              reports={[]} // Backtest reports can be added to mock later
              notifications={notifications}
              onViewReport={() => { }}
              onClearNotification={handleClearNotification}
            />
          </div>
        </main>
        ```
        const [healthState, setHealthState] = useState<SystemHealthState | null>(null);
        const [strategyState, setStrategyState] = useState<StrategyState>({ });

          // Modal State
          const [isSettingsOpen, setIsSettingsOpen] = useState(false);
          const [isWorkbenchOpen, setIsWorkbenchOpen] = useState(false);
          const [isHealthOpen, setIsHealthOpen] = useState(false);
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
      // Ensure the app doesn't get stuck on the loading screen: race with a short timeout.
      const timeout = new Promise<void>(resolve => setTimeout(resolve, 2500));
              try {
                await Promise.race([
                  (async () => { await refreshAllStateFromStorage(); })(),
                  timeout,
                ]);
      } catch (e) {
                // Non-fatal in preview mode; proceed to render UI
                console.warn('Startup hydrate failed; continuing in preview mode', e);
      }
              // run canonical migration (ensure categoryRaw/categoryKey exist)
              try {migrateLocalStorageAddCategoryMeta(); } catch (_) { }
      // one-time migration: ensure existing cts_stocks entries have categoryRaw and categoryKey
              try {
        const raw = localStorage.getItem('cts_stocks');
              if (raw) {
          const list = JSON.parse(raw);
              let changed = false;
              for (const it of list) {
            if (!it.categoryRaw || !it.categoryKey) {
              const {categoryKey, categoryRaw} = normalizeAndMapCategory(it.category || it.categoryRaw || '');
              it.categoryRaw = it.categoryRaw || categoryRaw;
              it.categoryKey = it.categoryKey || categoryKey;
              changed = true;
            }
          }
              if (changed) {
            try {localStorage.setItem('cts_stocks', JSON.stringify(list)); console.log('[migrate] cts_stocks updated with categoryKey/categoryRaw'); } catch (_) { }
          }
        }
      } catch (e) {console.warn('Migration failed', e); }
              // attempt to reconcile pending cts_stocks items on startup (non-blocking)
              try {
                // notify that background sync has started
                window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: 'Reconciling pending changes…', kind: 'info' } }));
        void runSyncQueue((m, k) => {
                window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: m, kind: k } }));
        }).catch(() => {
                window.dispatchEvent(new CustomEvent('cts:toast', { detail: { message: 'Background sync encountered an error', kind: 'error' } }));
        });
      } catch (_) { }
              setIsLoading(false);
    };
              initialize();
    const onApiChanged = () => {void refreshAllStateFromStorage(); };
              window.addEventListener('cts:api-changed', onApiChanged as EventListener);

    const tickerCallback = async () => {
                await api.evaluateOpenTradesAndNotify();
              // After evaluation, refresh trades and notifications to reflect changes
              setTrades(await api.getActiveTrades());
              setCompletedTrades(await api.getCompletedTrades());
              setNotifications(await api.getNotifications());
    };

    // Start the ticker with a small delay and a relaxed interval to keep dev fast and cool
    setTimeout(() => startTicker(tickerCallback, 3500), 500);

    return () => {stopTicker(); window.removeEventListener('cts:api-changed', onApiChanged as EventListener); };
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

              const apiBase = (window as any).__CTS_API_BASE || (import.meta as any).env?.VITE_API_BASE || '';

  const bannerText = (() => {
    if (!apiBase) return 'Preview Mode: all data simulated. No network calls are made.';
              if (!healthState) return 'Live Mode (initializing)';
    const up = healthState.components.find(c => c.service === 'Upstox API');
              if (up && up.status === 'ok') return 'Live Mode active';
              if (up && up.status === 'error') return 'Live Mode (Upstox disconnected)';
              return 'Live Mode (partial)';
  })();

              return (
              <>
                <div className={`text-center text-xs py-1 border-b ${apiBase ? 'bg-blue-700/40 text-white border-blue-400/30' : 'bg-cyan-900/50 text-cyan-200 border-cyan-400/30'}`}>
                  <b>{bannerText}</b>
                </div>
                <NotificationBar message={notificationMessage} />

                <div className="min-h-screen p-4 sm:p-6 lg:p-8 space-y-6">
                  <div className="flex justify-between items-start">
                    <Header />
                    <div className="flex space-x-2 items-center">
                      {/* Upstox login + status */}
                      <div className="hidden sm:block">
                        {apiBase && <div className="mr-2" />}
                      </div>
                      { /* Show widget only when an API base is configured */}
                      {apiBase ? (
                        <React.Suspense fallback={<span className="text-xs text-slate-500">Upstox…</span>}>
                          <UpstoxAuthWidget />
                        </React.Suspense>
                      ) : null}
                      <button
                        onClick={() => setIsHealthOpen(true)}
                        className="px-3 py-1.5 text-[0.7rem] bg-emerald-600/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 rounded-full mr-1 transition-colors"
                        title="Open System Health Map"
                      >
                        Health
                      </button>
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
                      <AIInsightsPanel />
                      <PortfolioStats activeTrades={trades} totalCapital={totalCapital} />
                      <DailySummary completedTrades={completedTrades} />
                      <SystemHealth healthState={healthState} />
                      <HealthMap />
                      <TradesDashboard trades={completedTrades} />
                      <IntelligencePanel
                        reports={[]} // Backtest reports can be added to mock later
                        notifications={notifications}
                        onViewReport={() => { }}
                        onClearNotification={handleClearNotification}
                      />
                    </div>
                  </main>
                </div>

                <CredentialsManager isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
                <HealthModal isOpen={isHealthOpen} onClose={() => setIsHealthOpen(false)} />

                {isWorkbenchOpen && (
                  <StrategyWorkbenchSimple
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
              ```