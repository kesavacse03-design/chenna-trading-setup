-- CreateTable
CREATE TABLE "stocks" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255),
    "exchange" VARCHAR(20),
    "instrument_key" VARCHAR(100),
    "instrument_type" VARCHAR(20),
    "isin" VARCHAR(20),
    "sector" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_categories" (
    "id" SERIAL NOT NULL,
    "stock_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "added_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategies" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER,
    "description" TEXT,
    "rules" JSONB,
    "params" JSONB,
    "metrics" JSONB,
    "version" VARCHAR(20) DEFAULT 'V1',
    "promoted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backtest_results" (
    "id" SERIAL NOT NULL,
    "job_id" VARCHAR(100) NOT NULL,
    "strategy_id" INTEGER,
    "category_id" INTEGER,
    "status" VARCHAR(20),
    "metrics" JSONB,
    "trades" JSONB,
    "equity_curve" JSONB,
    "config" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backtest_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ohlcv_cache" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(50) NOT NULL,
    "interval" VARCHAR(10) NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "data" JSONB NOT NULL,
    "source" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "ohlcv_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stocks_symbol_key" ON "stocks"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_instrument_key_key" ON "stocks"("instrument_key");

-- CreateIndex
CREATE INDEX "stocks_symbol_idx" ON "stocks"("symbol");

-- CreateIndex
CREATE INDEX "stocks_instrument_key_idx" ON "stocks"("instrument_key");

-- CreateIndex
CREATE UNIQUE INDEX "categories_key_key" ON "categories"("key");

-- CreateIndex
CREATE INDEX "stock_categories_category_id_idx" ON "stock_categories"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_categories_stock_id_category_id_key" ON "stock_categories"("stock_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "backtest_results_job_id_key" ON "backtest_results"("job_id");

-- CreateIndex
CREATE INDEX "backtest_results_job_id_idx" ON "backtest_results"("job_id");

-- CreateIndex
CREATE INDEX "ohlcv_cache_symbol_interval_idx" ON "ohlcv_cache"("symbol", "interval");

-- CreateIndex
CREATE UNIQUE INDEX "ohlcv_cache_symbol_interval_from_date_to_date_key" ON "ohlcv_cache"("symbol", "interval", "from_date", "to_date");

-- AddForeignKey
ALTER TABLE "stock_categories" ADD CONSTRAINT "stock_categories_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_categories" ADD CONSTRAINT "stock_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtest_results" ADD CONSTRAINT "backtest_results_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtest_results" ADD CONSTRAINT "backtest_results_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
