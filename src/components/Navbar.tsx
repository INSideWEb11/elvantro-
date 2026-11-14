import React, { useRef } from 'react';
import {
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  Grid,
  FileSpreadsheet,
  History,
  FolderGit2,
  Download,
  Upload,
  BookOpen,
  Sparkles,
  Cpu,
  AlertTriangle,
  RotateCcw,
  Boxes,
  Smartphone,
  QrCode,
  Menu,
  Building2,
} from 'lucide-react';
import { Part, StockMovement } from '../types/inventory';
import { formatINR } from '../utils/currency';

export type ActiveTab = 'stock' | 'inward' | 'outward' | 'vendor' | 'bulk' | 'grid' | 'report' | 'log' | 'projects' | 'docs';

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
  isAndroidPaired = false,
  terminalId = 'TRM-8824',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute live KPIs
  const totalParts = parts.length;
  const totalStockUnits = parts.reduce((acc, p) => acc + p.availableStock, 0);
  const totalValuation = parts.reduce((acc, p) => acc + p.totalValue, 0);
  const lowStockCount = parts.filter((p) => p.availableStock <= p.minReorderQty).length;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImportJson(e.target.files[0]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const navItems = [
    { id: 'stock' as ActiveTab, label: 'Stock Grid', icon: Layers },
    { id: 'inward' as ActiveTab, label: 'Inward Intake', icon: ArrowDownLeft, badge: 'AI' },
    { id: 'outward' as ActiveTab, label: 'Outward Dispatch', icon: ArrowUpRight, badge: 'AI' },
    { id: 'vendor' as ActiveTab, label: 'Vendor Hub & SIR', icon: Building2, badge: 'NEW' },
    { id: 'bulk' as ActiveTab, label: 'Bulk Ops & WiFi', icon: Boxes, badge: 'BATCH' },
    { id: 'grid' as ActiveTab, label: 'Storage Matrix', icon: Grid },
    { id: 'report' as ActiveTab, label: 'Monthly Report', icon: FileSpreadsheet },
    { id: 'log' as ActiveTab, label: 'Audit Log', icon: History },
    { id: 'projects' as ActiveTab, label: 'Project BOMs', icon: FolderGit2, badge: 'IMPORT' },
    { id: 'docs' as ActiveTab, label: 'Docs & SOP', icon: BookOpen },
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      {/* Top Banner & KPI Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2 sm:gap-4">
          {/* Menu Hamburger & Logo */}
          <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
            {onToggleSlideBar && (
              <button
                type="button"
                onClick={onToggleSlideBar}
                className="p-2 text-slate-700 hover:text-blue-600 hover:bg-blue-50 active:bg-blue-100 rounded-xl border border-slate-200 flex items-center space-x-1.5 transition-all shadow-xs group shrink-0"
                title="Open Navigation Menu"
              >
                <Menu className="w-5 h-5 text-slate-700 group-hover:text-blue-600 transition-colors" />
                <span className="text-xs font-bold hidden sm:inline text-slate-800 group-hover:text-blue-700">
                  Menu
                </span>
              </button>
            )}

            <div className="flex items-center space-x-2.5 sm:space-x-3 shrink-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shrink-0">
                <Cpu className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="shrink-0">
                <div className="flex items-center space-x-1.5 sm:space-x-2">
                  <span className="font-bold text-base sm:text-lg text-slate-900 tracking-tight">ELENTORY</span>
                  <span className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-mono font-medium border border-blue-200">
                    ERP v1.4
                  </span>
                </div>
                <p className="text-[10px] sm:text-xs text-slate-500 hidden sm:block">Electronic Parts & Storage Ledger</p>
              </div>
            </div>
          </div>

          {/* Real-time KPI summary bar - Full on XL, Compact Pill on MD-LG */}
          <div className="hidden xl:flex items-center space-x-6 text-sm border-l border-r border-slate-200 px-6 shrink-0">
            <div>
              <span className="text-[11px] text-slate-500 block uppercase font-medium">Catalog SKUs</span>
              <span className="font-mono tabular-nums font-semibold text-slate-800">{totalParts} parts</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 block uppercase font-medium">Total On-Hand</span>
              <span className="font-mono tabular-nums font-semibold text-slate-800">
                {totalStockUnits.toLocaleString()} units
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 block uppercase font-medium">Warehouse Value</span>
              <span className="font-mono tabular-nums font-semibold text-emerald-600">
                {formatINR(totalValuation)}
              </span>
            </div>
            {lowStockCount > 0 && (
              <div
                onClick={() => setActiveTab('stock')}
                className="cursor-pointer bg-amber-50 border border-amber-200 rounded px-2.5 py-1 flex items-center space-x-1.5 text-amber-800 hover:bg-amber-100 transition-colors"
                title="Click to view low-stock items in Stock Grid"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="font-mono tabular-nums font-semibold text-xs">{lowStockCount} Low</span>
              </div>
            )}
          </div>

          {/* Compact KPI Badge on Medium screens to prevent overflow */}
          <div className="hidden md:flex xl:hidden items-center space-x-2 text-xs bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg shrink-0">
            <span className="font-semibold text-slate-700">{totalParts} SKUs</span>
            <span className="text-slate-300">·</span>
            <span className="font-mono text-slate-600">{totalStockUnits.toLocaleString()} pcs</span>
            <span className="text-slate-300">·</span>
            <span className="font-mono font-semibold text-emerald-600">
              {formatINR(totalValuation)}
            </span>
            {lowStockCount > 0 && (
              <span
                onClick={() => setActiveTab('stock')}
                className="cursor-pointer ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold hover:bg-amber-200 transition-colors"
                title={`${lowStockCount} items below threshold`}
              >
                {lowStockCount} Low
              </span>
            )}
          </div>

          {/* Quick Actions (Android App Link, Backup, Restore, Reset) */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            {onOpenAndroidLink && (
              <button
                type="button"
                onClick={onOpenAndroidLink}
                className={`inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shadow-xs border shrink-0 ${
                  isAndroidPaired
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white border-blue-500'
                }`}
                title="Connect Android Phone or Mobile Scanner via QR Code"
              >
                <Smartphone className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden lg:inline">
                  {isAndroidPaired ? 'Android Linked' : 'Link Android App'}
                </span>
                <span className="lg:hidden text-[11px]">Android</span>
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isAndroidPaired ? 'bg-emerald-500 animate-ping' : 'bg-emerald-300'
                  }`}
                />
              </button>
            )}

            <button
              onClick={onExportJson}
              className="inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
              title="Export complete database backup as JSON"
            >
              <Download className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="hidden md:inline">Backup</span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
              title="Import and restore database from JSON file"
            >
              <Upload className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="hidden md:inline">Import</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              onClick={onResetData}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-transparent hover:border-slate-200 transition-colors shrink-0"
              title="Reset to factory test lab inventory dataset"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-slate-100">
        <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2 no-scrollbar scroll-smooth items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center space-x-1.5 sm:space-x-2 px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg whitespace-nowrap transition-colors shrink-0 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold border border-blue-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="text-[10px] uppercase font-mono font-bold bg-blue-600 text-white px-1.5 py-0.2 rounded">
                    {item.badge}
                  </span>
                )}
                {item.id === 'stock' && lowStockCount > 0 && (
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" title={`${lowStockCount} items below threshold`} />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Quick Feature Spotlight Bar */}
      <div className="bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-slate-50 border-t border-slate-200/80 px-4 sm:px-6 lg:px-8 py-1.5 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2 overflow-hidden">
        <div className="flex items-center space-x-2 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="font-semibold text-slate-800 text-[11px] shrink-0">Quick Shortcuts:</span>
          <span className="text-slate-500 text-[11px] truncate hidden md:inline">
            Vendor Invoice Intake · DOCX Inspection Reports · Android Companion Sync · Storage Matrix
          </span>
        </div>
        <div className="flex items-center space-x-1.5 font-mono text-[11px] shrink-0 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('vendor')}
            className={`px-2 py-0.5 rounded font-bold transition-all shrink-0 ${
              activeTab === 'vendor'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50'
            }`}
          >
            🏢 Vendor Hub & SIR →
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('inward')}
            className={`px-2 py-0.5 rounded font-bold transition-all shrink-0 ${
              activeTab === 'inward'
                ? 'bg-emerald-600 text-white'
                : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
            }`}
          >
            📥 Inward Scanner →
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('outward')}
            className={`px-2 py-0.5 rounded font-bold transition-all shrink-0 ${
              activeTab === 'outward'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-50'
            }`}
          >
            📷 Outward Dispatch →
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bulk')}
            className={`px-2 py-0.5 rounded font-bold transition-all shrink-0 ${
              activeTab === 'bulk'
                ? 'bg-purple-600 text-white'
                : 'bg-white text-purple-700 border border-purple-200 hover:bg-purple-50'
            }`}
          >
            ⚡ Bulk & Gun →
          </button>
        </div>
      </div>
    </header>
  );
};
