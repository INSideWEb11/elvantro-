import {
  Part,
  StockMovement,
  ProjectBOM,
  ProjectBOMItem,
  StorageLocation,
  AIScanResult,
  OutwardScanResult,
  VendorInvoice,
  SupplierInspectionReport,
  ApprovedVendor,
} from '../types/inventory';
import {
  INITIAL_PARTS,
  INITIAL_MOVEMENTS,
  INITIAL_PROJECTS,
  INITIAL_VENDOR_INVOICES,
  INITIAL_INSPECTION_REPORTS,
  INITIAL_APPROVED_VENDORS,
  generateLocations,
} from '../data/seedData';
import * as XLSX from 'xlsx';

// Local storage key for offline/fallback caching
const STORAGE_KEY = 'elentory_inventory_cache_v3';

interface CachedState {
  parts: Part[];
  movements: StockMovement[];
  projects: ProjectBOM[];
  locations: StorageLocation[];
  vendorInvoices: VendorInvoice[];
  inspectionReports: SupplierInspectionReport[];
  approvedVendors: ApprovedVendor[];
}

// Load cached state or default seed data
const getInitialState = (): CachedState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.parts && Array.isArray(parsed.parts)) {
        return {
          ...parsed,
          vendorInvoices: parsed.vendorInvoices || INITIAL_VENDOR_INVOICES,
          inspectionReports: parsed.inspectionReports || INITIAL_INSPECTION_REPORTS,
          approvedVendors: parsed.approvedVendors || INITIAL_APPROVED_VENDORS,
        };
      }
    }
  } catch {
    // Local storage fallback
  }
  return {
    parts: INITIAL_PARTS,
    movements: INITIAL_MOVEMENTS,
    projects: INITIAL_PROJECTS,
    locations: generateLocations(),
    vendorInvoices: INITIAL_VENDOR_INVOICES,
    inspectionReports: INITIAL_INSPECTION_REPORTS,
    approvedVendors: INITIAL_APPROVED_VENDORS,
  };
};

const saveCachedState = (state: CachedState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota or storage restriction fallback
  }
};

export const inventoryApi = {
  // Fetch all inventory state
  async getInventory(): Promise<CachedState> {
    try {
      const res = await fetch('/api/inventory');
      if (res.ok) {
        const data = await res.json();
        saveCachedState(data);
        return data;
      }
    } catch {
      // Backend unavailable, using local cache
    }
    return getInitialState();
  },

  // Record Inward movement
  async recordInward(payload: any): Promise<{ success: boolean; part: Part; movement: StockMovement }> {
    try {
      const res = await fetch('/api/inward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        return await res.json();
      }
      const err = await res.json();
      throw new Error(err.error || 'Failed to record inward');
    } catch (e: any) {
      // Local fallback execution
      const current = getInitialState();
      const cleanPartNo = String(payload.partNumber).trim().toUpperCase();
      const qty = Number(payload.quantity);
      const price = Number(payload.unitPrice) || 0;
      const destLocation = payload.location || 'STR1S1B1';

      let part = current.parts.find((p) => p.partNumber === cleanPartNo);
      if (part) {
        const oldVal = part.availableStock * part.avgUnitPrice;
        const newVal = qty * price;
        const newStock = part.availableStock + qty;
        part.avgUnitPrice = newStock > 0 ? Number(((oldVal + newVal) / newStock).toFixed(4)) : price;
        part.availableStock = newStock;
        part.totalInward += qty;
        part.totalValue = Number((part.availableStock * part.avgUnitPrice).toFixed(2));
        part.location = destLocation;
      } else {
        part = {
          id: `prt-${Date.now()}`,
          partNumber: cleanPartNo,
          category: payload.category || 'Resistor',
          description: payload.description || `${cleanPartNo} component`,
          makeBrand: payload.makeBrand || 'Generic',
          supplier: payload.supplier || 'Distributor',
          technicalSpecs: payload.technicalSpecs || { value: 'N/A', packageFootprint: '0805' },
          location: destLocation,
          totalInward: qty,
          totalOutward: 0,
          availableStock: qty,
          minReorderQty: 500,
          avgUnitPrice: price,
          totalValue: Number((qty * price).toFixed(2)),
          isCritical: Boolean(payload.isCritical),
        };
        current.parts.unshift(part);
      }

      const movement: StockMovement = {
        id: `mov-${Date.now()}`,
        type: 'IN',
        partNumber: cleanPartNo,
        category: part.category,
        quantity: qty,
        unitPrice: price,
        totalMovementValue: Number((qty * price).toFixed(2)),
        location: destLocation,
        personName: payload.personName || 'Warehouse Tech',
        timestamp: new Date().toISOString(),
        notes: payload.notes || 'Inward stock receipt',
      };
      current.movements.unshift(movement);
      saveCachedState(current);

      return { success: true, part, movement };
    }
  },

  // Record Outward movement with over-issue protection
  async recordOutward(payload: any): Promise<{ success: boolean; part: Part; movement: StockMovement }> {
    try {
      const res = await fetch('/api/outward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        return await res.json();
      }
      const err = await res.json();
      throw new Error(err.error || 'Failed to dispatch outward');
    } catch (e: any) {
      if (e.message && e.message.includes('Over-issue prevented')) {
        throw e;
      }
      // Local fallback
      const current = getInitialState();
      const cleanPartNo = String(payload.partNumber).trim().toUpperCase();
      const qty = Number(payload.quantity);
      const part = current.parts.find((p) => p.partNumber === cleanPartNo);

      if (!part) throw new Error(`Part ${cleanPartNo} not found`);
      if (qty > part.availableStock) {
        throw new Error(`Over-issue prevented: Requested quantity (${qty}) exceeds available (${part.availableStock})`);
      }

      part.availableStock -= qty;
      part.totalOutward += qty;
      part.totalValue = Number((part.availableStock * part.avgUnitPrice).toFixed(2));

      const movement: StockMovement = {
        id: `mov-${Date.now()}`,
        type: payload.movementType || 'OUT',
        partNumber: cleanPartNo,
        category: part.category,
        quantity: qty,
        unitPrice: part.avgUnitPrice,
        totalMovementValue: Number((qty * part.avgUnitPrice).toFixed(2)),
        location: payload.location || part.location,
        personName: payload.personName || 'Assembly Operator',
        timestamp: new Date().toISOString(),
        notes: payload.notes || 'Outward dispatch',
      };

      current.movements.unshift(movement);
      saveCachedState(current);
      return { success: true, part, movement };
    }
  },

  // Scan component label with Gemini Vision / OCR
  async scanLabel(imageBase64: string, mimeType = 'image/jpeg', fileName?: string): Promise<AIScanResult> {
    const res = await fetch('/api/scan-label', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, mimeType, fileName }),
    });
    if (res.ok) {
      const body = await res.json();
      return body.data;
    }
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Label OCR scan failed (HTTP ${res.status})`);
  },

  // Alias for scanLabel with wrapped data
  async scanReelLabel(imageBase64: string, mimeType = 'image/jpeg', fileName?: string): Promise<{ data: AIScanResult } & AIScanResult> {
    const result = await this.scanLabel(imageBase64, mimeType, fileName);
    return Object.assign({ data: result }, result);
  },

  // Scan component reel or work order sheet during outward dispatch
  async scanOutward(imageBase64: string, mimeType = 'image/jpeg'): Promise<OutwardScanResult> {
    const res = await fetch('/api/scan-outward', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, mimeType }),
    });
    if (res.ok) {
      const body = await res.json();
      return body.data;
    }
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Outward scan failed (HTTP ${res.status})`);
  },

  // Save / Update Project BOM
  async saveProject(project: ProjectBOM): Promise<ProjectBOM> {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
      });
      if (res.ok) {
        const body = await res.json();
        return body.project;
      }
    } catch {
      // Backend unavailable, fallback to local
    }

    const current = getInitialState();
    const cleanCode = project.code.trim().toUpperCase();
    const idx = current.projects.findIndex(
      (p) => p.id === project.id || p.code.toUpperCase() === cleanCode
    );

    if (idx >= 0) {
      current.projects[idx] = { ...current.projects[idx], ...project, code: cleanCode };
    } else {
      current.projects.unshift({
        ...project,
        id: project.id || `proj-${Date.now()}`,
        code: cleanCode,
        createdAt: project.createdAt || new Date().toISOString(),
      });
    }
    saveCachedState(current);
    return project;
  },

  // Delete Part from Catalog & Stock Grid
  async deletePart(idOrPartNumber: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/parts/${encodeURIComponent(idOrPartNumber)}`, { method: 'DELETE' });
      if (res.ok) return true;
    } catch {
      // Backend fallback to local
    }
    const current = getInitialState();
    const clean = idOrPartNumber.trim().toUpperCase();
    const idx = current.parts.findIndex((p) => p.id === idOrPartNumber || p.partNumber === clean);
    if (idx !== -1) {
      current.parts.splice(idx, 1);
      saveCachedState(current);
      return true;
    }
    return false;
  },

  // Batch Delete Parts from Catalog & Stock Grid
  async deleteMultipleParts(partNumbersOrIds: string[]): Promise<number> {
    if (!partNumbersOrIds || partNumbersOrIds.length === 0) return 0;
    try {
      const res = await fetch('/api/parts/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partNumbers: partNumbersOrIds, ids: partNumbersOrIds }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.deletedCount || partNumbersOrIds.length;
      }
    } catch {
      // Backend fallback to local
    }
    const current = getInitialState();
    const set = new Set(partNumbersOrIds.map((s) => s.trim().toUpperCase()));
    const initialLen = current.parts.length;
    current.parts = current.parts.filter((p) => !set.has(p.id) && !set.has(p.partNumber));
    saveCachedState(current);
    return initialLen - current.parts.length;
  },

  // Batch Inward Stock Intake
  async batchInward(payload: {
    items: Array<{
      partNumber: string;
      category?: string;
      description?: string;
      makeBrand?: string;
      supplier?: string;
      quantity: number;
      unitPrice?: number;
      location?: string;
      personName?: string;
      notes?: string;
    }>;
    personName?: string;
    batchNotes?: string;
  }): Promise<{ success: boolean; count: number; parts?: Part[]; movements?: StockMovement[] }> {
    try {
      const res = await fetch('/api/batch/inward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        return await res.json();
      }
      const err = await res.json();
      throw new Error(err.error || 'Failed to process batch inward');
    } catch {
      // Local fallback
      const current = getInitialState();
      const createdMovements: StockMovement[] = [];
      const updatedParts: Part[] = [];

      for (const item of payload.items) {
        if (!item.partNumber || Number(item.quantity) <= 0) continue;
        const cleanPartNo = String(item.partNumber).trim().toUpperCase();
        const qty = Number(item.quantity);
        const price = Number(item.unitPrice) || 0;
        const destLoc = item.location ? String(item.location).trim().toUpperCase() : 'STR1S1B1';

        let part = current.parts.find((p) => p.partNumber === cleanPartNo);
        if (part) {
          const oldVal = part.availableStock * part.avgUnitPrice;
          const newVal = qty * price;
          const newStock = part.availableStock + qty;
          part.avgUnitPrice = newStock > 0 ? Number(((oldVal + newVal) / newStock).toFixed(4)) : price;
          part.availableStock = newStock;
          part.totalInward += qty;
          part.totalValue = Number((part.availableStock * part.avgUnitPrice).toFixed(2));
          part.location = destLoc;
          updatedParts.push(part);
        } else {
          part = {
            id: `prt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            partNumber: cleanPartNo,
            category: (item.category as any) || 'Resistor',
            description: item.description || `${cleanPartNo} component`,
            makeBrand: item.makeBrand || 'Generic',
            supplier: item.supplier || 'Distributor',
            technicalSpecs: { value: 'N/A', packageFootprint: '0805' },
            location: destLoc,
            totalInward: qty,
            totalOutward: 0,
            availableStock: qty,
            minReorderQty: 500,
            avgUnitPrice: price,
            totalValue: Number((qty * price).toFixed(2)),
            isCritical: false,
            notes: item.notes || payload.batchNotes || 'Batch Inward',
          };
          current.parts.unshift(part);
          updatedParts.push(part);
        }

        const mov: StockMovement = {
          id: `mov-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          type: 'IN',
          partNumber: cleanPartNo,
          category: part.category,
          quantity: qty,
          unitPrice: price,
          totalMovementValue: Number((qty * price).toFixed(2)),
          location: destLoc,
          personName: item.personName || payload.personName || 'Warehouse Tech',
          timestamp: new Date().toISOString(),
          notes: item.notes || payload.batchNotes || 'Batch Inward Intake',
        };
        current.movements.unshift(mov);
        createdMovements.push(mov);
      }

      saveCachedState(current);
      return { success: true, count: createdMovements.length, parts: updatedParts, movements: createdMovements };
    }
  },

  // Batch Outward Stock Dispatch with Over-Issue Protection
  async batchOutward(payload: {
    items: Array<{
      partNumber: string;
      quantity: number;
      location?: string;
      personName?: string;
      notes?: string;
      movementType?: string;
      projectId?: string;
    }>;
    personName?: string;
    batchNotes?: string;
  }): Promise<{ success: boolean; count: number; parts?: Part[]; movements?: StockMovement[] }> {
    try {
      const res = await fetch('/api/batch/outward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        return await res.json();
      }
      const err = await res.json();
      throw new Error(err.error || 'Failed to process batch outward');
    } catch {
      const current = getInitialState();

      // Check shortages
      const shortages: string[] = [];
      for (const item of payload.items) {
        if (!item.partNumber || Number(item.quantity) <= 0) continue;
        const cleanPartNo = String(item.partNumber).trim().toUpperCase();
        const qty = Number(item.quantity);
        const part = current.parts.find((p) => p.partNumber === cleanPartNo);
        if (!part || part.availableStock < qty) {
          shortages.push(`${cleanPartNo} (Req: ${qty}, In Stock: ${part ? part.availableStock : 0})`);
        }
      }

      if (shortages.length > 0) {
        throw new Error(`Batch outward dispatch blocked by over-issue check: ${shortages.join('; ')}`);
      }

      const createdMovements: StockMovement[] = [];
      const updatedParts: Part[] = [];

      for (const item of payload.items) {
        if (!item.partNumber || Number(item.quantity) <= 0) continue;
        const cleanPartNo = String(item.partNumber).trim().toUpperCase();
        const qty = Number(item.quantity);
        const part = current.parts.find((p) => p.partNumber === cleanPartNo)!;

        part.availableStock -= qty;
        part.totalOutward += qty;
        part.totalValue = Number((part.availableStock * part.avgUnitPrice).toFixed(2));
        updatedParts.push(part);

        const mov: StockMovement = {
          id: `mov-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          type: (item.movementType as any) || 'OUT',
          partNumber: cleanPartNo,
          category: part.category,
          quantity: qty,
          unitPrice: part.avgUnitPrice,
          totalMovementValue: Number((qty * part.avgUnitPrice).toFixed(2)),
          location: item.location || part.location,
          personName: item.personName || payload.personName || 'Assembly Operator',
          timestamp: new Date().toISOString(),
          notes: item.notes || payload.batchNotes || 'Batch Outward Dispatch',
          projectId: item.projectId,
        };
        current.movements.unshift(mov);
        createdMovements.push(mov);
      }

      saveCachedState(current);
      return { success: true, count: createdMovements.length, parts: updatedParts, movements: createdMovements };
    }
  },

  // Delete Project BOM
  async deleteProject(idOrCode: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(idOrCode)}`, { method: 'DELETE' });
      if (res.ok) return true;
    } catch {
      // Local fallback
    }

    const current = getInitialState();
    const clean = idOrCode.trim().toUpperCase();
    const idx = current.projects.findIndex((p) => p.id === idOrCode || p.code.toUpperCase() === clean);
    if (idx !== -1) {
      current.projects.splice(idx, 1);
      saveCachedState(current);
      return true;
    }
    return false;
  },

  // Parse any Excel (.xlsx, .xls) or CSV / TSV file into BOM items using SheetJS
  async parseExcelOrCsvFile(file: File): Promise<{ items: ProjectBOMItem[]; headers: string[]; sheetNames: string[] }> {
    const isBinaryExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.ods');

    if (isBinaryExcel) {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetNames = workbook.SheetNames;
      const firstSheet = workbook.Sheets[sheetNames[0]];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

      if (rawRows.length === 0) return { items: [], headers: [], sheetNames };

      // Find first row that has text headers
      let headerRowIndex = 0;
      for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
        const row = rawRows[r];
        if (
          Array.isArray(row) &&
          row.some(
            (cell) =>
              typeof cell === 'string' &&
              ['part', 'mpn', 'qty', 'item', 'component', 'pn'].some((k) =>
                cell.toLowerCase().includes(k)
              )
          )
        ) {
          headerRowIndex = r;
          break;
        }
      }

      const headers = (rawRows[headerRowIndex] || []).map((h) => String(h || '').trim());
      const lowerHeaders = headers.map((h) => h.toLowerCase());

      let pnCol = lowerHeaders.findIndex((h) =>
        ['part', 'part number', 'part_number', 'mpn', 'mfr p/n', 'mfr_pn', 'pn', 'component', 'sku'].some((k) =>
          h.includes(k)
        )
      );
      let qtyCol = lowerHeaders.findIndex((h) =>
        ['qty', 'quantity', 'count', 'needed', 'amount', 'pieces'].some((k) => h.includes(k))
      );
      let desCol = lowerHeaders.findIndex((h) =>
        ['designator', 'ref', 'reference', 'refs'].some((k) => h.includes(k))
      );
      let descCol = lowerHeaders.findIndex((h) =>
        ['description', 'value', 'desc', 'specs'].some((k) => h.includes(k))
      );

      if (pnCol === -1) pnCol = 0;
      if (qtyCol === -1) qtyCol = headers.length > 1 ? 1 : 0;

      const items: ProjectBOMItem[] = [];
      for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length <= pnCol) continue;
        const partNumber = String(row[pnCol] || '').trim().toUpperCase();
        if (!partNumber || partNumber === 'PART NUMBER' || partNumber === 'TOTAL') continue;

        const rawQty = row[qtyCol];
        const numQty =
          typeof rawQty === 'number'
            ? rawQty
            : parseInt(String(rawQty).replace(/[^\d]/g, ''), 10);
        const requiredQty = isNaN(numQty) || numQty <= 0 ? 1 : numQty;
        const designator = desCol !== -1 && row[desCol] ? String(row[desCol]).trim() : undefined;
        const description = descCol !== -1 && row[descCol] ? String(row[descCol]).trim() : undefined;

        items.push({ partNumber, requiredQty, designator, description });
      }

      return { items, headers, sheetNames };
    }

    // Otherwise text CSV/TSV
    const text = await file.text();
    const csvResult = this.parseBOMCsv(text);
    return { ...csvResult, sheetNames: ['Sheet1'] };
  },

  // Parse CSV / TSV BOM file text with flexible column mapping
  parseBOMCsv(rawText: string): { items: ProjectBOMItem[]; headers: string[] } {
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return { items: [], headers: [] };

    // Detect delimiter (, or ; or \t)
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const delim = tabCount > commaCount && tabCount > semicolonCount ? '\t' : semicolonCount > commaCount ? ';' : ',';

    const parseRow = (rowStr: string) => {
      // Split respecting quotes
      const res: string[] = [];
      let inQuotes = false;
      let cur = '';
      for (let i = 0; i < rowStr.length; i++) {
        const char = rowStr[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === delim && !inQuotes) {
          res.push(cur.trim().replace(/^["']|["']$/g, ''));
          cur = '';
        } else {
          cur += char;
        }
      }
      res.push(cur.trim().replace(/^["']|["']$/g, ''));
      return res;
    };

    const headers = parseRow(lines[0]);
    const lowerHeaders = headers.map((h) => h.toLowerCase());

    // Auto-detect columns
    let pnCol = lowerHeaders.findIndex((h) =>
      ['part', 'part number', 'part_number', 'mpn', 'mfr p/n', 'mfr_pn', 'pn', 'component'].some((k) => h.includes(k))
    );
    let qtyCol = lowerHeaders.findIndex((h) =>
      ['qty', 'quantity', 'count', 'needed', 'amount'].some((k) => h.includes(k))
    );
    let desCol = lowerHeaders.findIndex((h) =>
      ['designator', 'ref', 'reference', 'refs'].some((k) => h.includes(k))
    );
    let descCol = lowerHeaders.findIndex((h) =>
      ['description', 'value', 'desc', 'specs'].some((k) => h.includes(k))
    );

    if (pnCol === -1) pnCol = 0;
    if (qtyCol === -1) qtyCol = headers.length > 1 ? 1 : 0;

    const items: ProjectBOMItem[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseRow(lines[i]);
      if (cols.length <= pnCol) continue;
      const partNumber = cols[pnCol]?.trim().toUpperCase();
      if (!partNumber) continue;

      const rawQty = cols[qtyCol] ? parseInt(cols[qtyCol].replace(/[^\d]/g, ''), 10) : 1;
      const requiredQty = isNaN(rawQty) || rawQty <= 0 ? 1 : rawQty;
      const designator = desCol !== -1 ? cols[desCol]?.trim() : undefined;
      const description = descCol !== -1 ? cols[descCol]?.trim() : undefined;

      items.push({
        partNumber,
        requiredQty,
        designator,
        description,
      });
    }

    return { items, headers };
  },

  // Delete movement
  async deleteMovement(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/movements/${id}`, { method: 'DELETE' });
      if (res.ok) return true;
    } catch {
      // Local fallback
    }
    const current = getInitialState();
    const idx = current.movements.findIndex((m) => m.id === id);
    if (idx !== -1) {
      const mov = current.movements[idx];
      const part = current.parts.find((p) => p.partNumber === mov.partNumber);
      if (part) {
        if (mov.type === 'IN') {
          part.availableStock = Math.max(0, part.availableStock - mov.quantity);
          part.totalInward = Math.max(0, part.totalInward - mov.quantity);
        } else {
          part.availableStock += mov.quantity;
          part.totalOutward = Math.max(0, part.totalOutward - mov.quantity);
        }
        part.totalValue = Number((part.availableStock * part.avgUnitPrice).toFixed(2));
      }
      current.movements.splice(idx, 1);
      saveCachedState(current);
      return true;
    }
    return false;
  },

  // Deduct project BOM
  async deductProject(projectId: string, multiplier: number, personName: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/projects/${projectId}/deduct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ multiplier, personName }),
      });
      if (res.ok) return true;
      const err = await res.json();
      throw new Error(err.error || 'Failed to deduct project BOM');
    } catch (e) {
      throw e;
    }
  },

  // Reset database
  async resetDatabase(): Promise<void> {
    try {
      await fetch('/api/reset', { method: 'POST' });
    } catch {
      // Fallback
    }
    const reset: CachedState = {
      parts: INITIAL_PARTS,
      movements: INITIAL_MOVEMENTS,
      projects: INITIAL_PROJECTS,
      locations: generateLocations(),
      vendorInvoices: INITIAL_VENDOR_INVOICES,
      inspectionReports: INITIAL_INSPECTION_REPORTS,
      approvedVendors: INITIAL_APPROVED_VENDORS,
    };
    saveCachedState(reset);
  },

  // Export database as JSON file
  exportBackupJson(parts: Part[], movements: StockMovement[], projects: ProjectBOM[], locations: StorageLocation[]) {
    const backup = {
      exportedAt: new Date().toISOString(),
      system: 'Elentory Parts Inventory ERP',
      version: '1.0.0',
      parts,
      movements,
      projects,
      locations,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `elentory-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Export Stock Summary CSV
  exportStockCsv(parts: Part[]) {
    const headers = [
      'Part Number',
      'Category',
      'Electrical Value',
      'Package / Footprint',
      'Tolerance',
      'Rating',
      'Description',
      'Manufacturer',
      'Supplier',
      'Location',
      'Total Inward',
      'Total Outward',
      'Available Stock',
      'Min Reorder Qty',
      'Average Unit Price (₹ INR)',
      'Total Valuation (₹ INR)',
    ];

    const rows = parts.map((p) => [
      `"${p.partNumber}"`,
      `"${p.category}"`,
      `"${p.technicalSpecs?.value || ''}"`,
      `"${p.technicalSpecs?.packageFootprint || ''}"`,
      `"${p.technicalSpecs?.tolerance || ''}"`,
      `"${p.technicalSpecs?.powerOrVoltageRating || ''}"`,
      `"${p.description.replace(/"/g, '""')}"`,
      `"${p.makeBrand}"`,
      `"${p.supplier}"`,
      `"${p.location}"`,
      p.totalInward,
      p.totalOutward,
      p.availableStock,
      p.minReorderQty,
      p.avgUnitPrice.toFixed(4),
      p.totalValue.toFixed(2),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `elentory-stock-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Export Movement Ledger CSV
  exportMovementsCsv(movements: StockMovement[]) {
    const headers = [
      'Date Time (UTC)',
      'Movement Type',
      'Part Number',
      'Category',
      'Quantity',
      'Unit Price (₹ INR)',
      'Total Movement Value (₹ INR)',
      'Location',
      'Person (Received From / Issued To)',
      'Notes & Reference',
    ];

    const rows = movements.map((m) => [
      `"${m.timestamp}"`,
      `"${m.type}"`,
      `"${m.partNumber}"`,
      `"${m.category}"`,
      m.quantity,
      m.unitPrice.toFixed(4),
      m.totalMovementValue.toFixed(2),
      `"${m.location}"`,
      `"${m.personName.replace(/"/g, '""')}"`,
      `"${m.notes.replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `elentory-movement-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Export Monthly Accounting Rollup CSV
  exportMonthlyCsv(movements: StockMovement[]) {
    // Group movements by month (YYYY-MM)
    const map = new Map<string, { inQty: number; inVal: number; outQty: number; outVal: number }>();

    for (const m of movements) {
      const monthKey = m.timestamp.slice(0, 7); // e.g. "2026-10"
      if (!map.has(monthKey)) {
        map.set(monthKey, { inQty: 0, inVal: 0, outQty: 0, outVal: 0 });
      }
      const entry = map.get(monthKey)!;
      if (m.type === 'IN') {
        entry.inQty += m.quantity;
        entry.inVal += m.totalMovementValue;
      } else if (m.type === 'OUT' || m.type === 'LOSS') {
        entry.outQty += m.quantity;
        entry.outVal += m.totalMovementValue;
      }
    }

    const sortedMonths = Array.from(map.keys()).sort().reverse();
    const headers = [
      'Month / Year',
      'Inward Quantity',
      'Inward Value (₹ INR)',
      'Outward Quantity',
      'Outward Value (₹ INR)',
      'Net Balance Quantity',
      'Net Balance Value (₹ INR)',
    ];

    let totalInQty = 0;
    let totalInVal = 0;
    let totalOutQty = 0;
    let totalOutVal = 0;

    const rows = sortedMonths.map((mk) => {
      const d = map.get(mk)!;
      totalInQty += d.inQty;
      totalInVal += d.inVal;
      totalOutQty += d.outQty;
      totalOutVal += d.outVal;
      const netQty = d.inQty - d.outQty;
      const netVal = d.inVal - d.outVal;

      return [
        `"${mk}"`,
        d.inQty,
        d.inVal.toFixed(2),
        d.outQty,
        d.outVal.toFixed(2),
        netQty,
        netVal.toFixed(2),
      ];
    });

    // Add fixed summary totals row
    rows.push([
      '"TOTALS"',
      totalInQty,
      totalInVal.toFixed(2),
      totalOutQty,
      totalOutVal.toFixed(2),
      totalInQty - totalOutQty,
      (totalInVal - totalOutVal).toFixed(2),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `elentory-monthly-accounting-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Export Comprehensive Multi-Sheet Excel Accounting & Complete Inventory Valuation
  exportMonthlyExcel(rollups: any[], parts: Part[], _movements: StockMovement[]) {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Monthly Rollup & Inventory Reconciliation
    const monthlyData = rollups.map((r) => ({
      'Period': r.monthLabel,
      'Month Key': r.monthKey,
      'Inward Quantity': r.inQty,
      'Inward Valuation (₹ INR)': Number(r.inValue.toFixed(2)),
      'Outward Dispatched Qty': r.outQty,
      'Outward Dispatched (₹ INR)': Number(r.outValue.toFixed(2)),
      'Net Movement Qty': r.netQty,
      'Net Valuation Flow (₹ INR)': Number(r.netValue.toFixed(2)),
      'Closing Est. Inventory Value (₹ INR)': Number((r.closingValuation || 0).toFixed(2)),
      'Transactions Count': r.transactions ? r.transactions.length : 0,
    }));
    const wsMonthly = XLSX.utils.json_to_sheet(monthlyData);
    XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly Rollup');

    // Sheet 2: Complete Current On-Hand Inventory
    const stockData = parts.map((p) => ({
      'Part Number': p.partNumber,
      'Category': p.category,
      'Description': p.description,
      'Manufacturer': p.makeBrand,
      'Supplier': p.supplier,
      'Storage Location': p.location,
      'Available On-Hand Stock': p.availableStock,
      'Min Reorder Qty': p.minReorderQty,
      'Weighted Avg Unit Cost (₹ INR)': p.avgUnitPrice,
      'Total Inventory Cost / Value (₹ INR)': p.totalValue,
      'Reorder Alert': p.availableStock <= p.minReorderQty ? 'LOW STOCK' : 'OK',
    }));
    const wsStock = XLSX.utils.json_to_sheet(stockData);
    XLSX.utils.book_append_sheet(wb, wsStock, 'Complete Stock Ledger');

    // Sheet 3: Category Breakdown
    const totalValuation = parts.reduce((a, b) => a + b.totalValue, 0);
    const catMap: Record<string, { count: number; units: number; val: number }> = {};
    for (const p of parts) {
      if (!catMap[p.category]) catMap[p.category] = { count: 0, units: 0, val: 0 };
      catMap[p.category].count += 1;
      catMap[p.category].units += p.availableStock;
      catMap[p.category].val += p.totalValue;
    }
    const catData = Object.entries(catMap).map(([cat, d]) => ({
      'Component Category': cat,
      'Active SKUs': d.count,
      'Physical Units On-Hand': d.units,
      'Total Inventory Value (₹ INR)': Number(d.val.toFixed(2)),
      'Share of Warehouse (%)': totalValuation > 0
        ? Number(((d.val / totalValuation) * 100).toFixed(1))
        : 0,
    }));
    const wsCat = XLSX.utils.json_to_sheet(catData);
    XLSX.utils.book_append_sheet(wb, wsCat, 'Category Valuation');

    XLSX.writeFile(wb, `elentory-complete-inventory-financials-${new Date().toISOString().slice(0, 10)}.xlsx`);
  },

  // Export Batch Manifest / Packing Slip
  exportBatchSlip(items: any[], mode: 'inward' | 'outward', meta?: { operator?: string; notes?: string }) {
    const wb = XLSX.utils.book_new();
    const rows = items.map((item, idx) => ({
      'Item #': idx + 1,
      'Part Number': item.partNumber,
      'Category': item.category || 'Passive',
      'Description': item.description || '',
      'Quantity': item.quantity,
      'Unit Price (₹ INR)': item.unitPrice || 0,
      'Line Total (₹ INR)': Number(((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2)),
      'Storage Location': item.location || 'STR1S1B1',
      'Operation': mode === 'inward' ? 'INWARD RECEIVING' : 'OUTWARD DISPATCH',
      'Notes': item.notes || meta?.notes || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, mode === 'inward' ? 'Inward Receiving Slip' : 'Dispatch Packing Slip');
    XLSX.writeFile(wb, `elentory-batch-${mode}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  },

  // ---------------------------------------------------------------------------
  // Android Terminal Pairing & Live Scanner Sync
  // ---------------------------------------------------------------------------
  async getTerminalSession(id?: string): Promise<{
    terminalId: string;
    token: string;
    isPaired: boolean;
    device?: { name: string; platform: string; lastActive: string };
    pendingScansCount: number;
  }> {
    try {
      const url = id ? `/api/terminal/session?id=${encodeURIComponent(id)}` : '/api/terminal/session';
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      // Local fallback
    }
    return {
      terminalId: id || 'TRM-8824',
      token: 'eln-local-token',
      isPaired: false,
      pendingScansCount: 0,
    };
  },

  async pairTerminal(terminalId: string, deviceName?: string, platform = 'Android'): Promise<any> {
    try {
      const res = await fetch('/api/terminal/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminalId, deviceName, platform }),
      });
      if (res.ok) return await res.json();
    } catch {
      // Local fallback
    }
    return { success: true, terminalId, message: 'Paired locally' };
  },

  async pushTerminalScan(terminalId: string, code: string, format = 'QR_CODE'): Promise<any> {
    try {
      const res = await fetch('/api/terminal/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminalId, code, format }),
      });
      if (res.ok) return await res.json();
    } catch {
      // Local fallback
    }
    return { success: true, code };
  },

  async pollTerminal(terminalId: string): Promise<{
    terminalId: string;
    isPaired: boolean;
    device?: { name: string; platform: string; lastActive: string };
    scans: any[];
    lastHeartbeat?: string;
  }> {
    try {
      const res = await fetch(`/api/terminal/poll?terminalId=${encodeURIComponent(terminalId)}`);
      if (res.ok) return await res.json();
    } catch {
      // Fallback
    }
    return { terminalId, isPaired: false, scans: [] };
  },

  async disconnectTerminal(terminalId: string): Promise<void> {
    try {
      await fetch('/api/terminal/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminalId }),
      });
    } catch {
      // Fallback
    }
  },

  // ---------------------------------------------------------------------------
  // VENDOR INVOICES & SUPPLIER INSPECTION REPORTS (SIR)
  // ---------------------------------------------------------------------------
  async getVendorInvoices(): Promise<VendorInvoice[]> {
    try {
      const res = await fetch('/api/vendor/invoices');
      if (res.ok) {
        const data = await res.json();
        return data.invoices || [];
      }
    } catch {
      // Fallback
    }
    return getInitialState().vendorInvoices || [];
  },

  async saveVendorInvoice(invoice: VendorInvoice): Promise<VendorInvoice> {
    try {
      const res = await fetch('/api/vendor/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoice),
      });
      if (res.ok) {
        const data = await res.json();
        return data.invoice;
      }
    } catch {
      // Fallback
    }
    const current = getInitialState();
    const idx = current.vendorInvoices.findIndex((i) => i.id === invoice.id);
    if (idx >= 0) {
      current.vendorInvoices[idx] = invoice;
    } else {
      current.vendorInvoices.unshift(invoice);
    }
    saveCachedState(current);
    return invoice;
  },

  async deleteVendorInvoice(id: string): Promise<void> {
    try {
      await fetch(`/api/vendor/invoices/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      // Fallback
    }
    const current = getInitialState();
    current.vendorInvoices = current.vendorInvoices.filter((i) => i.id !== id);
    saveCachedState(current);
  },

  async scanVendorInvoice(imageBase64: string, mimeType?: string, fileName?: string): Promise<{ success: boolean; invoice: VendorInvoice; message?: string }> {
    const res = await fetch('/api/vendor/invoices/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, mimeType, fileName }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.invoice) {
        const current = getInitialState();
        current.vendorInvoices = [data.invoice, ...current.vendorInvoices.filter((i) => i.id !== data.invoice.id)];
        saveCachedState(current);
      }
      return data;
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to scan vendor invoice (HTTP ${res.status})`);
  },

  async inwardVendorInvoice(invoiceId: string, allocatedLocations?: Record<string, string>): Promise<{ success: boolean; message: string; invoice: VendorInvoice }> {
    try {
      const res = await fetch(`/api/vendor/invoices/${encodeURIComponent(invoiceId)}/inward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocatedLocations }),
      });
      if (res.ok) {
        return await res.json();
      }
      const err = await res.json();
      throw new Error(err.error || 'Failed to inward vendor invoice batch');
    } catch (e: any) {
      // Local fallback
      const current = getInitialState();
      const invoice = current.vendorInvoices.find((i) => i.id === invoiceId);
      if (!invoice) throw new Error('Invoice not found in local cache');
      invoice.status = 'inwarded';
      invoice.inwardedAt = new Date().toISOString();

      for (const item of invoice.items) {
        const cleanPN = item.partNumber.trim().toUpperCase();
        const qty = item.quantity;
        const price = item.unitPrice;
        const targetLoc = (allocatedLocations && allocatedLocations[item.id]) || item.location || 'STR1S1B1';

        let part = current.parts.find((p) => p.partNumber === cleanPN);
        if (part) {
          part.availableStock += qty;
          part.totalInward += qty;
          part.location = targetLoc;
        } else {
          current.parts.unshift({
            id: `prt-${Date.now()}-${Math.random()}`,
            partNumber: cleanPN,
            category: item.category,
            description: item.description,
            makeBrand: invoice.supplier,
            supplier: invoice.supplier,
            technicalSpecs: { value: item.description, packageFootprint: 'Custom' },
            location: targetLoc,
            totalInward: qty,
            totalOutward: 0,
            availableStock: qty,
            minReorderQty: 200,
            avgUnitPrice: price,
            totalValue: Number((qty * price).toFixed(2)),
          });
        }

        current.movements.unshift({
          id: `mov-${Date.now()}-${Math.random()}`,
          type: 'IN',
          partNumber: cleanPN,
          category: item.category,
          quantity: qty,
          unitPrice: price,
          totalMovementValue: Number((qty * price).toFixed(2)),
          location: targetLoc,
          personName: `Vendor: ${invoice.supplier}`,
          timestamp: new Date().toISOString(),
          notes: `Batch Inward | Invoice: ${invoice.invoiceNumber}`,
        });
      }

      saveCachedState(current);
      return { success: true, message: `Inwarded ${invoice.items.length} items from ${invoice.supplier}`, invoice };
    }
  },

  async getInspectionReports(): Promise<SupplierInspectionReport[]> {
    try {
      const res = await fetch('/api/vendor/inspection-reports');
      if (res.ok) {
        const data = await res.json();
        return data.reports || [];
      }
    } catch {
      // Fallback
    }
    return getInitialState().inspectionReports || [];
  },

  async saveInspectionReport(report: SupplierInspectionReport): Promise<SupplierInspectionReport> {
    try {
      const res = await fetch('/api/vendor/inspection-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
      if (res.ok) {
        const data = await res.json();
        return data.report;
      }
    } catch {
      // Fallback
    }
    const current = getInitialState();
    const idx = current.inspectionReports.findIndex((r) => r.id === report.id);
    if (idx >= 0) {
      current.inspectionReports[idx] = report;
    } else {
      current.inspectionReports.unshift(report);
    }
    saveCachedState(current);
    return report;
  },

  async deleteInspectionReport(id: string): Promise<void> {
    try {
      await fetch(`/api/vendor/inspection-reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      // Fallback
    }
    const current = getInitialState();
    current.inspectionReports = current.inspectionReports.filter((r) => r.id !== id);
    saveCachedState(current);
  },

  // ---------------------------------------------------------------------------
  // APPROVED VENDORS DIRECTORY & REGISTRATION
  // ---------------------------------------------------------------------------
  async getApprovedVendors(): Promise<ApprovedVendor[]> {
    try {
      const res = await fetch('/api/vendors');
      if (res.ok) {
        const data = await res.json();
        return data.vendors || [];
      }
    } catch {
      // Fallback
    }
    return getInitialState().approvedVendors || [];
  },

  async saveApprovedVendor(vendor: Partial<ApprovedVendor>): Promise<ApprovedVendor> {
    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vendor),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.vendor) {
          const current = getInitialState();
          const idx = current.approvedVendors.findIndex((v) => v.id === data.vendor.id);
          if (idx >= 0) current.approvedVendors[idx] = data.vendor;
          else current.approvedVendors.push(data.vendor);
          saveCachedState(current);
          return data.vendor;
        }
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to save vendor');
    } catch (e: any) {
      if (e?.message && e.message.includes('Vendor name is required')) throw e;
      const current = getInitialState();
      const now = new Date().toISOString();
      const saved: ApprovedVendor = {
        id: vendor.id || `vnd-${Date.now()}`,
        vendorCode:
          vendor.vendorCode ||
          `VND-${String(current.approvedVendors.length + 1).padStart(3, '0')}`,
        name: vendor.name || 'Unnamed Vendor',
        address: vendor.address || '',
        contactPerson: vendor.contactPerson || '',
        contactDesignation: vendor.contactDesignation || '',
        phone: vendor.phone || '',
        email: vendor.email || '',
        website: vendor.website || '',
        whatSupplierFor: vendor.whatSupplierFor || '',
        suppliedCategories: vendor.suppliedCategories || [],
        gstin: (vendor.gstin || '').toUpperCase(),
        pan: (vendor.pan || '').toUpperCase(),
        bankName: vendor.bankName || '',
        accountNumber: vendor.accountNumber || '',
        ifscCode: (vendor.ifscCode || '').toUpperCase(),
        msmeNumber: (vendor.msmeNumber || '').toUpperCase(),
        isoLicenseNo: vendor.isoLicenseNo || '',
        status: vendor.status || 'approved',
        approvedDate: vendor.approvedDate || now.slice(0, 10),
        notes: vendor.notes || '',
        documents: vendor.documents || [],
        createdAt: vendor.createdAt || now,
      };
      const idx = current.approvedVendors.findIndex((v) => v.id === saved.id);
      if (idx >= 0) current.approvedVendors[idx] = saved;
      else current.approvedVendors.push(saved);
      saveCachedState(current);
      return saved;
    }
  },

  async deleteApprovedVendor(id: string): Promise<void> {
    try {
      await fetch(`/api/vendors/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch {
      // Fallback
    }
    const current = getInitialState();
    current.approvedVendors = current.approvedVendors.filter((v) => v.id !== id);
    saveCachedState(current);
  },

  // Build an Excel Blob specifically for Inward Report export (local or Google Drive Inward folder)
  buildInwardReportExcelBlob(
    movements: StockMovement[],
    parts: Part[],
    vendorInvoices: VendorInvoice[] = [],
    monthFilter?: string
  ): { blob: Blob; fileName: string } {
    const wb = XLSX.utils.book_new();
    const inwardMovements = movements.filter(
      (m) => m.type === 'IN' && (!monthFilter || m.timestamp.startsWith(monthFilter))
    );

    const ledgerRows = inwardMovements.map((m, idx) => ({
      'Sl. No.': idx + 1,
      'Date': m.timestamp.slice(0, 10),
      'Part Number': m.partNumber,
      'Category': m.category,
      'Inward Qty': m.quantity,
      'Unit Price (₹ INR)': Number(m.unitPrice.toFixed(4)),
      'Total Inward Value (₹ INR)': Number(m.totalMovementValue.toFixed(2)),
      'Storage Location': m.location,
      'Received From / Supplier': m.personName,
      'Reference / Notes': m.notes,
    }));
    const wsLedger = XLSX.utils.json_to_sheet(
      ledgerRows.length > 0
        ? ledgerRows
        : [{ 'Sl. No.': '-', 'Date': '-', 'Part Number': 'No inward entries found' }]
    );
    XLSX.utils.book_append_sheet(wb, wsLedger, 'Inward Ledger');

    // Monthly Inward Summary
    const monthMap = new Map<string, { count: number; qty: number; val: number }>();
    for (const m of inwardMovements) {
      const mk = m.timestamp.slice(0, 7);
      const cur = monthMap.get(mk) || { count: 0, qty: 0, val: 0 };
      cur.count += 1;
      cur.qty += m.quantity;
      cur.val += m.totalMovementValue;
      monthMap.set(mk, cur);
    }
    const monthlyRows = Array.from(monthMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([monthKey, d]) => ({
        'Month': monthKey,
        'Inward Transactions': d.count,
        'Total Inward Units': d.qty,
        'Total Inward Value (₹ INR)': Number(d.val.toFixed(2)),
      }));
    const wsMonthly = XLSX.utils.json_to_sheet(
      monthlyRows.length > 0 ? monthlyRows : [{ Month: '-', 'Inward Transactions': 0 }]
    );
    XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly Inward Summary');

    // Supplier Invoices Summary
    if (vendorInvoices.length > 0) {
      const invRows = vendorInvoices.map((inv, idx) => ({
        'Sl. No.': idx + 1,
        'Supplier': inv.supplier,
        'Invoice Number': inv.invoiceNumber,
        'Invoice Date': inv.invoiceDate,
        'PO Number': inv.purchaseOrder || '-',
        'Total Units': inv.totalItemsCount,
        'Total Amount (₹ INR)': Number(inv.totalAmount.toFixed(2)),
        'Status': inv.status.toUpperCase(),
      }));
      const wsInv = XLSX.utils.json_to_sheet(invRows);
      XLSX.utils.book_append_sheet(wb, wsInv, 'Supplier Invoices');
    }

    // Current Stock Valuation Snapshot
    const stockRows = parts.map((p, idx) => ({
      'Sl. No.': idx + 1,
      'Part Number': p.partNumber,
      'Category': p.category,
      'Supplier': p.supplier,
      'Location': p.location,
      'Total Inward': p.totalInward,
      'Available Stock': p.availableStock,
      'Avg Unit Price (₹ INR)': Number(p.avgUnitPrice.toFixed(4)),
      'Stock Value (₹ INR)': Number(p.totalValue.toFixed(2)),
    }));
    const wsStock = XLSX.utils.json_to_sheet(stockRows);
    XLSX.utils.book_append_sheet(wb, wsStock, 'Current Stock Snapshot');

    const wbArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbArray], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const suffix = monthFilter || new Date().toISOString().slice(0, 10);
    return {
      blob,
      fileName: `Elentory_Inward_Report_${suffix}.xlsx`,
    };
  },
};
