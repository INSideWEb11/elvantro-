import React, { useState } from 'react';
import { Grid, Box, Layers, Package, ArrowDownLeft, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { Part, StorageLocation } from '../types/inventory';
import { formatINR } from '../utils/currency';

interface StorageGridMapProps {
  parts: Part[];
  locations: StorageLocation[];
  onSelectPart: (part: Part) => void;
  onQuickInward: (part: Part) => void;
  onQuickOutward: (part: Part) => void;
}

export const StorageGridMap: React.FC<StorageGridMapProps> = ({
  parts,
  locations,
  onSelectPart,
  onQuickInward,
  onQuickOutward,
}) => {
  const [activeRack, setActiveRack] = useState<number>(1);
  const [selectedLocationCode, setSelectedLocationCode] = useState<string>('STR1S1B1');

  // Group parts by location code
  const partsByLocation = React.useMemo(() => {
    const map = new Map<string, Part[]>();
    for (const p of parts) {
      const loc = p.location || 'STR1S1B1';
      if (!map.has(loc)) map.set(loc, []);
      map.get(loc)!.push(p);
    }
    return map;
  }, [parts]);

  // Racks 1, 2, 3
  const racks = [
    { id: 1, name: 'Rack 1 (STR1)', desc: 'Surface Mount Passives (0402 - 1206 Res/Cap)' },
    { id: 2, name: 'Rack 2 (STR2)', desc: 'Power Inductors, Diodes & Magnetics' },
    { id: 3, name: 'Rack 3 (STR3)', desc: 'Bulk Reel Overflow & High-Capacity Bins' },
  ];

  const selectedParts = partsByLocation.get(selectedLocationCode) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <Grid className="w-5 h-5 text-blue-600" />
            <span>Physical Storage Matrix (STR1S1B1 Scheme)</span>
          </h2>
          <p className="text-xs text-slate-500">
            Hierarchical warehouse layout of Racks (STR1–STR3), Shelves (S1–S4), and Segmented Boxes (B1–B4)
          </p>
        </div>

        {/* Rack Tabs */}
        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg">
          {racks.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setActiveRack(r.id);
                setSelectedLocationCode(`STR${r.id}S1B1`);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                activeRack === r.id
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Visual Physical Shelving Grid */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                <Layers className="w-4 h-4 text-slate-500" />
                <span>{racks.find((r) => r.id === activeRack)?.name} Shelving Bays</span>
              </span>
              <span className="text-xs text-slate-500">
                {racks.find((r) => r.id === activeRack)?.desc}
              </span>
            </div>

            {/* Shelves S1 through S4 */}
            <div className="space-y-4">
              {[1, 2, 3, 4].map((shelfNum) => {
                const openShelfCode = `STR${activeRack}S${shelfNum}`;
                const openShelfParts = partsByLocation.get(openShelfCode) || [];
                const isOpenShelfSelected = selectedLocationCode === openShelfCode;

                return (
                  <div
                    key={shelfNum}
                    className="p-3 bg-slate-50/70 border border-slate-200 rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold font-mono text-slate-800">
                        Shelf S{shelfNum}
                      </span>
                      {/* Open Shelf Slot button */}
                      <button
                        onClick={() => setSelectedLocationCode(openShelfCode)}
                        className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-colors ${
                          isOpenShelfSelected
                            ? 'bg-blue-600 text-white border-blue-600 font-bold'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        Open Shelf Bay ({openShelfCode}) · {openShelfParts.length} SKUs
                      </button>
                    </div>

                    {/* 4 Box Compartments on this shelf */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {[1, 2, 3, 4].map((boxNum) => {
                        const boxCode = `STR${activeRack}S${shelfNum}B${boxNum}`;
                        const boxParts = partsByLocation.get(boxCode) || [];
                        const isSelected = selectedLocationCode === boxCode;
                        const totalUnits = boxParts.reduce((acc, p) => acc + p.availableStock, 0);
                        const hasLowStock = boxParts.some((p) => p.availableStock <= p.minReorderQty);

                        return (
                          <div
                            key={boxNum}
                            onClick={() => setSelectedLocationCode(boxCode)}
                            className={`p-2.5 rounded-md border text-left cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-300'
                                : boxParts.length > 0
                                ? 'bg-white border-slate-200 hover:border-slate-400 hover:shadow-xs'
                                : 'bg-slate-100/50 border-dashed border-slate-200 opacity-60 hover:opacity-100'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-mono font-bold text-xs text-slate-800">
                                Box B{boxNum}
                              </span>
                              <Box
                                className={`w-3.5 h-3.5 ${
                                  isSelected
                                    ? 'text-blue-600'
                                    : boxParts.length > 0
                                    ? 'text-emerald-500'
                                    : 'text-slate-300'
                                }`}
                              />
                            </div>

                            <div className="text-[11px] font-mono">
                              <span className="text-slate-400 block text-[10px]">{boxCode}</span>
                              {boxParts.length > 0 ? (
                                <>
                                  <span className="font-semibold text-slate-700 block truncate">
                                    {boxParts[0].partNumber}
                                  </span>
                                  <span className="text-slate-500 text-[10px]">
                                    {totalUnits.toLocaleString()} units
                                    {boxParts.length > 1 ? ` (+${boxParts.length - 1})` : ''}
                                  </span>
                                </>
                              ) : (
                                <span className="text-slate-400 italic">Empty Slot</span>
                              )}
                            </div>

                            {hasLowStock && (
                              <span className="mt-1 block text-[9px] font-bold text-amber-600 bg-amber-50 px-1 py-0.2 rounded border border-amber-200">
                                Low Stock
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Selected Location Inspector */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Slot Inspector: <span className="text-blue-600 font-mono">{selectedLocationCode}</span>
              </span>
              <span className="text-[11px] font-mono text-slate-500 font-semibold">
                {selectedParts.length} Components
              </span>
            </div>

            {selectedParts.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <Box className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="text-xs">No components currently assigned to {selectedLocationCode}.</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  You can assign incoming reels or bags to this coordinate in the Inward Intake tab.
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {selectedParts.map((part) => {
                  const isLow = part.availableStock <= part.minReorderQty;
                  return (
                    <div
                      key={part.id}
                      className="p-3 rounded-md bg-slate-50 border border-slate-200 space-y-2 text-xs"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-mono block">
                            {part.category}
                          </span>
                          <span
                            onClick={() => onSelectPart(part)}
                            className="font-mono font-bold text-blue-600 hover:underline cursor-pointer"
                          >
                            {part.partNumber}
                          </span>
                        </div>
                        <span className="font-mono font-semibold text-slate-700">
                          {part.technicalSpecs?.value}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-600 line-clamp-1">{part.description}</p>

                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between font-mono">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase block">Available</span>
                          <span
                            className={`font-bold ${isLow ? 'text-amber-600' : 'text-slate-900'}`}
                          >
                            {part.availableStock.toLocaleString()}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 uppercase block">Valuation</span>
                          <span className="text-emerald-700 font-semibold">
                            {formatINR(part.totalValue)}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => onQuickInward(part)}
                          className="px-2 py-1 text-[11px] font-medium text-emerald-700 bg-white hover:bg-emerald-50 rounded border border-emerald-300 flex items-center space-x-1"
                        >
                          <ArrowDownLeft className="w-3 h-3" />
                          <span>Inward</span>
                        </button>
                        <button
                          onClick={() => onQuickOutward(part)}
                          className="px-2 py-1 text-[11px] font-medium text-blue-700 bg-white hover:bg-blue-50 rounded border border-blue-300 flex items-center space-x-1"
                        >
                          <ArrowUpRight className="w-3 h-3" />
                          <span>Dispatch</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
