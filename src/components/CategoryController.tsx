import React, { useEffect, useState } from 'react';
import * as api from '../api';
import { Category } from '../types';

const CategoryController: React.FC = () => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchCategories = async () => {
        try {
            setLoading(true);
            const data = await api.getCategories();
            // Sort by key for consistent order
            data.sort((a, b) => a.key.localeCompare(b.key));
            setCategories(data);
            setError(null);
        } catch (err) {
            setError('Failed to load categories.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    const handleToggle = async (key: string, field: keyof Category, currentValue: boolean) => {
        try {
            const newValue = !currentValue;

            // Optimistic update
            setCategories(prev => prev.map(c =>
                c.key === key ? { ...c, [field]: newValue } : c
            ));

            const updatePayload: Partial<Category> = { [field]: newValue };
            await api.updateCategoryStatus(key, updatePayload);

            window.dispatchEvent(new CustomEvent('cts:toast', {
                detail: { message: `Updated ${key}: ${field} = ${newValue}`, kind: 'success' }
            }));

        } catch (err) {
            // Revert on error
            setCategories(prev => prev.map(c =>
                c.key === key ? { ...c, [field]: currentValue } : c
            ));
            window.dispatchEvent(new CustomEvent('cts:toast', {
                detail: { message: `Failed to update ${key}`, kind: 'error' }
            }));
        }
    };

    if (loading) return <div className="text-slate-400 p-8">Loading Categories...</div>;
    if (error) return <div className="text-red-400 p-8">Error: {error}</div>;

    return (
        <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-800">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    🎛️ Controller
                </h2>
                <button
                    onClick={fetchCategories}
                    className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-sm transition-colors"
                >
                    Refresh
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="text-slate-400 border-b border-slate-700 text-sm">
                            <th className="py-3 px-4">Category Key</th>
                            <th className="py-3 px-4">Master Enable</th>
                            <th className="py-3 px-4">Scanning</th>
                            <th className="py-3 px-4">Signal Gen</th>
                            <th className="py-3 px-4">Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        {categories.map((cat) => (
                            <tr key={cat.key} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                                <td className="py-3 px-4 font-mono text-cyan-400">{cat.key}</td>
                                <td className="py-3 px-4">
                                    <Toggle
                                        checked={cat.enabled}
                                        onChange={() => handleToggle(cat.key, 'enabled', cat.enabled)}
                                    />
                                </td>
                                <td className="py-3 px-4">
                                    <Toggle
                                        checked={cat.scanningEnabled}
                                        onChange={() => handleToggle(cat.key, 'scanningEnabled', cat.scanningEnabled)}
                                    />
                                </td>
                                <td className="py-3 px-4">
                                    <Toggle
                                        checked={cat.signalGenerationEnabled}
                                        onChange={() => handleToggle(cat.key, 'signalGenerationEnabled', cat.signalGenerationEnabled)}
                                    />
                                </td>
                                <td className="py-3 px-4 text-slate-500 text-sm">{cat.description || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="mt-4 text-xs text-slate-500">
                <p>• <b>Master Enable</b>: Controls visibility in the system.</p>
                <p>• <b>Scanning</b>: Determines if the background scanner processes this category.</p>
                <p>• <b>Signal Gen</b>: Controls actual buy/sell signal creation.</p>
            </div>
        </div>
    );
};

interface ToggleProps {
    checked: boolean;
    onChange: () => void;
}

const Toggle: React.FC<ToggleProps> = ({ checked, onChange }) => (
    <label className="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" className="sr-only peer" checked={checked} onChange={onChange} />
        <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
    </label>
);

export default CategoryController;
