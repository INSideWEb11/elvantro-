import React, { useState, useRef } from 'react';
import {
  FolderGit2,
  CheckCircle2,
  AlertTriangle,
  Play,
  Package,
  Plus,
  Upload,
  Download,
  Trash2,
  Edit2,
  X,
  Search,
  FileSpreadsheet,
  Check,
} from 'lucide-react';
import { ProjectBOM, ProjectBOMItem, Part } from '../types/inventory';
import { inventoryApi } from '../services/api';

interface ProjectsBOMProps {
  projects: ProjectBOM[];
  parts: Part[];
  onProjectDeducted: () => void;
  onProjectUpdated?: () => void;
}

export const ProjectsBOM: React.FC<ProjectsBOMProps> = ({
  projects,
  parts,
  onProjectDeducted,
  onProjectUpdated,
}) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [multiplier, setMultiplier] = useState<number>(5);
  const [operatorName, setOperatorName] = useState<string>('Marcus Wright');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);

  // Modals state
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectBOM | null>(null);

  // Create Project Form
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectCode, setNewProjectCode] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');

  // Add Item Form
  const [searchPartQuery, setSearchPartQuery] = useState('');
  const [selectedPartForAdd, setSelectedPartForAdd] = useState<string>('');
  const [addItemQty, setAddItemQty] = useState<number>(10);
  const [addItemDesignator, setAddItemDesignator] = useState<string>('');

  // Import BOM State
  const [importFileName, setImportFileName] = useState('');
  const [importText, setImportText] = useState('');
  const [parsedPreviewItems, setParsedPreviewItems] = useState<ProjectBOMItem[]>([]);
  const [importProjectName, setImportProjectName] = useState('Imported PCB Assembly');
  const [importProjectCode, setImportProjectCode] = useState('BOM-IMP');
  const [workbookSheets, setWorkbookSheets] = useState<string[]>([]);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentProject = projects.find((p) => p.id === selectedProjectId) || projects[0];

  // Bill items availability check
  const billItemsStatus = React.useMemo(() => {
    if (!currentProject) return [];
    return currentProject.items.map((item) => {
      const needed = item.requiredQty * multiplier;
      const part = parts.find((p) => p.partNumber === item.partNumber);
      const available = part ? part.availableStock : 0;
      const isSufficient = available >= needed;

      return {
        partNumber: item.partNumber,
        perUnitQty: item.requiredQty,
        designator: item.designator,
        description: item.description || part?.description,
        totalNeeded: needed,
        available,
        isSufficient,
        part,
      };
    });
  }, [currentProject, multiplier, parts]);

  const canBuild = billItemsStatus.length > 0 && billItemsStatus.every((i) => i.isSufficient);

  // Build & Deduct
  const handleBuild = async () => {
    if (!currentProject || !canBuild) return;
    setIsBuilding(true);
    setErrorMessage(null);

    try {
      await inventoryApi.deductProject(currentProject.id, multiplier, operatorName);
      setStatusMessage(
        `✓ Production allocation successful! Checked out components for ${multiplier} unit(s) of ${currentProject.name}.`
      );
      onProjectDeducted();
    } catch (e: any) {
      setErrorMessage(e.message || 'Build deduction failed');
    } finally {
      setIsBuilding(false);
    }
  };

  // Create Project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim() || !newProjectCode.trim()) {
      setErrorMessage('Project Name and Code are required.');
      return;
    }

    try {
      const newProj: ProjectBOM = {
        id: `proj-${Date.now()}`,
        name: newProjectName.trim(),
        code: newProjectCode.trim().toUpperCase(),
        description: newProjectDesc.trim() || 'Custom workshop BOM',
        items: [],
        createdAt: new Date().toISOString(),
      };

      await inventoryApi.saveProject(newProj);
      setShowCreateModal(false);
      setNewProjectName('');
      setNewProjectCode('');
      setNewProjectDesc('');
      setStatusMessage(`✓ Created new custom project: ${newProj.name} (${newProj.code})`);
      if (onProjectUpdated) onProjectUpdated();
      setSelectedProjectId(newProj.id);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create project');
    }
  };

  // Delete Project with safe in-app confirmation
  const handleConfirmDeleteProject = async () => {
    if (!projectToDelete) return;
    const { id, name } = projectToDelete;

    try {
      await inventoryApi.deleteProject(id);
      setStatusMessage(`✓ Project BOM "${name}" was successfully deleted.`);
      setProjectToDelete(null);
      if (onProjectUpdated) onProjectUpdated();
      const remaining = projects.filter((p) => p.id !== id);
      if (remaining.length > 0) {
        setSelectedProjectId(remaining[0].id);
      } else {
        setSelectedProjectId('');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete project');
      setProjectToDelete(null);
    }
  };

  // Add Item to Current Project
  const handleAddItemToProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProject) return;
    if (!selectedPartForAdd) {
      setErrorMessage('Please select a part to add to this BOM.');
      return;
    }

    const qty = Number(addItemQty) || 1;
    const existingIdx = currentProject.items.findIndex(
      (i) => i.partNumber === selectedPartForAdd
    );

    let updatedItems: ProjectBOMItem[];
    if (existingIdx >= 0) {
      updatedItems = [...currentProject.items];
      updatedItems[existingIdx].requiredQty += qty;
      if (addItemDesignator) {
        updatedItems[existingIdx].designator = addItemDesignator;
      }
    } else {
      updatedItems = [
        ...currentProject.items,
        {
          partNumber: selectedPartForAdd,
          requiredQty: qty,
          designator: addItemDesignator || undefined,
        },
      ];
    }

    const updatedProj: ProjectBOM = {
      ...currentProject,
      items: updatedItems,
    };

    try {
      await inventoryApi.saveProject(updatedProj);
      setShowAddItemModal(false);
      setSelectedPartForAdd('');
      setAddItemQty(10);
      setAddItemDesignator('');
      setStatusMessage(`✓ Added ${selectedPartForAdd} (x${qty}) to ${currentProject.name}`);
      if (onProjectUpdated) onProjectUpdated();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update BOM');
    }
  };

  // Remove Item from Current Project
  const handleRemoveItem = async (partNumber: string) => {
    if (!currentProject) return;
    const updatedItems = currentProject.items.filter((i) => i.partNumber !== partNumber);
    const updatedProj: ProjectBOM = {
      ...currentProject,
      items: updatedItems,
    };

    try {
      await inventoryApi.saveProject(updatedProj);
      setStatusMessage(`✓ Removed ${partNumber} from ${currentProject.name}`);
      if (onProjectUpdated) onProjectUpdated();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to remove item');
    }
  };

  // Inline Quantity Edit
  const handleUpdateItemQty = async (partNumber: string, newQty: number) => {
    if (!currentProject || newQty <= 0) return;
    const updatedItems = currentProject.items.map((i) =>
      i.partNumber === partNumber ? { ...i, requiredQty: newQty } : i
    );
    const updatedProj: ProjectBOM = {
      ...currentProject,
      items: updatedItems,
    };

    try {
      await inventoryApi.saveProject(updatedProj);
      if (onProjectUpdated) onProjectUpdated();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update quantity');
    }
  };

  // Handle Excel (.xlsx, .xls) and CSV File Upload for BOM Import
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const defaultName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    setImportProjectName(defaultName);
    setImportProjectCode(defaultName.slice(0, 8).toUpperCase().replace(/\s/g, ''));
    setIsParsingFile(true);
    setErrorMessage(null);

    try {
      const parsed = await inventoryApi.parseExcelOrCsvFile(file);
      setParsedPreviewItems(parsed.items);
      setWorkbookSheets(parsed.sheetNames || ['Sheet1']);
      setStatusMessage(`✓ Successfully parsed ${parsed.items.length} component line(s) from "${file.name}"`);
    } catch (err: any) {
      setErrorMessage('Failed to parse spreadsheet: ' + (err.message || 'Invalid format'));
    } finally {
      setIsParsingFile(false);
    }
  };

  // Commit Imported BOM as New Project
  const handleCommitImport = async () => {
    if (parsedPreviewItems.length === 0) {
      setErrorMessage('No valid component lines found in imported file.');
      return;
    }

    try {
      const newProj: ProjectBOM = {
        id: `proj-${Date.now()}`,
        name: importProjectName.trim() || 'Imported PCB BOM',
        code: importProjectCode.trim().toUpperCase() || 'BOM-IMP',
        description: `Imported from ${importFileName || 'spreadsheet'} (${parsedPreviewItems.length} lines)`,
        items: parsedPreviewItems,
        createdAt: new Date().toISOString(),
      };

      await inventoryApi.saveProject(newProj);
      setShowImportModal(false);
      setParsedPreviewItems([]);
      setImportText('');
      setImportFileName('');
      setStatusMessage(
        `✓ Successfully imported ${newProj.items.length} BOM components into "${newProj.name}"!`
      );
      if (onProjectUpdated) onProjectUpdated();
      setSelectedProjectId(newProj.id);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save imported BOM');
    }
  };

  // Export BOM Checklist CSV
  const handleExportBOM = () => {
    if (!currentProject) return;
    const headers = ['Part Number', 'Required Qty Per Unit', 'Designators', 'Description', 'Assigned Bin'];
    const rows = currentProject.items.map((i) => {
      const part = parts.find((p) => p.partNumber === i.partNumber);
      return [
        `"${i.partNumber}"`,
        i.requiredQty,
        `"${i.designator || ''}"`,
        `"${(i.description || part?.description || '').replace(/"/g, '""')}"`,
        `"${part?.location || 'STR1S1B1'}"`,
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BOM-${currentProject.code}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Matching parts for autocomplete
  const filteredCatalog = parts.filter(
    (p) =>
      p.partNumber.toLowerCase().includes(searchPartQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchPartQuery.toLowerCase()) ||
      p.technicalSpecs?.value?.toLowerCase().includes(searchPartQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <FolderGit2 className="w-5 h-5 text-blue-600" />
            <span>Project Bill of Materials (BOM) & Custom Builds</span>
          </h2>
          <p className="text-xs text-slate-500">
            Import engineering BOM spreadsheets (CSV/Excel), create custom projects, and execute automated stock checkouts
          </p>
        </div>

        {/* Global BOM Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs transition-colors"
            title="Import Bill of Materials from CSV or Excel file"
          >
            <Upload className="w-3.5 h-3.5 text-blue-200" />
            <span>Import BOM (CSV)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors"
            title="Create blank custom project"
          >
            <Plus className="w-3.5 h-3.5 text-slate-500" />
            <span>New Custom Project</span>
          </button>

          {currentProject && (
            <button
              type="button"
              onClick={handleExportBOM}
              className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors"
              title="Download BOM checklist spreadsheet"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export BOM</span>
            </button>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-2.5 rounded-md flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMessage}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-emerald-600 font-bold ml-4">
            ×
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-xs px-4 py-2.5 rounded-md flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-600 font-bold ml-4">
            ×
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Project Selector List */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                Active Projects ({projects.length})
              </span>
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center space-x-1"
              >
                <Plus className="w-3 h-3" />
                <span>Add</span>
              </button>
            </div>

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  onClick={() => setSelectedProjectId(proj.id)}
                  className={`p-3 rounded-md border cursor-pointer transition-all ${
                    currentProject?.id === proj.id
                      ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-300'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900 truncate pr-2">{proj.name}</span>
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 shrink-0">
                      {proj.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{proj.description}</p>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>{proj.items.length} BOM items</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setProjectToDelete(proj);
                      }}
                      className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"
                      title={`Delete project BOM ${proj.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bill of Materials Matrix & Custom BOM Editor */}
        <div className="lg:col-span-8 space-y-4">
          {currentProject ? (
            <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-2">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-base text-slate-900">{currentProject.name}</h3>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                      {currentProject.code}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{currentProject.description}</p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowAddItemModal(true)}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Component</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setProjectToDelete(currentProject)}
                    className="inline-flex items-center space-x-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded border border-slate-200 transition-colors"
                    title={`Delete project BOM ${currentProject.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Delete BOM</span>
                  </button>

                  {/* Multiplier control */}
                  <div className="flex items-center space-x-1.5 bg-slate-50 px-2.5 py-1 rounded border border-slate-200 text-xs">
                    <span className="text-slate-500 font-medium">Batch:</span>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={multiplier}
                      onChange={(e) => setMultiplier(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-14 px-1 py-0.5 text-xs font-mono font-bold bg-white border border-slate-300 rounded text-center"
                    />
                    <span className="text-slate-500 font-mono">pcs</span>
                  </div>
                </div>
              </div>

              {/* BOM Table */}
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 font-mono">
                      <th className="py-2.5 px-3">Part Number</th>
                      <th className="py-2.5 px-3">Designators / Specs</th>
                      <th className="py-2.5 px-3">Bin Location</th>
                      <th className="py-2.5 px-3 text-right">Per Unit</th>
                      <th className="py-2.5 px-3 text-right">Total Needed</th>
                      <th className="py-2.5 px-3 text-right">In Stock</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {billItemsStatus.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400 font-sans text-xs">
                          This project BOM is currently empty. Click "Add Component" above or import a CSV file.
                        </td>
                      </tr>
                    ) : (
                      billItemsStatus.map((item) => (
                        <tr key={item.partNumber} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-bold text-blue-600">{item.partNumber}</td>
                          <td className="py-2 px-3 font-sans text-slate-600 text-[11px] truncate max-w-[150px]">
                            {item.designator ? (
                              <span className="font-mono font-bold text-slate-800 mr-1">
                                [{item.designator}]
                              </span>
                            ) : null}
                            {item.description}
                          </td>
                          <td className="py-2 px-3 text-slate-700">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800">
                              {item.part?.location || 'STR1S1B1'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-semibold">
                            <input
                              type="number"
                              min={1}
                              value={item.perUnitQty}
                              onChange={(e) =>
                                handleUpdateItemQty(item.partNumber, parseInt(e.target.value, 10) || 1)
                              }
                              className="w-14 px-1 py-0.5 text-center font-mono font-semibold bg-white border border-slate-300 rounded text-xs"
                              title="Click to edit required quantity per unit"
                            />
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-900">
                            {item.totalNeeded.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-slate-800">
                            {item.available.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-center">
                            {item.isSufficient ? (
                              <span className="inline-flex items-center text-emerald-700 text-[11px] font-sans font-medium">
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                                Ready
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-red-600 text-[11px] font-sans font-bold">
                                <AlertTriangle className="w-3.5 h-3.5 mr-1 text-red-600" />
                                Shortage
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.partNumber)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded"
                              title="Remove component from BOM"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Build Action Footer */}
              <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-500">Assembly Operator:</span>
                  <input
                    type="text"
                    value={operatorName}
                    onChange={(e) => setOperatorName(e.target.value)}
                    className="px-2 py-1 text-xs border border-slate-300 rounded font-sans"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleBuild}
                  disabled={!canBuild || isBuilding}
                  className={`flex items-center space-x-2 px-5 py-2.5 rounded-md text-xs sm:text-sm font-semibold transition-colors shadow-xs ${
                    canBuild
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    {canBuild
                      ? `Allocate & Deduct Parts for ${multiplier} Unit(s)`
                      : 'Cannot Build: Component Shortage'}
                  </span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ----------------------------------------------------------------------- */}
      {/* MODAL 1: IMPORT BOM SPREADSHEET (CSV / Excel) */}
      {/* ----------------------------------------------------------------------- */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <span className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                <span>Import Bill of Materials (CSV / Excel)</span>
              </span>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Upload any electronic engineering BOM spreadsheet (Excel <span className="font-mono font-semibold text-slate-700">.xlsx, .xls</span>, or <span className="font-mono font-semibold text-slate-700">.csv, .tsv</span>) exported from Altium, KiCad, Eagle, or custom procurement sheets.
            </p>

            {/* File Drag Drop or Upload */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-lg p-6 text-center cursor-pointer bg-slate-50 hover:bg-blue-50/30 transition-colors"
            >
              <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
              <span className="text-xs font-semibold text-blue-600 hover:underline">
                {importFileName ? importFileName : 'Click to select Excel (.xlsx, .xls) or CSV / TSV file'}
              </span>
              <p className="text-[11px] text-slate-400 mt-1">
                Supports all Excel (.xlsx, .xls) & CSV formats with auto-column matching
              </p>
              {isParsingFile && (
                <p className="text-xs font-medium text-blue-600 mt-2 animate-pulse">
                  Analyzing sheets and reading component lines...
                </p>
              )}
              {workbookSheets.length > 1 && (
                <div className="mt-2 flex items-center justify-center space-x-1.5 flex-wrap">
                  <span className="text-[10px] text-slate-500">Detected Sheets:</span>
                  {workbookSheets.map((s) => (
                    <span key={s} className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-mono">
                      {s}
                    </span>
                  ))}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.tsv,.txt,.ods"
                onChange={handleFileImport}
                className="hidden"
              />
            </div>

            {/* Or Paste Raw Text */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Or Paste CSV / Tabular Text:
              </label>
              <textarea
                rows={3}
                value={importText}
                onChange={(e) => {
                  setImportText(e.target.value);
                  const parsed = inventoryApi.parseBOMCsv(e.target.value);
                  setParsedPreviewItems(parsed.items);
                }}
                placeholder="Part Number, Quantity, Designator, Description&#10;RC0805FR-0710KL, 10, R1-R10, 10k Resistor&#10;CL21B104KBCNNNC, 5, C1-C5, 100nF Cap"
                className="w-full p-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded focus:bg-white focus:outline-hidden"
              />
            </div>

            {/* Project metadata inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Project Name</label>
                <input
                  type="text"
                  value={importProjectName}
                  onChange={(e) => setImportProjectName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Project Code</label>
                <input
                  type="text"
                  value={importProjectCode}
                  onChange={(e) => setImportProjectCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-1.5 text-xs font-mono uppercase bg-white border border-slate-300 rounded focus:outline-hidden"
                />
              </div>
            </div>

            {/* Preview of Parsed Items */}
            {parsedPreviewItems.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-700 block">
                  Parsed BOM Lines Preview ({parsedPreviewItems.length} items found)
                </span>
                <div className="border border-slate-200 rounded max-h-40 overflow-y-auto">
                  <table className="w-full text-left text-[11px] font-mono border-collapse">
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b">
                      <tr>
                        <th className="py-1 px-2">Part Number</th>
                        <th className="py-1 px-2 text-right">Qty</th>
                        <th className="py-1 px-2">Designator</th>
                        <th className="py-1 px-2">In Catalog?</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedPreviewItems.slice(0, 10).map((item, idx) => {
                        const inCat = parts.some((p) => p.partNumber === item.partNumber);
                        return (
                          <tr key={idx}>
                            <td className="py-1 px-2 font-bold text-blue-600">{item.partNumber}</td>
                            <td className="py-1 px-2 text-right">{item.requiredQty}</td>
                            <td className="py-1 px-2 text-slate-500">{item.designator || '-'}</td>
                            <td className="py-1 px-2">
                              {inCat ? (
                                <span className="text-emerald-600 font-semibold">✓ In Stock</span>
                              ) : (
                                <span className="text-amber-600">New SKU</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommitImport}
                disabled={parsedPreviewItems.length === 0}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
              >
                Create Project with {parsedPreviewItems.length} Items
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* MODAL 2: CREATE BLANK CUSTOM PROJECT */}
      {/* ----------------------------------------------------------------------- */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <form
            onSubmit={handleCreateProject}
            className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <span className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <FolderGit2 className="w-5 h-5 text-blue-600" />
                <span>New Custom Assembly Project</span>
              </span>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Quadcopter Flight Controller Rev 2"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Project Code / Revision <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. FC-V2"
                value={newProjectCode}
                onChange={(e) => setNewProjectCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 text-xs font-mono uppercase bg-white border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
              <textarea
                rows={2}
                placeholder="Brief description of build assembly, revision notes, or workshop bench..."
                value={newProjectDesc}
                onChange={(e) => setNewProjectDesc(e.target.value)}
                className="w-full p-2 text-xs bg-white border border-slate-300 rounded focus:outline-hidden"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs"
              >
                Create Project
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* MODAL 3: ADD COMPONENT TO PROJECT */}
      {/* ----------------------------------------------------------------------- */}
      {showAddItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <form
            onSubmit={handleAddItemToProject}
            className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <span className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <Plus className="w-5 h-5 text-blue-600" />
                <span>Add Component to {currentProject?.name}</span>
              </span>
              <button
                type="button"
                onClick={() => setShowAddItemModal(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Catalog Search & Select */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">
                Search & Select Catalog Part <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter by part #, value (10k, 100nF)..."
                  value={searchPartQuery}
                  onChange={(e) => setSearchPartQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-t focus:bg-white focus:outline-hidden"
                />
              </div>
              <select
                size={5}
                required
                value={selectedPartForAdd}
                onChange={(e) => setSelectedPartForAdd(e.target.value)}
                className="w-full px-2 py-1 text-xs font-mono bg-white border border-t-0 border-slate-300 rounded-b focus:outline-hidden"
              >
                {filteredCatalog.map((p) => (
                  <option key={p.id} value={p.partNumber} className="py-1">
                    {p.partNumber} · {p.technicalSpecs?.value || p.category} · Stock: {p.availableStock}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Required Qty Per Unit <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={addItemQty}
                  onChange={(e) => setAddItemQty(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-1.5 text-xs font-mono font-bold bg-white border border-slate-300 rounded focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  PCB Designator(s)
                </label>
                <input
                  type="text"
                  placeholder="e.g. R1, R2, C5"
                  value={addItemDesignator}
                  onChange={(e) => setAddItemDesignator(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded focus:outline-hidden"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowAddItemModal(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selectedPartForAdd}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
              >
                Add Component to BOM
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* MODAL 4: CONFIRM DELETE PROJECT BOM (NO WINDOW.CONFIRM) */}
      {/* ----------------------------------------------------------------------- */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Delete Project BOM</h3>
                <p className="text-xs text-slate-500 font-mono">{projectToDelete.code}</p>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <p>
                Are you sure you want to permanently delete the project BOM{' '}
                <strong className="text-slate-900">"{projectToDelete.name}"</strong>?
              </p>
              <div className="flex items-center space-x-2 text-[11px] text-slate-500 font-mono">
                <span>Components configured: {projectToDelete.items.length} lines</span>
              </div>
              <p className="text-[11px] text-amber-700">
                Note: Physical warehouse inventory on shelves will remain intact. Only this project assembly definition is removed.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteProject}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md shadow-xs transition-colors"
              >
                Confirm Delete Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
