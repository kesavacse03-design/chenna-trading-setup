-- Shadow Learner Tables for Phase 3
-- Tracks all backtest outcomes, learned patterns, and strategy improvements

-- Learning Outcomes: Track every backtest/trade for pattern learning
CREATE TABLE IF NOT EXISTS "learning_outcomes" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" TEXT NOT NULL, -- 'tt_backtest', 'v1_execution', 'labs_discovery'
  "category_key" TEXT NOT NULL,
  "strategy_params" JSONB NOT NULL, -- All strategy parameters used
  "result" JSONB NOT NULL, -- Full backtest/execution result
  "market_context" JSONB, -- Market conditions at time of test
  "timestamp" TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Denormalized metrics for fast queries
  "accuracy" DOUBLE PRECISION,
  "win_rate" DOUBLE PRECISION,
  "pnl" DOUBLE PRECISION,
  "drawdown" DOUBLE PRECISION,
  "trade_count" INTEGER,
  
  CONSTRAINT "learning_outcomes_category_key_idx" 
    FOREIGN KEY ("category_key") REFERENCES "categories"("key") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_learning_outcomes_category_timestamp" 
  ON "learning_outcomes"("category_key", "timestamp" DESC);
CREATE INDEX IF NOT EXISTS "idx_learning_outcomes_type_accuracy" 
  ON "learning_outcomes"("type", "accuracy" DESC);
CREATE INDEX IF NOT EXISTS "idx_learning_outcomes_timestamp" 
  ON "learning_outcomes"("timestamp" DESC);

-- Pattern Observations: Discovered patterns from outcome analysis
CREATE TABLE IF NOT EXISTS "pattern_observations" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "category_key" TEXT NOT NULL,
  "pattern_type" TEXT NOT NULL, -- 'parameter_cluster', 'market_regime', 'failure_pattern'
  "pattern" JSONB NOT NULL, -- Pattern details
  "confidence" DOUBLE PRECISION NOT NULL, -- 0.0 to 1.0
  "sample_size" INTEGER NOT NULL, -- How many outcomes this is based on
  "discovered_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "valid_until" TIMESTAMP, -- Pattern expiry (optional)
  
  CONSTRAINT "pattern_observations_category_key_idx" 
    FOREIGN KEY ("category_key") REFERENCES "categories"("key") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_pattern_observations_category_confidence" 
  ON "pattern_observations"("category_key", "confidence" DESC);
CREATE INDEX IF NOT EXISTS "idx_pattern_observations_discovered_at" 
  ON "pattern_observations"("discovered_at" DESC);

-- Strategy Improvements: AI-suggested improvements awaiting application
CREATE TABLE IF NOT EXISTS "strategy_improvements" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "category_key" TEXT NOT NULL,
  "original_params" JSONB NOT NULL,
  "improved_params" JSONB NOT NULL,
  "expected_gain" DOUBLE PRECISION NOT NULL, -- Expected improvement (0.0 to 1.0)
  "actual_gain" DOUBLE PRECISION, -- Actual after applied (null until applied)
  "status" TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'applied', 'rejected', 'needs_review'
  "applied_at" TIMESTAMP,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "notes" TEXT, -- Human/AI notes
  
  CONSTRAINT "strategy_improvements_category_key_idx" 
    FOREIGN KEY ("category_key") REFERENCES "categories"("key") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_strategy_improvements_category_status" 
  ON "strategy_improvements"("category_key", "status");
CREATE INDEX IF NOT EXISTS "idx_strategy_improvements_created_at" 
  ON "strategy_improvements"("created_at" DESC);

-- Adaptation History: Log of all auto-adaptations
CREATE TABLE IF NOT EXISTS "adaptation_history" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "category_key" TEXT NOT NULL,
  "from_version" TEXT NOT NULL, -- e.g., "TT-V3"
  "to_version" TEXT NOT NULL, -- e.g., "TT-V4"
  "changes" JSONB NOT NULL, -- What parameters changed
  "performance_before" JSONB NOT NULL, -- Metrics before adaptation
  "performance_after" JSONB NOT NULL, -- Metrics after adaptation
  "auto_applied" BOOLEAN NOT NULL DEFAULT FALSE, -- True if auto-applied, false if manual
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT "adaptation_history_category_key_idx" 
    FOREIGN KEY ("category_key") REFERENCES "categories"("key") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_adaptation_history_category_created" 
  ON "adaptation_history"("category_key", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_adaptation_history_auto_applied" 
  ON "adaptation_history"("auto_applied", "created_at" DESC);

-- Shadow Learner Config: Per-category learning settings
CREATE TABLE IF NOT EXISTS "shadow_learner_config" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "category_key" TEXT NOT NULL UNIQUE,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "automation_level" INTEGER NOT NULL DEFAULT 2, -- 1=conservative, 2=moderate, 3=aggressive
  "learning_window_days" INTEGER NOT NULL DEFAULT 30,
  "min_sample_size" INTEGER NOT NULL DEFAULT 20,
  "confidence_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  
  CONSTRAINT "shadow_learner_config_category_key_idx" 
    FOREIGN KEY ("category_key") REFERENCES "categories"("key") ON DELETE CASCADE
);
