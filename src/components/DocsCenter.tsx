import React, { useState } from 'react';
import {
  BookOpen,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  Grid,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Calculator,
  Barcode,
  HelpCircle,
} from 'lucide-react';

export const DocsCenter: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'sop' | 'grid' | 'csv' | 'formulas' | 'faq'>('sop');

  // Sample CSV generator for technicians
  const handleDownloadSampleCsv = () => {
    const sampleContent = [
      'Part Number,Quantity,Designator,Description',
      'RC0805FR-0710KL,10,R1-R10,10k Ohm 1% 0805 Resistor',
      'CRCW06031K00FKEA,20,R11-R30,1k Ohm 1% 0603 Precision Resistor',
      'CL21B104KBCNNNC,15,C1-C15,100nF 50V X7R 0805 MLCC',
      'VLS3012ET-100M,2,L1-L2,10uH Shielded Power Inductor',
      '1N4148W-7-F,4,D1-D4,100V 300mA Fast Switching Diode',
    ].join('\n');

    const blob = new Blob([sampleContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample-project-bom-template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <span>Elentory Documentation & Standard Operating Procedures (SOP)</span>
          </h2>
          <p className="text-xs text-slate-500">
            Official operational manuals, warehouse coordinates, CSV specifications, and accounting formulas
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownloadSampleCsv}
          className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors shadow-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download Sample BOM CSV</span>
        </button>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1 border-b border-slate-200">
        {[
          { id: 'sop', label: 'Standard Operating Procedures', icon: Layers },
          { id: 'grid', label: 'STR1S1B1 Location Scheme', icon: Grid },
          { id: 'csv', label: 'CSV & EDA Import Specs', icon: FileSpreadsheet },
          { id: 'formulas', label: 'Valuation & Math Formulas', icon: Calculator },
          { id: 'faq', label: 'Scanner & Hardware Guide', icon: Barcode },
        ].map((sec) => {
          const Icon = sec.icon;
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id as any)}
              className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold rounded-t-md border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? 'border-blue-600 text-blue-600 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{sec.label}</span>
            </button>
          );
        })}
      </div>

      {/* SECTION 1: STANDARD OPERATING PROCEDURES */}
      {activeSection === 'sop' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* SOP-01 */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
              <span className="w-6 h-6 rounded bg-emerald-50 text-emerald-700 font-mono font-bold text-xs flex items-center justify-center border border-emerald-200">
                01
              </span>
              <h3 className="font-bold text-sm text-slate-900">SOP-01: Inward Receiving Workflow</h3>
            </div>
            <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
              <li>
                <strong>Camera Scan</strong>: Hold the component reel or distributor bag label (DigiKey, Mouser, LCSC, Arrow) before the camera.
              </li>
              <li>
                <strong>Automatic Extraction</strong>: The Gemini Multimodal Vision AI extracts the manufacturer Part Number, Brand, Supplier, Quantity, and passive electrical values.
              </li>
              <li>
                <strong>OCR Text Verification</strong>: Review the raw scanned string in the editable console and adjust numbers if needed.
              </li>
              <li>
                <strong>Coordinate Assignment</strong>: Choose a target rack, shelf, and box slot (e.g. <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">STR1S1B1</code>).
              </li>
              <li>
                <strong>Commit & Valuation</strong>: Click <em>Save Inward Entry</em>. The system increments stock and recalculates the weighted average price.
              </li>
            </ol>
          </div>

          {/* SOP-02 */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
              <span className="w-6 h-6 rounded bg-blue-50 text-blue-700 font-mono font-bold text-xs flex items-center justify-center border border-blue-200">
                02
              </span>
              <h3 className="font-bold text-sm text-slate-900">SOP-02: Outward Stock Dispatch</h3>
            </div>
            <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
              <li>
                <strong>Dual Scanner Mode</strong>: Scan a physical reel barcode or snap a photo of a printed work order pick list.
              </li>
              <li>
                <strong>Over-Issue Guard</strong>: The engine verifies available stock at that specific bin location. If requested quantity exceeds on-hand stock, issuance is blocked.
              </li>
              <li>
                <strong>Batch Queue</strong>: Add verified line items to the dispatch queue, specify recipient operator and project work order.
              </li>
              <li>
                <strong>Valuation Posting</strong>: Dispatches are valued at the running average unit price at time of issue, recorded in the audit log.
              </li>
            </ol>
          </div>

          {/* SOP-03 */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
              <span className="w-6 h-6 rounded bg-purple-50 text-purple-700 font-mono font-bold text-xs flex items-center justify-center border border-purple-200">
                03
              </span>
              <h3 className="font-bold text-sm text-slate-900">SOP-03: Project Bill of Materials (BOM)</h3>
            </div>
            <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
              <li>
                <strong>Import or Create</strong>: Upload a CSV exported from KiCad/Altium or build a new project from scratch.
              </li>
              <li>
                <strong>Catalog Auto-Match</strong>: The BOM links directly with live parts in warehouse inventory.
              </li>
              <li>
                <strong>Stock Readiness</strong>: The matrix marks parts as <span className="text-emerald-700 font-semibold">Ready</span> or <span className="text-red-600 font-semibold">Shortage</span> based on the requested batch multiplier.
              </li>
              <li>
                <strong>Deduct & Build</strong>: Executing checkout automatically decrements available warehouse stock and logs audit movements.
              </li>
            </ol>
          </div>

          {/* SOP-04 */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
              <span className="w-6 h-6 rounded bg-amber-50 text-amber-700 font-mono font-bold text-xs flex items-center justify-center border border-amber-200">
                04
              </span>
              <h3 className="font-bold text-sm text-slate-900">SOP-04: Monthly Financial Reconciliation</h3>
            </div>
            <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside leading-relaxed">
              <li>
                <strong>Rollup Matrix</strong>: Navigating to the Reports tab aggregates movements by calendar month.
              </li>
              <li>
                <strong>Drill-Down Inspection</strong>: Click any month row to inspect every inward and outward transaction executed in that period.
              </li>
              <li>
                <strong>Accounting CSV</strong>: Download monthly rollup figures formatted with clean numeric figures (without currency symbols) for external accounting ERPs.
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* SECTION 2: STORAGE LOCATION SCHEME */}
      {activeSection === 'grid' && (
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-xs space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Physical Coordinate Nomenclature (STR1S1B1 Scheme)</h3>
            <p className="text-xs text-slate-500 mt-1">
              Every storage compartment in the workshop maps to a unique hierarchical 8-character coordinate code.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row items-center justify-center gap-4 text-center">
            <div className="p-3 bg-white rounded border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-400 font-mono uppercase block">Warehouse Rack</span>
              <span className="font-mono font-bold text-base text-blue-600">STR1 to STR3</span>
              <span className="text-[10px] text-slate-500 block">3 Storage Racks</span>
            </div>
            <span className="text-slate-400 font-bold text-lg hidden sm:inline">→</span>
            <div className="p-3 bg-white rounded border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-400 font-mono uppercase block">Shelf Tier</span>
              <span className="font-mono font-bold text-base text-blue-600">S1 to S4</span>
              <span className="text-[10px] text-slate-500 block">4 Shelves per Rack</span>
            </div>
            <span className="text-slate-400 font-bold text-lg hidden sm:inline">→</span>
            <div className="p-3 bg-white rounded border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-400 font-mono uppercase block">Box Compartment</span>
              <span className="font-mono font-bold text-base text-blue-600">B1 to B4</span>
              <span className="text-[10px] text-slate-500 block">4 Boxes per Shelf</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600">
            <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1">
              <span className="font-bold text-slate-800 block">Standard Box Syntax (e.g. STR1S2B3)</span>
              <p>Designates <strong>Rack 1</strong>, <strong>Shelf 2</strong>, <strong>Box 3</strong>. Used for compartmentalized component bins containing chip reels and cut tape.</p>
            </div>
            <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1">
              <span className="font-bold text-slate-800 block">Open Shelf Syntax (e.g. STR1S3)</span>
              <p>Designates <strong>Rack 1</strong>, <strong>Shelf 3</strong> without container boxes. Ideal for bulky transformer reels, large ESD trays, and breadboard kits.</p>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: CSV & SPREADSHEET SPECS */}
      {activeSection === 'csv' && (
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-xs space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900">BOM Spreadsheet & CSV Import Specifications</h3>
            <p className="text-xs text-slate-500 mt-1">
              The importer accepts standard comma-separated (`.csv`), tab-separated (`.tsv`), and semicolon-separated files from KiCad, Altium, Eagle, or Excel.
            </p>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-md">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-semibold font-mono border-b">
                <tr>
                  <th className="py-2 px-3">Field</th>
                  <th className="py-2 px-3">Recognized Header Variations</th>
                  <th className="py-2 px-3">Required?</th>
                  <th className="py-2 px-3">Example</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                <tr>
                  <td className="py-2 px-3 font-bold text-blue-600">Part Number</td>
                  <td className="py-2 px-3 text-slate-600">Part, Part Number, MPN, MFR P/N, Component, PN</td>
                  <td className="py-2 px-3 text-emerald-600 font-bold">Yes</td>
                  <td className="py-2 px-3 text-slate-800">RC0805FR-0710KL</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-bold text-blue-600">Quantity</td>
                  <td className="py-2 px-3 text-slate-600">Qty, Quantity, Count, Needed, Amount</td>
                  <td className="py-2 px-3 text-emerald-600 font-bold">Yes (Defaults to 1)</td>
                  <td className="py-2 px-3 text-slate-800">10</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-bold text-blue-600">Designators</td>
                  <td className="py-2 px-3 text-slate-600">Designator, Ref, Reference, Refs</td>
                  <td className="py-2 px-3 text-slate-400">Optional</td>
                  <td className="py-2 px-3 text-slate-800">R1-R10, C1, C2</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-bold text-blue-600">Description</td>
                  <td className="py-2 px-3 text-slate-600">Description, Value, Desc, Specs</td>
                  <td className="py-2 px-3 text-slate-400">Optional</td>
                  <td className="py-2 px-3 text-slate-800">10k Ohm 1% 0805 SMD Resistor</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <span className="text-xs text-slate-500">Need a quick test template?</span>
            <button
              onClick={handleDownloadSampleCsv}
              className="text-xs font-semibold text-blue-600 hover:underline flex items-center space-x-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download sample-project-bom-template.csv</span>
            </button>
          </div>
        </div>
      )}

      {/* SECTION 4: FINANCIAL VALUATION FORMULAS */}
      {activeSection === 'formulas' && (
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-xs space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Inventory Valuation & Accounting Formulas</h3>
            <p className="text-xs text-slate-500 mt-1">
              Mathematical models implemented in the transactional ledger engine.
            </p>
          </div>

          <div className="space-y-4 text-xs text-slate-700">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 block text-sm">
                1. Running Weighted Average Unit Price (Inward Average Cost)
              </span>
              <p className="text-slate-600">
                When new stock arrives at an inward unit price and quantity, the weighted average unit price is dynamically recalculated against existing on-hand stock:
              </p>
              <div className="p-2.5 bg-white border border-slate-200 rounded font-mono text-center text-sm font-semibold text-blue-700">
                P_new = (Q_current × P_current + Q_inward × P_inward) / (Q_current + Q_inward)
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 block text-sm">
                2. Outward Movement Valuation
              </span>
              <p className="text-slate-600">
                Inventory dispatched for assembly or work orders is valued at the current running weighted average price:
              </p>
              <div className="p-2.5 bg-white border border-slate-200 rounded font-mono text-center text-sm font-semibold text-blue-700">
                Total Movement Value = Q_dispatched × P_avg
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <span className="font-bold text-slate-900 block text-sm">
                3. Total Warehouse Portfolio Valuation
              </span>
              <div className="p-2.5 bg-white border border-slate-200 rounded font-mono text-center text-sm font-semibold text-emerald-700">
                Total Valuation = ∑ (Available Stock_i × Avg Unit Price_i)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 5: HARDWARE & SCANNER FAQ */}
      {activeSection === 'faq' && (
        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Scanner Tips & Hardware Guidelines</h3>

          <div className="space-y-3 text-xs text-slate-600">
            <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1">
              <span className="font-semibold text-slate-800 block">Camera Permissions in Browser</span>
              <p>Ensure camera permissions are granted. Elentory requests the rear environment camera on mobile phones and tablets, and your primary webcam on desktop workstations.</p>
            </div>

            <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1">
              <span className="font-semibold text-slate-800 block">Scanning Barcodes vs Multimodal AI Snapshots</span>
              <p>For standard 1D manufacturer barcodes (Code 128 / UPC) and 2D Data Matrix codes, hold the barcode inside the dashed targeting reticle. For detailed text stickers or paper work orders, click <strong>Snap & AI Vision</strong> to invoke Gemini Multimodal extraction.</p>
            </div>

            <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1">
              <span className="font-semibold text-slate-800 block">Offline Mode & Data Backups</span>
              <p>If disconnected from the network, the ERP auto-saves all records to local browser storage. You can download a complete timestamped backup anytime via the <strong>Backup JSON</strong> button in the top navigation bar.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
