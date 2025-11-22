-- CreateTable
CREATE TABLE "instruments" (
    "id" SERIAL NOT NULL,
    "symbol" VARCHAR(50) NOT NULL,
    "trading_symbol" VARCHAR(100),
    "name" VARCHAR(255),
    "exchange" VARCHAR(20) NOT NULL,
    "segment" VARCHAR(50),
    "instrument_key" VARCHAR(100),
    "instrument_type" VARCHAR(20),
    "isin" VARCHAR(20),
    "lot_size" INTEGER,
    "tick_size" DECIMAL(10,4),
    "sector" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "instruments_symbol_key" ON "instruments"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "instruments_instrument_key_key" ON "instruments"("instrument_key");

-- CreateIndex
CREATE INDEX "instruments_symbol_idx" ON "instruments"("symbol");

-- CreateIndex
CREATE INDEX "instruments_exchange_symbol_idx" ON "instruments"("exchange", "symbol");

-- CreateIndex
CREATE INDEX "instruments_instrument_key_idx" ON "instruments"("instrument_key");
