import React, { useState, useCallback, useMemo } from 'react';
import { XMarkIcon } from './icons/XMarkIcon';
import { UploadIcon } from './icons/UploadIcon';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { parseWatchlist, ParseResult } from '../utils/watchlistParser';
import { PREPOPULATED_WATCHLIST } from '../constants';
// FIX: Import the shared ImportWatchlistPayload type.
import { ImportWatchlistPayload } from '../types';

interface WatchlistImporterProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (payload: ImportWatchlistPayload) => void;
}

const WatchlistImporter: React.FC<WatchlistImporterProps> = ({ isOpen, onClose, onImport }) => {
  type Step = 'upload' | 'preview';
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  const [parsedData, setParsedData] = useState<ParseResult>({ rows: [], errors: [] });
  const [selectedCategory, setSelectedCategory] = useState<string>('UPSIDE_LOM_SWING');

  const allCategories = useMemo(() => Object.values(PREPOPULATED_WATCHLIST).flatMap(page => Object.keys(page)), []);

  const resetState = () => {
    setStep('upload'); setFileName(''); setError(null); setParsedData({ rows: [], errors: [] });
  };

  const handleClose = () => { resetState(); onClose(); };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setFileName(file.name);
    const textContent = await file.text();
    const result = parseWatchlist(textContent);
    
    if (result.rows.length > 0) {
      setParsedData(result);
      setStep('preview');
    } else {
      setError(result.errors[0] || "Could not find any valid data in the file.");
    }
  };

  const handleConfirmImport = () => {
    const validRows = parsedData.rows
        .filter(row => row.ltp !== null && row.date !== null)
        .map(row => ({
            symbol: row.symbol,
            ltp: row.ltp!,
            date: row.date!
        }));
    
    if (validRows.length > 0) {
      onImport({ category: selectedCategory, rows: validRows });
      handleClose();
    } else {
      setError("No rows with both price and date found to import.");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 animate-fade-in-down" onClick={handleClose} role="dialog">
      <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl w-full max-w-2xl m-4" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-cyan-300">Import Watchlist</h2>
          <button onClick={handleClose} className="text-slate-400 hover:text-white" aria-label="Close"><XMarkIcon className="w-6 h-6" /></button>
        </div>
        
        {step === 'upload' ? (
          <>
            <div className="p-6">
                <label htmlFor="file-upload" className="w-full flex items-center justify-center px-4 py-6 bg-slate-700/50 border-2 border-dashed border-slate-600 rounded-lg cursor-pointer hover:bg-slate-700 hover:border-cyan-500">
                  <div className="text-center">
                    <UploadIcon className="w-8 h-8 mx-auto text-slate-400 mb-2"/>
                    <p className="font-semibold text-slate-300">{fileName || 'Click to choose a file'}</p>
                    <p className="text-xs text-slate-500">(CSV or Tab-delimited .txt)</p>
                  </div>
                  <input id="file-upload" type="file" className="sr-only" accept=".txt,.csv,text/plain" onChange={handleFileChange} />
                </label>
                {error && <p className="text-red-400 text-sm mt-3 text-center">{error}</p>}
            </div>
            <div className="flex justify-end p-4 bg-slate-800/50 border-t border-slate-700">
                <button onClick={handleClose} className="bg-slate-600 hover:bg-slate-500 text-white font-semibold py-2 px-6 rounded-lg transition-colors">Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="category-select" className="block text-sm font-medium text-slate-300 mb-1">Import into Category:</label>
                <select id="category-select" value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 px-3 text-sm focus:ring-cyan-500 focus:border-cyan-500">
                  {allCategories.map(cat => <option key={cat} value={cat}>{cat.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div className="bg-slate-900/70 border border-slate-700 rounded-lg max-h-64 overflow-y-auto p-2">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-slate-400 font-semibold border-b border-slate-600"><th className="p-2">Symbol</th><th className="p-2 text-right">Entry Price</th><th className="p-2 text-right">Date</th></tr></thead>
                  <tbody>
                    {parsedData.rows.map(row => (
                      <tr key={row.symbol} className={`border-b border-slate-800 ${!row.ltp ? 'opacity-50' : ''}`}>
                        <td className="p-2 font-mono text-slate-200">{row.symbol}</td>
                        <td className="p-2 font-mono text-right text-white">{row.ltp ? `₹${row.ltp.toFixed(2)}` : <span className="text-xs text-slate-500">N/A</span>}</td>
                        <td className="p-2 font-mono text-slate-400 text-right">{row.date || <span className="text-xs text-slate-500">N/A</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parsedData.errors.length > 0 && <p className="text-yellow-400 text-sm text-center">{parsedData.errors.join(', ')}</p>}
            </div>
            <div className="flex justify-between items-center p-4 bg-slate-800/50 border-t border-slate-700">
              <button onClick={() => setStep('upload')} className="bg-slate-600 hover:bg-slate-500 text-white font-semibold py-2 px-6 rounded-lg transition-colors text-sm">Back</button>
              <button onClick={handleConfirmImport} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-6 rounded-lg">Import {parsedData.rows.filter(r => r.ltp).length} Stocks</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default WatchlistImporter;