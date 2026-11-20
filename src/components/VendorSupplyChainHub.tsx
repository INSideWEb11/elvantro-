import React, { useState, useRef, useEffect } from 'react';
import {
  Building2,
  FileText,
  ShieldCheck,
  Upload,
  CheckCircle2,
  AlertCircle,
  Download,
  Eye,
  RefreshCw,
  Search,
  ExternalLink,
  ArrowDownLeft,
  Layers,
  Printer,
  X,
  Menu,
  ArrowLeft,
  ClipboardList,
  UserPlus,
  HardDrive,
  History,
  FolderOpen,
} from 'lucide-react';
import {
  Part,
  StockMovement,
  StorageLocation,
  VendorInvoice,
  SupplierInspectionReport,
  ApprovedVendor,
} from '../types/inventory';
import { inventoryApi } from '../services/api';
import {
  downloadInspectionReportDocx,
  buildInspectionReportDocxBlob,
} from '../utils/docxExporter';
import { VendorSubView } from './SlideBarDrawer';
import { formatINR } from '../utils/currency';
import { compressImageFile, sleep } from '../utils/imageCompressor';
import { useGoogleDrive } from '../context/GoogleDriveContext';
import { dataUrlToBlob, sanitizeDriveName } from '../services/googleDrive';
import { GoogleDriveConnectButton } from './GoogleDriveConnectButton';
import { ApprovedVendorsView } from './ApprovedVendorsView';
import { VendorRegistrationForm } from './VendorRegistrationForm';

interface VendorSupplyChainHubProps {
  parts: Part[];
  movements: StockMovement[];
  locations: StorageLocation[];
  vendorInvoices: VendorInvoice[];
  inspectionReports: SupplierInspectionReport[];
  approvedVendors: ApprovedVendor[];
  initialSubView?: VendorSubView;
  onSubViewChange?: (sub: VendorSubView) => void;
  onRefreshAll: () => Promise<void>;
  onShowToast: (message: string, type?: 'success' | 'error') => void;
  onToggleSlideBar: () => void;
  onExitVendorMode: () => void;
}

export const VendorSupplyChainHub: React.FC<VendorSupplyChainHubProps> = ({
  parts,
  movements,
  vendorInvoices,
  inspectionReports,
  approvedVendors,
  initialSubView = 'approved_vendors',
  onSubViewChange,
  onRefreshAll,
  onShowToast,
  onToggleSlideBar,
  onExitVendorMode,
}) => {
  const { isConnected, uploadWithOverwriteGuard } = useGoogleDrive();

  const [activeSubTab, setActiveSubTab] = useState<VendorSubView>(initialSubView);
  const [newlyRegisteredVendorId, setNewlyRegisteredVendorId] = useState<string | null>(null);

  const [selectedInvoice, setSelectedInvoice] = useState<VendorInvoice | null>(
    vendorInvoices[0] || null
  );
  const [selectedReport, setSelectedReport] = useState<SupplierInspectionReport | null>(
    inspectionReports[0] || null
  );

  // Sync sub-tab when user picks an option from SlideBarDrawer
  useEffect(() => {
    setActiveSubTab(initialSubView);
  }, [initialSubView]);

  // Keep selectedInvoice synced with latest vendorInvoices updates (e.g., driveWebViewLink saved)
  useEffect(() => {
    if (selectedInvoice) {
      const updated = vendorInvoices.find((i) => i.id === selectedInvoice.id);
      if (updated) setSelectedInvoice(updated);
    } else if (vendorInvoices.length > 0) {
      setSelectedInvoice(vendorInvoices[0]);
    }
  }, [vendorInvoices]);

  const switchSubTab = (sub: VendorSubView) => {
    setActiveSubTab(sub);
    onSubViewChange?.(sub);
  };

  // Invoice Upload & OCR state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<string>('');
  const [scanError, setScanError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewDocumentUrl, setPreviewDocumentUrl] = useState<string | null>(null);
  const [autoSyncDrive, setAutoSyncDrive] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Action states
  const [isInwarding, setIsInwarding] = useState(false);
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);
  const [syncingInvoiceId, setSyncingInvoiceId] = useState<string | null>(null);
  const [isExportingSirDrive, setIsExportingSirDrive] = useState(false);
  const [isExportingInwardDrive, setIsExportingInwardDrive] = useState(false);

  // Search filter in archive
  const [archiveSearch, setArchiveSearch] = useState('');

  // Upload a VendorInvoice file (or structured CSV summary if no raw file attached) to Google Drive
  // under: Elentory ERP / Supplier Invoices / <Supplier Name> / <fileName>
  const uploadInvoiceRecordToDrive = async (
    invoice: VendorInvoice,
    rawFile?: File,
    promptSignIn = true
  ): Promise<VendorInvoice | null> => {
    const cleanSupplier = sanitizeDriveName(invoice.supplier, 'Unspecified Supplier');
    const folderSegments = ['Elentory ERP', 'Supplier Invoices', cleanSupplier];

    let blob: Blob;
    let fileName: string;
    let mimeType: string;

    if (rawFile) {
      blob = rawFile;
      fileName = rawFile.name;
      mimeType = rawFile.type || 'application/octet-stream';
    } else if (invoice.fileData && invoice.fileData.startsWith('data:')) {
      mimeType = invoice.fileType || 'application/pdf';
      blob = dataUrlToBlob(invoice.fileData, mimeType);
      fileName =
        invoice.fileName ||
        `${sanitizeDriveName(invoice.invoiceNumber, invoice.id)}.${
          mimeType.includes('pdf') ? 'pdf' : mimeType.includes('png') ? 'png' : 'jpg'
        }`;
    } else {
      // Build a clean CSV invoice record when no binary scan was attached (e.g. seeded invoice)
      const headers = ['Sl No', 'Part Number', 'Description', 'HSN', 'Category', 'Quantity', 'Unit Price (INR)', 'Total (INR)', 'Location'];
      const rows = invoice.items.map((it, idx) => [
        it.slNo || idx + 1,
        `"${it.partNumber}"`,
        `"${(it.description || '').replace(/"/g, '""')}"`,
        `"${it.hsn || ''}"`,
        `"${it.category}"`,
        it.quantity,
        it.unitPrice.toFixed(4),
        it.totalPrice.toFixed(2),
        `"${it.location}"`,
      ]);
      const csv = [
        `Supplier,"${invoice.supplier.replace(/"/g, '""')}"`,
        `Invoice Number,"${invoice.invoiceNumber}"`,
        `Invoice Date,"${invoice.invoiceDate}"`,
        `PO Number,"${invoice.purchaseOrder || ''}"`,
        `Total Amount (INR),${invoice.totalAmount.toFixed(2)}`,
        '',
        headers.join(','),
        ...rows.map((r) => r.join(',')),
      ].join('\n');
      blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      fileName = `${sanitizeDriveName(invoice.invoiceNumber, invoice.id)}_${cleanSupplier}.csv`;
      mimeType = 'text/csv';
    }

    const result = await uploadWithOverwriteGuard({
      blob,
      fileName,
      mimeType,
      folderSegments,
      promptSignIn,
    });

    if (!result) return null;

    const updatedInvoice: VendorInvoice = {
      ...invoice,
      driveFileId: result.fileId,
      driveWebViewLink: result.webViewLink,
      driveFolderPath: result.folderPath,
    };
    await inventoryApi.saveVendorInvoice(updatedInvoice);
    return updatedInvoice;
  };

  // Manual "Save to Google Drive" click for any invoice
  const handleManualSyncInvoiceToDrive = async (invoice: VendorInvoice) => {
    try {
      setSyncingInvoiceId(invoice.id);
      const updated = await uploadInvoiceRecordToDrive(invoice, undefined, true);
      if (updated) {
        if (selectedInvoice?.id === updated.id) {
          setSelectedInvoice(updated);
        }
        await onRefreshAll();
        onShowToast(
          `Saved "${invoice.invoiceNumber}" to Google Drive (${updated.driveFolderPath})`
        );
      }
    } catch (err: any) {
      onShowToast(err?.message || 'Google Drive upload failed', 'error');
    } finally {
      setSyncingInvoiceId(null);
    }
  };

  // Export Inward Report (.xlsx) directly to Google Drive Elentory ERP / Inward folder
  const handleExportInwardReportToDrive = async () => {
    try {
      setIsExportingInwardDrive(true);
      const { blob, fileName } = inventoryApi.buildInwardReportExcelBlob(
        movements,
        parts,
        vendorInvoices
      );
      const res = await uploadWithOverwriteGuard({
        blob,
        fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        folderSegments: ['Elentory ERP', 'Inward'],
        promptSignIn: true,
      });
      if (res) {
        onShowToast(`Exported Inward Report "${res.fileName}" to Google Drive (${res.folderPath})`);
      }
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to export Inward Report to Google Drive', 'error');
    } finally {
      setIsExportingInwardDrive(false);
    }
  };

  // Handle single or multiple file upload for invoice(s)
  const handleInvoiceFileUpload = async (filesInput: File | FileList | File[]) => {
    if (!filesInput) return;
    const fileList: File[] = filesInput instanceof File ? [filesInput] : Array.from(filesInput);
    if (fileList.length === 0) return;

    try {
      setIsScanning(true);
      setScanError(null);
      const total = fileList.length;
      let successCount = 0;
      let driveSyncedCount = 0;
      let lastScannedInvoice: VendorInvoice | null = null;
      const failedFiles: string[] = [];

      for (let i = 0; i < total; i++) {
        const file = fileList[i];
        setScanProgress(`Processing invoice [${i + 1}/${total}]: "${file.name}"...`);

        try {
          let base64Data: string;
          const lowerName = file.name.toLowerCase();
          const isImageFile =
            file.type.startsWith('image/') ||
            /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i.test(lowerName);
          let fileType = file.type;
          if (!fileType) {
            if (lowerName.endsWith('.pdf')) fileType = 'application/pdf';
            else if (lowerName.endsWith('.csv')) fileType = 'text/csv';
            else if (lowerName.endsWith('.txt')) fileType = 'text/plain';
            else if (isImageFile) fileType = 'image/jpeg';
            else fileType = 'application/pdf';
          }

          if (isImageFile) {
            const compressed = await compressImageFile(file, 1600, 0.85);
            base64Data = compressed.base64;
            fileType = compressed.mimeType;
          } else {
            base64Data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target?.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
          }

          setScanProgress(
            `Extracting supplier, GSTIN, PO, line items, and prices for "${file.name}"...`
          );
          const res = await inventoryApi.scanVendorInvoice(base64Data, fileType, file.name);

          if (res.success && res.invoice) {
            let finalInvoice = res.invoice;
            successCount++;

            // Auto-sync uploaded invoice to Google Drive under Supplier Name folder if connected
            if (autoSyncDrive && isConnected) {
              try {
                setScanProgress(
                  `Saving "${file.name}" to Google Drive → Supplier Invoices / ${finalInvoice.supplier}...`
                );
                const synced = await uploadInvoiceRecordToDrive(finalInvoice, file, false);
                if (synced) {
                  finalInvoice = synced;
                  driveSyncedCount++;
                }
              } catch (driveErr: any) {
                console.warn('Auto Google Drive sync skipped:', driveErr?.message);
              }
            }

            lastScannedInvoice = finalInvoice;
            setSelectedInvoice(finalInvoice);

            // Auto-create matching inspection report if none exists
            if (!finalInvoice.inspectionReportId) {
              const supplierPrefix =
                (finalInvoice.supplier || 'SUP')
                  .replace(/[^a-zA-Z0-9]/g, '')
                  .substring(0, 2)
                  .toUpperCase() || 'SP';
              const autoReport: SupplierInspectionReport = {
                id: `sir-${Date.now()}-${i}`,
                reportNumber: `SIR/${supplierPrefix}/${
                  finalInvoice.invoiceNumber.split('/').pop() || '01'
                }`,
                reportDate: finalInvoice.invoiceDate || new Date().toISOString().split('T')[0],
                subtitle: finalInvoice.items[0]?.description || 'SUPPLIED ITEMS',
                vendorInvoiceId: finalInvoice.id,
                supplier: finalInvoice.supplier,
                supplierGstin: finalInvoice.supplierGstin,
                customer: finalInvoice.customer,
                purchaseOrder: finalInvoice.purchaseOrder,
                invoiceNumber: finalInvoice.invoiceNumber,
                ewayBill: finalInvoice.ewayBill,
                createdAt: new Date().toISOString(),
                items: finalInvoice.items.map((it, idx) => ({
                  slNo: it.slNo || idx + 1,
                  description: it.description,
                  hsn: it.hsn,
                  quantity: it.quantity,
                })),
                checks: [
                  {
                    id: 'chk-1',
                    check: 'Quantity',
                    acceptanceRequirement: `${finalInvoice.totalItemsCount || 0} Nos. as per invoice / PO`,
                    testingMethod: 'To be verified by supplier at dispatch',
                    observation: 'Found OK',
                  },
                  {
                    id: 'chk-2',
                    check: 'Material',
                    acceptanceRequirement: 'Standard material as per approved product specification',
                    testingMethod: 'To be verified against raw material supplier report',
                    observation: 'Found OK',
                  },
                  {
                    id: 'chk-3',
                    check: 'Dimensions',
                    acceptanceRequirement: 'As per approved drawing / PO specification',
                    testingMethod: 'To be verified against approved drawing',
                    observation: 'Found OK',
                  },
                  {
                    id: 'chk-4',
                    check: 'Workmanship / defects',
                    acceptanceRequirement: 'No cracks, flash, or visible moulding/component defects',
                    testingMethod: 'To be visually inspected',
                    observation: 'Found OK',
                  },
                  {
                    id: 'chk-5',
                    check: 'Surface finish',
                    acceptanceRequirement: 'Uniform finish; no unacceptable scratches or contamination',
                    testingMethod: 'To be visually inspected',
                    observation: 'Found OK',
                  },
                  {
                    id: 'chk-6',
                    check: 'Fitment',
                    acceptanceRequirement: 'Component mating and mounting features unobstructed',
                    testingMethod: 'To be verified by sample fitment',
                    observation: 'Found OK',
                  },
                  {
                    id: 'chk-7',
                    check: 'Colour / appearance',
                    acceptanceRequirement: 'As per approved sample / specification',
                    testingMethod: 'To be visually verified',
                    observation: 'Found OK',
                  },
                  {
                    id: 'chk-8',
                    check: 'Packaging',
                    acceptanceRequirement: 'Adequately packed to prevent damage during handling and transportation',
                    testingMethod: 'To be verified before dispatch',
                    observation: 'Found OK',
                  },
                ],
                samplingRecord: {
                  sampleQuantity: 'Visual Inspection - 100% | Others 10 samples per batch',
                  inspectionMethod:
                    'Visual inspection and measurement against approved drawing / specification',
                },
                conclusionText: `Based on the inspection checks recorded above and verification against the applicable approved drawing / purchase specification, we shall confirm that supplied ${
                  finalInvoice.items[0]?.description || 'goods'
                } conform to the specified requirements.`,
                preparedBy: {
                  name: 'Suresh',
                  designation: 'Supervisor',
                  date: finalInvoice.invoiceDate || new Date().toISOString().split('T')[0],
                  signatureText: 'Suresh (Verified)',
                },
                verifiedBy: {
                  name: 'Mani Kumar',
                  designation: 'In-charge',
                  date: finalInvoice.invoiceDate || new Date().toISOString().split('T')[0],
                  signatureText: 'Mani Kumar (Approved)',
                },
              };

              await inventoryApi.saveInspectionReport(autoReport);
              setSelectedReport(autoReport);
            }
          }

          if (i < total - 1) {
            await sleep(350);
          }
        } catch (fileErr: any) {
          console.error(`Error scanning invoice ${file.name}:`, fileErr);
          failedFiles.push(`${file.name}: ${fileErr?.message || 'Scan failed'}`);
        }
      }

      if (successCount > 0) {
        await onRefreshAll();
      }

      if (failedFiles.length > 0) {
        const errMsg = failedFiles.join(' | ');
        setScanError(errMsg);
        if (successCount === 0) {
          onShowToast(`Invoice scan failed: ${failedFiles[0]}`, 'error');
        } else {
          onShowToast(
            `Processed ${successCount}/${total} invoices. Failed: ${failedFiles.length}`,
            'error'
          );
        }
      } else if (total === 1 && lastScannedInvoice) {
        const driveNote =
          driveSyncedCount > 0
            ? ` · Saved to Drive (${lastScannedInvoice.driveFolderPath})`
            : '';
        onShowToast(
          `Scanned ${lastScannedInvoice.supplier} (${lastScannedInvoice.invoiceNumber}) — ${lastScannedInvoice.items.length} line item(s)${driveNote}`
        );
      } else if (successCount > 0) {
        const driveNote =
          driveSyncedCount > 0 ? ` (${driveSyncedCount} synced to Google Drive)` : '';
        onShowToast(`Processed ${successCount} of ${total} uploaded invoices${driveNote}`);
      }
    } catch (err: any) {
      setScanError(err.message || 'Invoice scan error');
      onShowToast(`Invoice scan error: ${err.message}`, 'error');
    } finally {
      setIsScanning(false);
      setScanProgress('');
    }
  };

  // Commit batch inward to warehouse inventory
  const handleExecuteBatchInward = async () => {
    if (!selectedInvoice) return;
    try {
      setIsInwarding(true);
      const res = await inventoryApi.inwardVendorInvoice(selectedInvoice.id);
      if (res.success) {
        onShowToast('Batch Inward Complete: All components received into inventory.');
        setSelectedInvoice(res.invoice);
        await onRefreshAll();
      }
    } catch (err: any) {
      onShowToast(`Inward failed: ${err.message}`, 'error');
    } finally {
      setIsInwarding(false);
    }
  };

  // Download DOCX report locally
  const handleDownloadDocx = async () => {
    if (!selectedReport) {
      onShowToast('Please select or create an inspection report first.', 'error');
      return;
    }
    try {
      setIsGeneratingDocx(true);
      await downloadInspectionReportDocx(selectedReport);
      onShowToast(`Downloaded "${selectedReport.reportNumber}.docx"`);
    } catch (err: any) {
      onShowToast(`DOCX generation error: ${err.message}`, 'error');
    } finally {
      setIsGeneratingDocx(false);
    }
  };

  // Export SIR DOCX directly to Google Drive Inward folder
  const handleExportSirDocxToDrive = async () => {
    if (!selectedReport) return;
    try {
      setIsExportingSirDrive(true);
      const { blob, fileName } = await buildInspectionReportDocxBlob(selectedReport);
      const res = await uploadWithOverwriteGuard({
        blob,
        fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        folderSegments: ['Elentory ERP', 'Inward'],
        promptSignIn: true,
      });
      if (res) {
        onShowToast(`Saved "${res.fileName}" to Google Drive (${res.folderPath})`);
      }
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to upload SIR to Google Drive', 'error');
    } finally {
      setIsExportingSirDrive(false);
    }
  };

  // Quality check observation toggle
  const handleToggleObservation = (checkId: string) => {
    if (!selectedReport) return;
    const updatedChecks = selectedReport.checks.map((chk) => {
      if (chk.id === checkId) {
        const nextObs = chk.observation === 'Found OK' ? 'Not OK (Defect)' : 'Found OK';
        return { ...chk, observation: nextObs };
      }
      return chk;
    });

    const updatedReport = { ...selectedReport, checks: updatedChecks };
    setSelectedReport(updatedReport);
    inventoryApi.saveInspectionReport(updatedReport);
  };

  const vendorNavTabs: { id: VendorSubView; label: string; icon: React.ReactNode; count?: number }[] = [
    {
      id: 'approved_vendors',
      label: 'Approved Vendor List',
      icon: <ClipboardList className="w-3.5 h-3.5" />,
      count: approvedVendors.length,
    },
    {
      id: 'vendor_registration',
      label: 'Vendor Registration Form',
      icon: <UserPlus className="w-3.5 h-3.5" />,
    },
    {
      id: 'invoice_inward',
      label: 'Invoice to Inward',
      icon: <FileText className="w-3.5 h-3.5" />,
    },
    {
      id: 'inspection_report',
      label: 'Supplier Inspection (SIR)',
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
    },
    {
      id: 'vendor_list',
      label: 'Invoices Archive',
      icon: <History className="w-3.5 h-3.5" />,
      count: vendorInvoices.length,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* DEDICATED VENDOR-ONLY HEADER (No other ERP screens or tabs shown) */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 gap-3">
            {/* Left: Menu + Vendor Portal Title */}
            <div className="flex items-center space-x-2.5 min-w-0">
              <button
                type="button"
                onClick={onToggleSlideBar}
                className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 transition-colors shrink-0"
                title="Open Menu"
              >
                <Menu className="w-4 h-4 text-slate-700" />
                <span className="text-xs font-semibold">Menu</span>
              </button>

              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-sm font-bold text-slate-900 tracking-tight truncate">
                    Vendor Management Portal
                  </h1>
                  <p className="hidden sm:block text-[11px] text-slate-500 leading-tight truncate">
                    Approved Vendors · Registration · Supplier Invoices & Drive Sync
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Google Drive Auth + Exit back to Inventory */}
            <div className="flex items-center space-x-2 shrink-0">
              <GoogleDriveConnectButton compact onStatusMessage={onShowToast} />

              <button
                type="button"
                onClick={onExitVendorMode}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Back to Inventory</span>
                <span className="sm:hidden">Inventory</span>
              </button>
            </div>
          </div>
        </div>

        {/* Vendor-Only Navigation Bar */}
        <div className="border-t border-slate-200 bg-slate-50/70">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav
              className="flex items-center space-x-1 overflow-x-auto no-scrollbar py-1.5"
              aria-label="Vendor Menu Navigation"
            >
              {vendorNavTabs.map((tab) => {
                const isActive = activeSubTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      switchSubTab(tab.id);
                      if (tab.id === 'inspection_report' && selectedInvoice && !selectedReport) {
                        const rep = inspectionReports.find(
                          (r) => r.vendorInvoiceId === selectedInvoice.id
                        );
                        if (rep) setSelectedReport(rep);
                      }
                    }}
                    className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                      isActive
                        ? 'bg-slate-900 text-white font-semibold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                    }`}
                  >
                    <span className={isActive ? 'text-white' : 'text-slate-400'}>{tab.icon}</span>
                    <span>{tab.label}</span>
                    {typeof tab.count === 'number' && (
                      <span
                        className={`font-mono text-[11px] tabular-nums ${
                          isActive ? 'text-slate-300' : 'text-slate-400'
                        }`}
                      >
                        ({tab.count})
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      {/* VENDOR WORKSPACE CONTENT */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ================================================================= */}
        {/* VIEW 1: APPROVED VENDOR LIST + VENDOR INFORMATION & PDF DOCS */}
        {/* ================================================================= */}
        {activeSubTab === 'approved_vendors' && (
          <ApprovedVendorsView
            vendors={approvedVendors}
            initialSelectedVendorId={newlyRegisteredVendorId}
            onRefreshAll={onRefreshAll}
            onOpenRegistrationForm={() => switchSubTab('vendor_registration')}
            onShowToast={onShowToast}
          />
        )}

        {/* ================================================================= */}
        {/* VIEW 2: VENDOR REGISTRATION FORM */}
        {/* ================================================================= */}
        {activeSubTab === 'vendor_registration' && (
          <VendorRegistrationForm
            existingCount={approvedVendors.length}
            onRegistered={async (vendor) => {
              await onRefreshAll();
              setNewlyRegisteredVendorId(vendor.id);
              switchSubTab('approved_vendors');
            }}
            onShowToast={onShowToast}
          />
        )}

        {/* ================================================================= */}
        {/* VIEW 3: INVOICE TO INWARD + GOOGLE DRIVE SUPPLIER FOLDER SYNC */}
        {/* ================================================================= */}
        {activeSubTab === 'invoice_inward' && (
          <div className="space-y-6">
            {/* Upload Area / Dropzone Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center space-x-2">
                    <Upload className="w-4 h-4 text-blue-600" />
                    <span>Upload Supplier Invoice / Delivery Challan</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Supports PDF, PNG, JPG, JPEG, WEBP, TIFF, CSV. Automatically extracts supplier, GSTIN, PO, line items, and INR rates, and files invoices in Google Drive under{' '}
                    <span className="font-mono text-slate-700">
                      Elentory ERP / Supplier Invoices / &lt;Supplier Name&gt;
                    </span>
                    .
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isExportingInwardDrive}
                    onClick={handleExportInwardReportToDrive}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                    title="Export complete Inward Report (.xlsx) directly to Google Drive Inward folder"
                  >
                    {isExportingInwardDrive ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <HardDrive className="w-3.5 h-3.5" />
                    )}
                    <span>Export Inward Report to Drive</span>
                  </button>
                </div>
              </div>

              {/* Google Drive Auto-Sync Toggle Bar */}
              <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <label className="inline-flex items-center space-x-2 text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSyncDrive}
                    onChange={(e) => setAutoSyncDrive(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <FolderOpen className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>
                    Auto-save uploaded invoice to Google Drive supplier folder (e.g.{' '}
                    <span className="font-mono text-slate-900">Supplier Invoices / Mouser</span>,{' '}
                    <span className="font-mono text-slate-900">Ktron</span>)
                  </span>
                </label>
                <span
                  className={`font-semibold text-[11px] shrink-0 ${
                    isConnected ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {isConnected
                    ? 'Google Drive Connected (Auto-sync active)'
                    : 'Click "Sign in with Google" above to enable auto-sync'}
                </span>
              </div>

              {/* Dropzone container */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragOver(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleInvoiceFileUpload(e.dataTransfer.files);
                  }
                }}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors group ${
                  isDragOver
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-slate-300 hover:border-blue-500 bg-slate-50/40 hover:bg-blue-50/30'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff,.bmp,.csv,.txt"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleInvoiceFileUpload(e.target.files);
                      e.target.value = '';
                    }
                  }}
                  className="hidden"
                />

                <div className="w-11 h-11 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto mb-3">
                  <FileText className="w-5 h-5" />
                </div>

                <p className="text-sm font-bold text-slate-800">
                  Click to browse or drag & drop supplier invoice here
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  PDF invoices, scanned delivery challans, CSV bills, or camera photos (single or multiple)
                </p>
              </div>

              {/* Error Banner */}
              {scanError && !isScanning && (
                <div className="mt-4 p-3.5 rounded-lg bg-red-50 border border-red-200 flex items-start space-x-3 text-red-900">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-xs flex-1">
                    <p className="font-bold">Could not scan invoice document</p>
                    <p className="text-red-700 mt-0.5">{scanError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScanError(null)}
                    className="text-red-600 hover:text-red-800 text-xs font-semibold"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Scanning Indicator */}
              {isScanning && (
                <div className="mt-4 p-4 rounded-lg bg-blue-50 border border-blue-200 flex items-center space-x-3 text-blue-900">
                  <RefreshCw className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold">Processing Invoice Document...</p>
                    <p className="text-blue-700">{scanProgress}</p>
                  </div>
                </div>
              )}
            </div>

            {/* ACTIVE INVOICE BATCH DETAILS */}
            {selectedInvoice && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {/* Card Header & Status */}
                <div className="p-5 bg-slate-900 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-white">
                        {selectedInvoice.supplier} · {selectedInvoice.invoiceNumber}
                      </h3>
                      <span
                        className={`text-[11px] font-mono font-semibold uppercase ${
                          selectedInvoice.status === 'inwarded'
                            ? 'text-emerald-400'
                            : 'text-amber-300'
                        }`}
                      >
                        [{selectedInvoice.status === 'inwarded' ? 'INWARDED' : selectedInvoice.status}]
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 font-mono">
                      PO: {selectedInvoice.purchaseOrder || 'N/A'} · Date: {selectedInvoice.invoiceDate} · E-Way: {selectedInvoice.ewayBill || 'N/A'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {selectedInvoice.driveWebViewLink ? (
                      <a
                        href={selectedInvoice.driveWebViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors"
                        title={`Stored in Google Drive: ${selectedInvoice.driveFolderPath || ''}`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Open in Google Drive</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled={syncingInvoiceId === selectedInvoice.id}
                        onClick={() => handleManualSyncInvoiceToDrive(selectedInvoice)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        {syncingInvoiceId === selectedInvoice.id ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <HardDrive className="w-3.5 h-3.5" />
                        )}
                        <span>
                          Save to Drive ({sanitizeDriveName(selectedInvoice.supplier, 'Supplier')})
                        </span>
                      </button>
                    )}

                    {selectedInvoice.fileData && (
                      <button
                        type="button"
                        onClick={() => setPreviewDocumentUrl(selectedInvoice.fileData || null)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center space-x-1 transition-colors border border-slate-700"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-400" />
                        <span>View File</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Metadata Grid */}
                <div className="p-5 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-500 block font-medium">Supplier / Vendor</span>
                    <span className="font-bold text-slate-900">{selectedInvoice.supplier}</span>
                    {selectedInvoice.supplierGstin && (
                      <span className="text-[11px] font-mono text-slate-500 block">
                        GSTIN: {selectedInvoice.supplierGstin}
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-slate-500 block font-medium">Customer Bill To</span>
                    <span className="font-bold text-slate-900">{selectedInvoice.customer}</span>
                  </div>

                  <div>
                    <span className="text-slate-500 block font-medium">Total Batch Quantity</span>
                    <span className="font-bold font-mono tabular-nums text-slate-900 text-sm">
                      {selectedInvoice.totalItemsCount.toLocaleString()} units
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 block font-medium">Total Batch Valuation</span>
                    <span className="font-bold font-mono tabular-nums text-emerald-700 text-sm">
                      {formatINR(selectedInvoice.totalAmount)}
                    </span>
                  </div>
                </div>

                {/* Line Items Table */}
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                      <Layers className="w-4 h-4 text-blue-600" />
                      <span>Scanned Components ({selectedInvoice.items.length})</span>
                    </h4>
                    {selectedInvoice.driveFolderPath && (
                      <span className="text-[11px] font-mono text-emerald-700">
                        Drive Path: {selectedInvoice.driveFolderPath}
                      </span>
                    )}
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3 w-12 text-center">Sl.</th>
                          <th className="py-2.5 px-3">Part Number / SKU</th>
                          <th className="py-2.5 px-3">Description</th>
                          <th className="py-2.5 px-3">HSN</th>
                          <th className="py-2.5 px-3">Category</th>
                          <th className="py-2.5 px-3 text-right">Quantity</th>
                          <th className="py-2.5 px-3 text-right">Unit Price (₹)</th>
                          <th className="py-2.5 px-3 text-right">Total (₹)</th>
                          <th className="py-2.5 px-3">Location</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {selectedInvoice.items.map((it, idx) => (
                          <tr key={it.id || idx} className="hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-3 text-center text-slate-500 font-mono tabular-nums">
                              {it.slNo || idx + 1}
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-blue-700">
                              {it.partNumber}
                            </td>
                            <td className="py-3 px-3 text-slate-700 max-w-xs">{it.description}</td>
                            <td className="py-3 px-3 font-mono text-slate-500">{it.hsn || '-'}</td>
                            <td className="py-3 px-3 text-slate-700">{it.category}</td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                              {it.quantity.toLocaleString()}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600">
                              {formatINR(it.unitPrice, 4)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                              {formatINR(it.totalPrice, 2)}
                            </td>
                            <td className="py-3 px-3 font-mono text-slate-700 font-semibold">
                              {it.location}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Batch Actions Bar */}
                  <div className="mt-5 pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center space-x-2 text-xs text-slate-600">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        {selectedInvoice.status === 'inwarded'
                          ? `Batch committed to inventory on ${
                              selectedInvoice.inwardedAt?.split('T')[0] || 'today'
                            }.`
                          : 'Ready to inward all line items into warehouse stock and ledger.'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => {
                          const rep =
                            inspectionReports.find(
                              (r) => r.vendorInvoiceId === selectedInvoice.id
                            ) || inspectionReports[0];
                          if (rep) setSelectedReport(rep);
                          switchSubTab('inspection_report');
                        }}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-800 rounded-lg text-xs font-semibold border border-slate-300"
                      >
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>View SIR Report</span>
                      </button>

                      {selectedInvoice.status !== 'inwarded' ? (
                        <button
                          type="button"
                          disabled={isInwarding}
                          onClick={handleExecuteBatchInward}
                          className="flex-1 sm:flex-none inline-flex items-center justify-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                        >
                          {isInwarding ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <ArrowDownLeft className="w-4 h-4" />
                          )}
                          <span>Inward Full Invoice Batch</span>
                        </button>
                      ) : (
                        <span className="px-3.5 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold inline-flex items-center space-x-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Inwarded & Stock Updated</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* VIEW 4: SUPPLIER INSPECTION REPORT (SIR) */}
        {/* ================================================================= */}
        {activeSubTab === 'inspection_report' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <span>Supplier Inspection Report (SIR)</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Review inspection checks, download official .docx Word format, or export straight into Google Drive <span className="font-mono">Elentory ERP / Inward</span>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {inspectionReports.length > 1 && (
                  <select
                    value={selectedReport?.id || ''}
                    onChange={(e) => {
                      const found = inspectionReports.find((r) => r.id === e.target.value);
                      if (found) setSelectedReport(found);
                    }}
                    className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-2 font-medium text-slate-700"
                  >
                    {inspectionReports.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.reportNumber} ({r.supplier})
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  disabled={isExportingSirDrive || !selectedReport}
                  onClick={handleExportSirDocxToDrive}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {isExportingSirDrive ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <HardDrive className="w-3.5 h-3.5" />
                  )}
                  <span>Save to Drive (Inward)</span>
                </button>

                <button
                  type="button"
                  disabled={isGeneratingDocx || !selectedReport}
                  onClick={handleDownloadDocx}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {isGeneratingDocx ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>Download .DOCX</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium border border-slate-300"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
              </div>
            </div>

            {selectedReport ? (
              <div className="bg-white rounded-xl border border-slate-300 p-6 sm:p-10 max-w-4xl mx-auto space-y-6 print:border-none print:p-0">
                <div className="text-center space-y-1 pb-3 border-b border-slate-300">
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-wide uppercase font-serif">
                    SUPPLIER INSPECTION REPORT
                  </h1>
                  <h2 className="text-sm sm:text-base font-bold text-slate-700 tracking-wider uppercase">
                    {selectedReport.subtitle || selectedReport.items[0]?.description || 'SUPPLIED ITEMS'}
                  </h2>
                </div>

                {/* Metadata Table */}
                <div className="overflow-x-auto rounded border border-slate-400">
                  <table className="w-full text-xs border-collapse">
                    <tbody>
                      <tr className="border-b border-slate-400">
                        <td className="p-2.5 font-bold bg-slate-100 w-1/4 border-r border-slate-400 text-slate-800">
                          Supplier
                        </td>
                        <td className="p-2.5 w-1/4 border-r border-slate-400 font-medium text-slate-900">
                          {selectedReport.supplier}
                        </td>
                        <td className="p-2.5 font-bold bg-slate-100 w-1/4 border-r border-slate-400 text-slate-800">
                          Inspection Report No.
                        </td>
                        <td className="p-2.5 w-1/4 font-mono font-bold text-blue-700">
                          {selectedReport.reportNumber}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-400">
                        <td className="p-2.5 font-bold bg-slate-100 border-r border-slate-400 text-slate-800">
                          Supplier GSTIN
                        </td>
                        <td className="p-2.5 border-r border-slate-400 font-mono text-slate-800">
                          {selectedReport.supplierGstin || 'N/A'}
                        </td>
                        <td className="p-2.5 font-bold bg-slate-100 border-r border-slate-400 text-slate-800">
                          Inspection Date
                        </td>
                        <td className="p-2.5 font-mono text-slate-800">
                          {selectedReport.reportDate}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-400">
                        <td className="p-2.5 font-bold bg-slate-100 border-r border-slate-400 text-slate-800">
                          Customer
                        </td>
                        <td className="p-2.5 border-r border-slate-400 font-medium text-slate-900">
                          {selectedReport.customer}
                        </td>
                        <td className="p-2.5 font-bold bg-slate-100 border-r border-slate-400 text-slate-800">
                          Invoice No.
                        </td>
                        <td className="p-2.5 font-mono font-bold text-slate-900">
                          {selectedReport.invoiceNumber}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-bold bg-slate-100 border-r border-slate-400 text-slate-800">
                          Purchase Order
                        </td>
                        <td className="p-2.5 border-r border-slate-400 font-mono text-slate-800">
                          {selectedReport.purchaseOrder}
                        </td>
                        <td className="p-2.5 font-bold bg-slate-100 border-r border-slate-400 text-slate-800">
                          E-Way Bill
                        </td>
                        <td className="p-2.5 font-mono text-slate-800">
                          {selectedReport.ewayBill}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 1. Supplied Item Details */}
                <div className="space-y-2">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
                    1. Supplied Item Details
                  </h3>
                  <div className="overflow-x-auto rounded border border-slate-400">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-slate-100 border-b border-slate-400">
                        <tr>
                          <th className="p-2 text-center w-14 font-bold border-r border-slate-400 text-slate-800">Sl. No.</th>
                          <th className="p-2 text-left font-bold border-r border-slate-400 text-slate-800">Description</th>
                          <th className="p-2 text-center w-28 font-bold border-r border-slate-400 text-slate-800">HSN</th>
                          <th className="p-2 text-right w-36 font-bold text-slate-800">Quantity (Batch)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedReport.items.map((it, idx) => (
                          <tr key={idx} className="border-b last:border-b-0 border-slate-300">
                            <td className="p-2.5 text-center border-r border-slate-400 font-mono">{it.slNo || idx + 1}</td>
                            <td className="p-2.5 border-r border-slate-400 font-semibold text-slate-900">{it.description}</td>
                            <td className="p-2.5 text-center border-r border-slate-400 font-mono">{it.hsn || '-'}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-slate-900">{it.quantity.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 2. Inspection & Quality Checks */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
                      2. Inspection & Quality Checks
                    </h3>
                    <span className="text-[11px] text-slate-500 italic print:hidden">
                      Click observation to toggle Found OK / Deviation
                    </span>
                  </div>
                  <div className="overflow-x-auto rounded border border-slate-400">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-slate-100 border-b border-slate-400">
                        <tr>
                          <th className="p-2 text-left font-bold border-r border-slate-400 text-slate-800 w-1/4">Check</th>
                          <th className="p-2 text-left font-bold border-r border-slate-400 text-slate-800 w-1/3">Acceptance Requirement</th>
                          <th className="p-2 text-left font-bold border-r border-slate-400 text-slate-800 w-1/4">Testing Method</th>
                          <th className="p-2 text-center font-bold text-slate-800 w-28">Observation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-300">
                        {selectedReport.checks.map((chk) => (
                          <tr key={chk.id} className="hover:bg-slate-50">
                            <td className="p-2.5 border-r border-slate-400 font-bold text-slate-800">{chk.check}</td>
                            <td className="p-2.5 border-r border-slate-400 text-slate-700">{chk.acceptanceRequirement}</td>
                            <td className="p-2.5 border-r border-slate-400 text-slate-600">{chk.testingMethod}</td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleObservation(chk.id)}
                                className={`px-2 py-1 rounded text-xs font-bold ${
                                  chk.observation?.toLowerCase().includes('ok')
                                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                    : 'bg-red-100 text-red-800 hover:bg-red-200'
                                }`}
                              >
                                {chk.observation || 'Found OK'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3. Sampling Record */}
                <div className="space-y-2">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
                    3. Inspection Sampling / Record
                  </h3>
                  <div className="overflow-x-auto rounded border border-slate-400">
                    <table className="w-full text-xs border-collapse">
                      <tbody>
                        <tr className="border-b border-slate-300">
                          <td className="p-2.5 font-bold bg-slate-50 border-r border-slate-400 text-slate-800 w-1/3">
                            Sample quantity
                          </td>
                          <td className="p-2.5 text-slate-700">
                            {selectedReport.samplingRecord?.sampleQuantity ||
                              'Visual Inspection - 100% | Others 10 samples per batch'}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2.5 font-bold bg-slate-50 border-r border-slate-400 text-slate-800">
                            Inspection method
                          </td>
                          <td className="p-2.5 text-slate-700">
                            {selectedReport.samplingRecord?.inspectionMethod ||
                              'Visual inspection and measurement against approved drawing / specification'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 4. Conclusion & Sign-off */}
                <div className="space-y-2">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
                    4. Inspection Conclusion
                  </h3>
                  <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded border border-slate-300">
                    {selectedReport.conclusionText}
                  </p>
                  <div className="overflow-x-auto rounded border border-slate-400 mt-3">
                    <table className="w-full text-xs border-collapse">
                      <thead className="bg-slate-100 border-b border-slate-400">
                        <tr>
                          <th className="p-2 text-left font-bold border-r border-slate-400 text-slate-800 w-1/2">
                            Prepared / Inspected By
                          </th>
                          <th className="p-2 text-left font-bold text-slate-800 w-1/2">
                            Verified By
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-slate-300">
                          <td className="p-2.5 border-r border-slate-400">
                            <strong>Name:</strong> {selectedReport.preparedBy?.name || 'Suresh'}
                          </td>
                          <td className="p-2.5">
                            <strong>Name:</strong> {selectedReport.verifiedBy?.name || 'Mani Kumar'}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-300">
                          <td className="p-2.5 border-r border-slate-400">
                            <strong>Designation:</strong> {selectedReport.preparedBy?.designation || 'Supervisor'}
                          </td>
                          <td className="p-2.5">
                            <strong>Designation:</strong> {selectedReport.verifiedBy?.designation || 'In-charge'}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-2.5 border-r border-slate-400">
                            <strong>Date:</strong>{' '}
                            <span className="font-mono">
                              {selectedReport.preparedBy?.date || selectedReport.reportDate}
                            </span>
                          </td>
                          <td className="p-2.5">
                            <strong>Date:</strong>{' '}
                            <span className="font-mono">
                              {selectedReport.verifiedBy?.date || selectedReport.reportDate}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
                <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">No Inspection Report Selected</p>
                <p className="text-xs mt-1">
                  Upload a supplier invoice in Invoice to Inward to generate an inspection report automatically.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* VIEW 5: INVOICES ARCHIVE & GOOGLE DRIVE SUPPLIER FOLDERS */}
        {/* ================================================================= */}
        {activeSubTab === 'vendor_list' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Supplier Invoices Archive & Google Drive Sync
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  All scanned supplier invoices organized by supplier folder in Google Drive.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search supplier or invoice #..."
                    value={archiveSearch}
                    onChange={(e) => setArchiveSearch(e.target.value)}
                    className="w-56 bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400"
                  />
                </div>
                <button
                  type="button"
                  disabled={isExportingInwardDrive}
                  onClick={handleExportInwardReportToDrive}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  {isExportingInwardDrive ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <HardDrive className="w-3.5 h-3.5" />
                  )}
                  <span>Export Inward Report to Drive</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4 w-12 text-center">Sl.</th>
                    <th className="py-3 px-4">Invoice No.</th>
                    <th className="py-3 px-4">Supplier Name</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Qty</th>
                    <th className="py-3 px-4 text-right">Amount (₹)</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4">Google Drive</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {vendorInvoices
                    .filter((inv) => {
                      const q = archiveSearch.toLowerCase();
                      return (
                        inv.supplier.toLowerCase().includes(q) ||
                        inv.invoiceNumber.toLowerCase().includes(q) ||
                        (inv.purchaseOrder && inv.purchaseOrder.toLowerCase().includes(q))
                      );
                    })
                    .map((inv, idx) => (
                      <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 text-center font-mono text-slate-500 tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-blue-700">
                          {inv.invoiceNumber}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{inv.supplier}</td>
                        <td className="py-3 px-4 font-mono text-slate-500">{inv.invoiceDate}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-800">
                          {inv.totalItemsCount.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-emerald-700">
                          {formatINR(inv.totalAmount)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`font-semibold text-[11px] uppercase ${
                              inv.status === 'inwarded'
                                ? 'text-emerald-700'
                                : inv.status === 'inspected'
                                ? 'text-blue-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {inv.driveWebViewLink ? (
                            <a
                              href={inv.driveWebViewLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center space-x-1 text-emerald-700 hover:underline font-semibold"
                              title={inv.driveFolderPath || 'Saved in Google Drive'}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Open Drive</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <button
                              type="button"
                              disabled={syncingInvoiceId === inv.id}
                              onClick={() => handleManualSyncInvoiceToDrive(inv)}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-md font-semibold disabled:opacity-50"
                            >
                              {syncingInvoiceId === inv.id ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <HardDrive className="w-3 h-3" />
                              )}
                              <span>Save to Drive</span>
                            </button>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedInvoice(inv);
                                switchSubTab('invoice_inward');
                              }}
                              className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded font-semibold"
                            >
                              Batch
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedInvoice(inv);
                                const rep =
                                  inspectionReports.find((r) => r.vendorInvoiceId === inv.id) ||
                                  inspectionReports[0];
                                if (rep) setSelectedReport(rep);
                                switchSubTab('inspection_report');
                              }}
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded font-semibold"
                            >
                              SIR
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* DOCUMENT PREVIEW MODAL */}
      {previewDocumentUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <span className="font-bold text-sm">Invoice Document Preview</span>
              <button
                type="button"
                onClick={() => setPreviewDocumentUrl(null)}
                className="text-slate-400 hover:text-white p-1 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex items-center justify-center bg-slate-100 max-h-[75vh]">
              {previewDocumentUrl.startsWith('data:application/pdf') ? (
                <iframe
                  src={previewDocumentUrl}
                  title="Invoice PDF Preview"
                  className="w-full h-[68vh] border-0 rounded bg-white"
                />
              ) : (
                <img
                  src={previewDocumentUrl}
                  alt="Invoice Document Preview"
                  className="max-w-full max-h-[70vh] rounded shadow object-contain"
                />
              )}
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewDocumentUrl(null)}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
