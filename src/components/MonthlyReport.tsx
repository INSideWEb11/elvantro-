import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Download,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Calendar,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  PieChart,
  HardDrive,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { StockMovement, Part, MonthlyRollup, VendorInvoice } from '../types/inventory';
import { inventoryApi } from '../services/api';
import { formatINR } from '../utils/currency';
import { useGoogleDrive } from '../context/GoogleDriveContext';

interface MonthlyReportProps {
  movements: StockMovement[];
  parts: Part[];
  vendorInvoices?: VendorInvoice[];
  onShowToast?: (message: string, type?: 'success' | 'error') => void;
}

export const MonthlyReport: React.FC<MonthlyReportProps> = ({
  movements,
  parts,
  vendorInvoices = [],
  onShowToast,
}) => {
  const { uploadWithOverwriteGuard } = useGoogleDrive();
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [isExportingDrive, setIsExportingDrive] = useState(false);
  const [lastDriveExport, setLastDriveExport] = useState<{
    fileName: string;
    folderPath: string;
    webViewLink: string;
  } | null>(null);

  const handleExportInwardToDrive = async (monthKey?: string) => {
    try {
      setIsExportingDrive(true);
      const { blob, fileName } = inventoryApi.buildInwardReportExcelBlob(
        movements,
        parts,
        vendorInvoices,
        monthKey
      );
      const result = await uploadWithOverwriteGuard({
        blob,
        fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        folderSegments: ['Elentory ERP', 'Inward'],
        promptSignIn: true,
      });

      if (!result) return; // cancelled by user
      setLastDriveExport({
        fileName: result.fileName,
        folderPath: result.folderPath,
        webViewLink: result.webViewLink,
      });
      onShowToast?.(
        `Exported "${result.fileName}" to Google Drive (${result.folderPath})`,
        'success'
      );
    } catch (err: any) {
      onShowToast?.(err?.message || 'Failed to export Inward Report to Google Drive', 'error');
    } finally {
      setIsExportingDrive(false);
    }
  };

  // Current On-Hand Inventory Metrics
  const totalCurrentStockUnits = useMemo(
    () => parts.reduce((acc, p) => acc + p.availableStock, 0),
    [parts]
  );
  const totalCurrentValuation = useMemo(
    () => parts.reduce((acc, p) => acc + p.totalValue, 0),
    [parts]
  );

  // Category Inventory Cost Breakdown
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { count: number; units: number; val: number }> = {
      Resistor: { count: 0, units: 0, val: 0 },
      Capacitor: { count: 0, units: 0, val: 0 },
      Inductor: { count: 0, units: 0, val: 0 },
      Diode: { count: 0, units: 0, val: 0 },
    };

    for (const p of parts) {
      if (!map[p.category]) {
        map[p.category] = { count: 0, units: 0, val: 0 };
      }
      map[p.category].count += 1;
      map[p.category].units += p.availableStock;
      map[p.category].val += p.totalValue;
    }

    return Object.entries(map).map(([cat, d]) => ({
      category: cat,
      count: d.count,
      units: d.units,
      valuation: d.val,
      percentage: totalCurrentValuation > 0 ? (d.val / totalCurrentValuation) * 100 : 0,
    }));
  }, [parts, totalCurrentValuation]);

  // Group transactions by month (YYYY-MM) and compute cumulative closing balance
  const rollups: MonthlyRollup[] = useMemo(() => {
    const map = new Map<string, StockMovement[]>();

    for (const m of movements) {
      const monthKey = m.timestamp.slice(0, 7); // e.g. "2026-10"
      if (!map.has(monthKey)) map.set(monthKey, []);
      map.get(monthKey)!.push(m);
    }

    // Sort chronologically ascending to calculate running balance
    const sortedKeysAsc = Array.from(map.keys()).sort();
    let runningNetQty = 0;
    let runningNetVal = 0;
    const computedMap = new Map<string, MonthlyRollup>();

    for (const mk of sortedKeysAsc) {
      const txs = map.get(mk)!;
      let inQty = 0;
      let inValue = 0;
      let outQty = 0;
      let outValue = 0;

      for (const t of txs) {
        if (t.type === 'IN') {
          inQty += t.quantity;
          inValue += t.totalMovementValue;
        } else if (t.type === 'OUT' || t.type === 'LOSS') {
          outQty += t.quantity;
          outValue += t.totalMovementValue;
        }
      }

      runningNetQty += (inQty - outQty);
      runningNetVal += (inValue - outValue);

      const [yearStr, monthStr] = mk.split('-');
      const dateObj = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
      const monthLabel = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      computedMap.set(mk, {
        monthKey: mk,
        monthLabel,
        inQty,
        inValue,
        outQty,
        outValue,
        netQty: inQty - outQty,
        netValue: inValue - outValue,
        closingUnits: Math.max(0, runningNetQty),
        closingValuation: Math.max(0, runningNetVal),
        transactions: txs.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ),
      });
    }

    // Return sorted newest first
    return Array.from(computedMap.values()).reverse();
  }, [movements]);

  // Aggregate totals across all months
  const totalInQty = useMemo(() => rollups.reduce((acc, r) => acc + r.inQty, 0), [rollups]);
  const totalInValue = useMemo(() => rollups.reduce((acc, r) => acc + r.inValue, 0), [rollups]);
  const totalOutQty = useMemo(() => rollups.reduce((acc, r) => acc + r.outQty, 0), [rollups]);
  const totalOutValue = useMemo(() => rollups.reduce((acc, r) => acc + r.outValue, 0), [rollups]);

  const toggleExpand = (monthKey: string) => {
    setExpandedMonth(expandedMonth === monthKey ? null : monthKey);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            <span>Monthly Movement Rollup & Complete Inventory Valuation</span>
          </h2>
          <p className="text-xs text-slate-500">
            Financial reconciliation matrix of intake vs dispatch velocity with complete remaining warehouse inventory cost
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isExportingDrive}
            onClick={() => handleExportInwardToDrive()}
            className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs transition-colors disabled:opacity-50"
            title="Upload complete Inward Report (.xlsx) directly to Google Drive inside Elentory ERP / Inward folder"
          >
            {isExportingDrive ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <HardDrive className="w-3.5 h-3.5" />
            )}
            <span>{isExportingDrive ? 'Uploading to Drive...' : 'Export Inward Report to Google Drive'}</span>
          </button>

          <button
            type="button"
            onClick={() => inventoryApi.exportMonthlyExcel(rollups, parts, movements)}
            className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-xs transition-colors"
            title="Download multi-sheet financial accounting workbook (.xlsx) with complete closing inventory"
          >
            <Download className="w-3.5 h-3.5 text-emerald-200" />
            <span>Export Financial Excel (.XLSX)</span>
          </button>

          <button
            type="button"
            onClick={() => inventoryApi.exportMonthlyCsv(movements)}
            className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
            title="Download Monthly Rollup formatted for spreadsheet accounting (CSV)"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Download CSV</span>
          </button>
        </div>
      </div>

      {/* Google Drive Export Confirmation Banner */}
      {lastDriveExport && (
        <div className="px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-2 text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Inward Report <strong>{lastDriveExport.fileName}</strong> saved in Google Drive folder{' '}
              <span className="font-mono font-semibold">{lastDriveExport.folderPath}</span>
            </span>
          </div>
          <a
            href={lastDriveExport.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1 font-semibold text-blue-700 hover:underline shrink-0"
          >
            <span>Open in Google Drive</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Primary KPI Cards (Highlighting Complete Remaining Inventory Cost!) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Complete Remaining Inventory on Hand */}
        <div className="bg-gradient-to-br from-blue-900 to-slate-900 text-white p-4 rounded-lg shadow-md border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-blue-200 font-medium uppercase tracking-wider block">
              Complete On-Hand Inventory
            </span>
            <Boxes className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="font-mono tabular-nums font-bold text-2xl text-emerald-400">
              {formatINR(totalCurrentValuation)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-300 font-mono mt-1 pt-1 border-t border-slate-800">
            <span>{totalCurrentStockUnits.toLocaleString()} units in stock</span>
            <span>{parts.length} active SKUs</span>
          </div>
        </div>

        {/* Total Recorded Inward Intake */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium block">Total Inward Intake</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="font-mono tabular-nums font-bold text-xl text-emerald-600">
              +{formatINR(totalInValue)}
            </span>
          </div>
          <span className="text-xs text-slate-500 font-mono mt-1 block">
            +{totalInQty.toLocaleString()} units received
          </span>
        </div>

        {/* Total Recorded Outward Dispatched */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium block">Total Dispatched Outward</span>
            <ArrowUpRight className="w-4 h-4 text-red-500" />
          </div>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="font-mono tabular-nums font-bold text-xl text-red-600">
              -{formatINR(totalOutValue)}
            </span>
          </div>
          <span className="text-xs text-slate-500 font-mono mt-1 block">
            -{totalOutQty.toLocaleString()} units issued
          </span>
        </div>

        {/* Net Flow / Inventory Velocity */}
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium block">Net Velocity Balance</span>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex items-baseline space-x-2 mt-1">
            <span className="font-mono tabular-nums font-bold text-xl text-slate-900">
              {formatINR(totalInValue - totalOutValue)}
            </span>
          </div>
          <span className="text-xs text-slate-500 font-mono mt-1 block">
            {(totalInQty - totalOutQty).toLocaleString()} net units flow
          </span>
        </div>
      </div>

      {/* Category Cost Breakdown Card */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
            <PieChart className="w-4 h-4 text-blue-600" />
            <span>Complete Inventory Cost Distribution by Category</span>
          </span>
          <span className="text-xs text-slate-500 font-mono">
            Total Valuation: {formatINR(totalCurrentValuation)}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {categoryBreakdown.map((cat) => (
            <div key={cat.category} className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">{cat.category}s</span>
                <span className="text-[11px] font-mono font-semibold px-1.5 py-0.2 rounded bg-white border border-slate-200 text-slate-600">
                  {cat.percentage.toFixed(1)}%
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between font-mono">
                <span className="font-bold text-emerald-700 text-sm">
                  {formatINR(cat.valuation)}
                </span>
                <span className="text-slate-500">{cat.units.toLocaleString()} pcs</span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.max(5, cat.percentage))}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 block mt-1">{cat.count} catalog SKUs</span>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly Rollup Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200 font-semibold">
                <th className="py-3 px-4">Month / Period</th>
                <th className="py-3 px-3 text-right">Inward Qty</th>
                <th className="py-3 px-3 text-right">Intake Value (₹)</th>
                <th className="py-3 px-3 text-right">Dispatched Qty</th>
                <th className="py-3 px-3 text-right">Dispatched (₹)</th>
                <th className="py-3 px-3 text-right">Net Flow Qty</th>
                <th className="py-3 px-3 text-right">Net Flow (₹)</th>
                <th className="py-3 px-4 text-right bg-emerald-50/60 text-emerald-900 border-l border-emerald-100 font-bold">
                  Closing Inv. Value (₹)
                </th>
                <th className="py-3 px-3 text-right bg-emerald-50/60 text-emerald-900">
                  Stock Left
                </th>
                <th className="py-3 px-3 text-center">Drill-Down</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {rollups.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400 text-sm">
                    No movement records found to generate monthly rollup.
                  </td>
                </tr>
              ) : (
                rollups.map((rollup) => {
                  const isExpanded = expandedMonth === rollup.monthKey;
                  return (
                    <React.Fragment key={rollup.monthKey}>
                      <tr
                        onClick={() => toggleExpand(rollup.monthKey)}
                        className={`cursor-pointer transition-colors ${
                          isExpanded ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3.5 px-4 font-semibold text-slate-900 flex items-center space-x-2">
                          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                          <span>{rollup.monthLabel}</span>
                          <span className="text-[11px] text-slate-400 font-mono font-normal">
                            ({rollup.monthKey})
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums text-emerald-600 font-semibold">
                          +{rollup.inQty.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-800">
                          {formatINR(rollup.inValue)}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums text-red-600 font-semibold">
                          -{rollup.outQty.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-800">
                          {formatINR(rollup.outValue)}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                          {rollup.netQty.toLocaleString()}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                          {formatINR(rollup.netValue)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-emerald-700 bg-emerald-50/30 border-l border-emerald-100">
                          {formatINR(rollup.closingValuation || 0)}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-700 bg-emerald-50/30">
                          {(rollup.closingUnits || 0).toLocaleString()} pcs
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          <button
                            type="button"
                            className="p-1 text-slate-400 hover:text-slate-800"
                            title="Expand transaction log"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-blue-600" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Accordion Table of Monthly Transactions */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={10} className="p-0 bg-slate-50 border-b border-slate-200">
                            <div className="p-4 space-y-2">
                              <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider">
                                <span>
                                  Transactions Executed in {rollup.monthLabel} ({rollup.transactions.length} entries)
                                </span>
                                <span className="font-mono text-slate-500 font-normal">
                                  Sorted Chronologically
                                </span>
                              </div>

                              <div className="bg-white rounded border border-slate-200 overflow-hidden">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead>
                                    <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                                      <th className="py-2 px-3">Date</th>
                                      <th className="py-2 px-3">Type</th>
                                      <th className="py-2 px-3">Part Number</th>
                                      <th className="py-2 px-3">Category</th>
                                      <th className="py-2 px-3 text-right">Quantity</th>
                                      <th className="py-2 px-3 text-right">Unit Price (₹)</th>
                                      <th className="py-2 px-3 text-right">Total (₹)</th>
                                      <th className="py-2 px-3">Location</th>
                                      <th className="py-2 px-3">Person</th>
                                      <th className="py-2 px-3">Reference</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 font-mono">
                                    {rollup.transactions.map((tx) => (
                                      <tr key={tx.id} className="hover:bg-slate-50">
                                        <td className="py-2 px-3 text-slate-500">
                                          {tx.timestamp.slice(0, 10)}
                                        </td>
                                        <td className="py-2 px-3 font-bold">
                                          <span
                                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                                              tx.type === 'IN'
                                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                : 'bg-red-50 text-red-700 border border-red-200'
                                            }`}
                                          >
                                            {tx.type}
                                          </span>
                                        </td>
                                        <td className="py-2 px-3 font-semibold text-blue-600">
                                          {tx.partNumber}
                                        </td>
                                        <td className="py-2 px-3 text-slate-600 font-sans">
                                          {tx.category}
                                        </td>
                                        <td className="py-2 px-3 text-right font-bold text-slate-800">
                                          {tx.quantity.toLocaleString()}
                                        </td>
                                        <td className="py-2 px-3 text-right text-slate-600">
                                          {formatINR(tx.unitPrice, 3)}
                                        </td>
                                        <td className="py-2 px-3 text-right font-semibold text-emerald-700">
                                          {formatINR(tx.totalMovementValue)}
                                        </td>
                                        <td className="py-2 px-3 text-slate-700">
                                          {tx.location}
                                        </td>
                                        <td className="py-2 px-3 font-sans text-slate-600 truncate max-w-[120px]">
                                          {tx.personName}
                                        </td>
                                        <td className="py-2 px-3 font-sans text-slate-500 truncate max-w-[180px]">
                                          {tx.notes}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}

              {/* Fixed Summary Totals Row (With Complete Warehouse Valuation!) */}
              <tr className="bg-slate-900 text-white font-bold border-t-2 border-slate-700 text-xs">
                <td className="py-3 px-4 font-mono">COMPLETE WAREHOUSE TOTALS</td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-400">
                  +{totalInQty.toLocaleString()}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-white">
                  {formatINR(totalInValue)}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-red-400">
                  -{totalOutQty.toLocaleString()}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-white">
                  {formatINR(totalOutValue)}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-white">
                  {(totalInQty - totalOutQty).toLocaleString()}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-400">
                  {formatINR(totalInValue - totalOutValue)}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-300 font-extrabold bg-slate-800 border-l border-slate-700">
                  {formatINR(totalCurrentValuation)}
                </td>
                <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300 bg-slate-800">
                  {totalCurrentStockUnits.toLocaleString()} pcs
                </td>
                <td className="py-3 px-3"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
