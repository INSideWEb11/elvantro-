import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  INITIAL_PARTS,
  INITIAL_MOVEMENTS,
  INITIAL_PROJECTS,
  INITIAL_VENDOR_INVOICES,
  INITIAL_INSPECTION_REPORTS,
  INITIAL_APPROVED_VENDORS,
  generateLocations,
} from './src/data/seedData.ts';
import {
  Part,
  StockMovement,
  ProjectBOM,
  StorageLocation,
  AIScanResult,
  ComponentCategory,
  VendorInvoice,
  SupplierInspectionReport,
  ApprovedVendor,
} from './src/types/inventory.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Body parser - increased limit for image/document uploads
app.use(express.json({ limit: '30mb' }));

// Initialize in-memory database store
let partsDatabase: Part[] = JSON.parse(JSON.stringify(INITIAL_PARTS));
let movementsDatabase: StockMovement[] = JSON.parse(JSON.stringify(INITIAL_MOVEMENTS));
let projectsDatabase: ProjectBOM[] = JSON.parse(JSON.stringify(INITIAL_PROJECTS));
let vendorInvoicesDatabase: VendorInvoice[] = JSON.parse(JSON.stringify(INITIAL_VENDOR_INVOICES));
let inspectionReportsDatabase: SupplierInspectionReport[] = JSON.parse(JSON.stringify(INITIAL_INSPECTION_REPORTS));
let approvedVendorsDatabase: ApprovedVendor[] = JSON.parse(JSON.stringify(INITIAL_APPROVED_VENDORS));
const locationsDatabase: StorageLocation[] = generateLocations();

// Initialize Google Gen AI client with required User-Agent header
const GEMINI_MODEL = 'gemini-4-hydrogen';

function getAiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const aiClient: GoogleGenAI | null = getAiClient();

async function callGeminiWithRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.code;
      const msg = String(err?.message || '');
      const isRetryable =
        status === 429 ||
        status === 503 ||
        status === 500 ||
        msg.includes('429') ||
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('RESOURCE_EXHAUSTED');
      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

function getGeminiHttpError(err: any, fallbackMsg: string): { status: number; message: string } {
  const msg = String(err?.message || fallbackMsg);
  const rawStatus = Number(err?.status || err?.code);
  if (rawStatus === 403 || msg.includes('PERMISSION_DENIED') || msg.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message: 'Gemini API authentication failed. Please verify your API key in Settings > Secrets.',
    };
  }
  if (rawStatus === 429 || msg.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message: 'AI rate limit reached. Please wait a moment and try again, or check your API quota in Settings > Secrets.',
    };
  }
  if (rawStatus === 404 || msg.includes('NOT_FOUND')) {
    return {
      status: 502,
      message: `AI model unavailable (${GEMINI_MODEL}). ${msg}`,
    };
  }
  return {
    status: rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500,
    message: msg || fallbackMsg,
  };
}

// -----------------------------------------------------------------------------
// REST API ENDPOINTS
// -----------------------------------------------------------------------------

// 1. Get entire inventory state
app.get('/api/inventory', (_req, res) => {
  res.json({
    parts: partsDatabase,
    movements: movementsDatabase,
    projects: projectsDatabase,
    locations: locationsDatabase,
    vendorInvoices: vendorInvoicesDatabase,
    inspectionReports: inspectionReportsDatabase,
    approvedVendors: approvedVendorsDatabase,
  });
});

// 2. Inward Stock Receiving endpoint
app.post('/api/inward', (req, res) => {
  try {
    const {
      partNumber,
      category,
      description,
      makeBrand,
      supplier,
      quantity,
      unitPrice,
      location,
      personName,
      notes,
      technicalSpecs,
      isCritical,
    } = req.body;

    if (!partNumber || !quantity || Number(quantity) <= 0) {
      return res.status(400).json({ error: 'Part number and valid quantity are required.' });
    }

    const cleanPartNo = String(partNumber).trim().toUpperCase();
    const qty = Number(quantity);
    const price = Number(unitPrice) || 0;
    const destLocation = location ? String(location).trim().toUpperCase() : 'STR1S1B1';

    let existingPart = partsDatabase.find((p) => p.partNumber === cleanPartNo);

    if (existingPart) {
      // Recalculate weighted average unit price
      const oldTotalVal = existingPart.availableStock * existingPart.avgUnitPrice;
      const newInwardVal = qty * price;
      const newAvailable = existingPart.availableStock + qty;
      const newAvgPrice = newAvailable > 0 ? (oldTotalVal + newInwardVal) / newAvailable : price;

      existingPart.availableStock = newAvailable;
      existingPart.totalInward += qty;
      existingPart.avgUnitPrice = Number(newAvgPrice.toFixed(4));
      existingPart.totalValue = Number((existingPart.availableStock * existingPart.avgUnitPrice).toFixed(2));
      existingPart.location = destLocation;
      if (description) existingPart.description = description;
      if (makeBrand) existingPart.makeBrand = makeBrand;
      if (supplier) existingPart.supplier = supplier;
      if (technicalSpecs) existingPart.technicalSpecs = { ...existingPart.technicalSpecs, ...technicalSpecs };
      if (typeof isCritical === 'boolean') existingPart.isCritical = isCritical;
    } else {
      // Create new part
      const newPart: Part = {
        id: `prt-${Date.now()}`,
        partNumber: cleanPartNo,
        category: (category as ComponentCategory) || 'Resistor',
        description: description || `${cleanPartNo} component`,
        makeBrand: makeBrand || 'Generic',
        supplier: supplier || 'Distributor',
        technicalSpecs: technicalSpecs || {
          value: 'N/A',
          packageFootprint: '0805',
          tolerance: '±1%',
        },
        location: destLocation,
        totalInward: qty,
        totalOutward: 0,
        availableStock: qty,
        minReorderQty: 500,
        avgUnitPrice: price,
        totalValue: Number((qty * price).toFixed(2)),
        isCritical: Boolean(isCritical),
        notes: notes || '',
      };
      partsDatabase.unshift(newPart);
      existingPart = newPart;
    }

    // Record movement in immutable ledger
    const movement: StockMovement = {
      id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: 'IN',
      partNumber: cleanPartNo,
      category: existingPart.category,
      quantity: qty,
      unitPrice: price,
      totalMovementValue: Number((qty * price).toFixed(2)),
      location: destLocation,
      personName: personName ? String(personName).trim() : 'Warehouse Operator',
      timestamp: new Date().toISOString(),
      notes: notes || 'Stock inward intake',
    };

    movementsDatabase.unshift(movement);

    res.json({
      success: true,
      message: `Successfully received ${qty} units of ${cleanPartNo} to ${destLocation}`,
      part: existingPart,
      movement,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to record inward movement' });
  }
});

// 3. Outward Stock Dispatch with strict Over-Issue Protection
app.post('/api/outward', (req, res) => {
  try {
    const { partNumber, quantity, location, personName, notes, movementType, projectId } = req.body;

    if (!partNumber || !quantity || Number(quantity) <= 0) {
      return res.status(400).json({ error: 'Part number and valid quantity are required.' });
    }

    const cleanPartNo = String(partNumber).trim().toUpperCase();
    const qty = Number(quantity);

    const part = partsDatabase.find((p) => p.partNumber === cleanPartNo);
    if (!part) {
      return res.status(404).json({ error: `Part ${cleanPartNo} not found in inventory.` });
    }

    // STRICT OVER-ISSUE PROTECTION
    if (qty > part.availableStock) {
      return res.status(400).json({
        error: `Over-issue prevented: Requested quantity (${qty}) exceeds currently available stock (${part.availableStock}) for ${cleanPartNo}.`,
      });
    }

    // Dispatch valuation calculated at running average unit price at time of issue
    const movementValue = Number((qty * part.avgUnitPrice).toFixed(2));

    part.availableStock -= qty;
    part.totalOutward += qty;
    part.totalValue = Number((part.availableStock * part.avgUnitPrice).toFixed(2));

    const movement: StockMovement = {
      id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: (movementType as any) || 'OUT',
      partNumber: cleanPartNo,
      category: part.category,
      quantity: qty,
      unitPrice: part.avgUnitPrice,
      totalMovementValue: movementValue,
      location: location || part.location,
      personName: personName ? String(personName).trim() : 'Assembly Tech',
      timestamp: new Date().toISOString(),
      notes: notes || 'Stock outward dispatch',
      projectId: projectId || undefined,
    };

    movementsDatabase.unshift(movement);

    res.json({
      success: true,
      message: `Successfully issued ${qty} units of ${cleanPartNo}`,
      part,
      movement,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to process outward dispatch' });
  }
});

// 4. Update / Create Part record directly
app.post('/api/parts', (req, res) => {
  try {
    const partData = req.body as Part;
    if (!partData.partNumber) {
      return res.status(400).json({ error: 'Part number is required' });
    }

    const cleanPartNo = partData.partNumber.trim().toUpperCase();
    const index = partsDatabase.findIndex((p) => p.partNumber === cleanPartNo);

    if (index >= 0) {
      partsDatabase[index] = {
        ...partsDatabase[index],
        ...partData,
        partNumber: cleanPartNo,
        totalValue: Number((partData.availableStock * partData.avgUnitPrice).toFixed(2)),
      };
      res.json({ success: true, part: partsDatabase[index] });
    } else {
      const newPart: Part = {
        ...partData,
        id: partData.id || `prt-${Date.now()}`,
        partNumber: cleanPartNo,
        availableStock: Number(partData.availableStock) || 0,
        totalInward: Number(partData.totalInward) || Number(partData.availableStock) || 0,
        totalOutward: Number(partData.totalOutward) || 0,
        avgUnitPrice: Number(partData.avgUnitPrice) || 0,
        totalValue: Number(((Number(partData.availableStock) || 0) * (Number(partData.avgUnitPrice) || 0)).toFixed(2)),
      };
      partsDatabase.unshift(newPart);
      res.json({ success: true, part: newPart });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to save part' });
  }
});

// 4b. Delete Part from Catalog & Stock Grid
app.delete('/api/parts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const cleanId = id.trim().toUpperCase();
    const index = partsDatabase.findIndex(
      (p) => p.id === id || p.partNumber === cleanId
    );
    if (index === -1) {
      return res.status(404).json({ error: 'Part not found' });
    }
    const deletedPart = partsDatabase[index];
    partsDatabase.splice(index, 1);
    res.json({
      success: true,
      message: `Part ${deletedPart.partNumber} deleted successfully from inventory.`,
      partId: deletedPart.id,
      deletedPart,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete part' });
  }
});

// 4c. Batch Delete Parts from Catalog & Stock Grid
app.post('/api/parts/batch-delete', (req, res) => {
  try {
    const { partNumbers = [], ids = [] } = req.body;
    const targets = new Set([
      ...partNumbers.map((p: string) => String(p).trim().toUpperCase()),
      ...ids.map((id: string) => String(id).trim()),
    ]);

    if (targets.size === 0) {
      return res.status(400).json({ error: 'No parts specified for deletion.' });
    }

    const initialLen = partsDatabase.length;
    partsDatabase = partsDatabase.filter(
      (p) => !targets.has(p.id) && !targets.has(p.partNumber)
    );
    const deletedCount = initialLen - partsDatabase.length;

    res.json({
      success: true,
      message: `Successfully deleted ${deletedCount} part(s) from inventory.`,
      deletedCount,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to batch delete parts' });
  }
});

// 4d. Batch Inward Stock Receiving endpoint
app.post('/api/batch/inward', (req, res) => {
  try {
    const { items = [], personName = 'Batch Inward Operator', batchNotes = 'Batch Inward Intake' } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided for batch inward receiving.' });
    }

    const processedParts: Part[] = [];
    const createdMovements: StockMovement[] = [];

    for (const item of items) {
      if (!item.partNumber || Number(item.quantity) <= 0) continue;

      const cleanPartNo = String(item.partNumber).trim().toUpperCase();
      const qty = Number(item.quantity);
      const price = Number(item.unitPrice) || 0;
      const destLocation = item.location ? String(item.location).trim().toUpperCase() : 'STR1S1B1';

      let existingPart = partsDatabase.find((p) => p.partNumber === cleanPartNo);

      if (existingPart) {
        const oldTotalVal = existingPart.availableStock * existingPart.avgUnitPrice;
        const newInwardVal = qty * price;
        const newAvailable = existingPart.availableStock + qty;
        const newAvgPrice = newAvailable > 0 ? (oldTotalVal + newInwardVal) / newAvailable : price;

        existingPart.availableStock = newAvailable;
        existingPart.totalInward += qty;
        existingPart.avgUnitPrice = Number(newAvgPrice.toFixed(4));
        existingPart.totalValue = Number((existingPart.availableStock * existingPart.avgUnitPrice).toFixed(2));
        existingPart.location = destLocation;
        if (item.description) existingPart.description = item.description;
        if (item.makeBrand) existingPart.makeBrand = item.makeBrand;
        if (item.supplier) existingPart.supplier = item.supplier;
        if (item.technicalSpecs) existingPart.technicalSpecs = { ...existingPart.technicalSpecs, ...item.technicalSpecs };
        processedParts.push(existingPart);
      } else {
        const newPart: Part = {
          id: `prt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          partNumber: cleanPartNo,
          category: (item.category as ComponentCategory) || 'Resistor',
          description: item.description || `${cleanPartNo} component`,
          makeBrand: item.makeBrand || 'Generic',
          supplier: item.supplier || 'Distributor',
          technicalSpecs: item.technicalSpecs || {
            value: item.value || 'N/A',
            packageFootprint: item.packageFootprint || '0805',
            tolerance: item.tolerance || '±1%',
          },
          location: destLocation,
          totalInward: qty,
          totalOutward: 0,
          availableStock: qty,
          minReorderQty: 500,
          avgUnitPrice: price,
          totalValue: Number((qty * price).toFixed(2)),
          isCritical: Boolean(item.isCritical),
          notes: item.notes || batchNotes,
        };
        partsDatabase.unshift(newPart);
        processedParts.push(newPart);
        existingPart = newPart;
      }

      const movement: StockMovement = {
        id: `mov-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        type: 'IN',
        partNumber: cleanPartNo,
        category: existingPart.category,
        quantity: qty,
        unitPrice: price,
        totalMovementValue: Number((qty * price).toFixed(2)),
        location: destLocation,
        personName: item.personName || personName,
        timestamp: new Date().toISOString(),
        notes: item.notes || batchNotes,
      };

      movementsDatabase.unshift(movement);
      createdMovements.push(movement);
    }

    res.json({
      success: true,
      message: `Successfully processed batch inward for ${createdMovements.length} component line(s).`,
      count: createdMovements.length,
      parts: processedParts,
      movements: createdMovements,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to process batch inward' });
  }
});

// 4e. Batch Outward Stock Dispatch endpoint
app.post('/api/batch/outward', (req, res) => {
  try {
    const { items = [], personName = 'Batch Dispatch Operator', batchNotes = 'Batch Outward Dispatch', movementType = 'OUT' } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided for batch outward dispatch.' });
    }

    // First validate availability for all items to guarantee atomic over-issue protection
    const shortages: { partNumber: string; needed: number; available: number }[] = [];
    for (const item of items) {
      if (!item.partNumber || Number(item.quantity) <= 0) continue;
      const cleanPartNo = String(item.partNumber).trim().toUpperCase();
      const qty = Number(item.quantity);
      const part = partsDatabase.find((p) => p.partNumber === cleanPartNo);
      if (!part) {
        shortages.push({ partNumber: cleanPartNo, needed: qty, available: 0 });
      } else if (qty > part.availableStock) {
        shortages.push({ partNumber: cleanPartNo, needed: qty, available: part.availableStock });
      }
    }

    if (shortages.length > 0) {
      const details = shortages
        .map((s) => `${s.partNumber} (Req: ${s.needed}, Available: ${s.available})`)
        .join('; ');
      return res.status(400).json({
        error: `Batch dispatch blocked by over-issue protection: Shortage for ${details}`,
        shortages,
      });
    }

    // Now execute dispatch
    const processedParts: Part[] = [];
    const createdMovements: StockMovement[] = [];

    for (const item of items) {
      if (!item.partNumber || Number(item.quantity) <= 0) continue;
      const cleanPartNo = String(item.partNumber).trim().toUpperCase();
      const qty = Number(item.quantity);
      const part = partsDatabase.find((p) => p.partNumber === cleanPartNo)!;

      const movementValue = Number((qty * part.avgUnitPrice).toFixed(2));
      part.availableStock -= qty;
      part.totalOutward += qty;
      part.totalValue = Number((part.availableStock * part.avgUnitPrice).toFixed(2));
      processedParts.push(part);

      const movement: StockMovement = {
        id: `mov-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        type: (movementType as any) || 'OUT',
        partNumber: cleanPartNo,
        category: part.category,
        quantity: qty,
        unitPrice: part.avgUnitPrice,
        totalMovementValue: movementValue,
        location: item.location || part.location,
        personName: item.personName || personName,
        timestamp: new Date().toISOString(),
        notes: item.notes || batchNotes,
        projectId: item.projectId || undefined,
      };

      movementsDatabase.unshift(movement);
      createdMovements.push(movement);
    }

    res.json({
      success: true,
      message: `Successfully dispatched batch of ${createdMovements.length} component line(s).`,
      count: createdMovements.length,
      parts: processedParts,
      movements: createdMovements,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to process batch outward' });
  }
});

// 5. Admin Delete Movement / Audit Log Reversal
app.delete('/api/movements/:id', (req, res) => {
  try {
    const { id } = req.params;
    const index = movementsDatabase.findIndex((m) => m.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Movement not found' });
    }

    const movement = movementsDatabase[index];
    const part = partsDatabase.find((p) => p.partNumber === movement.partNumber);

    // Rollback stock balance
    if (part) {
      if (movement.type === 'IN') {
        part.availableStock = Math.max(0, part.availableStock - movement.quantity);
        part.totalInward = Math.max(0, part.totalInward - movement.quantity);
      } else if (movement.type === 'OUT' || movement.type === 'LOSS') {
        part.availableStock += movement.quantity;
        part.totalOutward = Math.max(0, part.totalOutward - movement.quantity);
      }
      part.totalValue = Number((part.availableStock * part.avgUnitPrice).toFixed(2));
    }

    movementsDatabase.splice(index, 1);
    res.json({ success: true, message: 'Movement deleted and stock balances recalculated', part });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete movement' });
  }
});

// 6. Deduct Project BOM from Inventory
app.post('/api/projects/:id/deduct', (req, res) => {
  try {
    const { id } = req.params;
    const { multiplier = 1, personName = 'Build Technician' } = req.body;
    const project = projectsDatabase.find((p) => p.id === id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check availability for all items first
    const missing: string[] = [];
    for (const item of project.items) {
      const needed = item.requiredQty * multiplier;
      const part = partsDatabase.find((p) => p.partNumber === item.partNumber);
      if (!part || part.availableStock < needed) {
        missing.push(
          `${item.partNumber} (Needed: ${needed}, Available: ${part ? part.availableStock : 0})`
        );
      }
    }

    if (missing.length > 0) {
      return res.status(400).json({
        error: `Cannot assemble project ${project.code}. Insufficient stock for: ${missing.join(', ')}`,
      });
    }

    // Deduct stock and log movements
    const createdMovements: StockMovement[] = [];
    for (const item of project.items) {
      const needed = item.requiredQty * multiplier;
      const part = partsDatabase.find((p) => p.partNumber === item.partNumber)!;

      part.availableStock -= needed;
      part.totalOutward += needed;
      part.totalValue = Number((part.availableStock * part.avgUnitPrice).toFixed(2));

      const mov: StockMovement = {
        id: `mov-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: 'OUT',
        partNumber: part.partNumber,
        category: part.category,
        quantity: needed,
        unitPrice: part.avgUnitPrice,
        totalMovementValue: Number((needed * part.avgUnitPrice).toFixed(2)),
        location: part.location,
        personName,
        timestamp: new Date().toISOString(),
        notes: `Project Build: ${project.name} (${project.code}) x${multiplier}`,
        projectId: project.id,
      };

      movementsDatabase.unshift(mov);
      createdMovements.push(mov);
    }

    res.json({
      success: true,
      message: `Successfully allocated and deducted components for ${multiplier} unit(s) of ${project.name}`,
      movements: createdMovements,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to deduct project BOM' });
  }
});

// 6b. Project BOM CRUD: Create or Update Project
app.post('/api/projects', (req, res) => {
  try {
    const project = req.body as ProjectBOM;
    if (!project.name || !project.code) {
      return res.status(400).json({ error: 'Project name and project code are required.' });
    }
    const cleanCode = project.code.trim().toUpperCase();
    const idx = projectsDatabase.findIndex(
      (p) => p.id === project.id || p.code.toUpperCase() === cleanCode
    );

    if (idx >= 0) {
      projectsDatabase[idx] = {
        ...projectsDatabase[idx],
        ...project,
        code: cleanCode,
      };
      res.json({ success: true, project: projectsDatabase[idx] });
    } else {
      const newProj: ProjectBOM = {
        ...project,
        id: project.id || `proj-${Date.now()}`,
        code: cleanCode,
        createdAt: project.createdAt || new Date().toISOString(),
        items: project.items || [],
      };
      projectsDatabase.unshift(newProj);
      res.json({ success: true, project: newProj });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to save project BOM' });
  }
});

// 6c. Project BOM CRUD: Delete Project
app.delete('/api/projects/:id', (req, res) => {
  try {
    const { id } = req.params;
    const clean = id.trim().toUpperCase();
    const idx = projectsDatabase.findIndex((p) => p.id === id || p.code.toUpperCase() === clean);
    if (idx === -1) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const removed = projectsDatabase.splice(idx, 1)[0];
    res.json({ success: true, message: `Project BOM "${removed.name}" deleted successfully` });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete project' });
  }
});

// 6d. Outward AI Scanner: Reel & Work Order Pick List with Automated Stock Verification
app.post('/api/scan-outward', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Image base64 data is required' });
    }

    const client = aiClient || getAiClient();
    if (!client) {
      return res.status(503).json({
        error: 'Gemini API key is not configured. Please check Settings > Secrets.',
      });
    }

    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const prompt = `You are an expert electronics warehouse technician inspecting stock dispatches.
Analyze this photo which may be either:
1. An electronics component reel/bag label
2. A printed workshop work order, pick list, or BOM requisition sheet containing one or more part numbers and required quantities.

Extract ONLY the actual part numbers and requested quantities visibly shown in this image. Do NOT invent items.`;

    const response = await callGeminiWithRetry(() =>
      client.models.generateContent({
        model: GEMINI_MODEL,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scanMode: { type: Type.STRING, description: 'Either "reel" or "work_order"' },
              workOrderNumber: { type: Type.STRING, description: 'Work order number if visible, else empty string' },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    partNumber: { type: Type.STRING, description: 'Exact manufacturer or distributor part number' },
                    quantity: { type: Type.INTEGER, description: 'Requested quantity (default 1 if unclear)' },
                    notes: { type: Type.STRING, description: 'Brief item description, value, or designator if visible' },
                  },
                  required: ['partNumber', 'quantity'],
                },
              },
              rawOcrText: { type: Type.STRING, description: 'Concise raw text read directly from the image' },
            },
            required: ['scanMode', 'items', 'rawOcrText'],
          },
        },
      })
    );

    const raw = (response.text || '').trim();
    const parsed = JSON.parse(raw);
    const scanMode: 'reel' | 'work_order' = parsed.scanMode === 'work_order' ? 'work_order' : 'reel';
    const workOrderNumber: string = parsed.workOrderNumber || '';
    const scannedItems: { partNumber: string; quantity: number; notes?: string }[] = Array.isArray(parsed.items)
      ? parsed.items
      : [];
    const rawOcrText: string = parsed.rawOcrText || raw;

    if (scannedItems.length === 0) {
      return res.status(422).json({
        error: 'No part numbers or pick-list items could be detected in the uploaded image.',
      });
    }

    // Automatically check and control warehouse stock for every extracted item
    const enrichedItems = scannedItems.map((item) => {
      const cleanPN = String(item.partNumber).trim().toUpperCase();
      const part = partsDatabase.find((p) => p.partNumber === cleanPN);
      const reqQty = Number(item.quantity) || 1;

      if (!part) {
        return {
          partNumber: cleanPN,
          quantity: reqQty,
          notes: item.notes || 'Component not found in catalog',
          availableStock: 0,
          location: 'N/A',
          unitPrice: 0,
          status: 'not_found' as const,
        };
      }

      const isShortage = reqQty > part.availableStock;
      return {
        partNumber: part.partNumber,
        quantity: reqQty,
        notes: item.notes || part.description,
        availableStock: part.availableStock,
        location: part.location,
        unitPrice: part.avgUnitPrice,
        status: (isShortage ? 'shortage' : 'ok') as 'ok' | 'shortage',
      };
    });

    res.json({
      success: true,
      data: {
        scanMode,
        workOrderNumber,
        items: enrichedItems,
        rawOcrText,
      },
    });
  } catch (error: any) {
    console.error('Gemini outward scan error:', error);
    const mapped = getGeminiHttpError(error, 'Outward AI scan failed');
    res.status(mapped.status).json({ error: mapped.message });
  }
});

// 7. Gemini Multimodal Camera Label OCR & Component Identification
app.post('/api/scan-label', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', fileName = '' } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Image base64 data is required' });
    }

    const client = aiClient || getAiClient();
    if (!client) {
      return res.status(503).json({
        error: 'Gemini API key is not configured. Please check Settings > Secrets.',
      });
    }

    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const prompt = `You are an expert electronics warehouse technician and optical inspection system.
Analyze this photo of an electronics component reel, bag, label, or distributor sticker${fileName ? ` (filename: ${fileName})` : ''}.
Extract ONLY the actual part number, manufacturer, distributor/supplier, quantity, electrical specifications, and raw text visibly printed on this label.
If a unit price is printed on the label, extract it in Indian Rupees (INR); otherwise estimate a realistic INR unit price or return 0.
Allowed categories: "Resistor", "Capacitor", "Inductor", "Diode", "Enclosure", "IC", "Connector", "Mechanical".
Suggest a bin location between STR1S1B1 and STR3S4B4.`;

    const response = await callGeminiWithRetry(() =>
      client.models.generateContent({
        model: GEMINI_MODEL,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              partNumber: { type: Type.STRING, description: 'Exact manufacturer or distributor part number' },
              category: { type: Type.STRING, description: 'Component category' },
              makeBrand: { type: Type.STRING, description: 'Manufacturer brand name' },
              supplier: { type: Type.STRING, description: 'Distributor or supplier name if visible' },
              quantity: { type: Type.INTEGER, description: 'Quantity on label (default 1 if unclear)' },
              unitPrice: { type: Type.NUMBER, description: 'Unit price in Indian Rupees (INR)' },
              technicalSpecs: {
                type: Type.OBJECT,
                properties: {
                  value: { type: Type.STRING },
                  tolerance: { type: Type.STRING },
                  packageFootprint: { type: Type.STRING },
                  powerOrVoltageRating: { type: Type.STRING },
                  dielectricOrType: { type: Type.STRING },
                },
              },
              suggestedLocation: { type: Type.STRING, description: 'Warehouse bin location e.g. STR1S1B1' },
              rawOcrText: { type: Type.STRING, description: 'Concise raw text read directly from the label' },
              confidence: { type: Type.STRING, description: 'high, medium, or low' },
            },
            required: ['partNumber', 'category', 'quantity', 'rawOcrText', 'confidence'],
          },
        },
      })
    );

    const rawText = (response.text || '').trim();
    const parsed: AIScanResult = JSON.parse(rawText);
    return res.json({
      success: true,
      source: 'gemini-multimodal',
      data: parsed,
    });
  } catch (error: any) {
    console.error('Gemini label scan error:', error);
    const mapped = getGeminiHttpError(error, 'Vision label scan failed');
    res.status(mapped.status).json({ error: mapped.message });
  }
});

// 8. JSON Database Export & Import
app.get('/api/backup/export', (_req, res) => {
  const backup = {
    exportedAt: new Date().toISOString(),
    system: 'Elentory Parts Inventory ERP',
    version: '1.0.0',
    parts: partsDatabase,
    movements: movementsDatabase,
    projects: projectsDatabase,
    locations: locationsDatabase,
  };
  res.setHeader('Content-Disposition', `attachment; filename="elentory-backup-${Date.now()}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(backup, null, 2));
});

app.post('/api/backup/import', (req, res) => {
  try {
    const data = req.body;
    if (!data.parts || !Array.isArray(data.parts)) {
      return res.status(400).json({ error: 'Invalid backup file format: missing parts array.' });
    }

    partsDatabase = data.parts;
    if (data.movements && Array.isArray(data.movements)) {
      movementsDatabase = data.movements;
    }
    if (data.projects && Array.isArray(data.projects)) {
      projectsDatabase = data.projects;
    }

    res.json({
      success: true,
      message: `Database successfully restored (${partsDatabase.length} parts, ${movementsDatabase.length} movements)`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to restore database' });
  }
});

// 9. Reset database to initial test lab state
app.post('/api/reset', (_req, res) => {
  partsDatabase = JSON.parse(JSON.stringify(INITIAL_PARTS));
  movementsDatabase = JSON.parse(JSON.stringify(INITIAL_MOVEMENTS));
  projectsDatabase = JSON.parse(JSON.stringify(INITIAL_PROJECTS));
  vendorInvoicesDatabase = JSON.parse(JSON.stringify(INITIAL_VENDOR_INVOICES));
  inspectionReportsDatabase = JSON.parse(JSON.stringify(INITIAL_INSPECTION_REPORTS));
  approvedVendorsDatabase = JSON.parse(JSON.stringify(INITIAL_APPROVED_VENDORS));
  res.json({ success: true, message: 'Database reset to default test lab dataset' });
});

// -----------------------------------------------------------------------------
// 9A. APPROVED VENDORS DIRECTORY & REGISTRATION CRUD
// -----------------------------------------------------------------------------

app.get('/api/vendors', (_req, res) => {
  res.json({ vendors: approvedVendorsDatabase });
});

app.post('/api/vendors', (req, res) => {
  try {
    const payload = req.body as Partial<ApprovedVendor>;
    if (!payload.name || !String(payload.name).trim()) {
      return res.status(400).json({ error: 'Vendor name is required.' });
    }

    const now = new Date().toISOString();
    const id = payload.id || `vnd-${Date.now()}`;
    const existingIdx = approvedVendorsDatabase.findIndex((v) => v.id === id);

    const nextVendor: ApprovedVendor = {
      id,
      vendorCode:
        payload.vendorCode?.trim() ||
        `VND-${String(approvedVendorsDatabase.length + 1).padStart(3, '0')}`,
      name: String(payload.name).trim(),
      address: String(payload.address || '').trim(),
      contactPerson: String(payload.contactPerson || '').trim(),
      contactDesignation: String(payload.contactDesignation || '').trim(),
      phone: String(payload.phone || '').trim(),
      email: String(payload.email || '').trim(),
      website: String(payload.website || '').trim(),
      whatSupplierFor: String(payload.whatSupplierFor || '').trim(),
      suppliedCategories: Array.isArray(payload.suppliedCategories) ? payload.suppliedCategories : [],
      gstin: String(payload.gstin || '').trim().toUpperCase(),
      pan: String(payload.pan || '').trim().toUpperCase(),
      bankName: String(payload.bankName || '').trim(),
      accountNumber: String(payload.accountNumber || '').trim(),
      ifscCode: String(payload.ifscCode || '').trim().toUpperCase(),
      msmeNumber: String(payload.msmeNumber || '').trim().toUpperCase(),
      isoLicenseNo: String(payload.isoLicenseNo || '').trim(),
      status: payload.status || 'approved',
      approvedDate: payload.approvedDate || now.slice(0, 10),
      notes: String(payload.notes || '').trim(),
      documents: Array.isArray(payload.documents) ? payload.documents : [],
      createdAt: payload.createdAt || now,
    };

    if (existingIdx >= 0) {
      approvedVendorsDatabase[existingIdx] = nextVendor;
    } else {
      approvedVendorsDatabase.push(nextVendor);
    }

    res.json({ success: true, vendor: nextVendor });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to save vendor' });
  }
});

app.put('/api/vendors/:id', (req, res) => {
  try {
    const { id } = req.params;
    const idx = approvedVendorsDatabase.findIndex((v) => v.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Vendor not found' });
    }
    const updated: ApprovedVendor = {
      ...approvedVendorsDatabase[idx],
      ...req.body,
      id,
    };
    approvedVendorsDatabase[idx] = updated;
    res.json({ success: true, vendor: updated });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to update vendor' });
  }
});

app.delete('/api/vendors/:id', (req, res) => {
  const { id } = req.params;
  const before = approvedVendorsDatabase.length;
  approvedVendorsDatabase = approvedVendorsDatabase.filter((v) => v.id !== id);
  if (approvedVendorsDatabase.length === before) {
    return res.status(404).json({ error: 'Vendor not found' });
  }
  res.json({ success: true });
});

// -----------------------------------------------------------------------------
// 9B. VENDOR MANAGEMENT, INVOICE-TO-INWARD & SUPPLIER INSPECTION REPORTS (SIR)
// -----------------------------------------------------------------------------

// Fetch all vendor invoices
app.get('/api/vendor/invoices', (_req, res) => {
  res.json({ invoices: vendorInvoicesDatabase });
});

// Create or update vendor invoice
app.post('/api/vendor/invoices', (req, res) => {
  try {
    const invoiceData: VendorInvoice = req.body;
    if (!invoiceData.supplier || !invoiceData.invoiceNumber) {
      return res.status(400).json({ error: 'Supplier and invoice number are required.' });
    }

    const existingIdx = vendorInvoicesDatabase.findIndex(
      (inv) => inv.id === invoiceData.id || inv.invoiceNumber === invoiceData.invoiceNumber
    );

    if (existingIdx >= 0) {
      vendorInvoicesDatabase[existingIdx] = {
        ...vendorInvoicesDatabase[existingIdx],
        ...invoiceData,
      };
      res.json({ success: true, invoice: vendorInvoicesDatabase[existingIdx] });
    } else {
      const newInvoice: VendorInvoice = {
        ...invoiceData,
        id: invoiceData.id || `vinv-${Date.now()}`,
        status: invoiceData.status || 'uploaded',
        createdAt: invoiceData.createdAt || new Date().toISOString(),
      };
      vendorInvoicesDatabase.unshift(newInvoice);
      res.json({ success: true, invoice: newInvoice });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save vendor invoice' });
  }
});

// Delete vendor invoice
app.delete('/api/vendor/invoices/:id', (req, res) => {
  const { id } = req.params;
  vendorInvoicesDatabase = vendorInvoicesDatabase.filter((inv) => inv.id !== id);
  res.json({ success: true, message: 'Vendor invoice deleted' });
});

// Multimodal AI Scan for Supplier Invoices (PDF, PNG, JPG, JPEG, WEBP, CSV, TXT)
app.post('/api/vendor/invoices/scan', async (req, res) => {
  try {
    const { imageBase64, mimeType, fileName } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Document payload (imageBase64) is required' });
    }

    const client = aiClient || getAiClient();
    if (!client) {
      return res.status(503).json({
        error: 'Gemini API key is not configured. Please check Settings > Secrets.',
      });
    }

    const dataUriMatch = /^data:([^;]+);base64,/.exec(imageBase64);
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const lowerName = (fileName || '').toLowerCase();

    let docMimeType = (mimeType || dataUriMatch?.[1] || '').toLowerCase();
    if (!docMimeType || docMimeType === 'application/octet-stream') {
      if (lowerName.endsWith('.pdf')) docMimeType = 'application/pdf';
      else if (lowerName.endsWith('.png')) docMimeType = 'image/png';
      else if (lowerName.endsWith('.webp')) docMimeType = 'image/webp';
      else if (lowerName.endsWith('.csv')) docMimeType = 'text/csv';
      else if (lowerName.endsWith('.txt')) docMimeType = 'text/plain';
      else docMimeType = 'image/jpeg';
    }

    const isTextDocument =
      docMimeType.startsWith('text/') ||
      docMimeType === 'application/csv' ||
      lowerName.endsWith('.csv') ||
      lowerName.endsWith('.txt');

    const prompt = `You are an expert procurement and accounts specialist extracting data from supplier tax invoices, commercial invoices, and delivery challans for electronics manufacturing.
Carefully read EVERY detail visibly present in THIS uploaded document${fileName ? ` (filename: ${fileName})` : ''}.
STRICT RULES:
1. Extract ONLY the actual supplier/seller name, GSTIN/tax ID, buyer/customer name, invoice/challan number, invoice date, PO number, E-Way bill number, and EVERY line item printed in THIS document.
2. NEVER invent, guess, or substitute sample or unrelated company names. If a field is not present on the document, return an empty string "" (or 0 for numbers).
3. Distinguish clearly between the Seller/Supplier (issuer of the invoice) and the Buyer/Customer (Consignee / Bill To). Put the seller company name in "supplier" and the buyer company name in "customer".
4. Extract ALL line items in the invoice table with exact descriptions, HSN/SAC codes, quantities, unit rates (in the invoice's native currency — e.g. Indian Rupees INR without converting to USD), and line totals.
5. For "partNumber", use the exact SKU/MPN/Item Code printed on the invoice; if the invoice has no SKU column, derive a concise uppercase code from the item description.
6. Choose the closest category from: "Enclosure", "Resistor", "Capacitor", "Inductor", "Diode", "Mechanical", "IC", "Connector".`;

    const requestParts: any[] = [];
    if (isTextDocument) {
      const decodedText = Buffer.from(cleanBase64, 'base64').toString('utf-8');
      requestParts.push({
        text: `${prompt}\n\n--- UPLOADED DOCUMENT CONTENT ---\n${decodedText.slice(0, 100000)}`,
      });
    } else {
      requestParts.push({
        inlineData: {
          mimeType: docMimeType,
          data: cleanBase64,
        },
      });
      requestParts.push({ text: prompt });
    }

    const response = await callGeminiWithRetry(() =>
      client.models.generateContent({
        model: GEMINI_MODEL,
        contents: { parts: requestParts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              supplier: { type: Type.STRING, description: 'Exact seller / supplier company name printed on the invoice' },
              supplierGstin: { type: Type.STRING, description: 'Supplier GSTIN / Tax ID if present, else empty string' },
              customer: { type: Type.STRING, description: 'Buyer / Bill To / Consignee company name if present, else empty string' },
              invoiceNumber: { type: Type.STRING, description: 'Invoice or Delivery Challan number' },
              invoiceDate: { type: Type.STRING, description: 'Invoice date in YYYY-MM-DD format if parseable, else as printed' },
              purchaseOrder: { type: Type.STRING, description: 'Buyer PO / Order number if present, else empty string' },
              ewayBill: { type: Type.STRING, description: 'E-Way Bill number if present, else empty string' },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    slNo: { type: Type.INTEGER, description: 'Line serial number' },
                    partNumber: { type: Type.STRING, description: 'Item SKU / part number from invoice or concise derived code' },
                    description: { type: Type.STRING, description: 'Full item description from invoice' },
                    hsn: { type: Type.STRING, description: 'HSN / SAC code if present, else empty string' },
                    quantity: { type: Type.NUMBER, description: 'Exact billed quantity' },
                    unitPrice: { type: Type.NUMBER, description: 'Unit rate / price per unit as printed (numeric, 0 if omitted)' },
                    totalPrice: { type: Type.NUMBER, description: 'Line item taxable amount / total as printed (numeric, 0 if omitted)' },
                    category: { type: Type.STRING, description: 'Component category' },
                    location: { type: Type.STRING, description: 'Suggested warehouse bin e.g. STR1S1B1' },
                    notes: { type: Type.STRING, description: 'Optional line notes, batch/lot, or unit of measure' },
                  },
                  required: ['description', 'quantity'],
                },
              },
              totalAmount: { type: Type.NUMBER, description: 'Grand total or subtotal invoice value as printed' },
              notes: { type: Type.STRING, description: 'Additional invoice notes, tax summary (CGST/SGST/IGST), or payment terms' },
            },
            required: ['supplier', 'invoiceNumber', 'items'],
          },
        },
      })
    );

    const raw = (response.text || '').trim();
    if (!raw) {
      return res.status(502).json({ error: 'AI returned an empty response for this document. Please try a clearer image or PDF.' });
    }

    const extractedData = JSON.parse(raw);

    const rawItems = Array.isArray(extractedData.items) ? extractedData.items : [];
    const items = rawItems.map((it: any, idx: number) => {
      const qty = Number(it.quantity) > 0 ? Number(it.quantity) : 1;
      let unitPrice = Number(it.unitPrice);
      let lineTotal = Number(it.totalPrice);

      if (!Number.isFinite(unitPrice) || unitPrice < 0) unitPrice = 0;
      if (!Number.isFinite(lineTotal) || lineTotal < 0) lineTotal = 0;

      if (unitPrice === 0 && lineTotal > 0 && qty > 0) {
        unitPrice = Number((lineTotal / qty).toFixed(4));
      } else if (lineTotal === 0 && unitPrice > 0) {
        lineTotal = Number((qty * unitPrice).toFixed(2));
      }

      const rawPn = String(it.partNumber || '').trim();
      const derivedPn =
        rawPn ||
        String(it.description || `ITEM-${idx + 1}`)
          .replace(/[^a-zA-Z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .toUpperCase()
          .slice(0, 24) ||
        `SKU-${Date.now().toString().slice(-4)}-${idx + 1}`;
      const cleanPn = derivedPn.toUpperCase();

      return {
        id: `vitem-${Date.now()}-${idx}`,
        slNo: Number(it.slNo) || idx + 1,
        partNumber: cleanPn,
        description: String(it.description || 'Supplied Item').trim(),
        hsn: String(it.hsn || '').trim(),
        quantity: qty,
        unitPrice,
        totalPrice: Number(lineTotal.toFixed(2)),
        category: (it.category as ComponentCategory) || 'Mechanical',
        location: String(it.location || 'STR1S1B1').trim() || 'STR1S1B1',
        notes: String(it.notes || '').trim(),
        isNewSku: !partsDatabase.some((p) => p.partNumber === cleanPn),
      };
    });

    const sumOfLines = Number(items.reduce((acc: number, it: any) => acc + it.totalPrice, 0).toFixed(2));
    const parsedGrandTotal = Number(extractedData.totalAmount);
    const finalTotalAmount =
      Number.isFinite(parsedGrandTotal) && parsedGrandTotal > 0 ? parsedGrandTotal : sumOfLines;

    const cleanFileBase = (fileName || 'uploaded_invoice').replace(/\.[^/.]+$/, '');
    const invoice: VendorInvoice = {
      id: `vinv-${Date.now()}`,
      supplier: String(extractedData.supplier || '').trim() || `Supplier (${cleanFileBase})`,
      supplierGstin: String(extractedData.supplierGstin || '').trim(),
      customer: String(extractedData.customer || '').trim(),
      invoiceNumber: String(extractedData.invoiceNumber || '').trim() || `INV-${Date.now().toString().slice(-6)}`,
      invoiceDate: String(extractedData.invoiceDate || '').trim() || new Date().toISOString().split('T')[0],
      purchaseOrder: String(extractedData.purchaseOrder || '').trim(),
      ewayBill: String(extractedData.ewayBill || '').trim(),
      fileName: fileName || 'uploaded_invoice.pdf',
      fileType: docMimeType,
      fileData: imageBase64.startsWith('data:') ? imageBase64 : `data:${docMimeType};base64,${cleanBase64}`,
      items,
      status: 'uploaded',
      createdAt: new Date().toISOString(),
      totalAmount: finalTotalAmount,
      totalItemsCount: items.reduce((acc: number, it: any) => acc + it.quantity, 0),
      notes: String(extractedData.notes || '').trim(),
    };

    // Store in database
    vendorInvoicesDatabase.unshift(invoice);

    res.json({
      success: true,
      invoice,
      message: `Invoice ${invoice.invoiceNumber} from ${invoice.supplier} scanned (${items.length} line item${items.length === 1 ? '' : 's'} detected)`,
    });
  } catch (err: any) {
    console.error('Vendor invoice scan error:', err);
    const mapped = getGeminiHttpError(err, 'Failed to scan vendor invoice');
    res.status(mapped.status).json({ error: mapped.message });
  }
});

// Commit Invoice to Warehouse Inward (Batch Inward Intake)
app.post('/api/vendor/invoices/:id/inward', (req, res) => {
  try {
    const { id } = req.params;
    const { allocatedLocations } = req.body || {};

    const invoice = vendorInvoicesDatabase.find((inv) => inv.id === id);
    if (!invoice) {
      return res.status(404).json({ error: 'Vendor invoice not found.' });
    }

    if (invoice.status === 'inwarded') {
      return res.status(400).json({ error: 'This invoice batch has already been inwarded to inventory.' });
    }

    let totalInwardUnits = 0;
    const movementsCreated: StockMovement[] = [];

    // Process every line item in the invoice
    for (const item of invoice.items) {
      const cleanPN = item.partNumber.trim().toUpperCase();
      const qty = Number(item.quantity);
      const price = Number(item.unitPrice) || 0;
      const targetLoc = (allocatedLocations && allocatedLocations[item.id]) || item.location || 'STR1S1B1';

      totalInwardUnits += qty;

      let part = partsDatabase.find((p) => p.partNumber === cleanPN);
      if (part) {
        const oldVal = part.availableStock * part.avgUnitPrice;
        const newVal = qty * price;
        const newStock = part.availableStock + qty;
        part.avgUnitPrice = newStock > 0 ? Number(((oldVal + newVal) / newStock).toFixed(4)) : price;
        part.availableStock = newStock;
        part.totalInward += qty;
        part.totalValue = Number((part.availableStock * part.avgUnitPrice).toFixed(2));
        part.location = targetLoc;
        if (invoice.supplier) part.supplier = invoice.supplier;
      } else {
        const newPart: Part = {
          id: `prt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          partNumber: cleanPN,
          category: item.category || 'Enclosure',
          description: item.description,
          makeBrand: invoice.supplier,
          supplier: invoice.supplier,
          technicalSpecs: {
            value: item.description,
            packageFootprint: 'Custom',
          },
          location: targetLoc,
          totalInward: qty,
          totalOutward: 0,
          availableStock: qty,
          minReorderQty: 200,
          avgUnitPrice: price,
          totalValue: Number((qty * price).toFixed(2)),
          isCritical: false,
          notes: `Inwarded from ${invoice.supplier} via invoice ${invoice.invoiceNumber}`,
        };
        partsDatabase.unshift(newPart);
      }

      // Add StockMovement record
      const movement: StockMovement = {
        id: `mov-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        type: 'IN',
        partNumber: cleanPN,
        category: item.category || 'Enclosure',
        quantity: qty,
        unitPrice: price,
        totalMovementValue: Number((qty * price).toFixed(2)),
        location: targetLoc,
        personName: `Vendor: ${invoice.supplier}`,
        timestamp: new Date().toISOString(),
        notes: `Vendor Batch Inward | Invoice: ${invoice.invoiceNumber} | PO: ${invoice.purchaseOrder || 'N/A'}`,
      };
      movementsDatabase.unshift(movement);
      movementsCreated.push(movement);
    }

    // Mark invoice as inwarded
    invoice.status = 'inwarded';
    invoice.inwardedAt = new Date().toISOString();

    res.json({
      success: true,
      message: `Successfully inwarded ${totalInwardUnits} units across ${invoice.items.length} items from ${invoice.supplier}`,
      invoice,
      movementsCount: movementsCreated.length,
      partsCount: partsDatabase.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to inward vendor invoice batch' });
  }
});

// Fetch all Supplier Inspection Reports
app.get('/api/vendor/inspection-reports', (_req, res) => {
  res.json({ reports: inspectionReportsDatabase });
});

// Create or update Supplier Inspection Report
app.post('/api/vendor/inspection-reports', (req, res) => {
  try {
    const reportData: SupplierInspectionReport = req.body;
    if (!reportData.reportNumber || !reportData.supplier) {
      return res.status(400).json({ error: 'Report number and supplier are required.' });
    }

    const existingIdx = inspectionReportsDatabase.findIndex(
      (r) => r.id === reportData.id || r.reportNumber === reportData.reportNumber
    );

    if (existingIdx >= 0) {
      inspectionReportsDatabase[existingIdx] = {
        ...inspectionReportsDatabase[existingIdx],
        ...reportData,
      };
      res.json({ success: true, report: inspectionReportsDatabase[existingIdx] });
    } else {
      const newReport: SupplierInspectionReport = {
        ...reportData,
        id: reportData.id || `sir-${Date.now()}`,
        createdAt: reportData.createdAt || new Date().toISOString(),
      };
      inspectionReportsDatabase.unshift(newReport);

      // Link to invoice if specified
      if (newReport.vendorInvoiceId) {
        const inv = vendorInvoicesDatabase.find((i) => i.id === newReport.vendorInvoiceId);
        if (inv) {
          inv.inspectionReportId = newReport.id;
          if (inv.status === 'uploaded') inv.status = 'inspected';
        }
      }

      res.json({ success: true, report: newReport });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save inspection report' });
  }
});

// Delete Supplier Inspection Report
app.delete('/api/vendor/inspection-reports/:id', (req, res) => {
  const { id } = req.params;
  inspectionReportsDatabase = inspectionReportsDatabase.filter((r) => r.id !== id);
  res.json({ success: true, message: 'Inspection report deleted' });
});

// -----------------------------------------------------------------------------
// 10. ANDROID / MOBILE QR TERMINAL LINK & REAL-TIME SYNC
// -----------------------------------------------------------------------------
interface TerminalScanEvent {
  id: string;
  code: string;
  format: string;
  timestamp: string;
  partNumber?: string;
  description?: string;
  availableStock?: number;
  category?: string;
  unitPrice?: number;
}

interface TerminalSession {
  terminalId: string;
  token: string;
  createdAt: string;
  lastHeartbeat: string;
  isPaired: boolean;
  device?: {
    name: string;
    platform: string;
    lastActive: string;
  };
  pendingScans: TerminalScanEvent[];
}

const terminalSessions = new Map<string, TerminalSession>();
const DEFAULT_TERMINAL_ID = 'TRM-8824';

function getOrCreateSession(id?: string): TerminalSession {
  const terminalId = (id || DEFAULT_TERMINAL_ID).toUpperCase();
  let session = terminalSessions.get(terminalId);
  if (!session) {
    session = {
      terminalId,
      token: 'eln-live-' + Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      isPaired: false,
      pendingScans: [],
    };
    terminalSessions.set(terminalId, session);
  }
  return session;
}

// Get or create active terminal session
app.get('/api/terminal/session', (req, res) => {
  const requestedId = req.query.id as string | undefined;
  const session = getOrCreateSession(requestedId);
  session.lastHeartbeat = new Date().toISOString();
  res.json({
    terminalId: session.terminalId,
    token: session.token,
    isPaired: session.isPaired,
    device: session.device,
    pendingScansCount: session.pendingScans.length,
  });
});

// Pair Android Mobile Terminal via QR code or Terminal ID
app.post('/api/terminal/pair', (req, res) => {
  try {
    const { terminalId, deviceName, platform } = req.body;
    if (!terminalId) {
      return res.status(400).json({ error: 'terminalId is required.' });
    }
    const session = getOrCreateSession(terminalId);
    session.isPaired = true;
    session.lastHeartbeat = new Date().toISOString();
    session.device = {
      name: deviceName || 'Android Mobile Companion',
      platform: platform || 'Android',
      lastActive: new Date().toISOString(),
    };

    res.json({
      success: true,
      terminalId: session.terminalId,
      message: `Paired successfully with ${session.device.name}`,
      device: session.device,
      inventory: {
        partsCount: partsDatabase.length,
        movementsCount: movementsDatabase.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to pair device' });
  }
});

// Push scanned barcode/QR from Android phone to Desktop Web
app.post('/api/terminal/scan', (req, res) => {
  try {
    const { terminalId, code, format } = req.body;
    if (!terminalId || !code) {
      return res.status(400).json({ error: 'terminalId and code are required.' });
    }
    const session = getOrCreateSession(terminalId);
    session.lastHeartbeat = new Date().toISOString();

    const cleanCode = String(code).trim().toUpperCase();
    const matchedPart = partsDatabase.find(
      (p) => p.partNumber === cleanCode || (p.barcode && p.barcode.toUpperCase() === cleanCode)
    );

    const scanEvent: TerminalScanEvent = {
      id: `scn-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      code: cleanCode,
      format: format || 'QR_CODE',
      timestamp: new Date().toISOString(),
      partNumber: matchedPart ? matchedPart.partNumber : cleanCode,
      description: matchedPart ? matchedPart.description : undefined,
      availableStock: matchedPart ? matchedPart.availableStock : undefined,
      category: matchedPart ? matchedPart.category : undefined,
      unitPrice: matchedPart ? matchedPart.avgUnitPrice : undefined,
    };

    session.pendingScans.push(scanEvent);

    if (session.pendingScans.length > 50) {
      session.pendingScans.shift();
    }

    res.json({
      success: true,
      scanEvent,
      matched: Boolean(matchedPart),
      part: matchedPart || null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to record scan' });
  }
});

// Desktop poll for incoming phone scans and pairing updates
app.get('/api/terminal/poll', (req, res) => {
  const terminalId = (req.query.terminalId as string) || DEFAULT_TERMINAL_ID;
  const session = getOrCreateSession(terminalId);
  session.lastHeartbeat = new Date().toISOString();

  const scans = [...session.pendingScans];
  session.pendingScans = [];

  res.json({
    terminalId: session.terminalId,
    isPaired: session.isPaired,
    device: session.device,
    scans,
    lastHeartbeat: session.lastHeartbeat,
  });
});

// Disconnect paired Android terminal
app.post('/api/terminal/disconnect', (req, res) => {
  const { terminalId } = req.body;
  const session = getOrCreateSession(terminalId);
  session.isPaired = false;
  session.device = undefined;
  session.pendingScans = [];
  res.json({ success: true, message: 'Terminal disconnected' });
});

// -----------------------------------------------------------------------------
// VITE INTEGRATION & SERVER STARTUP
// -----------------------------------------------------------------------------
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';

    if (hmrDisabled) {
      app.use('/@vite/client', (req, res, next) => {
        // Force Vite to return full body so we can strip WS connection cleanly
        delete req.headers['if-none-match'];
        delete req.headers['if-modified-since'];

        const origEnd = res.end.bind(res);
        const chunks: Buffer[] = [];
        let ended = false;

        res.write = ((chunk: any, encoding?: any, cb?: any) => {
          if (chunk) {
            chunks.push(
              Buffer.isBuffer(chunk)
                ? chunk
                : Buffer.from(chunk, typeof encoding === 'string' ? (encoding as BufferEncoding) : undefined)
            );
          }
          if (typeof encoding === 'function') encoding();
          else if (typeof cb === 'function') cb();
          return true;
        }) as any;

        res.end = ((chunk?: any, encoding?: any, cb?: any) => {
          if (ended) return res;
          ended = true;
          if (chunk && typeof chunk !== 'function') {
            chunks.push(
              Buffer.isBuffer(chunk)
                ? chunk
                : Buffer.from(chunk, typeof encoding === 'string' ? (encoding as BufferEncoding) : undefined)
            );
          }
          if (chunks.length > 0) {
            let body = Buffer.concat(chunks).toString('utf-8');
            if (body.includes('createWebSocketModuleRunnerTransport')) {
              body = body.replace(
                /const createWebSocketModuleRunnerTransport = \(options\) => \{/,
                'const createWebSocketModuleRunnerTransport = (_options) => ({ async connect() {}, async disconnect() {}, send() {} }); const _disabledCreateWebSocketModuleRunnerTransport = (options) => {'
              );
              res.removeHeader('Content-Length');
              res.removeHeader('ETag');
              res.setHeader('Content-Length', Buffer.byteLength(body, 'utf-8'));
              res.setHeader('Cache-Control', 'no-store');
            }
            const doneCb = typeof encoding === 'function' ? encoding : cb;
            return origEnd(body, 'utf-8', doneCb);
          }
          return origEnd(chunk, encoding, cb);
        }) as any;

        next();
      });
    }

    // Mount Vite dev middlewares
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: !hmrDisabled,
        ws: hmrDisabled ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Elentory Inventory ERP server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
