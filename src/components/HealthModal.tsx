import React from 'react';
import HealthMap from './HealthMap';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const HealthModal: React.FC<Props> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70">
      <div className="bg-slate-950 border border-slate-700 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/70 bg-slate-900/80">
          <h2 className="text-sm font-semibold text-slate-100">System Health Map</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 text-xs px-2 py-1 rounded hover:bg-slate-700/70"
          >
            Close
          </button>
        </div>
        <div className="p-4 overflow-auto max-h-[80vh] bg-slate-950/90">
          <HealthMap />
        </div>
      </div>
    </div>
  );
};

export default HealthModal;
