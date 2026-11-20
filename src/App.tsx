import React, { useState, useEffect } from 'react';
import { Navbar, ActiveTab } from './components/Navbar';
import { StockGrid } from './components/StockGrid';
import { InwardScanner } from './components/InwardScanner';
import { OutwardDispatch } from './components/OutwardDispatch';
import { StorageGridMap } from './components/StorageGridMap';
import { MonthlyReport } from './components/MonthlyReport';
import { AuditLog } from './components/AuditLog';
import { ProjectsBOM } from './components/ProjectsBOM';
import { DocsCenter } from './components/DocsCenter';
import { BulkOperationsHub } from './components/BulkOperationsHub';
import { PartDetailModal } from './components/PartDetailModal';
import { AndroidCompanionModal } from './components/AndroidCompanionModal';
import { MobileTerminalView } from './components/MobileTerminalView';
import { SlideBarDrawer, VendorSubView } from './components/SlideBarDrawer';
import { VendorSupplyChainHub } from './components/VendorSupplyChainHub';
import { GoogleDriveProvider } from './context/GoogleDriveContext';
import {
  Part,
  StockMovement,
  ProjectBOM,
  StorageLocation,
  VendorInvoice,
  SupplierInspectionReport,
  ApprovedVendor,
} from './types/inventory';
import { inventoryApi } from './services/api';
import { AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';

function AppShell() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('stock');
  const [parts, setParts] = useState<Part[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [projects, setProjects] = useState<ProjectBOM[]>([]);
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [vendorInvoices, setVendorInvoices] = useState<VendorInvoice[]>([]);
  const [inspectionReports, setInspectionReports] = useState<SupplierInspectionReport[]>([]);
  const [approvedVendors, setApprovedVendors] = useState<ApprovedVendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Navigation Menu Drawer & Vendor SubView State
  const [isSlideBarOpen, setIsSlideBarOpen] = useState(false);
  const [vendorSubView, setVendorSubView] = useState<VendorSubView>('approved_vendors');

  // Android Mobile Companion & Terminal Pairing State
  const [showAndroidModal, setShowAndroidModal] = useState(false);
  const [terminalId, setTerminalId] = useState('TRM-8824');
  const [isTerminalPaired, setIsTerminalPaired] = useState(false);
  const [pairedDevice, setPairedDevice] = useState<
    { name: string; platform: string; lastActive: string } | undefined
  >(undefined);
  const [isTerminalViewMode, setIsTerminalViewMode] = useState(false);

  // Check URL parameters for direct Android pairing or terminal mode on launch
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const pair = params.get('pair');
      const mode = params.get('mode');
      if (pair) {
        setTerminalId(pair.toUpperCase());
        inventoryApi.pairTerminal(pair.toUpperCase(), 'Android Mobile Companion', 'Android');
      }
      if (mode === 'terminal' || pair) {
        setIsTerminalViewMode(true);
      }
    } catch {
      // URL parsing fallback
    }
  }, []);

  // Poll terminal status for live pairing and scan relay
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const poll = await inventoryApi.pollTerminal(terminalId);
        if (poll.isPaired !== isTerminalPaired) {
          setIsTerminalPaired(poll.isPaired);
          if (poll.device) setPairedDevice(poll.device);
        }
        if (poll.scans && poll.scans.length > 0) {
          const latest = poll.scans[poll.scans.length - 1];
          showToast(`Mobile Scan Received: ${latest.code} (${latest.description || latest.format})`);
        }
      } catch {
        // Silent catch
      }
    }, 2500);

    return () => clearInterval(pollInterval);
  }, [terminalId, isTerminalPaired]);

  // Modal & Preselected navigation state
  const [selectedPartForDetail, setSelectedPartForDetail] = useState<Part | null>(null);
  const [preSelectedPartForInward, setPreSelectedPartForInward] = useState<Part | null>(null);
  const [preSelectedPartForOutward, setPreSelectedPartForOutward] = useState<Part | null>(null);

  // Global toast
  const [globalToast, setGlobalToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setGlobalToast({ message, type });
    setTimeout(() => {
      setGlobalToast(null);
    }, 4500);
  };

  // Load inventory on mount
  const refreshInventory = async () => {
    try {
      setIsLoading(true);
      const data = await inventoryApi.getInventory();
      setParts(data.parts);
      setMovements(data.movements);
      setProjects(data.projects);
      setLocations(data.locations);
      if (data.vendorInvoices) setVendorInvoices(data.vendorInvoices);
      if (data.inspectionReports) setInspectionReports(data.inspectionReports);
      if (data.approvedVendors) setApprovedVendors(data.approvedVendors);
    } catch (e: any) {
      showToast(e.message || 'Failed to load inventory', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshInventory();
  }, []);

  // Quick action navigation
  const handleQuickInward = (part: Part) => {
    setPreSelectedPartForInward(part);
    setActiveTab('inward');
  };

  const handleQuickOutward = (part: Part) => {
    setPreSelectedPartForOutward(part);
    setActiveTab('outward');
  };

  const handleInwardSuccess = (updatedPart: Part) => {
    refreshInventory();
    showToast(`Inward receipt committed: ${updatedPart.partNumber} updated`);
  };

  const handleOutwardSuccess = (updatedPart: Part) => {
    refreshInventory();
    showToast(`Outward dispatch completed: ${updatedPart.partNumber} updated`);
  };

  const handleMovementDeleted = (_id: string) => {
    refreshInventory();
    showToast('Movement deleted and stock balance reversed');
  };

  const handleExportJson = () => {
    inventoryApi.exportBackupJson(parts, movements, projects, locations);
    showToast('Inventory backup exported as JSON');
  };

  const handleImportJson = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetch('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      if (res.ok) {
        showToast('Database successfully restored from JSON backup');
        refreshInventory();
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to import backup', 'error');
      }
    } catch (e: any) {
      showToast('Invalid JSON backup file: ' + e.message, 'error');
    }
  };

  const [showResetModal, setShowResetModal] = useState(false);

  const handleResetData = () => {
    setShowResetModal(true);
  };

  const confirmResetDatabase = async () => {
    try {
      setShowResetModal(false);
      await inventoryApi.resetDatabase();
      await refreshInventory();
      showToast('Database reset to factory test lab dataset');
    } catch (e: any) {
      showToast(e.message || 'Failed to reset database', 'error');
    }
  };

  const handleSavePartNotes = async (partId: string, notes: string, isCritical: boolean) => {
    const target = parts.find((p) => p.id === partId);
    if (!target) return;
    try {
      await fetch('/api/parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, notes, isCritical }),
      });
      refreshInventory();
      showToast(`Updated notes for ${target.partNumber}`);
    } catch (e) {
      console.error(e);
    }
  };

  if (isTerminalViewMode) {
    return (
      <MobileTerminalView
        terminalId={terminalId}
        parts={parts}
        locations={locations}
        onRefreshInventory={refreshInventory}
        onSwitchToFullWeb={() => setIsTerminalViewMode(false)}
      />
    );
  }

  const isVendorMode = activeTab === 'vendor';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Main ERP Navbar — hidden when inside dedicated Vendor Portal Mode */}
      {!isVendorMode && (
        <Navbar
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setActiveTab(tab);
            if (tab !== 'inward') setPreSelectedPartForInward(null);
            if (tab !== 'outward') setPreSelectedPartForOutward(null);
          }}
          parts={parts}
          movements={movements}
          onExportJson={handleExportJson}
          onImportJson={handleImportJson}
          onResetData={handleResetData}
          onOpenQuickScan={() => setActiveTab('inward')}
          onOpenAndroidLink={() => setShowAndroidModal(true)}
          onToggleSlideBar={() => setIsSlideBarOpen(true)}
          onShowToast={showToast}
          isAndroidPaired={isTerminalPaired}
          terminalId={terminalId}
        />
      )}

      {/* Global Toast */}
      {globalToast && (
        <div className="fixed bottom-5 right-5 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div
            className={`px-4 py-3 rounded-lg shadow-lg text-xs font-medium flex items-center space-x-2 border ${
              globalToast.type === 'success'
                ? 'bg-slate-900 text-white border-slate-800'
                : 'bg-red-600 text-white border-red-700'
            }`}
          >
            {globalToast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-white shrink-0" />
            )}
            <span>{globalToast.message}</span>
          </div>
        </div>
      )}

      {/* Dedicated Vendor Mode vs Standard Inventory ERP Viewport */}
      {isVendorMode ? (
        <VendorSupplyChainHub
          parts={parts}
          movements={movements}
          locations={locations}
          vendorInvoices={vendorInvoices}
          inspectionReports={inspectionReports}
          approvedVendors={approvedVendors}
          initialSubView={vendorSubView}
          onSubViewChange={(sub) => setVendorSubView(sub)}
          onRefreshAll={refreshInventory}
          onShowToast={showToast}
          onToggleSlideBar={() => setIsSlideBarOpen(true)}
          onExitVendorMode={() => setActiveTab('stock')}
        />
      ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {isLoading && parts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mb-3" />
              <p className="text-sm font-medium">Connecting to Elentory Inventory Ledger...</p>
            </div>
          ) : (
            <>
              {activeTab === 'stock' && (
                <StockGrid
                  parts={parts}
                  onSelectPart={(p) => setSelectedPartForDetail(p)}
                  onQuickInward={handleQuickInward}
                  onQuickOutward={handleQuickOutward}
                  onDeletePart={async (partNumber) => {
                    await inventoryApi.deletePart(partNumber);
                    await refreshInventory();
                    showToast(`Deleted ${partNumber} from inventory`);
                  }}
                  onDeleteMultipleParts={async (pns) => {
                    await inventoryApi.deleteMultipleParts(pns);
                    await refreshInventory();
                    showToast(`Deleted ${pns.length} items from inventory`);
                  }}
                />
              )}

              {activeTab === 'inward' && (
                <InwardScanner
                  locations={locations}
                  parts={parts}
                  preSelectedPart={preSelectedPartForInward}
                  onSuccess={handleInwardSuccess}
                />
              )}

              {activeTab === 'outward' && (
                <OutwardDispatch
                  parts={parts}
                  preSelectedPart={preSelectedPartForOutward}
                  onSuccess={handleOutwardSuccess}
                />
              )}

              {activeTab === 'bulk' && (
                <BulkOperationsHub
                  parts={parts}
                  locations={locations}
                  onBatchExecuted={refreshInventory}
                />
              )}

              {activeTab === 'grid' && (
                <StorageGridMap
                  parts={parts}
                  locations={locations}
                  onSelectPart={(p) => setSelectedPartForDetail(p)}
                  onQuickInward={handleQuickInward}
                  onQuickOutward={handleQuickOutward}
                />
              )}

              {activeTab === 'report' && (
                <MonthlyReport
                  movements={movements}
                  parts={parts}
                  vendorInvoices={vendorInvoices}
                  onShowToast={showToast}
                />
              )}

              {activeTab === 'log' && (
                <AuditLog movements={movements} onMovementDeleted={handleMovementDeleted} />
              )}

              {activeTab === 'projects' && (
                <ProjectsBOM
                  projects={projects}
                  parts={parts}
                  onProjectDeducted={refreshInventory}
                  onProjectUpdated={refreshInventory}
                />
              )}

              {activeTab === 'docs' && <DocsCenter />}
            </>
          )}
        </main>
      )}

      {/* Reset Database In-App Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 text-slate-800">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-center text-slate-900">
              Reset to Factory Test Lab Data?
            </h3>
            <p className="text-xs text-slate-500 text-center mt-2 leading-relaxed">
              This will restore all active electronic components, stock quantities, approved vendors, storage bin allocations, and transaction ledgers back to factory default presets.
            </p>
            <div className="mt-6 flex items-center justify-center space-x-3">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmResetDatabase}
                className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition-colors"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Part Technical Detail Modal */}
      <PartDetailModal
        part={selectedPartForDetail}
        onClose={() => setSelectedPartForDetail(null)}
        onQuickInward={handleQuickInward}
        onQuickOutward={handleQuickOutward}
        onSavePartNotes={handleSavePartNotes}
      />

      {/* Android Companion Pairing Modal */}
      <AndroidCompanionModal
        isOpen={showAndroidModal}
        onClose={() => setShowAndroidModal(false)}
        terminalId={terminalId}
        onTerminalIdChange={(newId) => setTerminalId(newId)}
        isPaired={isTerminalPaired}
        pairedDevice={pairedDevice}
        onOpenMobileTerminalView={() => setIsTerminalViewMode(true)}
      />

      {/* Modular Navigation Menu Drawer */}
      <SlideBarDrawer
        isOpen={isSlideBarOpen}
        onClose={() => setIsSlideBarOpen(false)}
        activeTab={activeTab}
        activeVendorSubView={vendorSubView}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (tab !== 'inward') setPreSelectedPartForInward(null);
          if (tab !== 'outward') setPreSelectedPartForOutward(null);
        }}
        onSelectVendorSubView={(sub) => {
          setVendorSubView(sub);
          setActiveTab('vendor');
        }}
        onOpenAndroidModal={() => setShowAndroidModal(true)}
        isAndroidPaired={isTerminalPaired}
      />

      {/* Footer (only in main ERP mode; vendor mode stays crisp & focused) */}
      {!isVendorMode && (
        <footer className="border-t border-slate-200 bg-white py-4 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-700">Elentory Electronics ERP</span>
              <span>·</span>
              <span>Physical Storage Schema STR1S1B1 to STR3S4B4</span>
            </div>
            <div className="flex items-center space-x-4 font-mono text-[11px]">
              <span>Google Drive Supplier & Inward Sync</span>
              <span>·</span>
              <span>Real-time INR Valuation Ledger</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}

export default function App() {
  return (
    <GoogleDriveProvider>
      <AppShell />
    </GoogleDriveProvider>
  );
}
