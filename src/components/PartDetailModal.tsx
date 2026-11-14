import React, { useState } from 'react';
import {
  X,
  Cpu,
  Barcode,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  Printer,
  Edit2,
  Check,
  Trash2,
} from 'lucide-react';
import { Part } from '../types/inventory';
import { formatINR } from '../utils/currency';

interface PartDetailModalProps {
  part: Part | null;
  onClose: () => void;
  onQuickInward: (part: Part) => void;
  onQuickOutward: (part: Part) => void;
  onSavePartNotes?: (partId: string, notes: string, isCritical: boolean) => void;
  onDeletePart?: (partNumber: string) => void;
}

export const PartDetailModal: React.FC<PartDetailModalProps> = ({
  part,
  onClose,
  onQuickInward,
  onQuickOutward,
  onSavePartNotes,
  onDeletePart,
}) => {
  if (!part) return null;

  const [notes, setNotes] = useState(part.notes || '');
  const [isCritical, setIsCritical] = useState(Boolean(part.isCritical));
  const [isSaved, setIsSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isLowStock = part.availableStock <= part.minReorderQty;

  const handleSave = () => {
    if (onSavePartNotes) {
      onSavePartNotes(part.id, notes, isCritical);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    }
  };

  const handlePrintLabel = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 flex items-start justify-between bg-slate-50/70">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs uppercase font-mono font-bold text-slate-400">
                  {part.category}
                </span>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                  {part.location}
                </span>
              </div>
              <h3 className="font-mono font-bold text-lg text-slate-900 tracking-tight">
                {part.partNumber}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* Description */}
          <div>
            <span className="text-xs font-medium text-slate-500 uppercase block">Description</span>
            <p className="text-sm text-slate-800 font-medium mt-0.5">{part.description}</p>
          </div>

          {/* Technical Specs Grid */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-3">
              Passive Component Technical Specifications
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase block">Primary Value</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {part.technicalSpecs?.value || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase block">Tolerance</span>
                <span className="font-mono font-semibold text-slate-800">
                  {part.technicalSpecs?.tolerance || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase block">Package Footprint</span>
                <span className="font-mono font-semibold text-slate-800">
                  {part.technicalSpecs?.packageFootprint || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase block">Power / Voltage</span>
                <span className="font-mono font-semibold text-slate-800">
                  {part.technicalSpecs?.powerOrVoltageRating || 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Stock Balances & Valuation */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-white border border-slate-200 rounded-lg">
              <span className="text-[10px] text-slate-400 uppercase block">Available Stock</span>
              <span
                className={`font-mono tabular-nums font-bold text-lg ${
                  isLowStock ? 'text-amber-600' : 'text-slate-900'
                }`}
              >
                {part.availableStock.toLocaleString()}
              </span>
              {isLowStock && (
                <span className="text-[10px] text-amber-700 block font-medium">Reorder Alert</span>
              )}
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded-lg">
              <span className="text-[10px] text-slate-400 uppercase block">Min Threshold</span>
              <span className="font-mono tabular-nums font-bold text-lg text-slate-700">
                {part.minReorderQty.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400 block font-mono">safety stock</span>
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded-lg">
              <span className="text-[10px] text-slate-400 uppercase block">Avg Unit Price</span>
              <span className="font-mono tabular-nums font-bold text-lg text-slate-800">
                {formatINR(part.avgUnitPrice, 3)}
              </span>
              <span className="text-[10px] text-slate-400 block font-mono">weighted cost</span>
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded-lg">
              <span className="text-[10px] text-slate-400 uppercase block">Total Valuation</span>
              <span className="font-mono tabular-nums font-bold text-lg text-emerald-600">
                {formatINR(part.totalValue)}
              </span>
              <span className="text-[10px] text-slate-400 block font-mono">on-hand assets</span>
            </div>
          </div>

          {/* Printable Barcode Label Card */}
          <div className="p-4 bg-white border-2 border-dashed border-slate-300 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                <Barcode className="w-4 h-4 text-slate-500" />
                <span>Warehouse Bin Label Preview</span>
              </span>
              <button
                type="button"
                onClick={handlePrintLabel}
                className="inline-flex items-center space-x-1 text-xs text-blue-600 hover:underline"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Bin Label</span>
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded border border-slate-200 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-bold font-mono text-slate-900 block">
                  {part.partNumber}
                </span>
                <span className="text-[11px] text-slate-600 font-mono block">
                  {part.technicalSpecs?.value} · {part.technicalSpecs?.packageFootprint} · {part.makeBrand}
                </span>
                <span className="text-[10px] font-mono text-slate-400 block">
                  BIN: {part.location}
                </span>
              </div>
              {/* Simulated 1D Barcode Graphic */}
              <div className="flex flex-col items-center">
                <div className="flex items-center space-x-0.5 h-9 bg-white px-2 py-1 rounded border border-slate-200">
                  {[3, 1, 2, 1, 3, 2, 1, 2, 3, 1, 1, 2, 3, 1, 2, 1, 3, 2].map((w, idx) => (
                    <div
                      key={idx}
                      className="bg-black h-full"
                      style={{ width: `${w * 1.5}px` }}
                    />
                  ))}
                </div>
                <span className="text-[9px] font-mono text-slate-500 mt-0.5 tracking-widest">
                  {part.barcode || part.partNumber}
                </span>
              </div>
            </div>
          </div>

          {/* Engineering & Repair Notes */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700">
              Workshop Engineering & Repair Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add application circuit notes, alternate brands, or test instructions..."
              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-hidden"
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={isCritical}
                  onChange={(e) => setIsCritical(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>Critical Component Flag</span>
              </label>

              <button
                type="button"
                onClick={handleSave}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 flex items-center space-x-1"
              >
                {isSaved ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Edit2 className="w-3.5 h-3.5" />}
                <span>{isSaved ? 'Saved!' : 'Save Notes'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmDelete) {
                  if (onDeletePart) onDeletePart(part.partNumber);
                  onClose();
                } else {
                  setConfirmDelete(true);
                }
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors"
              title="Delete this part from inventory"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{confirmDelete ? 'Click Again to Confirm Delete' : 'Delete Part'}</span>
            </button>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                onClose();
                onQuickInward(part);
              }}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-md"
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Receive Inward</span>
            </button>

            <button
              onClick={() => {
                onClose();
                onQuickOutward(part);
              }}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-300 rounded-md"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Dispatch Outward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
