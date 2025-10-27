import React, { useState, useMemo } from 'react';
import DashboardCard from './DashboardCard';
import { GroupedWatchlist, StockData, ImportWatchlistPayload } from '../types';
import { UploadIcon } from './icons/UploadIcon';
import ManualImport from './ManualImport';

import { SearchIcon } from './icons/SearchIcon';
import { WrenchScrewdriverIcon } from './icons/WrenchScrewdriverIcon';
import { ArrowUpIcon } from './icons/ArrowUpIcon';
import { ArrowDownIcon } from './icons/ArrowDownIcon';

interface AnalysisHubProps {
  watchlist: GroupedWatchlist;
  onWatchlistUpdate: (payload: ImportWatchlistPayload) => void;
  onManageStrategy: (categoryKey: string) => void;
}

const isStockExpired = (stock: StockData): boolean => {
    if (!stock.expires_at) return false;
    return new Date() > new Date(stock.expires_at);
};

const getDaysLeft = (expiresAt: string): number => {
    const diffTime = new Date(expiresAt).getTime() - new Date().getTime();
    if (diffTime < 0) return 0;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const StockRow = ({ stock }: { stock: StockData }) => {
    const daysLeft = getDaysLeft(stock.expires_at);
    const daysLeftClass = daysLeft <= 2 ? 'text-yellow-400' : 'text-slate-400';

    return (
        <tr className={`border-b border-slate-800 hover:bg-slate-700/50 ${stock.isNew ? 'animate-highlight' : ''}`}>
            <td className="p-2 font-mono font-semibold text-slate-200 truncate">{stock.stockName}</td>
            <td className="p-2 text-right font-mono text-slate-300">
                <div className="flex items-center justify-end">
                    {stock.priceChange === 'up' && <ArrowUpIcon className="w-3 h-3 text-green-400 mr-1" />}
                    {stock.priceChange === 'down' && <ArrowDownIcon className="w-3 h-3 text-red-400 mr-1" />}
                    {stock.price ? `₹${stock.price.toFixed(2)}` : '—'}
                </div>
            </td>
            <td className="p-2 text-center">
                 <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                    {stock.status.toUpperCase()}
                </span>
            </td>
            <td className={`p-2 text-center font-mono text-xs ${daysLeftClass}`}>{daysLeft}</td>
        </tr>
    );
};

const AnalysisHub: React.FC<AnalysisHubProps> = ({ watchlist, onWatchlistUpdate, onManageStrategy }) => {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [activePage, setActivePage] = useState<string>('ALL_PAGES');
  const [searchTerm, setSearchTerm] = useState('');

  const pages = useMemo(() => ['ALL_PAGES', ...Object.keys(watchlist)], [watchlist]);

  const displayedContent = useMemo(() => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    const content: { page: string, category: string, stocks: StockData[] }[] = [];
    const pagesToSearch = activePage === 'ALL_PAGES' ? Object.keys(watchlist) : [activePage];

    pagesToSearch.forEach(page => {
        const categories = watchlist[page] || {};
        Object.entries(categories).forEach(([category, stocks]) => {
            const activeAndFilteredStocks = stocks
                .filter(s => !isStockExpired(s))
                .filter(s => s.stockName.toLowerCase().includes(lowerCaseSearchTerm));

            if (activeAndFilteredStocks.length > 0) {
                content.push({ page, category, stocks: activeAndFilteredStocks });
            }
        });
    });
    return content;
  }, [activePage, watchlist, searchTerm]);

  return (
    <>
      <DashboardCard title="Active Watchlist & Analysis" className="flex-grow h-full">
        <div className="flex flex-col h-full">
            <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                <div className="flex items-center border-b border-slate-700 overflow-x-auto">
                    {pages.map(page => (
                    <button key={page} onClick={() => setActivePage(page)}
                        className={`px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors uppercase ${activePage === page ? 'text-cyan-300 border-b-2 border-cyan-400' : 'text-slate-400 hover:text-white'}`}>
                        {page.replace(/_/g, ' ')}
                    </button>
                    ))}
                </div>
                <div className="relative flex-shrink-0 w-full sm:w-auto sm:min-w-[200px]">
                    <input type="text" placeholder="Search stock..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-700 border border-slate-600 rounded-md py-2 pl-9 pr-3 text-sm placeholder-slate-400 focus:ring-cyan-500 focus:border-cyan-500" />
                    <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
            </div>

            <div className="flex-grow overflow-y-auto pr-1">
                 {displayedContent.length > 0 ? (
                    <div className="space-y-4">
                    {displayedContent.map(({ page, category, stocks }) => (
                        <div key={`${page}-${category}`} className="bg-slate-900/50 p-3 rounded-lg">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-cyan-400 font-semibold text-sm">{category.replace(/_/g, ' ')}</h3>
                                <button onClick={() => onManageStrategy(category)} className="text-slate-400 hover:text-cyan-300 transition-colors text-xs flex items-center p-1 bg-slate-700/50 rounded-md border border-slate-600">
                                    <WrenchScrewdriverIcon className="w-3 h-3 mr-1.5" />
                                    Manage Strategy
                                </button>
                            </div>
                            <div className="max-h-72 overflow-y-auto border border-slate-700 rounded-md">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-slate-800 z-10">
                                        <tr className="border-b border-slate-600">
                                            <th className="p-2 text-left font-semibold text-slate-400">Stock</th>
                                            <th className="p-2 text-right font-semibold text-slate-400">Price</th>
                                            <th className="p-2 text-center font-semibold text-slate-400">Status</th>
                                            <th className="p-2 text-center font-semibold text-slate-400">D-Left</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stocks.map(stock => (
                                           <StockRow 
                                                key={`${page}-${category}-${stock.stockName}-${stock.addedDate}`}
                                                stock={stock}
                                           />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                    </div>
                ) : (
                    <div className="text-center text-slate-500 pt-10 flex items-center justify-center h-full"><p>No active stocks. Import data to begin monitoring.</p></div>
                )}
            </div>
             <div className="flex-shrink-0 pt-3 mt-3 border-t border-slate-700">
                <button type="button" onClick={() => setIsImportModalOpen(true)} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center transition-colors text-sm">
                    <UploadIcon className="w-4 h-4 mr-2" />Import Data
                </button>
            </div>
        </div>
      </DashboardCard>
            <ManualImport
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onImport={(rows: any[]) => onWatchlistUpdate({ category: activePage, rows })}
            />
    </>
  );
};

export default AnalysisHub;
