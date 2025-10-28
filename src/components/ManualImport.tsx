// add after imports
const CATEGORY_GROUPS: Record<string, string[]> = {
  "INTRA DAY CATEGORIES": [
    "HIGH POWERED STOCKS",
    "INTRADAY BOOST",
    "DOWNSIDE LOM INTRA",
    "UPSIDE LOM INTRA",
    "DAILY CONTRACTION",
    "PRE MARKET",
  ],
  "SWING TRADE CATEGORIES": [
    "DOWNSIDE LOM SWING",
    "UPSIDE LOM SWING",
    "MULTI RESISTANCE BO",
    "MULTI SUPPORT BO",
    "SHORT TERM SWING BO - UP",
    "SHORT TERM SWING BO - DOWN",
    "LONG TERM SWING BO - UP",
    "LONG TERM SWING BO - DOWN",
  ],
};

import React, { useState, useEffect } from "react";
import { X, PlusCircle, CheckCircle, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";

interface ManualImportProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (rows: any[]) => void;
}

interface StockRow {
  id: number;
  symbol: string;
  name?: string;
  category: string;
  date: string;
  price?: number;
  valid: boolean;
  error?: string;
}

const MOCK_SYMBOLS = ["TCS", "INFY", "RELIANCE", "TITAN", "HDFCBANK", "ITC", "SBIN", "AXISBANK"];

const ManualImport: React.FC<ManualImportProps> = ({ isOpen, onClose, onImport }) => {
  const defaultCategory = Object.values(CATEGORY_GROUPS)[0][0];
  const [selectedCategory, setSelectedCategory] = useState<string>(defaultCategory);

  const [rows, setRows] = useState<StockRow[]>([
    { id: Date.now(), symbol: "", category: defaultCategory, date: new Date().toISOString().slice(0, 10), valid: false },
  ]);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen)
      setRows([{ id: Date.now(), symbol: "", category: defaultCategory, date: new Date().toISOString().slice(0, 10), valid: false }]);
  }, [isOpen, defaultCategory]);

  // when header selectedCategory changes, update all rows to match
  React.useEffect(() => {
    setRows((prev) => prev.map((r) => ({ ...r, category: selectedCategory })));
  }, [selectedCategory]);

  const validateSymbol = (symbol: string) => {
    const match = MOCK_SYMBOLS.find((s) => s.toLowerCase() === symbol.toLowerCase());
    if (!symbol.trim()) return { valid: false, error: "Symbol required" };
    if (!match) return { valid: false, error: "Invalid or unknown stock" };
    return { valid: true, error: undefined };
  };

  const handleChange = (id: number, field: keyof StockRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value, ...(field === "symbol" ? validateSymbol(value) : {}) } : r))
    );
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      { id: Date.now(), symbol: "", category: selectedCategory, date: new Date().toISOString().slice(0, 10), valid: false },
    ]);
  };

  const handleImport = () => {
    const invalid = rows.filter((r) => !r.valid);
    if (invalid.length) {
      setGlobalError("Please fix invalid stocks before importing.");
      return;
    }

    // Simulate Upstox price fetch
    const enriched = rows.map((r) => ({
      ...r,
      price: (Math.random() * 1000 + 1000).toFixed(2),
    }));

    localStorage.setItem("CTS_WATCHLIST", JSON.stringify(enriched));
   onImport(enriched);

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        className="bg-[#0f172a] text-white w-[600px] rounded-2xl shadow-lg p-6"
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-cyan-400">Manual Import Watchlist</h2>
          <div className="flex items-center gap-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-900/50 rounded px-2 py-1 text-sm text-slate-200"
            >
              {Object.entries(CATEGORY_GROUPS).map(([groupLabel, cats]) => (
                <optgroup label={groupLabel} key={groupLabel}>
                  {cats.map((c) => (
                    <option value={c} key={c}>
                      {c}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button onClick={onClose}>
              <X className="text-gray-400 hover:text-white" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto">
          {rows.map((row) => (
            <div key={row.id} className="grid grid-cols-5 gap-2 items-center bg-slate-800/40 p-2 rounded-md">
              <div>
                <input
                  className="bg-slate-900/50 w-full rounded px-2 py-1 text-sm focus:ring-1 focus:ring-cyan-500"
                  placeholder="Stock Symbol"
                  value={row.symbol}
                  onChange={(e) => handleChange(row.id, 'symbol', e.target.value)}
                />
                {row.error && <span className="text-xs text-red-400">{row.error}</span>}
              </div>
              <div>
                <input
                  type="date"
                  className="bg-slate-900/50 w-full rounded px-2 py-1 text-sm"
                  value={row.date}
                  onChange={(e) => handleChange(row.id, 'date', e.target.value)}
                />
              </div>
              <div>
                <select
                  className="bg-slate-900/50 w-full rounded px-2 py-1 text-sm"
                  value={row.category}
                  onChange={(e) => handleChange(row.id, 'category', e.target.value)}
                >
                  {Object.entries(CATEGORY_GROUPS).map(([groupLabel, cats]) => (
                    <optgroup label={groupLabel} key={groupLabel}>
                      {cats.map((c) => (
                        <option value={c} key={c}>
                          {c}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="flex justify-center">
                {row.valid ? (
                  <CheckCircle className="text-green-400 w-5 h-5" />
                ) : (
                  <AlertTriangle className="text-yellow-400 w-5 h-5" />
                )}
              </div>
              <div className="flex justify-center">
                <button
                  className="text-red-400 hover:text-red-300 text-xs"
                  onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        {globalError && <div className="text-red-400 text-sm mt-2">{globalError}</div>}

        <div className="flex justify-between items-center mt-5">
          <button
            className="flex items-center gap-2 text-sm bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg"
            onClick={addRow}
          >
            <PlusCircle size={16} /> Add Row
          </button>

          <div className="flex gap-2">
            <button
              className="bg-gray-600 hover:bg-gray-500 text-sm px-4 py-2 rounded-lg"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="bg-cyan-600 hover:bg-cyan-500 text-sm px-4 py-2 rounded-lg"
              onClick={handleImport}
            >
              Import Stocks
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ManualImport;
