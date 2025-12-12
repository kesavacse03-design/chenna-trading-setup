-- Migration: Add Time-Travel Labs Models
-- Date: 2025-11-28
-- Description: Adds LabsRun, LabsCache, and TrapDetection tables for Time-Travel Labs system

-- Labs Run table: stores each Time-Travel Labs research run
CREATE TABLE IF NOT EXISTS labs_runs (
  id VARCHAR(100) PRIMARY KEY,
  category_key VARCHAR(100) NOT NULL,
  tt_version VARCHAR(20) NOT NULL,
  accuracy DECIMAL(5, 2) NOT NULL,
  trades_tested INTEGER NOT NULL,
  recommended_logic JSONB NOT NULL,
  entry_conditions JSONB NOT NULL,
  exit_conditions JSONB NOT NULL,
  trap_rules JSONB NOT NULL,
  cache_status JSONB NOT NULL,
  performance_metrics JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  promoted_to_version_id INTEGER REFERENCES strategy_versions(id) ON DELETE SET NULL
);

CREATE INDEX idx_labs_runs_category ON labs_runs(category_key, tt_version);
CREATE INDEX idx_labs_runs_accuracy ON labs_runs(accuracy);

-- Labs Cache table: caches stock research to avoid reprocessing
CREATE TABLE IF NOT EXISTS labs_cache (
  symbol VARCHAR(50) PRIMARY KEY,
  last_research_date TIMESTAMP NOT NULL,
  best_patterns JSONB NOT NULL,
  traps_detected JSONB NOT NULL,
  technical_combos JSONB NOT NULL,
  volume_profile JSONB,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trap Detection table: stores detected institutional traps
CREATE TABLE IF NOT EXISTS trap_detections (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  trap_type VARCHAR(50) NOT NULL,
  confidence DECIMAL(5, 2) NOT NULL,
  indicators JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_trap_detections_symbol ON trap_detections(symbol, date);
CREATE INDEX idx_trap_detections_type ON trap_detections(trap_type);

-- Add labs_run_id to existing strategy_versions table
ALTER TABLE strategy_versions 
ADD COLUMN IF NOT EXISTS labs_run_id VARCHAR(100) REFERENCES labs_runs(id) ON DELETE SET NULL;

-- Add source column to track where version came from (labs, shadow, manual)
ALTER TABLE strategy_versions 
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual';

CREATE INDEX idx_strategy_versions_labs ON strategy_versions(labs_run_id);
