import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  ChevronRight,
  ArrowLeft,
  FileText,
  Upload,
  Eye,
  Download,
  Trash2,
  Plus,
  HardDrive,
  CheckCircle2,
  ExternalLink,
  Pencil,
  X,
  RefreshCw,
  AlertCircle,
  UserPlus,
} from 'lucide-react';
import {
  ApprovedVendor,
  VendorDocument,
  VendorDocumentCategory,
} from '../types/inventory';
import { inventoryApi } from '../services/api';
import { useGoogleDrive } from '../context/GoogleDriveContext';
import { dataUrlToBlob, sanitizeDriveName } from '../services/googleDrive';

export const REQUIRED_VENDOR_DOCUMENT_SLOTS: {
  slNo: number;
  category: Exclude<VendorDocumentCategory, 'other'>;
  title: string;
  description: string;
  required: boolean;
}[] = [
  {
    slNo: 1,
    category: 'pan_card',
    title: 'PAN Card',
    description: 'Company / Proprietor Permanent Account Number card (PDF)',
    required: true,
  },
  {
    slNo: 2,
    category: 'gst_certificate',
    title: 'GST Registration Certificate',
    description: 'Valid GSTIN Registration Certificate (REG-06) in PDF format',
    required: true,
  },
  {
    slNo: 3,
    category: 'bank_proof',
    title: 'Cancelled Cheque / Bank Passbook / Bank Statement',
    description: 'Verified bank account proof for NEFT/RTGS vendor payouts (PDF)',
    required: true,
  },
  {
    slNo: 4,
    category: 'msme_iso_license',
    title: 'MSME / Udyam Certificate and ISO/Labour Licenses, if applicable',
    description: 'Udyam registration, ISO 9001/14001, or statutory labour license PDF',
    required: false,
  },
  {
    slNo: 5,
    category: 'vendor_application_form',
    title: 'Completed Vendor Application Form with authorized contact person details',
    description: 'Signed & stamped vendor registration form with authorized signatory (PDF)',
    required: true,
  },
];

interface ApprovedVendorsViewProps {
  vendors: ApprovedVendor[];
  initialSelectedVendorId?: string | null;
  onRefreshAll: () => Promise<void>;
  onOpenRegistrationForm: () => void;
  onShowToast: (message: string, type?: 'success' | 'error') => void;
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const ApprovedVendorsView: React.FC<ApprovedVendorsViewProps> = ({
  vendors,
  initialSelectedVendorId = null,
  onRefreshAll,
  onOpenRegistrationForm,
  onShowToast,
}) => {
  const { uploadWithOverwriteGuard } = useGoogleDrive();

  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(initialSelectedVendorId);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending_review'>('all');

  // Upload & Drive sync states
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [syncingDocId, setSyncingDocId] = useState<string | null>(null);

  // Other Document uploader inputs
  const [otherDocLabel, setOtherDocLabel] = useState('');
  const otherFileInputRef = useRef<HTMLInputElement>(null);

  // PDF preview modal state
  const [previewDoc, setPreviewDoc] = useState<{ doc: VendorDocument; blobUrl: string } | null>(null);

  // Edit Vendor modal state
  const [isEditingVendor, setIsEditingVendor] = useState(false);
  const [editDraft, setEditDraft] = useState<ApprovedVendor | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete confirmation states
  const [confirmDeleteVendor, setConfirmDeleteVendor] = useState<ApprovedVendor | null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<VendorDocument | null>(null);

  useEffect(() => {
    if (initialSelectedVendorId) {
      setSelectedVendorId(initialSelectedVendorId);
    }
  }, [initialSelectedVendorId]);

  // Cleanup preview Blob URL on unmount/change
  useEffect(() => {
    return () => {
      if (previewDoc?.blobUrl) {
        URL.revokeObjectURL(previewDoc.blobUrl);
      }
    };
  }, [previewDoc]);

  const selectedVendor = useMemo(
    () => vendors.find((v) => v.id === selectedVendorId) || null,
    [vendors, selectedVendorId]
  );

  const filteredVendors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return vendors.filter((v) => {
      if (statusFilter !== 'all' && v.status !== statusFilter) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.vendorCode.toLowerCase().includes(q) ||
        v.whatSupplierFor.toLowerCase().includes(q) ||
        v.contactPerson.toLowerCase().includes(q) ||
        v.gstin.toLowerCase().includes(q) ||
        v.phone.toLowerCase().includes(q) ||
        v.email.toLowerCase().includes(q)
      );
    });
  }, [vendors, searchQuery, statusFilter]);

  const countStandardDocs = (vendor: ApprovedVendor) => {
    const standardCats = new Set(REQUIRED_VENDOR_DOCUMENT_SLOTS.map((s) => s.category));
    const present = new Set(
      (vendor.documents || [])
        .filter((d) => standardCats.has(d.category as any))
        .map((d) => d.category)
    );
    return present.size;
  };

  // Read PDF file and attach to vendor
  const handleUploadDocumentForSlot = async (
    vendor: ApprovedVendor,
    category: VendorDocumentCategory,
    label: string,
    file: File
  ) => {
    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      onShowToast('Please upload documents in PDF (.pdf) format.', 'error');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      onShowToast('PDF file is too large (max 15 MB per document).', 'error');
      return;
    }

    try {
      setUploadingSlot(category === 'other' ? 'other' : category);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const newDoc: VendorDocument = {
        id: `vdoc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        category,
        label,
        fileName: file.name,
        mimeType: 'application/pdf',
        fileSize: file.size,
        fileData: dataUrl,
        uploadedAt: new Date().toISOString(),
      };

      // For numbered standard categories (1-5), replace existing doc in that slot; for 'other', append
      const existingDocs = vendor.documents || [];
      const nextDocs =
        category === 'other'
          ? [...existingDocs, newDoc]
          : [...existingDocs.filter((d) => d.category !== category), newDoc];

      await inventoryApi.saveApprovedVendor({ ...vendor, documents: nextDocs });
      await onRefreshAll();
      if (category === 'other') {
        setOtherDocLabel('');
      }
      onShowToast(`Uploaded "${file.name}" under ${label}`);
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to upload PDF document', 'error');
    } finally {
      setUploadingSlot(null);
    }
  };

  // Preview PDF in-app using a Blob URL (avoids popup blockers / iframe window.open issues)
  const handlePreviewDocument = (doc: VendorDocument) => {
    try {
      if (previewDoc?.blobUrl) {
        URL.revokeObjectURL(previewDoc.blobUrl);
      }
      const blob = dataUrlToBlob(doc.fileData, 'application/pdf');
      const blobUrl = URL.createObjectURL(blob);
      setPreviewDoc({ doc, blobUrl });
    } catch {
      onShowToast('Unable to preview this PDF document.', 'error');
    }
  };

  // Download PDF locally
  const handleDownloadDocument = (doc: VendorDocument) => {
    try {
      const blob = dataUrlToBlob(doc.fileData, 'application/pdf');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName || `${sanitizeDriveName(doc.label)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      onShowToast('Failed to download document.', 'error');
    }
  };

  // Upload compliance PDF to Google Drive inside Elentory ERP / Supplier Invoices / <Vendor Name> / Compliance Docs
  const handleSyncDocToDrive = async (vendor: ApprovedVendor, doc: VendorDocument) => {
    try {
      setSyncingDocId(doc.id);
      const blob = dataUrlToBlob(doc.fileData, 'application/pdf');
      const res = await uploadWithOverwriteGuard({
        blob,
        fileName: doc.fileName || `${sanitizeDriveName(doc.label)}.pdf`,
        mimeType: 'application/pdf',
        folderSegments: [
          'Elentory ERP',
          'Supplier Invoices',
          sanitizeDriveName(vendor.name, 'Vendor'),
          'Compliance Docs',
        ],
        promptSignIn: true,
      });

      if (!res) {
        return; // cancelled by user
      }

      const nextDocs = (vendor.documents || []).map((d) =>
        d.id === doc.id
          ? { ...d, driveFileId: res.fileId, driveWebViewLink: res.webViewLink }
          : d
      );
      await inventoryApi.saveApprovedVendor({ ...vendor, documents: nextDocs });
      await onRefreshAll();
      onShowToast(`Saved "${res.fileName}" to Google Drive (${res.folderPath})`);
    } catch (err: any) {
      onShowToast(err?.message || 'Google Drive upload failed', 'error');
    } finally {
      setSyncingDocId(null);
    }
  };

  // Remove document from vendor
  const handleConfirmDeleteDoc = async () => {
    if (!selectedVendor || !confirmDeleteDoc) return;
    try {
      const nextDocs = (selectedVendor.documents || []).filter((d) => d.id !== confirmDeleteDoc.id);
      await inventoryApi.saveApprovedVendor({ ...selectedVendor, documents: nextDocs });
      await onRefreshAll();
      onShowToast(`Removed "${confirmDeleteDoc.fileName}"`);
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to remove document', 'error');
    } finally {
      setConfirmDeleteDoc(null);
    }
  };

  // Save edited vendor details
  const handleSaveVendorEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDraft || !editDraft.name.trim()) {
      onShowToast('Vendor name cannot be empty', 'error');
      return;
    }
    try {
      setIsSavingEdit(true);
      await inventoryApi.saveApprovedVendor(editDraft);
      await onRefreshAll();
      setIsEditingVendor(false);
      setEditDraft(null);
      onShowToast(`Updated vendor information for ${editDraft.name}`);
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to update vendor', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Delete entire vendor
  const handleConfirmDeleteVendor = async () => {
    if (!confirmDeleteVendor) return;
    try {
      await inventoryApi.deleteApprovedVendor(confirmDeleteVendor.id);
      await onRefreshAll();
      if (selectedVendorId === confirmDeleteVendor.id) {
        setSelectedVendorId(null);
      }
      onShowToast(`Deleted vendor "${confirmDeleteVendor.name}"`);
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to delete vendor', 'error');
    } finally {
      setConfirmDeleteVendor(null);
    }
  };

  // ===========================================================================
  // DETAIL VIEW: VENDOR INFORMATION + APPROVED PDF DOCUMENTS
  // ===========================================================================
  if (selectedVendor) {
    const otherDocs = (selectedVendor.documents || []).filter((d) => d.category === 'other');
    const standardUploadedCount = countStandardDocs(selectedVendor);

    return (
      <div className="space-y-5">
        {/* Top Breadcrumb & Back Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center space-x-3 min-w-0">
            <button
              type="button"
              onClick={() => setSelectedVendorId(null)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Approved Vendor List</span>
            </button>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="font-mono text-xs text-slate-500">{selectedVendor.vendorCode}</span>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  {selectedVendor.name}
                </h2>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setEditDraft({ ...selectedVendor });
                setIsEditingVendor(true);
              }}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit Info</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteVendor(selectedVendor)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-white hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove</span>
            </button>
          </div>
        </div>

        {/* VENDOR INFORMATION SHEET */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Vendor Information
            </h3>
            <span
              className={`text-xs font-semibold ${
                selectedVendor.status === 'approved'
                  ? 'text-emerald-700'
                  : selectedVendor.status === 'pending_review'
                  ? 'text-amber-700'
                  : 'text-red-700'
              }`}
            >
              {selectedVendor.status === 'approved'
                ? `Approved (${selectedVendor.approvedDate})`
                : selectedVendor.status === 'pending_review'
                ? 'Pending Review'
                : 'Suspended'}
            </span>
          </div>

          <dl className="divide-y divide-slate-200 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-4 px-5 py-3.5 gap-1 sm:gap-4">
              <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Name</dt>
              <dd className="sm:col-span-3 font-semibold text-slate-900">
                {selectedVendor.name}
                <span className="ml-2 font-mono text-xs font-normal text-slate-500">
                  ({selectedVendor.vendorCode})
                </span>
              </dd>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 px-5 py-3.5 gap-1 sm:gap-4">
              <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Address</dt>
              <dd className="sm:col-span-3 text-slate-800 leading-relaxed">
                {selectedVendor.address || '—'}
              </dd>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 px-5 py-3.5 gap-1 sm:gap-4">
              <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Contact Details
              </dt>
              <dd className="sm:col-span-3 space-y-1 text-slate-800">
                <div className="font-semibold text-slate-900">
                  {selectedVendor.contactPerson || '—'}
                  {selectedVendor.contactDesignation && (
                    <span className="text-xs font-normal text-slate-500">
                      {' '}
                      · {selectedVendor.contactDesignation}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-mono text-slate-700">
                  <span>Phone: {selectedVendor.phone || '—'}</span>
                  <span>Email: {selectedVendor.email || '—'}</span>
                  {selectedVendor.website && <span>Web: {selectedVendor.website}</span>}
                </div>
              </dd>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 px-5 py-3.5 gap-1 sm:gap-4">
              <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                What Supplier For
              </dt>
              <dd className="sm:col-span-3 text-slate-800 leading-relaxed">
                <p>{selectedVendor.whatSupplierFor || '—'}</p>
                {selectedVendor.suppliedCategories && selectedVendor.suppliedCategories.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    Categories: {selectedVendor.suppliedCategories.join(' · ')}
                  </p>
                )}
              </dd>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 px-5 py-3.5 gap-1 sm:gap-4 bg-slate-50/50">
              <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Tax, Bank & Registration
              </dt>
              <dd className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block">GSTIN</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {selectedVendor.gstin || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">PAN</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {selectedVendor.pan || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">MSME / Udyam & ISO</span>
                  <span className="font-mono text-slate-800">
                    {[selectedVendor.msmeNumber, selectedVendor.isoLicenseNo]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </span>
                </div>
                {(selectedVendor.bankName || selectedVendor.accountNumber || selectedVendor.ifscCode) && (
                  <div className="sm:col-span-3 pt-1 border-t border-slate-200/70">
                    <span className="text-slate-500 mr-2">Bank Details:</span>
                    <span className="font-mono text-slate-800">
                      {[
                        selectedVendor.bankName,
                        selectedVendor.accountNumber ? `A/C: ${selectedVendor.accountNumber}` : '',
                        selectedVendor.ifscCode ? `IFSC: ${selectedVendor.ifscCode}` : '',
                      ]
                        .filter(Boolean)
                        .join(' | ')}
                    </span>
                  </div>
                )}
              </dd>
            </div>
          </dl>
        </section>

        {/* APPROVED COMPLIANCE DOCUMENTS (PDF FORMAT) */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Approved Documents (PDF Format)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload, inspect, download, or archive vendor compliance PDFs to Google Drive under{' '}
                <span className="font-mono text-slate-700">
                  Elentory ERP / Supplier Invoices / {sanitizeDriveName(selectedVendor.name)} / Compliance Docs
                </span>
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-slate-700 shrink-0 tabular-nums">
              {standardUploadedCount} / 5 Core Docs · {otherDocs.length} Other
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-white text-slate-500 border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-4 w-14 text-center font-semibold">Sl. No.</th>
                  <th className="py-2.5 px-4 font-semibold">Document Requirement</th>
                  <th className="py-2.5 px-4 font-semibold">Uploaded PDF File</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {REQUIRED_VENDOR_DOCUMENT_SLOTS.map((slot) => {
                  const uploadedDoc = (selectedVendor.documents || []).find(
                    (d) => d.category === slot.category
                  );
                  const isBusy = uploadingSlot === slot.category;

                  return (
                    <tr key={slot.category} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4 text-center font-mono font-semibold text-slate-600 tabular-nums align-top">
                        {slot.slNo}
                      </td>
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-semibold text-slate-900">{slot.title}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{slot.description}</div>
                      </td>
                      <td className="py-3.5 px-4 align-top">
                        {uploadedDoc ? (
                          <div className="space-y-1">
                            <div className="flex items-center space-x-1.5 text-emerald-700 font-semibold">
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate max-w-[240px]" title={uploadedDoc.fileName}>
                                {uploadedDoc.fileName}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 flex flex-wrap items-center gap-x-2">
                              <span>{formatFileSize(uploadedDoc.fileSize)}</span>
                              <span>·</span>
                              <span>{uploadedDoc.uploadedAt.slice(0, 10)}</span>
                              {uploadedDoc.driveWebViewLink && (
                                <a
                                  href={uploadedDoc.driveWebViewLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center space-x-1 text-blue-600 hover:underline font-sans font-semibold"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>In Google Drive</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Not uploaded yet (PDF required)</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right align-top">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          <label className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-md font-semibold cursor-pointer transition-colors">
                            {isBusy ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Upload className="w-3.5 h-3.5" />
                            )}
                            <span>{uploadedDoc ? 'Replace PDF' : 'Upload PDF'}</span>
                            <input
                              type="file"
                              accept=".pdf,application/pdf"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  handleUploadDocumentForSlot(
                                    selectedVendor,
                                    slot.category,
                                    slot.title,
                                    file
                                  );
                                  e.target.value = '';
                                }
                              }}
                            />
                          </label>

                          {uploadedDoc && (
                            <>
                              <button
                                type="button"
                                onClick={() => handlePreviewDocument(uploadedDoc)}
                                className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-md font-medium"
                                title="View PDF"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>View</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadDocument(uploadedDoc)}
                                className="inline-flex items-center space-x-1 px-2 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-md"
                                title="Download PDF"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={syncingDocId === uploadedDoc.id}
                                onClick={() => handleSyncDocToDrive(selectedVendor, uploadedDoc)}
                                className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-medium disabled:opacity-50"
                                title="Save to Google Drive"
                              >
                                {syncingDocId === uploadedDoc.id ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <HardDrive className="w-3.5 h-3.5" />
                                )}
                                <span>Drive</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteDoc(uploadedDoc)}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-md"
                                title="Remove PDF"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {/* Other Uploaded PDF Documents */}
                {otherDocs.map((doc, idx) => (
                  <tr key={doc.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 text-center font-mono font-semibold text-slate-500 tabular-nums align-top">
                      {6 + idx}
                    </td>
                    <td className="py-3.5 px-4 align-top">
                      <div className="font-semibold text-slate-900">{doc.label}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Additional supporting document (PDF)</div>
                    </td>
                    <td className="py-3.5 px-4 align-top">
                      <div className="flex items-center space-x-1.5 text-emerald-700 font-semibold">
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate max-w-[240px]" title={doc.fileName}>
                          {doc.fileName}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 flex flex-wrap items-center gap-x-2 mt-0.5">
                        <span>{formatFileSize(doc.fileSize)}</span>
                        <span>·</span>
                        <span>{doc.uploadedAt.slice(0, 10)}</span>
                        {doc.driveWebViewLink && (
                          <a
                            href={doc.driveWebViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-1 text-blue-600 hover:underline font-sans font-semibold"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>In Google Drive</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right align-top">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handlePreviewDocument(doc)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-md font-medium"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadDocument(doc)}
                          className="inline-flex items-center space-x-1 px-2 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-md"
                          title="Download PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={syncingDocId === doc.id}
                          onClick={() => handleSyncDocToDrive(selectedVendor, doc)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-medium disabled:opacity-50"
                        >
                          {syncingDocId === doc.id ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <HardDrive className="w-3.5 h-3.5" />
                          )}
                          <span>Drive</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteDoc(doc)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-md"
                          title="Remove PDF"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add Other Document Bar */}
          <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center gap-2.5">
            <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
              Other Document (PDF):
            </span>
            <input
              type="text"
              value={otherDocLabel}
              onChange={(e) => setOtherDocLabel(e.target.value)}
              placeholder="Document title (e.g. NDA, RoHS Certificate, Quality Audit Report)..."
              className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400"
            />
            <input
              ref={otherFileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleUploadDocumentForSlot(
                    selectedVendor,
                    'other',
                    otherDocLabel.trim() || file.name.replace(/\.pdf$/i, ''),
                    file
                  );
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              disabled={uploadingSlot === 'other'}
              onClick={() => otherFileInputRef.current?.click()}
              className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              {uploadingSlot === 'other' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>Add Other PDF</span>
            </button>
          </div>
        </section>

        {/* PDF Preview Modal */}
        {previewDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
            <div className="bg-white rounded-xl max-w-4xl w-full h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200">
              <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold truncate">{previewDoc.doc.label}</div>
                  <div className="text-[11px] text-slate-400 font-mono truncate">
                    {previewDoc.doc.fileName}
                  </div>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleDownloadDocument(previewDoc.doc)}
                    className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md text-xs font-medium"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDoc(null)}
                    className="p-1 text-slate-400 hover:text-white rounded"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-slate-100">
                <iframe
                  src={previewDoc.blobUrl}
                  title={previewDoc.doc.fileName}
                  className="w-full h-full border-0"
                />
              </div>
            </div>
          </div>
        )}

        {/* Edit Vendor Modal */}
        {isEditingVendor && editDraft && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <form
              onSubmit={handleSaveVendorEdit}
              className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200"
            >
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between sticky top-0">
                <h3 className="text-sm font-bold text-slate-900">Edit Vendor Information</h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingVendor(false);
                    setEditDraft(null);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Vendor Name *</label>
                  <input
                    type="text"
                    required
                    value={editDraft.name}
                    onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Address</label>
                  <textarea
                    rows={2}
                    value={editDraft.address}
                    onChange={(e) => setEditDraft({ ...editDraft, address: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">What Supplier For</label>
                  <textarea
                    rows={2}
                    value={editDraft.whatSupplierFor}
                    onChange={(e) => setEditDraft({ ...editDraft, whatSupplierFor: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Authorized Contact Person</label>
                  <input
                    type="text"
                    value={editDraft.contactPerson}
                    onChange={(e) => setEditDraft({ ...editDraft, contactPerson: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Designation</label>
                  <input
                    type="text"
                    value={editDraft.contactDesignation || ''}
                    onChange={(e) => setEditDraft({ ...editDraft, contactDesignation: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={editDraft.phone}
                    onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={editDraft.email}
                    onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">GSTIN</label>
                  <input
                    type="text"
                    value={editDraft.gstin}
                    onChange={(e) => setEditDraft({ ...editDraft, gstin: e.target.value.toUpperCase() })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">PAN</label>
                  <input
                    type="text"
                    value={editDraft.pan}
                    onChange={(e) => setEditDraft({ ...editDraft, pan: e.target.value.toUpperCase() })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={editDraft.bankName || ''}
                    onChange={(e) => setEditDraft({ ...editDraft, bankName: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Account No. / IFSC</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Account No."
                      value={editDraft.accountNumber || ''}
                      onChange={(e) => setEditDraft({ ...editDraft, accountNumber: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900 font-mono"
                    />
                    <input
                      type="text"
                      placeholder="IFSC"
                      value={editDraft.ifscCode || ''}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, ifscCode: e.target.value.toUpperCase() })
                      }
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900 font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">MSME / Udyam No.</label>
                  <input
                    type="text"
                    value={editDraft.msmeNumber || ''}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, msmeNumber: e.target.value.toUpperCase() })
                    }
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Approval Status</label>
                  <select
                    value={editDraft.status}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, status: e.target.value as ApprovedVendor['status'] })
                    }
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 bg-white"
                  >
                    <option value="approved">Approved</option>
                    <option value="pending_review">Pending Review</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>
              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingVendor(false);
                    setEditDraft(null);
                  }}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Delete Document Confirmation Modal */}
        {confirmDeleteDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
            <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-2xl border border-slate-200">
              <div className="flex items-center space-x-2.5 text-red-700 mb-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <h4 className="text-sm font-bold">Remove PDF Document?</h4>
              </div>
              <p className="text-xs text-slate-600">
                Remove <strong>{confirmDeleteDoc.fileName}</strong> from {selectedVendor.name}?
              </p>
              <div className="mt-4 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteDoc(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteDoc}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Vendor Confirmation Modal */}
        {confirmDeleteVendor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
            <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-2xl border border-slate-200">
              <div className="flex items-center space-x-2.5 text-red-700 mb-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <h4 className="text-sm font-bold">Delete Approved Vendor?</h4>
              </div>
              <p className="text-xs text-slate-600">
                Permanently remove <strong>{confirmDeleteVendor.name}</strong> and its attached compliance files from the approved list?
              </p>
              <div className="mt-4 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteVendor(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteVendor}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                >
                  Delete Vendor
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // MASTER LIST VIEW: CLEAN LINE-BY-LINE APPROVED VENDOR LIST WITH SL. NO.
  // ===========================================================================
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            Approved Vendor List
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Select any vendor row to view complete vendor information and approved compliance PDF documents.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vendor, GSTIN, supplied items..."
              className="w-60 sm:w-64 bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700"
          >
            <option value="all">All Status ({vendors.length})</option>
            <option value="approved">Approved</option>
            <option value="pending_review">Pending Review</option>
          </select>

          <button
            type="button"
            onClick={onOpenRegistrationForm}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Register Vendor</span>
          </button>
        </div>
      </div>

      {/* Clean Tabular Line List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4 w-16 text-center font-semibold">Sl. No.</th>
                <th className="py-3 px-4 font-semibold">Vendor Name</th>
                <th className="py-3 px-4 font-semibold">What Supplier For</th>
                <th className="py-3 px-4 font-semibold">Contact Details</th>
                <th className="py-3 px-4 font-semibold">GSTIN</th>
                <th className="py-3 px-4 text-center font-semibold">PDF Docs</th>
                <th className="py-3 px-4 text-center font-semibold">Status</th>
                <th className="py-3 px-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredVendors.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    No approved vendors match your search.{' '}
                    <button
                      type="button"
                      onClick={onOpenRegistrationForm}
                      className="text-blue-600 font-semibold hover:underline"
                    >
                      Register a new vendor
                    </button>
                  </td>
                </tr>
              ) : (
                filteredVendors.map((vendor, index) => {
                  const coreCount = countStandardDocs(vendor);
                  const totalDocs = (vendor.documents || []).length;

                  return (
                    <tr
                      key={vendor.id}
                      onClick={() => setSelectedVendorId(vendor.id)}
                      className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                    >
                      <td className="py-3.5 px-4 text-center font-mono font-semibold text-slate-500 tabular-nums">
                        {index + 1}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                          {vendor.name}
                        </div>
                        <div className="font-mono text-[11px] text-slate-400 mt-0.5">
                          {vendor.vendorCode}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700 max-w-xs">
                        <div className="line-clamp-2">{vendor.whatSupplierFor || '—'}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800">{vendor.contactPerson || '—'}</div>
                        <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                          {vendor.phone || vendor.email || '—'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                        {vendor.gstin || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono tabular-nums whitespace-nowrap">
                        <span
                          className={
                            coreCount >= 5
                              ? 'text-emerald-700 font-semibold'
                              : totalDocs > 0
                              ? 'text-blue-700 font-semibold'
                              : 'text-slate-400'
                          }
                        >
                          {coreCount}/5
                        </span>
                        {totalDocs > coreCount && (
                          <span className="text-[11px] text-slate-500 ml-1">
                            (+{totalDocs - coreCount})
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span
                          className={`text-[11px] font-semibold ${
                            vendor.status === 'approved'
                              ? 'text-emerald-700'
                              : vendor.status === 'pending_review'
                              ? 'text-amber-700'
                              : 'text-red-700'
                          }`}
                        >
                          {vendor.status === 'approved'
                            ? 'Approved'
                            : vendor.status === 'pending_review'
                            ? 'Pending'
                            : 'Suspended'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-400 group-hover:text-blue-600">
                        <ChevronRight className="w-4 h-4 inline" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
