-- AlterTable
ALTER TABLE "strategy_versions" ADD COLUMN     "labs_run_id" VARCHAR(100),
ADD COLUMN     "source" VARCHAR(50) NOT NULL DEFAULT 'manual';

-- CreateTable
CREATE TABLE "labs_runs" (
    "id" TEXT NOT NULL,
    "category_key" VARCHAR(100) NOT NULL,
    "tt_version" VARCHAR(20) NOT NULL,
    "accuracy" DECIMAL(5,2) NOT NULL,
    "trades_tested" INTEGER NOT NULL,
    "recommended_logic" JSONB NOT NULL,
    "entry_conditions" JSONB NOT NULL,
    "exit_conditions" JSONB NOT NULL,
    "trap_rules" JSONB NOT NULL,
    "cache_status" JSONB NOT NULL,
    "performance_metrics" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promoted_to_version_id" INTEGER,

    CONSTRAINT "labs_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labs_cache" (
    "symbol" VARCHAR(50) NOT NULL,
    "last_research_date" TIMESTAMP(3) NOT NULL,
    "best_patterns" JSONB NOT NULL,
    "traps_detected" JSONB NOT NULL,
    "technical_combos" JSONB NOT NULL,
    "volume_profile" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "labs_cache_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "trap_detections" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(50) NOT NULL,
    "date" DATE NOT NULL,
    "trap_type" VARCHAR(50) NOT NULL,
    "confidence" DECIMAL(5,2) NOT NULL,
    "indicators" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trap_detections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "labs_runs_category_key_tt_version_idx" ON "labs_runs"("category_key", "tt_version");

-- CreateIndex
CREATE INDEX "labs_runs_accuracy_idx" ON "labs_runs"("accuracy");

-- CreateIndex
CREATE INDEX "trap_detections_symbol_date_idx" ON "trap_detections"("symbol", "date");

-- CreateIndex
CREATE INDEX "trap_detections_trap_type_idx" ON "trap_detections"("trap_type");

-- CreateIndex
CREATE INDEX "strategy_versions_labs_run_id_idx" ON "strategy_versions"("labs_run_id");
