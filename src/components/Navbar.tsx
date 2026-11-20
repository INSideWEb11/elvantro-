import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Cpu,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  Grid,
  FileSpreadsheet,
  History,
  FolderKanban,
  BookOpen,
  Download,
  Upload,
  RotateCcw,
  Boxes,
  Smartphone,
  Menu,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Part, StockMovement } from '../types/inventory';
import { formatINR } from '../utils/currency';
import { GoogleDriveConnectButton } from './GoogleDriveConnectButton';

export type ActiveTab =
  | 'stock'
  | 'inward'
  | 'outward'
  | 'bulk'
  | 'vendor'
  | 'grid'
  | 'report'
  | 'log'
  | 'projects'
  | 'docs';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  parts: Part[];
  movements: StockMovement[];
  onExportJson: () => void;
  onImportJson: (file: File) => void;
  onResetData: () => void;
  onOpenQuickScan: () => void;
  onOpenAndroidLink?: () => void;
  onToggleSlideBar?: () => void;
  onShowToast?: (message: string, type?: 'success' | 'error') => void;
  isAndroidPaired?: boolean;
  terminalId?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  parts,
  onExportJson,
  onImportJson,
  onResetData,
  onOpenAndroidLink,
  onToggleSlideBar,
  onShowToast,
  isAndroidPaired = false,
  terminalId,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const totalParts = parts.length;
  const totalUnits = parts.reduce((acc, p) => acc + p.availableStock, 0);
  const totalValuation = parts.reduce((acc, p) => acc + p.totalValue, 0);
  const lowStockCount = parts.filter((p) => p.availableStock <= p.minReorderQty).length;

  // Main ERP navigation tabs (Vendor Portal is cleanly housed inside the Menu drawer)
  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode; alert?: boolean }[] = [
    { id: 'stock', label: 'Stock Grid', icon: <Layers className="w-3.5 h-3.5" />, alert: lowStockCount > 0 },
    { id: 'inward', label: 'Inward', icon: <ArrowDownLeft className="w-3.5 h-3.5" /> },
    { id: 'outward', label: 'Outward', icon: <ArrowUpRight className="w-3.5 h-3.5" /> },
    { id: 'bulk', label: 'Bulk Ops', icon: <Boxes className="w-3.5 h-3.5" /> },
    { id: 'grid', label: 'Storage Map', icon: <Grid className="w-3.5 h-3.5" /> },
    { id: 'report', label: 'Monthly Report', icon: <FileSpreadsheet className="w-3.5 h-3.5" /> },
    { id: 'log', label: 'Audit Log', icon: <History className="w-3.5 h-3.5" /> },
    { id: 'projects', label: 'Project BOMs', icon: <FolderKanban className="w-3.5 h-3.5" /> },
    { id: 'docs', label: 'Docs & SOP', icon: <BookOpen className="w-3.5 h-3.5" /> },
  ];

  const updateScrollButtons = useCallback(() => {
    const el = navScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollButtons();
    window.addEventListener('resize', updateScrollButtons);
    return () => window.removeEventListener('resize', updateScrollButtons);
  }, [updateScrollButtons]);

  const scrollNavBy = (delta: number) => {
    const el = navScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportJson(file);
      e.target.value = '';
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
      {/* Row 1: Brand, Live Inventory Metrics & Utility Controls */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 gap-3">
          {/* Left: Menu Drawer Trigger + Brand */}
          <div className="flex items-center space-x-2.5 min-w-0">
            {onToggleSlideBar && (
              <button
                type="button"
                onClick={onToggleSlideBar}
                className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 transition-colors shrink-0"
                title="Open Navigation Menu & Vendor Portal"
              >
                <Menu className="w-4 h-4 text-slate-700" />
                <span className="text-xs font-semibold">Menu</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('stock')}
              className="flex items-center space-x-2.5 text-left min-w-0"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 text-white shrink-0">
                <Cpu className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="text-sm font-bold tracking-tight text-slate-900">ELENTORY</span>
                  <span className="hidden sm:inline font-mono text-[10px] font-semibold text-slate-500">
                    ERP
                  </span>
                </div>
                <p className="hidden md:block text-[11px] text-slate-500 leading-tight truncate">
                  Electronic Parts & Storage Ledger
                </p>
              </div>
            </button>
          </div>

          {/* Center: Compact Live Ledger Metrics */}
          <div className="hidden xl:flex items-center space-x-3 text-xs font-mono tabular-nums text-slate-600 px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 shrink-0">
            <span className="font-semibold text-slate-900">{totalParts} SKUs</span>
            <span className="text-slate-300">·</span>
            <span>{totalUnits.toLocaleString()} pcs</span>
            <span className="text-slate-300">·</span>
            <span className="font-semibold text-emerald-700">{formatINR(totalValuation)}</span>
            {lowStockCount > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="font-semibold text-amber-700">{lowStockCount} Low</span>
              </>
            )}
          </div>

          {/* Right: Google Drive, Android & Backup Actions */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <GoogleDriveConnectButton compact onStatusMessage={onShowToast} />

            {onOpenAndroidLink && (
              <button
                type="button"
                onClick={onOpenAndroidLink}
                className={`inline-flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  isAndroidPaired
                    ? 'text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                    : 'text-slate-700 bg-white border-slate-300 hover:bg-slate-50'
                }`}
                title={
                  isAndroidPaired
                    ? `Paired to Android Mobile Terminal (${terminalId})`
                    : 'Pair Android Phone Camera Scanner'
                }
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{isAndroidPaired ? 'Paired' : 'Android'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onExportJson}
              className="hidden sm:inline-flex items-center space-x-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shrink-0"
              title="Export Full Database Backup (JSON)"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden lg:inline">Backup</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="hidden sm:inline-flex items-center space-x-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shrink-0"
              title="Restore Database from JSON Backup"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden lg:inline">Import</span>
            </button>

            <button
              type="button"
              onClick={onResetData}
              className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
              title="Reset to Factory Test Lab Dataset"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Clean Full-Width Main Navigation Bar (No Clipped Tabs) */}
      <div className="border-t border-slate-200 bg-slate-50/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative flex items-center">
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scrollNavBy(-220)}
              aria-label="Scroll navigation left"
              className="absolute left-1 z-10 flex items-center justify-center w-7 h-7 rounded-md bg-white border border-slate-300 text-slate-700 shadow-xs hover:bg-slate-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}

          <nav
            ref={navScrollRef}
            onScroll={updateScrollButtons}
            className="flex items-center space-x-1 overflow-x-auto no-scrollbar w-full py-1.5"
            aria-label="Primary Inventory Navigation"
          >
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                  }`}
                >
                  <span className={isActive ? 'text-white' : 'text-slate-400'}>{item.icon}</span>
                  <span>{item.label}</span>
                  {item.alert && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isActive ? 'bg-amber-300' : 'bg-amber-500'
                      }`}
                      title={`${lowStockCount} low stock parts`}
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {canScrollRight && (
            <button
              type="button"
              onClick={() => scrollNavBy(220)}
              aria-label="Scroll navigation right"
              className="absolute right-1 z-10 flex items-center justify-center w-7 h-7 rounded-md bg-white border border-slate-300 text-slate-700 shadow-xs hover:bg-slate-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
