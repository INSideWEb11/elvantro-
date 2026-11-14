import React, { useEffect } from 'react';
import {
  X,
  Cpu,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Grid,
  FileSpreadsheet,
  History,
  FolderGit2,
  BookOpen,
  Smartphone,
  Building2,
  FileText,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  ExternalLink,
  PlusCircle,
  Database,
  Radio,
  SlidersHorizontal,
} from 'lucide-react';
import { ActiveTab } from './Navbar';

export type VendorSubView = 'invoice_inward' | 'inspection_report' | 'vendor_list';

interface SlideBarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onSelectVendorSubView?: (subView: VendorSubView) => void;
  onOpenAndroidModal?: () => void;
  isAndroidPaired?: boolean;
}

export const SlideBarDrawer: React.FC<SlideBarDrawerProps> = ({
  isOpen,
  onClose,
  activeTab,
  onSelectTab,
  onSelectVendorSubView,
  onOpenAndroidModal,
  isAndroidPaired = false,
}) => {
  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleNavClick = (tab: ActiveTab, subView?: VendorSubView) => {
    onSelectTab(tab);
    if (subView && onSelectVendorSubView) {
      onSelectVendorSubView(subView);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
      />

      <div className="fixed inset-y-0 left-0 max-w-full flex">
        <aside className="w-screen max-w-sm sm:max-w-md bg-white border-r border-slate-200 shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-250">
          {/* Drawer Header */}
          <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="font-bold text-base tracking-tight text-white">ELENTORY ERP</h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                    NAVIGATION MENU
                  </span>
                </div>
                <p className="text-xs text-slate-400">Electronic Supply Chain & Inventory Portal</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Close Menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Items List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* SECTION 1: VENDOR & SUPPLY CHAIN (NEW!) */}
            <div className="bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-slate-50 p-3.5 rounded-2xl border border-blue-200 shadow-xs">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-bold text-blue-900 uppercase tracking-wider flex items-center space-x-1.5">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  <span>Vendor & Supply Chain Hub</span>
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-600 text-white rounded-full">
                  NEW
                </span>
              </div>
              <p className="text-[11px] text-slate-600 mb-3">
                Upload supplier invoices, batch inward all parts, and generate Supplier Inspection Reports (.docx).
              </p>

              <div className="space-y-1.5">
                {/* 1. Invoice to Inward */}
                <button
                  type="button"
                  onClick={() => handleNavClick('vendor' as any, 'invoice_inward')}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between transition-all ${
                    activeTab === ('vendor' as any)
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white hover:bg-blue-100/70 text-slate-800 border border-blue-200/80'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <FileText className={`w-4 h-4 ${activeTab === ('vendor' as any) ? 'text-white' : 'text-blue-600'}`} />
                    <div>
                      <span className="block font-bold">1. Invoice to Inward</span>
                      <span className={`text-[10px] font-normal ${activeTab === ('vendor' as any) ? 'text-blue-100' : 'text-slate-500'}`}>
                        Scan PDF/PNG invoice & auto-inward full batch
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0 opacity-70" />
                </button>

                {/* 2. Supplier Inspection Report (SIR) */}
                <button
                  type="button"
                  onClick={() => handleNavClick('vendor' as any, 'inspection_report')}
                  className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between bg-white hover:bg-blue-100/70 text-slate-800 border border-blue-200/80 transition-all"
                >
                  <div className="flex items-center space-x-2.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <div>
                      <span className="block font-bold">2. Supplier Inspection Report</span>
                      <span className="text-[10px] font-normal text-slate-500">
                        Quality checks, sign-off & DOCX Word download
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0 opacity-70" />
                </button>

                {/* 3. Vendor Directory & Archive */}
                <button
                  type="button"
                  onClick={() => handleNavClick('vendor' as any, 'vendor_list')}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between bg-white/60 hover:bg-white text-slate-700 border border-slate-200 transition-all"
                >
                  <div className="flex items-center space-x-2">
                    <Building2 className="w-3.5 h-3.5 text-slate-500" />
                    <span>Vendor Archive (Mudra Innovation, DigiKey, etc.)</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                </button>
              </div>
            </div>

            {/* SECTION 2: WAREHOUSE OPERATIONS */}
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2 px-1">
                Warehouse Logistics
              </span>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => handleNavClick('inward')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                    activeTab === 'inward'
                      ? 'bg-emerald-50 text-emerald-800 font-bold border border-emerald-200'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                    <span>Inward Intake (Live Reel/Barcode Scan)</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-700 rounded font-mono">AI</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleNavClick('outward')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                    activeTab === 'outward'
                      ? 'bg-blue-50 text-blue-800 font-bold border border-blue-200'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <ArrowUpRight className="w-4 h-4 text-blue-600" />
                    <span>Outward Dispatch (Reel Picking & BOMs)</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.2 bg-blue-100 text-blue-700 rounded font-mono">DISPATCH</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleNavClick('bulk')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                    activeTab === 'bulk'
                      ? 'bg-purple-50 text-purple-800 font-bold border border-purple-200'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Boxes className="w-4 h-4 text-purple-600" />
                    <span>Bulk Operations & Wireless Gun Hub</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.2 bg-purple-100 text-purple-700 rounded font-mono">BATCH</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleNavClick('grid')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                    activeTab === 'grid'
                      ? 'bg-amber-50 text-amber-800 font-bold border border-amber-200'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Grid className="w-4 h-4 text-amber-600" />
                    <span>Physical Storage Matrix (Rack 1-3, Bins)</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">STR1-STR3</span>
                </button>
              </div>
            </div>

            {/* SECTION 3: INVENTORY, BOM & REPORTS */}
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2 px-1">
                Inventory & Analytics
              </span>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => handleNavClick('stock')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                    activeTab === 'stock'
                      ? 'bg-blue-50 text-blue-800 font-bold border border-blue-200'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span>Stock Grid & Catalog (Live Ledger)</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleNavClick('projects')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                    activeTab === 'projects'
                      ? 'bg-blue-50 text-blue-800 font-bold border border-blue-200'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <FolderGit2 className="w-4 h-4 text-indigo-600" />
                    <span>Project BOMs (Bills of Materials)</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleNavClick('report')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                    activeTab === 'report'
                      ? 'bg-blue-50 text-blue-800 font-bold border border-blue-200'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Monthly Valuation & Ledger Reports</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleNavClick('log')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                    activeTab === 'log'
                      ? 'bg-blue-50 text-blue-800 font-bold border border-blue-200'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <History className="w-4 h-4 text-slate-600" />
                    <span>Audit Trail Log (Movement History)</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleNavClick('docs')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                    activeTab === 'docs'
                      ? 'bg-blue-50 text-blue-800 font-bold border border-blue-200'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <BookOpen className="w-4 h-4 text-amber-600" />
                    <span>Documentation & Warehouse SOP</span>
                  </div>
                </button>
              </div>
            </div>

            {/* SECTION 4: ANDROID MOBILE SCANNER TERMINAL */}
            {onOpenAndroidModal && (
              <div className="bg-slate-900 text-white p-3.5 rounded-2xl border border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold">Android Phone Link</span>
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                    isAndroidPaired ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {isAndroidPaired ? '● LIVE SYNC' : 'OFFLINE'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 mb-2.5">
                  Link your Android phone camera via QR code to scan warehouse reels & auto-relay to desktop.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAndroidModal();
                  }}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Open Android Link QR Code</span>
                </button>
              </div>
            )}

            {/* SECTION 5: FUTURE INTEGRATIONS SLOTS */}
            <div className="p-3.5 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                  <span>Future Integrations</span>
                </span>
                <span className="text-[10px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                  MODULAR EXTENSIONS
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Engineered with modular architecture to seamlessly plug in more enterprise integrations in the future:
              </p>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-slate-600">
                  <div className="flex items-center space-x-2">
                    <Database className="w-3.5 h-3.5 text-blue-500" />
                    <span>Tally / ERP9 Two-Way Sync</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">Ready</span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-slate-600">
                  <div className="flex items-center space-x-2">
                    <Radio className="w-3.5 h-3.5 text-indigo-500" />
                    <span>DigiKey & Mouser Real-time API</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">Ready</span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-slate-600">
                  <div className="flex items-center space-x-2">
                    <Boxes className="w-3.5 h-3.5 text-amber-500" />
                    <span>Zebra RFID / Thermal Label Print</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">Ready</span>
                </div>
              </div>
            </div>
          </div>

          {/* Drawer Footer */}
          <div className="p-3 bg-slate-50 border-t border-slate-200 text-center text-[11px] text-slate-500 shrink-0">
            <span>Elentory Electronics ERP · Navigation Menu</span>
          </div>
        </aside>
      </div>
    </div>
  );
};
