import React, { useState, useRef } from 'react';
import {
  FileText,
  Upload,
  Plus,
  Trash2,
  CheckCircle2,
  Printer,
  RefreshCw,
  HardDrive,
} from 'lucide-react';
import {
  ApprovedVendor,
  VendorDocument,
  VendorDocumentCategory,
} from '../types/inventory';
import { REQUIRED_VENDOR_DOCUMENT_SLOTS } from './ApprovedVendorsView';
import { inventoryApi } from '../services/api';
import { useGoogleDrive } from '../context/GoogleDriveContext';
import { dataUrlToBlob, sanitizeDriveName } from '../services/googleDrive';

interface VendorRegistrationFormProps {
  existingCount: number;
  onRegistered: (vendor: ApprovedVendor) => void;
  onShowToast: (message: string, type?: 'success' | 'error') => void;
}

const SUPPLY_CATEGORY_OPTIONS = [
  'Resistor',
  'Capacitor',
  'Inductor',
  'Diode',
  'IC / Semiconductor',
  'Connector / Harness',
  'PCB Fabrication',
  'Enclosure / Plastics',
  'Mechanical / Fasteners',
  'Packaging & Consumables',
];

export const VendorRegistrationForm: React.FC<VendorRegistrationFormProps> = ({
  existingCount,
  onRegistered,
  onShowToast,
}) => {
  const { isConnected, uploadWithOverwriteGuard } = useGoogleDrive();

  // Form fields
  const [vendorCode, setVendorCode] = useState(
    `VND-${String(existingCount + 1).padStart(3, '0')}`
  );
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [whatSupplierFor, setWhatSupplierFor] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [contactPerson, setContactPerson] = useState('');
  const [contactDesignation, setContactDesignation] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [pan, setPan] = useState('');
  const [gstin, setGstin] = useState('');
  const [msmeNumber, setMsmeNumber] = useState('');
  const [isoLicenseNo, setIsoLicenseNo] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [status, setStatus] = useState<'approved' | 'pending_review'>('approved');
  const [notes, setNotes] = useState('');
  const [syncToDriveOnSubmit, setSyncToDriveOnSubmit] = useState(true);

  // Uploaded PDF documents staged before submit
  const [documents, setDocuments] = useState<VendorDocument[]>([]);
  const [otherDocTitle, setOtherDocTitle] = useState('');
  const otherFileRef = useRef<HTMLInputElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleStagePdfFile = async (
    category: VendorDocumentCategory,
    label: string,
    file: File
  ) => {
    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      onShowToast('Please attach documents in PDF (.pdf) format.', 'error');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      onShowToast('PDF file exceeds 15 MB limit.', 'error');
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const stagedDoc: VendorDocument = {
        id: `vdoc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        category,
        label,
        fileName: file.name,
        mimeType: 'application/pdf',
        fileSize: file.size,
        fileData: dataUrl,
        uploadedAt: new Date().toISOString(),
      };

      setDocuments((prev) =>
        category === 'other'
          ? [...prev, stagedDoc]
          : [...prev.filter((d) => d.category !== category), stagedDoc]
      );
      if (category === 'other') {
        setOtherDocTitle('');
      }
      onShowToast(`Attached "${file.name}"`);
    } catch {
      onShowToast('Failed to read PDF file', 'error');
    }
  };

  const removeStagedDoc = (docId: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      onShowToast('Please enter the Vendor / Company Name.', 'error');
      return;
    }
    if (!whatSupplierFor.trim()) {
      onShowToast('Please specify what this vendor supplies for.', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      let finalDocs = [...documents];

      // If connected to Google Drive and option enabled, also archive attached PDFs to supplier folder
      if (isConnected && syncToDriveOnSubmit && finalDocs.length > 0) {
        const folderSegments = [
          'Elentory ERP',
          'Supplier Invoices',
          sanitizeDriveName(name.trim(), 'Vendor'),
          'Compliance Docs',
        ];
        const syncedDocs: VendorDocument[] = [];
        for (const doc of finalDocs) {
          try {
            const blob = dataUrlToBlob(doc.fileData, 'application/pdf');
            const res = await uploadWithOverwriteGuard({
              blob,
              fileName: doc.fileName,
              mimeType: 'application/pdf',
              folderSegments,
              promptSignIn: false,
            });
            if (res) {
              syncedDocs.push({
                ...doc,
                driveFileId: res.fileId,
                driveWebViewLink: res.webViewLink,
              });
            } else {
              syncedDocs.push(doc);
            }
          } catch {
            syncedDocs.push(doc);
          }
        }
        finalDocs = syncedDocs;
      }

      const saved = await inventoryApi.saveApprovedVendor({
        vendorCode: vendorCode.trim() || `VND-${String(existingCount + 1).padStart(3, '0')}`,
        name: name.trim(),
        address: address.trim(),
        contactPerson: contactPerson.trim(),
        contactDesignation: contactDesignation.trim(),
        phone: phone.trim(),
        email: email.trim(),
        website: website.trim(),
        whatSupplierFor: whatSupplierFor.trim(),
        suppliedCategories: selectedCategories,
        gstin: gstin.trim().toUpperCase(),
        pan: pan.trim().toUpperCase(),
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        ifscCode: ifscCode.trim().toUpperCase(),
        msmeNumber: msmeNumber.trim().toUpperCase(),
        isoLicenseNo: isoLicenseNo.trim(),
        status,
        approvedDate: new Date().toISOString().slice(0, 10),
        notes: notes.trim(),
        documents: finalDocs,
      });

      onShowToast(`Vendor "${saved.name}" registered and added to Approved Vendor List.`);
      onRegistered(saved);
    } catch (err: any) {
      onShowToast(err?.message || 'Failed to register vendor', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const otherStagedDocs = documents.filter((d) => d.category === 'other');

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            Vendor Registration Form
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Register a new supplier with company details, authorized contact person, tax/bank particulars, and mandatory PDF compliance documents.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg print:hidden self-start sm:self-auto"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Print Form</span>
        </button>
      </div>

      {/* SECTION 1: COMPANY & SUPPLY SCOPE */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            1. Supplier Information & Scope of Supply
          </h3>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="sm:col-span-2">
            <label className="block font-semibold text-slate-700 mb-1">
              Vendor / Company Legal Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Mouser Electronics India Pvt. Ltd. / Ktron Components"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 placeholder-slate-400"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Vendor Code</label>
            <input
              type="text"
              value={vendorCode}
              onChange={(e) => setVendorCode(e.target.value.toUpperCase())}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block font-semibold text-slate-700 mb-1">
              Registered Business Address *
            </label>
            <textarea
              rows={2}
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Building / Plot No., Industrial Area, Street, City, State, PIN Code"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 placeholder-slate-400"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block font-semibold text-slate-700 mb-1">
              What Supplier For (Items / Materials / Services Supplied) *
            </label>
            <textarea
              rows={2}
              required
              value={whatSupplierFor}
              onChange={(e) => setWhatSupplierFor(e.target.value)}
              placeholder="Describe components or services supplied (e.g. SMD Passives, Connectors, ABS Enclosures, PCB Assemblies)"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 placeholder-slate-400"
            />
          </div>

          <div className="sm:col-span-3">
            <label className="block font-semibold text-slate-700 mb-1.5">
              Supplied Material Categories
            </label>
            <div className="flex flex-wrap gap-2">
              {SUPPLY_CATEGORY_OPTIONS.map((cat) => {
                const active = selectedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: AUTHORIZED CONTACT PERSON */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            2. Authorized Contact Person Details
          </h3>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Authorized Contact Person Name *
            </label>
            <input
              type="text"
              required
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="Full name"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Designation</label>
            <input
              type="text"
              value={contactDesignation}
              onChange={(e) => setContactDesignation(e.target.value)}
              placeholder="e.g. Sales Manager / Director"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Phone / Mobile Number *
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98XXXXXXXX"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Official Email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sales@supplier.com"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Website (Optional)</label>
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://www.supplier.com"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Approval Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'approved' | 'pending_review')}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 bg-white"
            >
              <option value="approved">Approved Vendor</option>
              <option value="pending_review">Pending Quality Review</option>
            </select>
          </div>
        </div>
      </section>

      {/* SECTION 3: TAX, BANKING & STATUTORY DETAILS */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            3. Tax, Banking & Compliance Particulars
          </h3>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">PAN Number</label>
            <input
              type="text"
              value={pan}
              onChange={(e) => setPan(e.target.value.toUpperCase())}
              placeholder="ABCDE1234F"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">GSTIN</label>
            <input
              type="text"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              placeholder="29ABCDE1234F1Z5"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              MSME / Udyam Reg. No. (if applicable)
            </label>
            <input
              type="text"
              value={msmeNumber}
              onChange={(e) => setMsmeNumber(e.target.value.toUpperCase())}
              placeholder="UDYAM-XX-00-0000000"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Bank Name & Branch</label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="e.g. HDFC Bank - Peenya"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Bank Account Number</label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Account number"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">IFSC Code</label>
            <input
              type="text"
              value={ifscCode}
              onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
              placeholder="HDFC0000001"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block font-semibold text-slate-700 mb-1">
              ISO / Labour License Details (if applicable)
            </label>
            <input
              type="text"
              value={isoLicenseNo}
              onChange={(e) => setIsoLicenseNo(e.target.value)}
              placeholder="e.g. ISO 9001:2015 / Labour License No."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
            />
          </div>
        </div>
      </section>

      {/* SECTION 4: REQUIRED PDF DOCUMENTS */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              4. Upload Vendor Compliance Documents (PDF Format)
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Attach vendor KYC & registration documents in PDF format. You can also add or replace PDFs anytime from the Approved Vendor List.
            </p>
          </div>
          <span className="font-mono text-xs text-slate-600 font-semibold tabular-nums">
            {documents.length} PDF(s) attached
          </span>
        </div>

        <div className="divide-y divide-slate-200 text-xs">
          {REQUIRED_VENDOR_DOCUMENT_SLOTS.map((slot) => {
            const attached = documents.find((d) => d.category === slot.category);
            return (
              <div
                key={slot.category}
                className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start space-x-3 min-w-0">
                  <span className="font-mono font-semibold text-slate-500 w-5 shrink-0 pt-0.5">
                    {slot.slNo}.
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{slot.title}</div>
                    {attached ? (
                      <div className="flex items-center space-x-1.5 text-emerald-700 font-medium mt-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{attached.fileName}</span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500 mt-0.5">{slot.description}</div>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0 pl-8 sm:pl-0">
                  <label className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg font-semibold cursor-pointer transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{attached ? 'Change PDF' : 'Attach PDF'}</span>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleStagePdfFile(slot.category, slot.title, file);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                  {attached && (
                    <button
                      type="button"
                      onClick={() => removeStagedDoc(attached.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                      title="Remove attached PDF"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Other Documents */}
          {otherStagedDocs.map((doc, idx) => (
            <div
              key={doc.id}
              className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/40"
            >
              <div className="flex items-start space-x-3 min-w-0">
                <span className="font-mono font-semibold text-slate-500 w-5 shrink-0 pt-0.5">
                  {6 + idx}.
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{doc.label}</div>
                  <div className="flex items-center space-x-1.5 text-emerald-700 font-medium mt-0.5">
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{doc.fileName}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeStagedDoc(doc.id)}
                className="p-1.5 text-slate-400 hover:text-red-600 rounded self-end sm:self-center"
                title="Remove PDF"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {/* Add Other PDF row */}
          <div className="px-5 py-3.5 bg-slate-50 flex flex-col sm:flex-row sm:items-center gap-2.5">
            <span className="font-semibold text-slate-700 whitespace-nowrap">
              Other Document (if required):
            </span>
            <input
              type="text"
              value={otherDocTitle}
              onChange={(e) => setOtherDocTitle(e.target.value)}
              placeholder="Document name (e.g. NDA, RoHS Certificate, Quality Manual)..."
              className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400"
            />
            <input
              ref={otherFileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleStagePdfFile(
                    'other',
                    otherDocTitle.trim() || file.name.replace(/\.pdf$/i, ''),
                    file
                  );
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => otherFileRef.current?.click()}
              className="inline-flex items-center justify-center space-x-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Attach Other PDF</span>
            </button>
          </div>
        </div>
      </section>

      {/* Notes & Submit Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="text-xs">
          <label className="block font-semibold text-slate-700 mb-1">
            Internal Procurement Remarks (Optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Payment terms (e.g. Net 30), lead time, quality notes..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 placeholder-slate-400"
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200">
          <label className="inline-flex items-center space-x-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={syncToDriveOnSubmit}
              onChange={(e) => setSyncToDriveOnSubmit(e.target.checked)}
              className="rounded border-slate-300 text-blue-600"
            />
            <HardDrive className="w-3.5 h-3.5 text-slate-500" />
            <span>
              {isConnected
                ? 'Automatically copy attached PDFs to Google Drive supplier folder on save'
                : 'Connect Google Drive above to also archive attached PDFs to Drive'}
            </span>
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {isSubmitting ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            <span>{isSubmitting ? 'Saving Vendor...' : 'Submit & Add to Approved Vendor List'}</span>
          </button>
        </div>
      </div>
    </form>
  );
};
