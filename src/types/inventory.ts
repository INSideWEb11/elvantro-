export type ComponentCategory = 'Resistor' | 'Capacitor' | 'Inductor' | 'Diode' | 'Enclosure' | 'Mechanical' | 'IC' | 'Connector';

export interface TechnicalSpecs {
  value: string; // e.g. "10kΩ", "100nF", "10µH", "0.7V Vf"
  tolerance?: string; // e.g. "±1%", "±5%", "±10%"
  packageFootprint: string; // e.g. "0402", "0603", "0805", "1206", "SOD-123", "SMA", "Through-Hole"
  powerOrVoltageRating?: string; // e.g. "1/8W (0.125W)", "50V", "1A"
  dielectricOrType?: string; // e.g. "X7R", "C0G/NP0", "Schottky", "Fast Switching", "Zener 3.3V"
}

export interface Part {
  id: string;
  partNumber: string;
  category: ComponentCategory;
  description: string;
  makeBrand: string;
  supplier: string;
  technicalSpecs: TechnicalSpecs;
  location: string; // e.g. "STR1S1B1" or "STR1S3"
  totalInward: number;
  totalOutward: number;
  availableStock: number;
  minReorderQty: number;
  avgUnitPrice: number;
  totalValue: number;
  barcode?: string;
  isCritical?: boolean;
  notes?: string;
}

export type MovementType = 'IN' | 'OUT' | 'RETURN' | 'LOSS';

export interface StockMovement {
  id: string;
  type: MovementType;
  partNumber: string;
  category: ComponentCategory;
  quantity: number;
  unitPrice: number;
  totalMovementValue: number;
  location: string;
  personName: string; // "Received from" or "Issued to"
  timestamp: string; // ISO String
  notes: string;
  projectId?: string;
}

export interface StorageLocation {
  code: string; // e.g. STR1S1B1
  rack: number; // 1-3
  shelf: number; // 1-4
  box: number | null; // 1-4 or null for open shelf
  label?: string;
}

export interface ProjectBOMItem {
  partNumber: string;
  requiredQty: number;
  designator?: string;
  description?: string;
}

export interface ProjectBOM {
  id: string;
  name: string;
  description: string;
  code: string;
  items: ProjectBOMItem[];
  createdAt: string;
}

export interface OutwardScannedItem {
  partNumber: string;
  quantity: number;
  notes?: string;
  availableStock: number;
  location: string;
  unitPrice: number;
  status: 'ok' | 'shortage' | 'not_found';
}

export interface OutwardScanResult {
  scanMode: 'reel' | 'work_order';
  workOrderNumber?: string;
  items: OutwardScannedItem[];
  rawOcrText: string;
}

export interface AIScanResult {
  partNumber: string;
  category: ComponentCategory;
  makeBrand: string;
  supplier: string;
  quantity: number;
  unitPrice: number;
  technicalSpecs: TechnicalSpecs;
  suggestedLocation: string;
  rawOcrText: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface MonthlyRollup {
  monthKey: string; // "2026-10"
  monthLabel: string; // "October 2026"
  inQty: number;
  inValue: number;
  outQty: number;
  outValue: number;
  netQty: number;
  netValue: number;
  openingUnits?: number;
  openingValuation?: number;
  closingUnits?: number;
  closingValuation?: number;
  transactions: StockMovement[];
}

// -----------------------------------------------------------------------------
// VENDOR MANAGEMENT & INVOICE TO INWARD
// -----------------------------------------------------------------------------

export interface VendorInvoiceItem {
  id: string;
  slNo: number;
  partNumber: string;
  description: string;
  hsn: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  category: ComponentCategory;
  location: string;
  notes?: string;
  isNewSku?: boolean;
}

export interface VendorInvoice {
  id: string;
  supplier: string;
  supplierGstin: string;
  customer: string;
  invoiceNumber: string;
  invoiceDate: string;
  purchaseOrder: string;
  ewayBill: string;
  fileName?: string;
  fileType?: string;
  fileData?: string; // base64 or preview url
  driveFileId?: string;
  driveWebViewLink?: string;
  driveFolderPath?: string;
  items: VendorInvoiceItem[];
  status: 'uploaded' | 'inspected' | 'inwarded';
  createdAt: string;
  inwardedAt?: string;
  totalAmount: number;
  totalItemsCount: number;
  inspectionReportId?: string;
  notes?: string;
}

// -----------------------------------------------------------------------------
// APPROVED VENDOR DIRECTORY & VENDOR REGISTRATION
// -----------------------------------------------------------------------------

export type VendorDocumentCategory =
  | 'pan_card'
  | 'gst_certificate'
  | 'bank_proof'
  | 'msme_iso_license'
  | 'vendor_application_form'
  | 'other';

export interface VendorDocument {
  id: string;
  category: VendorDocumentCategory;
  label: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  fileData: string; // base64 data URL (PDF)
  uploadedAt: string;
  driveFileId?: string;
  driveWebViewLink?: string;
}

export interface ApprovedVendor {
  id: string;
  vendorCode: string;
  name: string;
  address: string;
  contactPerson: string;
  contactDesignation?: string;
  phone: string;
  email: string;
  website?: string;
  whatSupplierFor: string;
  suppliedCategories: string[];
  gstin: string;
  pan: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  msmeNumber?: string;
  isoLicenseNo?: string;
  status: 'approved' | 'pending_review' | 'suspended';
  approvedDate: string;
  notes?: string;
  documents: VendorDocument[];
  createdAt: string;
}

// -----------------------------------------------------------------------------
// SUPPLIER INSPECTION REPORT (SIR)
// -----------------------------------------------------------------------------

export interface QualityCheckItem {
  id: string;
  check: string;
  acceptanceRequirement: string;
  testingMethod: string;
  observation: 'Found OK' | 'Not OK' | 'Pending' | string;
  remarks?: string;
}

export interface SupplierInspectionReport {
  id: string;
  reportNumber: string; // e.g. "SIR/MI/INV-839"
  reportDate: string; // e.g. "24/03/2026"
  subtitle: string; // e.g. "ABS ENCLOSURES"
  vendorInvoiceId?: string;
  supplier: string;
  supplierGstin: string;
  customer: string;
  purchaseOrder: string;
  invoiceNumber: string;
  ewayBill: string;
  items: {
    slNo: number;
    description: string;
    hsn: string;
    quantity: number;
  }[];
  checks: QualityCheckItem[];
  samplingRecord: {
    sampleQuantity: string;
    inspectionMethod: string;
  };
  conclusionText: string;
  preparedBy: {
    name: string;
    designation: string;
    date: string;
    signatureText?: string;
  };
  verifiedBy: {
    name: string;
    designation: string;
    date: string;
    signatureText?: string;
  };
  createdAt: string;
}
