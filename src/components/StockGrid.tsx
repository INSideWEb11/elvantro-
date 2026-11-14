import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Download,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Eye,
  CheckCircle2,
  Trash2,
  X,
} from 'lucide-react';
import { Part, ComponentCategory } from '../types/inventory';
import { inventoryApi } from '../services/api';
import { formatINR } from '../utils/currency';

interface StockGridProps {
  parts: Part[];
  onSelectPart: (part: Part) => void;
  onQuickInward: (part: Part) => void;
  onQuickOutward: (part: Part) => void;
  onDeletePart?: (partNumber: string) => void;
  onDeleteMultipleParts?: (partNumbers: string[]) => void;
}

export const StockGrid: React.FC<StockGridProps> = ({
  parts,
  onSelectPart,
  onQuickInward,
  onQuickOutward,
  onDeletePart,
  onDeleteMultipleParts,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'partNumber' | 'stock' | 'value' | 'location'>('partNumber');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Deletion states
  const [partToDelete, setPartToDelete] = useState<Part | null>(null);
  const [selectedPartNumbers, setSelectedPartNumbers] = useState<Set<string>>(new Set());
  const [showBatchDeleteModal, setShowBatchDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteSuccessMsg, setDeleteSuccessMsg] = useState<string | null>(null);

  // Toggle selection
  const toggleSelectPart = (partNumber: string) => {
    setSelectedPartNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(partNumber)) {
        next.delete(partNumber);
      } else {
        next.add(partNumber);
      }
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedPartNumbers(new Set(filteredParts.map((p) => p.partNumber)));
    } else {
      setSelectedPartNumbers(new Set());
    }
  };

  // Confirm Single Delete
  const handleConfirmSingleDelete = async () => {
    if (!partToDelete) return;
    setIsDeleting(true);
    const targetPn = partToDelete.partNumber;

    try {
      if (onDeletePart) {
        onDeletePart(targetPn);
      } else {
        await inventoryApi.deletePart(targetPn);
      }
      setSelectedPartNumbers((prev) => {
        const next = new Set(prev);
        next.delete(targetPn);
        return next;
      });
      setDeleteSuccessMsg(`✓ Successfully removed part ${targetPn} from inventory catalog.`);
      setPartToDelete(null);
    } catch (e: any) {
      console.error('Delete error', e);
    } finally {
      setIsDeleting(false);
    }
  };

  // Confirm Batch Delete
  const handleConfirmBatchDelete = async () => {
    if (selectedPartNumbers.size === 0) return;
    setIsDeleting(true);
    const arr = Array.from(selectedPartNumbers);

    try {
      if (onDeleteMultipleParts) {
        onDeleteMultipleParts(arr);
      } else {
        await inventoryApi.deleteMultipleParts(arr);
      }
      setDeleteSuccessMsg(`✓ Successfully deleted ${arr.length} selected component(s) from inventory.`);
      setSelectedPartNumbers(new Set());
      setShowBatchDeleteModal(false);
    } catch (e: any) {
      console.error('Batch delete error', e);
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter & sort logic
  const filteredParts = useMemo(() => {
    let result = parts.filter((part) => {
      // Search across part number, description, make, supplier, value, footprint, location
      const query = searchTerm.toLowerCase();
      const matchSearch =
        part.partNumber.toLowerCase().includes(query) ||
        part.description.toLowerCase().includes(query) ||
        part.makeBrand.toLowerCase().includes(query) ||
        part.supplier.toLowerCase().includes(query) ||
        part.location.toLowerCase().includes(query) ||
        (part.technicalSpecs?.value && part.technicalSpecs.value.toLowerCase().includes(query)) ||
        (part.technicalSpecs?.packageFootprint &&
          part.technicalSpecs.packageFootprint.toLowerCase().includes(query));

      const matchCategory = selectedCategory === 'ALL' || part.category === selectedCategory;
      const matchLowStock = !showLowStockOnly || part.availableStock <= part.minReorderQty;

      return matchSearch && matchCategory && matchLowStock;
    });

    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'partNumber') {
        cmp = a.partNumber.localeCompare(b.partNumber);
      } else if (sortBy === 'stock') {
        cmp = a.availableStock - b.availableStock;
      } else if (sortBy === 'value') {
        cmp = a.totalValue - b.totalValue;
      } else if (sortBy === 'location') {
        cmp = a.location.localeCompare(b.location);
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [parts, searchTerm, selectedCategory, showLowStockOnly, sortBy, sortOrder]);

  // Aggregate stats for filtered view
  const aggregateUnits = useMemo(
    () => filteredParts.reduce((acc, p) => acc + p.availableStock, 0),
    [filteredParts]
  );
  const aggregateValuation = useMemo(
    () => filteredParts.reduce((acc, p) => acc + p.totalValue, 0),
    [filteredParts]
  );
  const lowStockCountInFiltered = useMemo(
    () => filteredParts.filter((p) => p.availableStock <= p.minReorderQty).length,
    [filteredParts]
  );

  const categories: { label: string; value: string }[] = [
    { label: 'All Passives', value: 'ALL' },
    { label: 'Resistors', value: 'Resistor' },
    { label: 'Capacitors', value: 'Capacitor' },
    { label: 'Inductors', value: 'Inductor' },
    { label: 'Diodes', value: 'Diode' },
  ];

  return (
    <div className="space-y-4">
      {/* Control Toolbar */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Global Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search part #, value (10k, 100nF), footprint (0805, 0603), brand, location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-300 rounded-md focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-mono"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>

          {/* Right Toolbar Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Low-stock filter toggle */}
            <button
              onClick={() => setShowLowStockOnly(!showLowStockOnly)}
              className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-medium rounded-md border transition-colors ${
                showLowStockOnly
                  ? 'bg-amber-500 text-white border-amber-600 font-semibold shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <AlertTriangle className={`w-3.5 h-3.5 ${showLowStockOnly ? 'text-white' : 'text-amber-500'}`} />
              <span>Low Stock Alerts</span>
              {lowStockCountInFiltered > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono ${
                    showLowStockOnly ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {lowStockCountInFiltered}
                </span>
              )}
            </button>

            {/* Sort Dropdown */}
            <div className="flex items-center space-x-1 bg-white border border-slate-300 rounded-md px-2 py-1 text-xs">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent border-none text-slate-700 text-xs focus:ring-0 cursor-pointer"
              >
                <option value="partNumber">Sort: Part #</option>
                <option value="stock">Sort: Stock Qty</option>
                <option value="value">Sort: Total Value</option>
                <option value="location">Sort: Location</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="text-slate-500 hover:text-slate-800 font-mono font-bold px-1"
                title="Toggle ascending / descending"
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center border border-slate-300 rounded-md overflow-hidden bg-slate-50">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 transition-colors ${
                  viewMode === 'table' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Table List View"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 transition-colors ${
                  viewMode === 'cards' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
                title="Thumbnail Cards View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>

            {/* Export Stock CSV */}
            <button
              onClick={() => inventoryApi.exportStockCsv(filteredParts)}
              className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
              title="Download full stock summary spreadsheet (CSV)"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          </div>
        </div>

        {/* Category Pills Bar */}
        <div className="flex items-center space-x-2 overflow-x-auto pt-1">
          <span className="text-xs text-slate-400 flex items-center shrink-0">
            <Filter className="w-3.5 h-3.5 mr-1" /> Category:
          </span>
          {categories.map((c) => {
            const isSelected = selectedCategory === c.value;
            return (
              <button
                key={c.value}
                onClick={() => setSelectedCategory(c.value)}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors whitespace-nowrap ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {c.label}
              </button>
            );
          })}
          {selectedCategory !== 'ALL' && (
            <button
              onClick={() => setSelectedCategory('ALL')}
              className="text-xs text-blue-600 hover:underline pl-2 shrink-0"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Delete Success Alert */}
      {deleteSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-2.5 rounded-md flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{deleteSuccessMsg}</span>
          </div>
          <button onClick={() => setDeleteSuccessMsg(null)} className="text-emerald-700 font-bold hover:text-emerald-900">
            ×
          </button>
        </div>
      )}

      {/* Batch Selection Action Bar */}
      {selectedPartNumbers.size > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-xs text-red-900 font-mono">
              {selectedPartNumbers.size} part(s) selected
            </span>
            <span className="text-xs text-red-600 hidden sm:inline">
              (Delete unwanted or mistakenly added entries from inventory)
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setSelectedPartNumbers(new Set())}
              className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setShowBatchDeleteModal(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded shadow-xs transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selectedPartNumbers.size})</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Stock Data View */}
      {viewMode === 'table' ? (
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200 font-semibold">
                  <th className="py-3 px-3 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={filteredParts.length > 0 && selectedPartNumbers.size === filteredParts.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                      title="Select all matching components"
                    />
                  </th>
                  <th className="py-3 px-4">Part Number</th>
                  <th className="py-3 px-3">Category & Specs</th>
                  <th className="py-3 px-3">Description</th>
                  <th className="py-3 px-3">Make / Supplier</th>
                  <th className="py-3 px-3">Location</th>
                  <th className="py-3 px-3 text-right">In / Out</th>
                  <th className="py-3 px-4 text-right">Available Stock</th>
                  <th className="py-3 px-3 text-right">Avg Price (₹)</th>
                  <th className="py-3 px-4 text-right">Total Value (₹)</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredParts.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-400">
                      <p className="text-sm">No electronic components match your criteria.</p>
                      <button
                        onClick={() => {
                          setSearchTerm('');
                          setSelectedCategory('ALL');
                          setShowLowStockOnly(false);
                        }}
                        className="mt-2 text-xs text-blue-600 hover:underline"
                      >
                        Reset filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredParts.map((part) => {
                    const isLowStock = part.availableStock <= part.minReorderQty;
                    const isCritical = part.isCritical;
                    const isSelected = selectedPartNumbers.has(part.partNumber);

                    return (
                      <tr
                        key={part.id}
                        className={`hover:bg-blue-50/40 transition-colors ${
                          isSelected ? 'bg-blue-50/60' : isLowStock ? 'bg-amber-50/20' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectPart(part.partNumber)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                          />
                        </td>

                        {/* Part Number */}
                        <td className="py-3 px-4">
                          <button
                            onClick={() => onSelectPart(part)}
                            className="font-mono font-semibold text-blue-600 hover:text-blue-800 hover:underline text-left"
                            title="Click to view detailed specs & movement history"
                          >
                            {part.partNumber}
                          </button>
                          {isCritical && (
                            <span className="block text-[10px] text-red-600 font-mono font-medium">
                              CRITICAL COMPONENT
                            </span>
                          )}
                        </td>

                        {/* Category & Electrical Specs */}
                        <td className="py-3 px-3">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-800 text-xs">
                              {part.technicalSpecs?.value || part.category}
                            </span>
                            <span className="text-xs text-slate-500 font-mono">
                              {part.technicalSpecs?.packageFootprint}
                              {part.technicalSpecs?.tolerance ? ` · ${part.technicalSpecs.tolerance}` : ''}
                            </span>
                          </div>
                        </td>

                        {/* Description */}
                        <td className="py-3 px-3 max-w-xs truncate text-xs text-slate-600" title={part.description}>
                          {part.description}
                        </td>

                        {/* Make & Supplier */}
                        <td className="py-3 px-3 text-xs text-slate-600">
                          <span className="font-medium text-slate-700">{part.makeBrand}</span>
                          <span className="block text-slate-400 text-[11px]">{part.supplier}</span>
                        </td>

                        {/* Storage Location Code */}
                        <td className="py-3 px-3">
                          <span className="inline-block px-2 py-0.5 rounded font-mono text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            {part.location}
                          </span>
                        </td>

                        {/* Inward / Outward counts */}
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-slate-500">
                          <span className="text-emerald-600">+{part.totalInward}</span>
                          <span className="text-slate-300 mx-1">/</span>
                          <span className="text-red-500">-{part.totalOutward}</span>
                        </td>

                        {/* Available Stock */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex flex-col items-end">
                            <span
                              className={`font-mono tabular-nums font-bold text-sm ${
                                isLowStock ? 'text-amber-600' : 'text-slate-900'
                              }`}
                            >
                              {part.availableStock.toLocaleString()}
                            </span>
                            {isLowStock && (
                              <span className="inline-flex items-center text-[10px] text-amber-700 font-medium">
                                <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                                Reorder (&le;{part.minReorderQty})
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Average Unit Price */}
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-slate-700">
                          {formatINR(part.avgUnitPrice, 4)}
                        </td>

                        {/* Total Stock Valuation */}
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-xs text-emerald-700">
                          {formatINR(part.totalValue, 2)}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center space-x-1">
                            <button
                              onClick={() => onQuickInward(part)}
                              className="p-1 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded"
                              title="Receive stock (Inward)"
                            >
                              <ArrowDownLeft className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => onQuickOutward(part)}
                              className="p-1 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded"
                              title="Dispatch stock (Outward)"
                            >
                              <ArrowUpRight className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => onSelectPart(part)}
                              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
                              title="View specs & datasheet"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setPartToDelete(part)}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Delete part from inventory"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Visual Cards Mode */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredParts.map((part) => {
            const isLowStock = part.availableStock <= part.minReorderQty;
            return (
              <div
                key={part.id}
                className={`bg-white rounded-lg border p-4 shadow-xs transition-shadow hover:shadow-md flex flex-col justify-between ${
                  isLowStock ? 'border-amber-300 bg-amber-50/10' : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-semibold">
                        {part.category}
                      </span>
                      <h4
                        onClick={() => onSelectPart(part)}
                        className="font-mono font-bold text-sm text-blue-600 hover:underline cursor-pointer"
                      >
                        {part.partNumber}
                      </h4>
                    </div>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                      {part.location}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 mt-2 line-clamp-2" title={part.description}>
                    {part.description}
                  </p>

                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase block">Value & Package</span>
                      <span className="font-semibold text-slate-800 font-mono">
                        {part.technicalSpecs?.value}
                      </span>
                      <span className="text-slate-500 block text-[11px] font-mono">
                        {part.technicalSpecs?.packageFootprint}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 uppercase block">Available Stock</span>
                      <span
                        className={`font-mono tabular-nums font-bold text-base ${
                          isLowStock ? 'text-amber-600' : 'text-slate-900'
                        }`}
                      >
                        {part.availableStock.toLocaleString()}
                      </span>
                      {isLowStock && (
                        <span className="text-[10px] text-amber-700 block font-medium">Reorder Alert</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block">Valuation</span>
                    <span className="font-mono tabular-nums font-semibold text-emerald-600">
                      {formatINR(part.totalValue, 2)}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => onQuickInward(part)}
                      className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200"
                    >
                      + In
                    </button>
                    <button
                      onClick={() => onQuickOutward(part)}
                      className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200"
                    >
                      - Out
                    </button>
                    <button
                      onClick={() => setPartToDelete(part)}
                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Delete part"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Summary Bar */}
      <div className="bg-slate-900 text-white rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 font-sans shadow-xs">
        <div className="flex items-center space-x-2 text-xs sm:text-sm">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="text-slate-300">Live Inventory Valuation Summary:</span>
          <span className="font-semibold text-white">{filteredParts.length} matching SKUs</span>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs sm:text-sm">
          <div>
            <span className="text-slate-400 text-xs block">Total Units</span>
            <span className="font-mono tabular-nums font-bold text-base text-white">
              {aggregateUnits.toLocaleString()}
            </span>
          </div>
          <div className="border-l border-slate-700 pl-6">
            <span className="text-slate-400 text-xs block">Portfolio Valuation</span>
            <span className="font-mono tabular-nums font-bold text-base text-emerald-400">
              {formatINR(aggregateValuation)}
            </span>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------------- */}
      {/* MODAL 1: SINGLE PART DELETE CONFIRMATION */}
      {/* ----------------------------------------------------------------------- */}
      {partToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Delete Part Entry</h3>
                <p className="text-xs text-slate-500 font-mono">{partToDelete.partNumber}</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-2">
              <p className="text-slate-700">
                Are you sure you want to delete <strong className="text-slate-900 font-mono">{partToDelete.partNumber}</strong> from the stock catalog?
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-600 pt-1">
                <div>
                  <span className="text-slate-400 block text-[10px]">CATEGORY:</span>
                  <span className="font-semibold text-slate-800">{partToDelete.category}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">BIN LOCATION:</span>
                  <span className="font-semibold text-slate-800">{partToDelete.location}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">CURRENT STOCK:</span>
                  <span className="font-semibold text-slate-800">{partToDelete.availableStock.toLocaleString()} pcs</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">INVENTORY VALUE:</span>
                  <span className="font-semibold text-emerald-700">${partToDelete.totalValue.toFixed(2)}</span>
                </div>
              </div>
              <p className="text-[11px] text-amber-700 pt-1">
                If this part was added by mistake or is no longer stocked in the lab, this will remove it from the stock grid.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setPartToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSingleDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md shadow-xs transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete Part'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* MODAL 2: BATCH DELETE CONFIRMATION */}
      {/* ----------------------------------------------------------------------- */}
      {showBatchDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Batch Delete Component Entries</h3>
                <p className="text-xs text-slate-500 font-mono">{selectedPartNumbers.size} components selected</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs space-y-2">
              <p className="text-slate-700">
                Are you sure you want to permanently delete these <strong className="text-slate-900">{selectedPartNumbers.size}</strong> selected components from the inventory catalog?
              </p>
              <div className="max-h-36 overflow-y-auto border border-slate-200 rounded p-2 bg-white text-xs font-mono space-y-1">
                {Array.from(selectedPartNumbers).map((pn) => (
                  <div key={pn} className="flex items-center justify-between py-0.5 border-b border-slate-100 last:border-0">
                    <span className="font-bold text-blue-600">{pn}</span>
                    <span className="text-slate-500">
                      {parts.find((p) => p.partNumber === pn)?.availableStock || 0} units
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-amber-700 pt-1">
                Warning: This will remove all selected parts and their storage records.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBatchDeleteModal(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBatchDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md shadow-xs transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : `Delete All ${selectedPartNumbers.size} Selected`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
