import React, { useState } from 'react';
import {
  X,
  ChevronDown,
  ChevronRight,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  Grid,
  FileSpreadsheet,
  History,
  FolderKanban,
  BookOpen,
  Building2,
  FileText,
  ShieldCheck,
  Smartphone,
  Cpu,
  UserPlus,
  ClipboardList,
} from 'lucide-react';
import { ActiveTab } from './Navbar';

export type VendorSubView =
  | 'approved_vendors'
  | 'vendor_registration'
  | 'invoice_inward'
  | 'inspection_report'
  | 'vendor_list';

interface SlideBarDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: ActiveTab;
  activeVendorSubView?: VendorSubView;
  onSelectTab: (tab: ActiveTab) => void;
  onSelectVendorSubView: (subView: VendorSubView) => void;
  onOpenAndroidModal: () => void;
  isAndroidPaired?: boolean;
}

export const SlideBarDrawer: React.FC<SlideBarDrawerProps> = ({
  isOpen,
  onClose,
  activeTab,
  activeVendorSubView,
  onSelectTab,
  onSelectVendorSubView,
  onOpenAndroidModal,
  isAndroidPaired = false,
}) => {
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({
    vendor: true,
    inventory: true,
    reports: false,
  });

  const toggleModule = (mod: string) => {
    setExpandedModules((prev) => ({ ...prev, [mod]: !prev[mod] }));
  };

  if (!isOpen) return null;

  const isVendorMode = activeTab === 'vendor';

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
      />

      {/* Navigation Menu Drawer */}
      <aside className="relative w-72 max-w-[85vw] bg-white border-r border-slate-200 h-full shadow-2xl flex flex-col z-10 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">ELENTORY MENU</h2>
              <p className="text-[11px] text-slate-500">Inventory & Vendor Portal</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition-colors"
            title="Close Menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Modules */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {/* MODULE 1: VENDOR PORTAL (Dedicated Mode) */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => toggleModule('vendor')}
              className={`w-full px-3 py-2.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider transition-colors ${
                isVendorMode
                  ? 'bg-blue-50 text-blue-800'
                  : 'bg-slate-50 text-slate-800 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>Vendor</span>
              </div>
              {expandedModules.vendor ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {expandedModules.vendor && (
              <div className="bg-white divide-y divide-slate-100 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    onSelectVendorSubView('approved_vendors');
                    onClose();
                  }}
                  className={`w-full px-3.5 py-2.5 flex items-center space-x-2.5 text-left transition-colors ${
                    isVendorMode && activeVendorSubView === 'approved_vendors'
                      ? 'bg-blue-50/80 text-blue-800'
                      : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <ClipboardList className="w-4 h-4 text-blue-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">Approved Vendor List</div>
                    <div className="text-[11px] text-slate-500">Vendor info & PDF documents</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSelectVendorSubView('vendor_registration');
                    onClose();
                  }}
                  className={`w-full px-3.5 py-2.5 flex items-center space-x-2.5 text-left transition-colors ${
                    isVendorMode && activeVendorSubView === 'vendor_registration'
                      ? 'bg-blue-50/80 text-blue-800'
                      : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <UserPlus className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">Vendor Registration Form</div>
                    <div className="text-[11px] text-slate-500">Onboard supplier & upload KYC PDFs</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSelectVendorSubView('invoice_inward');
                    onClose();
                  }}
                  className={`w-full px-3.5 py-2.5 flex items-center space-x-2.5 text-left transition-colors ${
                    isVendorMode && activeVendorSubView === 'invoice_inward'
                      ? 'bg-blue-50/80 text-blue-800'
                      : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">Invoice to Inward</div>
                    <div className="text-[11px] text-slate-500">Scan bill & save to Drive supplier folder</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSelectVendorSubView('inspection_report');
                    onClose();
                  }}
                  className={`w-full px-3.5 py-2.5 flex items-center space-x-2.5 text-left transition-colors ${
                    isVendorMode && activeVendorSubView === 'inspection_report'
                      ? 'bg-blue-50/80 text-blue-800'
                      : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">Supplier Inspection (SIR)</div>
                    <div className="text-[11px] text-slate-500">Word .docx & Google Drive export</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSelectVendorSubView('vendor_list');
                    onClose();
                  }}
                  className={`w-full px-3.5 py-2.5 flex items-center space-x-2.5 text-left transition-colors ${
                    isVendorMode && activeVendorSubView === 'vendor_list'
                      ? 'bg-blue-50/80 text-blue-800'
                      : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <History className="w-4 h-4 text-slate-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">Invoices Archive</div>
                    <div className="text-[11px] text-slate-500">Past supplier invoices & Drive files</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* MODULE 2: INVENTORY OPERATIONS */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => toggleModule('inventory')}
              className="w-full px-3 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-800 uppercase tracking-wider transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-slate-600" />
                <span>Inventory ERP</span>
              </div>
              {expandedModules.inventory ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {expandedModules.inventory && (
              <div className="bg-white divide-y divide-slate-100 border-t border-slate-200 text-xs">
                {[
                  { id: 'stock' as ActiveTab, label: 'Stock Grid', icon: <Layers className="w-4 h-4" /> },
                  { id: 'inward' as ActiveTab, label: 'Inward Intake', icon: <ArrowDownLeft className="w-4 h-4" /> },
                  { id: 'outward' as ActiveTab, label: 'Outward Dispatch', icon: <ArrowUpRight className="w-4 h-4" /> },
                  { id: 'bulk' as ActiveTab, label: 'Bulk Ops & WiFi', icon: <Boxes className="w-4 h-4" /> },
                  { id: 'grid' as ActiveTab, label: 'Storage Grid Map', icon: <Grid className="w-4 h-4" /> },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(item.id);
                      onClose();
                    }}
                    className={`w-full px-3.5 py-2.5 flex items-center space-x-2.5 transition-colors ${
                      activeTab === item.id
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50 font-medium'
                    }`}
                  >
                    <span className={activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* MODULE 3: REPORTS, BOM & DOCS */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => toggleModule('reports')}
              className="w-full px-3 py-2.5 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-xs font-bold text-slate-800 uppercase tracking-wider transition-colors"
            >
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-4 h-4 text-slate-600" />
                <span>Reports & BOMs</span>
              </div>
              {expandedModules.reports ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {expandedModules.reports && (
              <div className="bg-white divide-y divide-slate-100 border-t border-slate-200 text-xs">
                {[
                  { id: 'report' as ActiveTab, label: 'Monthly & Inward Report', icon: <FileSpreadsheet className="w-4 h-4" /> },
                  { id: 'log' as ActiveTab, label: 'Audit Log', icon: <History className="w-4 h-4" /> },
                  { id: 'projects' as ActiveTab, label: 'Project BOMs', icon: <FolderKanban className="w-4 h-4" /> },
                  { id: 'docs' as ActiveTab, label: 'Docs & SOP', icon: <BookOpen className="w-4 h-4" /> },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(item.id);
                      onClose();
                    }}
                    className={`w-full px-3.5 py-2.5 flex items-center space-x-2.5 transition-colors ${
                      activeTab === item.id
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50 font-medium'
                    }`}
                  >
                    <span className={activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer: Mobile Companion Link */}
        <div className="p-3 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => {
              onOpenAndroidModal();
              onClose();
            }}
            className={`w-full px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between border transition-colors ${
              isAndroidPaired
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Smartphone className="w-4 h-4" />
              <span>{isAndroidPaired ? 'Android Scanner Paired' : 'Pair Android Scanner'}</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
          </button>
        </div>
      </aside>
    </div>
  );
};
