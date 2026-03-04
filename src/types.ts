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
    traps: string;
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
    // Enriched metrics (event simulation layer)
    totalNetPnl?: number; // absolute aggregate PnL across events
    avgNetPnlPerEvent?: number; // average net PnL per event
    avgRMultiple?: number; // average R multiple across trades/events
    expectancy?: number; // expectancy per trade/event (R terms)
  };
  tradeLog: BacktestEntry[];
  suggestions: string[];
  tickersUsed: string[];
  backtestPeriod: string;
}

// Category event simulation aggregate (run-events-<CATEGORY>.report.json)
export interface CategoryEventReport {
  categoryKey: string;
  totalEvents: number;
  eventsWithTrades: number;
  profitableEvents: number;
  failedEvents: number;
  accuracy: number; // 0..1 fraction
  totalTrades: number;
  totalNetPnl: number;
  avgNetPnlPerEvent: number;
  avgRMultiple: number;
  expectancy: number;
  maxDrawdown: number; // absolute drawdown
  strategyConfig?: Record<string, any>;
  topSymbolsByAggregatePnl?: { symbol: string; pnl: number }[];
  bottomSymbolsByAggregatePnl?: { symbol: string; pnl: number }[];
  generatedAt: string;
  source?: string;
  successWithin10Days?: number;
  failWithin10Days?: number;
  expiredTrades?: number;
  successRateWithin10Days?: number; // percentage 0..100
}

export interface TradeDetail {
  symbol: string;
  entryDate: string | null;
  exitDate: string | null;
  signalType: string; // BUY/SELL
  holdingDays: number | null;
  entry: number;
  exit: number;
  stop: number;
  target: number;
  pnl: number;
  rMultiple: number | null;
  outcome: 'TARGET' | 'STOP' | 'EXPIRED' | string;
  expired?: boolean;
}

export interface CandidateRank {
  config: Record<string, any>;
  runId?: string;
  resultsPath?: string;
  tradesPath?: string;
  tradesCsvUrl?: string | null;
  resultsJsonUrl?: string | null;
  metrics?: { netPnl?: number; winRate?: number; profitFactor?: number; maxDrawdown?: number; avgReturn?: number };
}

export interface CompositeOptimizationResponse {
  ok: boolean;
  categoryKey: string;
  candidates: number;
  ranked: CandidateRank[];
  selected?: { config: Record<string, any>; metrics: any; runId?: string } | null;
  persisted?: boolean;
  snapshotPath?: string | null;
  timedOut?: boolean;
  startedAt?: number;
  durationMs?: number;
  threshold?: { minAccuracyPct: number; minExpectancy: number; maxDrawdown: number };
  autoPersist?: boolean;
}


export interface StrategyLogic {
  description: string;
  rules: string[];
  indicators?: string[];
}

// V1 Strategy Snapshot (immutable baseline per category)
export interface StrategyParamsV1 {
  shortMA: number; // e.g., 20
  longMA: number;  // e.g., 50
  stopPercent: number; // e.g., 0.08 means 8%
  targetPercent: number; // e.g., 0.12 means 12%
  volumeMultiplier: number; // e.g., 1.5x average
  versionTag: string; // 'V1', 'V2', etc.
}

export interface StrategySnapshotV1 {
  categoryKey: string;
  description: string;
  rules: string[];
  params: StrategyParamsV1;
  createdAt: string; // ISO
  immutable: true;
}

export interface AssignedExample {
  symbol: string;
  listedDate: string; // YYYY-MM-DD
  categoryKey: string;
}

export type BacktestOutcome = 'PASSED' | 'FAILED';
export type StopReason = 'TARGET' | 'STOP' | 'TIMEOUT' | 'NONE' | 'MISSING_DATA';

export interface BacktestResult {
  example: AssignedExample;
  outcome: BacktestOutcome;
  reason: string; // one-line human reason
  daysToExit: number;
  returnPct: number; // signed percentage
  stopReason: StopReason;
}

export interface CategoryMetrics {
  categoryKey: string;
  totalExamples: number;
  tested: number;
  passed: number;
  failed: number;
  winRate: number; // 0..1
  profitFactor: number; // simple PF estimate
  avgReturnPct: number;
  maxDrawdownPct: number; // placeholder in V1
  lastRunAt?: string;
  versionTag: string; // e.g., 'V1'
}

export interface AuditTrailEntry {
  runId: string;
  timestamp: string;
  inputs: {
    examples: AssignedExample[];
    dateRange?: { from: string; to: string };
    strategy: StrategySnapshotV1;
    dataSource: string; // e.g., 'Upstox'
  };
  summary: string;
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

export interface Category {
  id: number;
  key: string;
  description: string | null;
  enabled: boolean;
  scanningEnabled: boolean;
  signalGenerationEnabled: boolean;
  stocks?: any[];
}

export interface SystemHealthState {
  status: 'ok' | 'warning' | 'error';
  components: HealthStatusAPI[];
  timestamp: string;
}