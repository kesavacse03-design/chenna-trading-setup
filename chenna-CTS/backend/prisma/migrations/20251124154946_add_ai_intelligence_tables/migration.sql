-- CreateTable
CREATE TABLE "signals" (
    "id" SERIAL NOT NULL,
    "signal_id" VARCHAR(100) NOT NULL,
    "category_key" VARCHAR(100) NOT NULL,
    "symbol" VARCHAR(50) NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "entry_price" DECIMAL(10,2) NOT NULL,
    "entry_conditions" JSONB NOT NULL,
    "buffer_minutes" INTEGER NOT NULL DEFAULT 15,
    "ai_confidence" DECIMAL(5,2),
    "ai_validation" JSONB,
    "target_price" DECIMAL(10,2) NOT NULL,
    "stop_loss" DECIMAL(10,2) NOT NULL,
    "trailing_stop_percent" DECIMAL(5,2) NOT NULL,
    "current_trailing_stop" DECIMAL(10,2),
    "tracking_days" INTEGER NOT NULL,
    "tracking_status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "exited_at" TIMESTAMP(3),
    "current_price" DECIMAL(10,2),
    "exit_price" DECIMAL(10,2),
    "unrealized_pnl" DECIMAL(10,2),
    "realized_pnl" DECIMAL(10,2),
    "days_in_trade" INTEGER NOT NULL DEFAULT 0,
    "strategy_version" VARCHAR(20) NOT NULL DEFAULT 'v1',
    "failure_reason" TEXT,
    "market_context" JSONB,
    "telegram_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shadow_learnings" (
    "id" SERIAL NOT NULL,
    "category_key" VARCHAR(100) NOT NULL,
    "signal_id" VARCHAR(100),
    "failure_type" VARCHAR(50) NOT NULL,
    "ai_analysis" JSONB NOT NULL,
    "root_cause" TEXT,
    "suggested_improvement" JSONB NOT NULL,
    "price_history" JSONB,
    "volume_profile" JSONB,
    "market_sentiment" VARCHAR(20),
    "news_events" JSONB,
    "applied_to_shadow" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shadow_learnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_versions" (
    "id" SERIAL NOT NULL,
    "category_key" VARCHAR(100) NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "description" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "params" JSONB NOT NULL,
    "accuracy" DECIMAL(5,2),
    "total_signals" INTEGER NOT NULL DEFAULT 0,
    "successful_signals" INTEGER NOT NULL DEFAULT 0,
    "failed_signals" INTEGER NOT NULL DEFAULT 0,
    "avg_pnl" DECIMAL(10,2),
    "max_drawdown" DECIMAL(10,2),
    "expectancy" DECIMAL(10,4),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "is_shadow" BOOLEAN NOT NULL DEFAULT false,
    "promoted_at" TIMESTAMP(3),
    "promoted_from" VARCHAR(20),
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "learning_source" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strategy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_config" (
    "id" SERIAL NOT NULL,
    "bot_token" VARCHAR(500) NOT NULL,
    "chat_id" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "notify_signals" BOOLEAN NOT NULL DEFAULT true,
    "notify_updates" BOOLEAN NOT NULL DEFAULT true,
    "notify_exits" BOOLEAN NOT NULL DEFAULT true,
    "notify_ai_insights" BOOLEAN NOT NULL DEFAULT true,
    "daily_update_time" VARCHAR(10),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_sentiment_log" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(50) NOT NULL,
    "date" DATE NOT NULL,
    "sentiment" VARCHAR(20) NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "ai_analysis" JSONB NOT NULL,
    "key_events" JSONB,
    "recommendation" VARCHAR(20),
    "news_sources" JSONB,
    "social_media_data" JSONB,
    "market_indicators" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_sentiment_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signals_signal_id_key" ON "signals"("signal_id");

-- CreateIndex
CREATE INDEX "signals_category_key_tracking_status_idx" ON "signals"("category_key", "tracking_status");

-- CreateIndex
CREATE INDEX "signals_symbol_tracking_status_idx" ON "signals"("symbol", "tracking_status");

-- CreateIndex
CREATE INDEX "signals_tracking_status_idx" ON "signals"("tracking_status");

-- CreateIndex
CREATE INDEX "shadow_learnings_category_key_idx" ON "shadow_learnings"("category_key");

-- CreateIndex
CREATE INDEX "shadow_learnings_failure_type_idx" ON "shadow_learnings"("failure_type");

-- CreateIndex
CREATE INDEX "strategy_versions_category_key_is_active_idx" ON "strategy_versions"("category_key", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "strategy_versions_category_key_version_key" ON "strategy_versions"("category_key", "version");

-- CreateIndex
CREATE INDEX "market_sentiment_log_symbol_idx" ON "market_sentiment_log"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "market_sentiment_log_symbol_date_key" ON "market_sentiment_log"("symbol", "date");

-- AddForeignKey
ALTER TABLE "shadow_learnings" ADD CONSTRAINT "shadow_learnings_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("signal_id") ON DELETE SET NULL ON UPDATE CASCADE;
