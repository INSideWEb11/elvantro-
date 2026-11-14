import React, { useState } from 'react';
import { History, Download, Trash2, Filter, Search, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { StockMovement, Part } from '../types/inventory';
import { inventoryApi } from '../services/api';
import { formatINR } from '../utils/currency';

interface AuditLogProps {
  movements: StockMovement[];
  onMovementDeleted: (id: string) => void;
}

export const AuditLog: React.FC<AuditLogProps> = ({ movements, onMovementDeleted }) => {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [movementToDelete, setMovementToDelete] = useState<StockMovement | null>(null);

  // Filter movements
  const filtered = movements.filter((m) => {
    const matchType = filterType === 'ALL' || m.type === filterType;
    const q = searchTerm.toLowerCase();
    const matchSearch =
      m.partNumber.toLowerCase().includes(q) ||
      m.personName.toLowerCase().includes(q) ||
      m.location.toLowerCase().includes(q) ||
      m.notes.toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  const confirmDeleteMovement = async () => {
    if (!movementToDelete) return;
    const { id } = movementToDelete;
    setIsDeleting(id);
    try {
      const ok = await inventoryApi.deleteMovement(id);
      if (ok) {
        onMovementDeleted(id);
        setMovementToDelete(null);
      }
    } catch (e) {
      console.error('Delete error', e);
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <History className="w-5 h-5 text-blue-600" />
            <span>Unified Movement Audit Log</span>
          </h2>
          <p className="text-xs text-slate-500">
            Immutable chronological ledger of all warehouse movements with administrative reversal safeguards
          </p>
        </div>

        <button
          onClick={() => inventoryApi.exportMovementsCsv(filtered)}
          className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
        >
          <Download className="w-3.5 h-3.5 text-slate-500" />
          <span>Export Ledger CSV</span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search part #, person, location, notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-hidden font-mono"
          />
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className="text-slate-400 flex items-center">
            <Filter className="w-3.5 h-3.5 mr-1" /> Type:
          </span>
          {['ALL', 'IN', 'OUT', 'RETURN', 'LOSS'].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                filterType === t
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 uppercase tracking-wider border-b border-slate-200 font-semibold font-sans">
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">Part Number</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3 text-right">Quantity</th>
                <th className="py-3 px-3 text-right">Unit Price (₹)</th>
                <th className="py-3 px-3 text-right">Total (₹)</th>
                <th className="py-3 px-3">Location</th>
                <th className="py-3 px-3">Operator</th>
                <th className="py-3 px-4">Reference Notes</th>
                <th className="py-3 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-slate-400 font-sans text-sm">
                    No transactions match your search filter.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleString()}
                    </td>

                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.type === 'IN'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {item.type === 'IN' ? (
                          <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <ArrowUpRight className="w-3 h-3 text-red-600" />
                        )}
                        <span>{item.type}</span>
                      </span>
                    </td>

                    <td className="py-2.5 px-3 font-bold text-blue-600">{item.partNumber}</td>

                    <td className="py-2.5 px-3 font-sans text-slate-600">{item.category}</td>

                    <td className="py-2.5 px-3 text-right font-bold tabular-nums text-slate-900">
                      {item.type === 'IN' ? `+${item.quantity.toLocaleString()}` : `-${item.quantity.toLocaleString()}`}
                    </td>

                    <td className="py-2.5 px-3 text-right tabular-nums text-slate-600">
                      {formatINR(item.unitPrice, 3)}
                    </td>

                    <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-emerald-700">
                      {formatINR(item.totalMovementValue)}
                    </td>

                    <td className="py-2.5 px-3 text-slate-700">{item.location}</td>

                    <td className="py-2.5 px-3 font-sans text-slate-700">{item.personName}</td>

                    <td className="py-2.5 px-4 font-sans text-slate-500 max-w-xs truncate" title={item.notes}>
                      {item.notes}
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => setMovementToDelete(item)}
                        disabled={isDeleting === item.id}
                        className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                        title="Delete movement & reverse inventory balance"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Movement Confirmation Modal */}
      {movementToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-slate-800">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-center text-slate-900">
              Reverse & Delete Ledger Entry?
            </h3>
            <p className="text-xs text-slate-500 text-center mt-2 leading-relaxed">
              Are you sure you want to delete this <span className="font-semibold text-slate-800">{movementToDelete.type}</span> movement for{' '}
              <span className="font-mono font-bold text-blue-600">{movementToDelete.partNumber}</span>{' '}
              ({movementToDelete.quantity.toLocaleString()} units)? Warehouse stock balance will be automatically reversed.
            </p>
            <div className="mt-6 flex items-center justify-center space-x-3">
              <button
                type="button"
                onClick={() => setMovementToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteMovement}
                disabled={isDeleting !== null}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-colors flex items-center space-x-1"
              >
                {isDeleting ? 'Reversing...' : 'Delete & Reverse'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
