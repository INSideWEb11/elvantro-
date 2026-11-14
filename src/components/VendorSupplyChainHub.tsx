import React, { useState, useRef } from 'react';
import {
  Building2,
  FileText,
  ShieldCheck,
  Upload,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Download,
  Eye,
  Trash2,
  Plus,
  RefreshCw,
  Search,
  ExternalLink,
  ArrowDownLeft,
  Layers,
  Sparkles,
  Printer,
  FileCheck,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import {
  Part,
  StorageLocation,
  VendorInvoice,
  VendorInvoiceItem,
  SupplierInspectionReport,
  QualityCheckItem,
  ComponentCategory,
} from '../types/inventory';
import { inventoryApi } from '../services/api';
import { downloadInspectionReportDocx } from '../utils/docxExporter';
import { VendorSubView } from './SlideBarDrawer';
import { formatINR } from '../utils/currency';
import { compressImageFile, sleep } from '../utils/imageCompressor';

interface VendorSupplyChainHubProps {
  parts: Part[];
  locations: StorageLocation[];
  vendorInvoices: VendorInvoice[];
  inspectionReports: SupplierInspectionReport[];
  initialSubView?: VendorSubView;
  onRefreshAll: () => Promise<void>;
  onShowToast: (message: string, type?: 'success' | 'error') => void;
}

export const VendorSupplyChainHub: React.FC<VendorSupplyChainHubProps> = ({
  parts,
  locations,
  vendorInvoices,
  inspectionReports,
  initialSubView = 'invoice_inward',
  onRefreshAll,
  onShowToast,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<VendorSubView>(initialSubView);
  const [selectedInvoice, setSelectedInvoice] = useState<VendorInvoice | null>(
    vendorInvoices[0] || null
  );
  const [selectedReport, setSelectedReport] = useState<SupplierInspectionReport | null>(
    inspectionReports[0] || null
  );

  // Invoice Upload & OCR state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<string>('');
  const [previewDocumentUrl, setPreviewDocumentUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inward batch loading state
  const [isInwarding, setIsInwarding] = useState(false);
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);

  // Search filter in archive
  const [archiveSearch, setArchiveSearch] = useState('');

  // Handle single or multiple file upload for invoice(s)
  const handleInvoiceFileUpload = async (filesInput: File | FileList | File[]) => {
    if (!filesInput) return;
    const fileList: File[] =
      filesInput instanceof File
        ? [filesInput]
        : Array.from(filesInput);

    if (fileList.length === 0) return;

    try {
      setIsScanning(true);
      const total = fileList.length;
      let successCount = 0;

      for (let i = 0; i < total; i++) {
        const file = fileList[i];
        setScanProgress(`Processing invoice [${i + 1}/${total}]: "${file.name}"...`);

        try {
          let base64Data: string;
          let fileType = file.type || 'application/pdf';

          if (file.type.startsWith('image/')) {
            // Compress and downscale camera photos / scans
            const compressed = await compressImageFile(file, 1600, 0.85);
            base64Data = compressed.base64;
            fileType = compressed.mimeType;
          } else {
            // PDF or text file
            base64Data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target?.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
          }

          setScanProgress(`Extracting GSTIN, PO, line items, and quantities for "${file.name}"...`);
          const res = await inventoryApi.scanVendorInvoice(base64Data, fileType, file.name);

          if (res.success && res.invoice) {
            successCount++;
            setSelectedInvoice(res.invoice);

            // Auto-create matching inspection report if none exists
            if (!res.invoice.inspectionReportId) {
              const autoReport: SupplierInspectionReport = {
                id: `sir-${Date.now()}-${i}`,
                reportNumber: `SIR/${res.invoice.supplier.substring(0, 2).toUpperCase()}/${res.invoice.invoiceNumber.split('/').pop() || '01'}`,
                reportDate: res.invoice.invoiceDate || new Date().toISOString().split('T')[0],
                subtitle: res.invoice.items[0]?.description || 'COMPONENTS',
                vendorInvoiceId: res.invoice.id,
                supplier: res.invoice.supplier,
                supplierGstin: res.invoice.supplierGstin,
                customer: res.invoice.customer,
                purchaseOrder: res.invoice.purchaseOrder,
                invoiceNumber: res.invoice.invoiceNumber,
                ewayBill: res.invoice.ewayBill,
                createdAt: new Date().toISOString(),
                items: res.invoice.items.map((it, idx) => ({
                  slNo: it.slNo || idx + 1,
                  description: it.description,
                  hsn: it.hsn,
                  quantity: it.quantity,
                })),
                checks: [
                  {
                    id: 'chk-1',
                    check: 'Quantity',
                    acceptanceRequirement: `${res.invoice.totalItemsCount || 590} Nos. as per invoice / PO`,
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
                  inspectionMethod: 'Visual inspection and measurement against approved drawing / specification',
                },
                conclusionText: `Based on the inspection checks recorded above and verification against the applicable approved drawing / purchase specification, we shall confirm that supplied ${res.invoice.items[0]?.description || 'goods'} conform to the specified requirements.`,
                preparedBy: {
                  name: 'Suresh',
                  designation: 'Supervisor',
                  date: res.invoice.invoiceDate || new Date().toISOString().split('T')[0],
                  signatureText: 'Suresh (Verified)',
                },
                verifiedBy: {
                  name: 'Mani Kumar',
                  designation: 'In-charge',
                  date: res.invoice.invoiceDate || new Date().toISOString().split('T')[0],
                  signatureText: 'Mani Kumar (Approved)',
                },
              };

              await inventoryApi.saveInspectionReport(autoReport);
              setSelectedReport(autoReport);
            }
          }

          // Delay between multiple invoice files
          if (i < total - 1) {
            await sleep(350);
          }
        } catch (fileErr: any) {
          console.error(`Error scanning invoice ${file.name}:`, fileErr);
        }
      }

      await onRefreshAll();
      if (total === 1) {
        onShowToast(`Invoice scanned and parsed successfully!`);
      } else {
        onShowToast(`Successfully processed and saved ${successCount} of ${total} uploaded invoices!`);
      }
    } catch (err: any) {
      onShowToast(`Invoice scan error: ${err.message}`, 'error');
    } finally {
      setIsScanning(false);
      setScanProgress('');
    }
  };

  // Load sample Mudra Innovation invoice
  const handleLoadSampleMudraInvoice = async () => {
    const mudraInvoice = vendorInvoices.find((i) => i.id === 'vinv-001') || vendorInvoices[0];
    if (mudraInvoice) {
      setSelectedInvoice(mudraInvoice);
      const rep = inspectionReports.find((r) => r.vendorInvoiceId === mudraInvoice.id) || inspectionReports[0];
      if (rep) setSelectedReport(rep);
      onShowToast('Loaded Mudra Innovation ASG Gold Enclosures invoice batch!');
    }
  };

  // Commit batch inward to warehouse inventory
  const handleExecuteBatchInward = async () => {
    if (!selectedInvoice) return;
    try {
      setIsInwarding(true);
      const res = await inventoryApi.inwardVendorInvoice(selectedInvoice.id);
      if (res.success) {
        onShowToast(`✅ Batch Inward Complete: All components received into inventory!`);
        setSelectedInvoice(res.invoice);
        await onRefreshAll();
      }
    } catch (err: any) {
      onShowToast(`Inward failed: ${err.message}`, 'error');
    } finally {
      setIsInwarding(false);
    }
  };

  // Download DOCX report
  const handleDownloadDocx = async () => {
    if (!selectedReport) {
      onShowToast('Please select or create an inspection report first.', 'error');
      return;
    }

    try {
      setIsGeneratingDocx(true);
      await downloadInspectionReportDocx(selectedReport);
      onShowToast(`📥 Downloaded "${selectedReport.reportNumber}.docx" successfully!`);
    } catch (err: any) {
      onShowToast(`DOCX generation error: ${err.message}`, 'error');
    } finally {
      setIsGeneratingDocx(false);
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

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-start sm:items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shrink-0 mt-0.5 sm:mt-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                  Vendor & Supply Chain Operations
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  INVOICE TO INWARD & SIR
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Scan supplier invoices (PDF/Images), batch inward parts to warehouse inventory, and generate official Supplier Inspection Reports in .docx Word format.
              </p>
            </div>
          </div>
        </div>

        {/* 3 Tab Buttons */}
        <div className="flex flex-wrap sm:flex-nowrap items-center bg-slate-100 p-1 sm:p-1.5 rounded-xl border border-slate-200 gap-1 w-full lg:w-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveSubTab('invoice_inward')}
            className={`flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'invoice_inward'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span>1. Invoice to Inward</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSubTab('inspection_report');
              if (selectedInvoice && !selectedReport) {
                const rep = inspectionReports.find((r) => r.vendorInvoiceId === selectedInvoice.id);
                if (rep) setSelectedReport(rep);
              }
            }}
            className={`flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'inspection_report'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>2. Supplier Inspection (SIR)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('vendor_list')}
            className={`flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeSubTab === 'vendor_list'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <span>3. Invoices Archive ({vendorInvoices.length})</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* OPTION 1: INVOICE TO INWARD (BATCH INTAKE) */}
      {/* ========================================================================= */}
      {activeSubTab === 'invoice_inward' && (
        <div className="space-y-6">
          {/* Upload Area / Dropzone Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span>Upload Supplier Invoice / Delivery Challan</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Supports all formats: <strong>PDF, PNG, JPG, JPEG, WEBP, TIFF, CSV</strong>. AI reads table and line items automatically.
                </p>
              </div>

              {/* Sample loader */}
              <button
                type="button"
                onClick={handleLoadSampleMudraInvoice}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-semibold transition-colors shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Load Sample Mudra Innovation Invoice</span>
              </button>
            </div>

            {/* Dropzone container */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-blue-300 hover:border-blue-500 rounded-xl p-8 text-center cursor-pointer bg-blue-50/20 hover:bg-blue-50/50 transition-colors group"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff,.bmp,.csv,.txt"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleInvoiceFileUpload(e.target.files);
                  }
                }}
                className="hidden"
              />

              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform">
                <FileText className="w-6 h-6" />
              </div>

              <p className="text-sm font-bold text-slate-800">
                Click to browse or drag & drop invoice document here
              </p>
              <p className="text-xs text-slate-500 mt-1">
                PDF invoices, scanned delivery challans, or camera photos of physical bills
              </p>
            </div>

            {/* Scanning Indicator */}
            {isScanning && (
              <div className="mt-4 p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center space-x-3 text-blue-900 animate-pulse">
                <RefreshCw className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                <div className="text-xs">
                  <p className="font-bold">Multimodal AI OCR in Progress...</p>
                  <p className="text-blue-700">{scanProgress}</p>
                </div>
              </div>
            )}
          </div>

          {/* ACTIVE INVOICE BATCH DETAILS */}
          {selectedInvoice && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              {/* Card Header & Status */}
              <div className="p-5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-bold text-blue-400 bg-blue-900/60 px-2 py-0.5 rounded border border-blue-700/50">
                      INVOICE BATCH
                    </span>
                    <h3 className="text-base font-bold text-white">
                      {selectedInvoice.supplier} · {selectedInvoice.invoiceNumber}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    PO: <strong className="text-slate-200">{selectedInvoice.purchaseOrder || 'N/A'}</strong> · Date: {selectedInvoice.invoiceDate} · E-Way: {selectedInvoice.ewayBill || 'N/A'}
                  </p>
                </div>

                <div className="flex items-center space-x-3">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center space-x-1.5 ${
                      selectedInvoice.status === 'inwarded'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : selectedInvoice.status === 'inspected'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    <span className="uppercase font-mono text-[11px]">
                      {selectedInvoice.status === 'inwarded' ? 'INWARDED TO STOCK' : selectedInvoice.status}
                    </span>
                  </span>

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
                  <span className="text-slate-400 block font-medium">Supplier / Vendor</span>
                  <span className="font-bold text-slate-800">{selectedInvoice.supplier}</span>
                  {selectedInvoice.supplierGstin && (
                    <span className="text-[11px] font-mono text-slate-500 block">
                      GSTIN: {selectedInvoice.supplierGstin}
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-slate-400 block font-medium">Customer Bill To</span>
                  <span className="font-bold text-slate-800">{selectedInvoice.customer}</span>
                </div>

                <div>
                  <span className="text-slate-400 block font-medium">Total Batch Quantity</span>
                  <span className="font-bold font-mono text-slate-800 text-sm">
                    {selectedInvoice.totalItemsCount.toLocaleString()} units
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block font-medium">Total Batch Valuation</span>
                  <span className="font-bold font-mono text-emerald-600 text-sm">
                    {formatINR(selectedInvoice.totalAmount)}
                  </span>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span>Scanned Components in this Batch ({selectedInvoice.items.length})</span>
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Auto-allocated to storage locations
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 w-12 text-center">#</th>
                        <th className="py-2.5 px-3">Part Number / SKU</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3">HSN</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3 text-right">Quantity</th>
                        <th className="py-2.5 px-3 text-right">Unit Price (₹)</th>
                        <th className="py-2.5 px-3 text-right">Total (₹)</th>
                        <th className="py-2.5 px-3">Storage Location</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-sans">
                      {selectedInvoice.items.map((it, idx) => (
                        <tr key={it.id || idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-3 text-center text-slate-400 font-mono">{it.slNo || idx + 1}</td>
                          <td className="py-3 px-3 font-mono font-bold text-blue-700">
                            {it.partNumber}
                            {it.isNewSku && (
                              <span className="ml-1.5 px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[10px] rounded font-mono font-bold">
                                NEW SKU
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-700 max-w-xs">{it.description}</td>
                          <td className="py-3 px-3 font-mono text-slate-500">{it.hsn || '-'}</td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200">
                              {it.category}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                            {it.quantity.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-600">
                            {formatINR(it.unitPrice, 4)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600">
                            {formatINR(it.totalPrice, 2)}
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-mono text-xs font-semibold border border-amber-200">
                              {it.location}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Batch Actions Bar */}
                <div className="mt-6 pt-5 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center space-x-2 text-xs text-slate-500">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>
                      {selectedInvoice.status === 'inwarded'
                        ? `Batch successfully committed to warehouse inventory on ${selectedInvoice.inwardedAt?.split('T')[0] || 'today'}.`
                        : 'Ready to inward. Clicking below will add all items into inventory and ledger.'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-3 w-full sm:w-auto">
                    {/* Button 1: Go to Inspection Report */}
                    <button
                      type="button"
                      onClick={() => {
                        const rep = inspectionReports.find((r) => r.vendorInvoiceId === selectedInvoice.id) || inspectionReports[0];
                        if (rep) setSelectedReport(rep);
                        setActiveSubTab('inspection_report');
                      }}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center space-x-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold transition-colors border border-slate-300"
                    >
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>View Supplier Inspection Report</span>
                    </button>

                    {/* Button 2: Execute Inward */}
                    {selectedInvoice.status !== 'inwarded' ? (
                      <button
                        type="button"
                        disabled={isInwarding}
                        onClick={handleExecuteBatchInward}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-md disabled:opacity-50"
                      >
                        {isInwarding ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <ArrowDownLeft className="w-4 h-4" />
                        )}
                        <span>⚡ Inward Full Invoice Batch to Stock</span>
                      </button>
                    ) : (
                      <div className="px-4 py-2 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold flex items-center space-x-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Inwarded & Stock Updated</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* OPTION 2: SUPPLIER INSPECTION REPORT (SIR) */}
      {/* ========================================================================= */}
      {activeSubTab === 'inspection_report' && (
        <div className="space-y-6">
          {/* Action Header Card with DOCX Download */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Supplier Inspection Report (SIR)
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  DOCX FORMAT READY
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Directly matches your physical inspection report format. View on screen and download official <strong>.docx</strong> Word document.
              </p>
            </div>

            <div className="flex items-center space-x-3 shrink-0">
              {/* Select report dropdown if multiple */}
              {inspectionReports.length > 1 && (
                <select
                  value={selectedReport?.id || ''}
                  onChange={(e) => {
                    const found = inspectionReports.find((r) => r.id === e.target.value);
                    if (found) setSelectedReport(found);
                  }}
                  className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 font-medium text-slate-700"
                >
                  {inspectionReports.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.reportNumber} ({r.supplier})
                    </option>
                  ))}
                </select>
              )}

              {/* DOCX DOWNLOAD BUTTON (REQUESTED BY USER) */}
              <button
                type="button"
                disabled={isGeneratingDocx || !selectedReport}
                onClick={handleDownloadDocx}
                className="inline-flex items-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold transition-all shadow-md disabled:opacity-50"
              >
                {isGeneratingDocx ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>Download as DOCX (Word)</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium border border-slate-300 transition-colors"
                title="Print Report"
              >
                <Printer className="w-4 h-4 text-slate-600" />
                <span className="hidden sm:inline">Print</span>
              </button>
            </div>
          </div>

          {/* INSPECTION REPORT DOCUMENT SHEET (Pixel-perfect matching photos) */}
          {selectedReport ? (
            <div className="bg-white rounded-2xl border-2 border-slate-300 p-6 sm:p-10 shadow-lg max-w-4xl mx-auto space-y-6 print:border-none print:shadow-none print:p-0">
              {/* Document Title & Subtitle */}
              <div className="text-center space-y-1 pb-3 border-b border-slate-300">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-wide uppercase font-serif">
                  SUPPLIER INSPECTION REPORT
                </h1>
                <h2 className="text-sm sm:text-base font-bold text-slate-700 tracking-wider uppercase">
                  {selectedReport.subtitle || selectedReport.items[0]?.description || 'ABS ENCLOSURES'}
                </h2>
              </div>

              {/* Metadata Table (4 columns, matching Image 1) */}
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
                        {selectedReport.supplierGstin || '29ABHFM7009H1Z2'}
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

              {/* 2. Inspection & Quality Checks Table */}
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
                        <tr key={chk.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-2.5 border-r border-slate-400 font-bold text-slate-800">{chk.check}</td>
                          <td className="p-2.5 border-r border-slate-400 text-slate-700">{chk.acceptanceRequirement}</td>
                          <td className="p-2.5 border-r border-slate-400 text-slate-600">{chk.testingMethod}</td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleObservation(chk.id)}
                              className={`px-2 py-1 rounded text-xs font-bold transition-all ${
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

              {/* 3. Inspection Sampling / Record */}
              <div className="space-y-2">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
                  3. Inspection Sampling / Record
                </h3>
                <div className="overflow-x-auto rounded border border-slate-400">
                  <table className="w-full text-xs border-collapse">
                    <thead className="bg-slate-100 border-b border-slate-400">
                      <tr>
                        <th className="p-2 text-left font-bold border-r border-slate-400 text-slate-800 w-1/3">Parameter</th>
                        <th className="p-2 text-left font-bold text-slate-800">Record</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-300">
                        <td className="p-2.5 font-bold border-r border-slate-400 text-slate-800">Sample quantity</td>
                        <td className="p-2.5 text-slate-700">
                          {selectedReport.samplingRecord?.sampleQuantity || 'Visual Inspection - 100% | Others 10 samples per batch'}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 font-bold border-r border-slate-400 text-slate-800">Inspection method</td>
                        <td className="p-2.5 text-slate-700">
                          {selectedReport.samplingRecord?.inspectionMethod || 'Visual inspection and measurement against approved drawing / specification'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. Inspection Conclusion */}
              <div className="space-y-2">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">
                  4. Inspection Conclusion
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded border border-slate-300">
                  {selectedReport.conclusionText ||
                    'Based on the inspection checks recorded above and verification against the applicable approved drawing / purchase specification, we shall confirm that supplied goods conform to the specified requirements.'}
                </p>

                {/* Sign-off Table (Image 2) */}
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
                          <span className="font-bold text-slate-700">Name: </span>
                          <span className="font-semibold text-slate-900">{selectedReport.preparedBy?.name || 'Suresh'}</span>
                        </td>
                        <td className="p-2.5">
                          <span className="font-bold text-slate-700">Name: </span>
                          <span className="font-semibold text-slate-900">{selectedReport.verifiedBy?.name || 'Mani Kumar'}</span>
                        </td>
                      </tr>
                      <tr className="border-b border-slate-300">
                        <td className="p-2.5 border-r border-slate-400">
                          <span className="font-bold text-slate-700">Designation: </span>
                          <span>{selectedReport.preparedBy?.designation || 'Supervisor'}</span>
                        </td>
                        <td className="p-2.5">
                          <span className="font-bold text-slate-700">Designation: </span>
                          <span>{selectedReport.verifiedBy?.designation || 'In-charge'}</span>
                        </td>
                      </tr>
                      <tr className="border-b border-slate-300">
                        <td className="p-2.5 border-r border-slate-400">
                          <span className="font-bold text-slate-700">Date: </span>
                          <span className="font-mono">{selectedReport.preparedBy?.date || selectedReport.reportDate}</span>
                        </td>
                        <td className="p-2.5">
                          <span className="font-bold text-slate-700">Date: </span>
                          <span className="font-mono">{selectedReport.verifiedBy?.date || selectedReport.reportDate}</span>
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2.5 border-r border-slate-400">
                          <span className="font-bold text-slate-700">Signature: </span>
                          <span className="font-serif italic text-blue-800 font-bold">
                            {selectedReport.preparedBy?.signatureText || 'Suresh (Verified)'}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <span className="font-bold text-slate-700">Signature: </span>
                          <span className="font-serif italic text-blue-800 font-bold">
                            {selectedReport.verifiedBy?.signatureText || 'Mani Kumar (Approved)'}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottom Docx Action inside the report */}
              <div className="pt-4 border-t border-slate-300 flex items-center justify-between print:hidden">
                <span className="text-xs text-slate-500">
                  Supplier Inspection Report format conforms to ISO 9001 quality audit standards.
                </span>
                <button
                  type="button"
                  disabled={isGeneratingDocx}
                  onClick={handleDownloadDocx}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .docx Word Document</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
              <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No Inspection Report Selected</p>
              <p className="text-xs text-slate-500 mt-1">Upload an invoice in Tab 1 to auto-generate a report, or select one from the archive.</p>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* OPTION 3: VENDOR ARCHIVE & INVOICE HISTORY */}
      {/* ========================================================================= */}
      {activeSubTab === 'vendor_list' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Supplier Invoices & Inspection Archive
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Full history of vendor invoice batches, inward timestamps, and generated inspection certificates.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search vendor or invoice #..."
                value={archiveSearch}
                onChange={(e) => setArchiveSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Invoice No.</th>
                  <th className="py-2.5 px-3">Supplier Name</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">PO Number</th>
                  <th className="py-2.5 px-3 text-right">Items / Qty</th>
                  <th className="py-2.5 px-3 text-right">Total Amount</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
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
                  .map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-blue-700">{inv.invoiceNumber}</td>
                      <td className="py-3 px-3 font-medium text-slate-900">{inv.supplier}</td>
                      <td className="py-3 px-3 font-mono text-slate-500">{inv.invoiceDate}</td>
                      <td className="py-3 px-3 font-mono text-slate-600">{inv.purchaseOrder || '-'}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                        {inv.totalItemsCount.toLocaleString()} pcs
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600">
                        {formatINR(inv.totalAmount)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                            inv.status === 'inwarded'
                              ? 'bg-emerald-100 text-emerald-800'
                              : inv.status === 'inspected'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setActiveSubTab('invoice_inward');
                            }}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold"
                          >
                            View Batch
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setSelectedInvoice(inv);
                              const rep = inspectionReports.find((r) => r.vendorInvoiceId === inv.id) || inspectionReports[0];
                              if (rep) setSelectedReport(rep);
                              setActiveSubTab('inspection_report');
                            }}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-xs font-semibold"
                          >
                            SIR Report
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

      {/* DOCUMENT PREVIEW MODAL */}
      {previewDocumentUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200">
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
                <div className="text-center p-12 text-slate-600">
                  <FileText className="w-16 h-16 mx-auto text-blue-600 mb-3" />
                  <p className="font-bold">PDF Invoice Document Attached</p>
                  <p className="text-xs text-slate-500 mt-1">
                    All items and tables have been extracted into the batch table.
                  </p>
                </div>
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
