export enum TradeType {
  INTRADAY = 'Intraday',
  SWING = 'Swing',
}

export enum TradeStatus {
  ACTIVE = 'Active',
  TARGET_HIT = 'Target Hit',
  SL_HIT = 'SL Hit',
  EXPIRED = 'Expired',
}

export interface Trade {
  id: number;
  ticker: string;
  type: string; 
  entry: number;
  target: number;
  stopLoss: number;
  status: TradeStatus;
  rr: string;
  openDate: Date;
  age: number;
  positionSize: number;
  capitalAtRisk: number;
  isNew?: boolean;
  isUpdated?: boolean;
  closeDate?: Date;
  pnl?: number;
  strategyVersionId: number;
}

export interface BacktestEntry {
    ticker: string;
    entryDate: string;
    outcome: 'Win' | 'Loss';
    pnl: number;
    reason: string;
}


export enum HealthStatus {
  OK = 'OK',
  ERROR = 'Error',
  WARN = 'Warning',
}

export interface HealthItem {
  service: string;
  status: HealthStatus;
}

export interface StockData {
  stockName: string;
  date: string; // The date it was identified/added
  price?: number; 
  isNew?: boolean;
  isUpdated?: boolean;
  addedDate: string; // ISO string of when it was added to the list
  status: 'watching' | 'signaled' | 'in_trade' | 'closed' | 'expired';
  expires_at: string; // ISO string for expiry
  lastPrice?: number;
  priceChange?: 'up' | 'down' | 'none';
}

export interface ParsedStockFile {
  [category: string]: StockData[];
}

export interface GroupedWatchlist {
    [page: string]: ParsedStockFile;
}

// FIX: Added and exported the ImportWatchlistPayload type for global use.
export interface ImportWatchlistPayload {
  category: string;
  rows: { symbol: string; ltp: number; date: string }[];
}

export interface TradeSetup {
  signal: 'BUY' | 'SELL' | 'HOLD';
  entry: number;
  target: number;
  stopLoss: number;
  rationale: string;
}

export interface AnalysisResult {
  analysis: {
    strength: string;
    traps:string;
    psychology: string;
  };
  tradeSetup: TradeSetup;
  confidenceScore: number;
}

export interface Notification {
  id: number;
  timestamp: Date;
  message: string;
  type: 'info' | 'success' | 'error';
}

export interface SystemLearning {
    tradeId: number;
    ticker: string;
    analysis: {
        failurePattern: string;
        v2Improvement: string;
    }
}

export interface StrategyPerformance {
    winRate: number;
    totalTrades: number;
    netPL: number;
}

export interface BacktestReport {
    id: string;
    categoryKey: string;
    versionId: number;
    generatedAt: Date;
    status: 'candidate' | 'live';
    summary: {
        accuracy: number;
        totalTrades: number;
        wins: number;
        losses: number;
        averagePL: number;
        confidenceRating: number;
        maxDrawdown: number;
    };
    tradeLog: BacktestEntry[];
    suggestions: string[];
    tickersUsed: string[];
    backtestPeriod: string;
}


export interface StrategyLogic {
  description: string;
  rules: string[];
  indicators?: string[];
}

export interface StrategyVersion {
    id: number;
    categoryKey: string;
    status: 'live' | 'shadow' | 'archived';
    performance: StrategyPerformance;
    learnings: SystemLearning[];
    logic: StrategyLogic; 
    backtestReportId?: string;
}

export interface StrategyState {
    [categoryKey: string]: StrategyVersion[];
}

export interface HealthStatusAPI {
  service: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
}

export interface SystemHealthState {
    status: 'ok' | 'warning' | 'error';
    components: HealthStatusAPI[];
    timestamp: string;
}