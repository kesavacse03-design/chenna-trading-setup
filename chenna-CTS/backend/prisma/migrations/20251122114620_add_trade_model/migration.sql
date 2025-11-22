-- CreateTable
CREATE TABLE "trades" (
    "id" SERIAL NOT NULL,
    "stock_symbol" VARCHAR(50) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "strategy_version" VARCHAR(20) NOT NULL DEFAULT 'V1',
    "direction" VARCHAR(10) NOT NULL,
    "entry_price" DECIMAL(10,2),
    "target_price" DECIMAL(10,2) NOT NULL,
    "stop_loss" DECIMAL(10,2) NOT NULL,
    "trailing_stop" DECIMAL(10,2) NOT NULL,
    "current_trail" DECIMAL(10,2),
    "status" VARCHAR(20) NOT NULL,
    "entry_date" TIMESTAMP(3),
    "exit_date" TIMESTAMP(3),
    "exit_price" DECIMAL(10,2),
    "pnl" DECIMAL(10,2),
    "pnl_percent" DECIMAL(10,4),
    "tracking_days" INTEGER NOT NULL DEFAULT 0,
    "max_tracking_days" INTEGER NOT NULL DEFAULT 10,
    "signal_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trades_status_category_idx" ON "trades"("status", "category");

-- CreateIndex
CREATE INDEX "trades_stock_symbol_status_idx" ON "trades"("stock_symbol", "status");
