import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowUpRight,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Package,
  Layers,
  Search,
  Plus,
  Trash2,
  Info,
  Camera,
  Upload,
  Sparkles,
  Barcode,
  RotateCcw,
  VideoOff,
  RefreshCw,
  FileText,
  QrCode,
  FlipHorizontal,
  Zap,
} from 'lucide-react';
import { Part, MovementType, OutwardScannedItem } from '../types/inventory';
import { formatINR } from '../utils/currency';
import { inventoryApi } from '../services/api';
import {
  initializeCameraStream,
  LiveScannerEngine,
  toggleTorch,
  decodeFromImageSource,
} from '../utils/scannerEngine';

interface OutwardDispatchProps {
  parts: Part[];
  preSelectedPart?: Part | null;
  onSuccess: (part: Part) => void;
}

interface DispatchItem {
  id: string;
  partNumber: string;
  quantity: number;
  location: string;
  availableStock: number;
  unitPrice: number;
  movementType: MovementType;
  notes: string;
}

export const OutwardDispatch: React.FC<OutwardDispatchProps> = ({
  parts,
  preSelectedPart,
  onSuccess,
}) => {
  // Navigation between AI Scanner mode and Manual mode
  const [dispatchMode, setDispatchMode] = useState<'manual' | 'ai_scanner'>('ai_scanner');

  // Manual Form State
  const [selectedPartNo, setSelectedPartNo] = useState<string>(
    preSelectedPart ? preSelectedPart.partNumber : parts[0]?.partNumber || ''
  );
  const [issueQty, setIssueQty] = useState<number | ''>(50);
  const [movementType, setMovementType] = useState<MovementType>('OUT');
  const [personName, setPersonName] = useState('Sarah Miller');
  const [notes, setNotes] = useState('SMT Production Line Batch #B-2026');
  const [searchTerm, setSearchTerm] = useState('');

  // AI Camera Scanner State
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanningAI, setIsScanningAI] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [scannedWorkOrderItems, setScannedWorkOrderItems] = useState<OutwardScannedItem[]>([]);
  const [workOrderRef, setWorkOrderRef] = useState<string>('');
  const [lastBarcodeFound, setLastBarcodeFound] = useState<string | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<'QR_CODE' | 'BARCODE' | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  // Multi-item queue
  const [queue, setQueue] = useState<DispatchItem[]>([]);

  // UI feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerEngineRef = useRef<LiveScannerEngine | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update selection if prop changes
  useEffect(() => {
    if (preSelectedPart) {
      setSelectedPartNo(preSelectedPart.partNumber);
    }
  }, [preSelectedPart]);

  const currentPart = parts.find((p) => p.partNumber === selectedPartNo);

  // Filter parts for manual selector
  const matchingParts = parts.filter(
    (p) =>
      p.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.technicalSpecs?.value?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Validation: Check if requested exceeds available
  const isOverIssue = currentPart && Number(issueQty) > currentPart.availableStock;

  // ---------------------------------------------------------------------------
  // Camera & AI Scanner Handlers
  // ---------------------------------------------------------------------------
  const startCamera = async (overrideFacing?: 'environment' | 'user') => {
    setCameraError(null);
    const targetFacing = overrideFacing || facingMode;
    try {
      if (!videoRef.current) return;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (scannerEngineRef.current) {
        scannerEngineRef.current.stop();
        scannerEngineRef.current = null;
      }

      const res = await initializeCameraStream(videoRef.current, targetFacing);
      streamRef.current = res.stream;
      setHasTorch(res.hasTorch);
      setFacingMode(res.activeFacingMode);
      setIsCameraActive(true);

      // Start live QR & Barcode reader
      const engine = new LiveScannerEngine((result) => {
        handleBarcodeDetected(result.text, result.format);
      }, 1800);
      scannerEngineRef.current = engine;
      engine.start(videoRef.current);
    } catch (err: any) {
      setCameraError(err.message || 'Camera access unavailable. You can upload a photo or use the test simulators.');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (scannerEngineRef.current) {
      scannerEngineRef.current.stop();
      scannerEngineRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsTorchOn(false);
  };

  const toggleCameraFacing = async () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    await startCamera(nextFacing);
  };

  const handleToggleTorch = async () => {
    const nextState = !isTorchOn;
    const success = await toggleTorch(streamRef.current, nextState);
    if (success) setIsTorchOn(nextState);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const handleBarcodeDetected = (code: string, format?: 'QR_CODE' | 'BARCODE' | 'DATA_MATRIX' | 'UNKNOWN') => {
    let cleanCode = code.trim();
    if (cleanCode.startsWith('{') && cleanCode.endsWith('}')) {
      try {
        const obj = JSON.parse(cleanCode);
        if (obj.partNumber || obj.pn || obj.sku || obj.mpn) {
          cleanCode = String(obj.partNumber || obj.pn || obj.sku || obj.mpn);
        }
        if (obj.quantity || obj.qty) {
          setIssueQty(Number(obj.quantity || obj.qty));
        }
      } catch {}
    }

    let candidateSku = cleanCode;
    if (candidateSku.startsWith('1P') || candidateSku.startsWith('1p')) {
      candidateSku = candidateSku.slice(2);
    } else if (candidateSku.startsWith('P') && candidateSku.length > 4 && /[A-Z]/.test(candidateSku[1])) {
      candidateSku = candidateSku.slice(1);
    }

    const clean = candidateSku.replace(/[^\w\d-_.]/g, '').toUpperCase();
    if (!clean) return;

    setLastBarcodeFound(clean);
    setDetectedFormat(format === 'QR_CODE' ? 'QR_CODE' : 'BARCODE');

    // Look up part in catalog
    const match = parts.find((p) => p.partNumber === clean || (p.barcode && p.barcode.toUpperCase() === clean));
    if (match) {
      setSelectedPartNo(match.partNumber);
      setToastMessage(`✓ ${format === 'QR_CODE' ? 'QR Code' : 'Barcode'} matched: ${match.partNumber}. Stock on hand: ${match.availableStock}`);
    } else {
      setToastMessage(`Scanned ${format === 'QR_CODE' ? 'QR Code' : 'Barcode'}: ${clean} (Not in catalog)`);
    }
  };

  // Trigger Gemini AI Multimodal Vision Scan
  const captureAndScanOutward = async () => {
    if (!videoRef.current) return;
    setIsScanningAI(true);
    setErrorMessage(null);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCapturedImage(dataUrl);

        const res = await inventoryApi.scanOutward(dataUrl);
        processScanResults(res);
      }
    } catch (e: any) {
      setErrorMessage(e.message || 'Outward AI scan failed');
    } finally {
      setIsScanningAI(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setCapturedImage(dataUrl);
      setIsScanningAI(true);
      setErrorMessage(null);

      // Attempt immediate client-side QR / Barcode detection on image
      try {
        const decoded = await decodeFromImageSource(dataUrl);
        if (decoded && decoded.text) {
          handleBarcodeDetected(decoded.text, decoded.format);
        }
      } catch {
        // Continue to Gemini outward parser
      }

      try {
        const res = await inventoryApi.scanOutward(dataUrl, file.type);
        processScanResults(res);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to scan image');
      } finally {
        setIsScanningAI(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const processScanResults = (res: any) => {
    if (!res || !res.items) return;
    setWorkOrderRef(res.workOrderNumber || 'WO-SCANNED');
    setScannedWorkOrderItems(res.items);

    const shortages = res.items.filter((i: OutwardScannedItem) => i.status === 'shortage');
    if (shortages.length > 0) {
      setToastMessage(
        `AI detected ${res.items.length} items. Warning: ${shortages.length} item(s) exceed available stock!`
      );
    } else {
      setToastMessage(`✓ AI detected ${res.items.length} items. All items in stock and ready to dispatch!`);
    }
  };

  // Simulate Work Order Sheet or Reel Scan
  const simulateOutwardScan = (type: 'work_order' | 'reel') => {
    if (type === 'work_order') {
      const items: OutwardScannedItem[] = [
        {
          partNumber: 'CRCW06031K00FKEA',
          quantity: 200,
          notes: 'LED current limiting R1-R20',
          availableStock: parts.find((p) => p.partNumber === 'CRCW06031K00FKEA')?.availableStock || 800,
          location: 'STR1S1B2',
          unitPrice: 0.015,
          status: 'ok',
        },
        {
          partNumber: 'CL21B104KBCNNNC',
          quantity: 300,
          notes: 'Decoupling MLCC C1-C15',
          availableStock: parts.find((p) => p.partNumber === 'CL21B104KBCNNNC')?.availableStock || 3600,
          location: 'STR1S2B1',
          unitPrice: 0.024,
          status: 'ok',
        },
        {
          partNumber: 'VLS3012ET-100M',
          quantity: 600, // will trigger shortage alert against 450 stock!
          notes: 'Buck switcher L1-L10',
          availableStock: parts.find((p) => p.partNumber === 'VLS3012ET-100M')?.availableStock || 450,
          location: 'STR2S1B1',
          unitPrice: 0.28,
          status: 'shortage',
        },
      ];
      setWorkOrderRef('WO-2026-8802');
      setScannedWorkOrderItems(items);
      setToastMessage('Simulated Work Order Sheet scan: 3 items detected with automatic stock control!');
    } else {
      const match = parts.find((p) => p.partNumber === 'RC0805FR-0710KL') || parts[0];
      const items: OutwardScannedItem[] = [
        {
          partNumber: match.partNumber,
          quantity: 250,
          notes: 'Reel pull for SMT Line 1',
          availableStock: match.availableStock,
          location: match.location,
          unitPrice: match.avgUnitPrice,
          status: 'ok',
        },
      ];
      setWorkOrderRef('REEL-PICK');
      setScannedWorkOrderItems(items);
      setToastMessage(`Simulated Reel Scan: ${match.partNumber} (${items[0].quantity} units)`);
    }
  };

  // Add all verified AI-scanned items to the dispatch queue
  const handleQueueAllScannedItems = () => {
    const validItems: DispatchItem[] = [];
    let skipped = 0;

    for (const item of scannedWorkOrderItems) {
      if (item.status === 'shortage' || item.status === 'not_found') {
        skipped++;
        continue;
      }
      validItems.push({
        id: `scanned-${Date.now()}-${Math.random()}`,
        partNumber: item.partNumber,
        quantity: item.quantity,
        location: item.location,
        availableStock: item.availableStock,
        unitPrice: item.unitPrice,
        movementType: 'OUT',
        notes: `${workOrderRef ? `[${workOrderRef}] ` : ''}${item.notes || 'AI Verified Dispatch'}`,
      });
    }

    if (validItems.length > 0) {
      setQueue([...queue, ...validItems]);
      setToastMessage(
        `Added ${validItems.length} verified items to dispatch queue.${
          skipped > 0 ? ` (${skipped} shortage item(s) skipped to prevent over-issue)` : ''
        }`
      );
      setScannedWorkOrderItems([]);
    } else {
      setErrorMessage('Cannot queue items: All scanned items have stock shortages or are not found.');
    }
  };

  // ---------------------------------------------------------------------------
  // Manual & Batch Dispatch Submission
  // ---------------------------------------------------------------------------
  const handleAddToQueue = () => {
    if (!currentPart) return;
    const qty = Number(issueQty);
    if (!qty || qty <= 0) {
      setErrorMessage('Please specify a positive issue quantity.');
      return;
    }

    const alreadyInQueue = queue
      .filter((q) => q.partNumber === currentPart.partNumber)
      .reduce((acc, q) => acc + q.quantity, 0);

    if (alreadyInQueue + qty > currentPart.availableStock) {
      setErrorMessage(
        `Over-issue error: Total requested in queue (${alreadyInQueue + qty}) exceeds available stock (${currentPart.availableStock}) for ${currentPart.partNumber}.`
      );
      return;
    }

    const newItem: DispatchItem = {
      id: `queue-${Date.now()}-${Math.random()}`,
      partNumber: currentPart.partNumber,
      quantity: qty,
      location: currentPart.location,
      availableStock: currentPart.availableStock,
      unitPrice: currentPart.avgUnitPrice,
      movementType,
      notes,
    };

    setQueue([...queue, newItem]);
    setErrorMessage(null);
    setToastMessage(`Added ${qty} units of ${currentPart.partNumber} to dispatch queue.`);
  };

  const handleRemoveFromQueue = (id: string) => {
    setQueue(queue.filter((q) => q.id !== id));
  };

  const handleSingleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPart) return;
    const qty = Number(issueQty);

    if (!qty || qty <= 0) {
      setErrorMessage('Please enter a valid quantity.');
      return;
    }

    if (qty > currentPart.availableStock) {
      setErrorMessage(
        `Strict Over-Issue Guard: Requested quantity (${qty}) exceeds available stock (${currentPart.availableStock}).`
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await inventoryApi.recordOutward({
        partNumber: currentPart.partNumber,
        quantity: qty,
        location: currentPart.location,
        personName,
        movementType,
        notes,
      });

      setToastMessage(
        `✓ Dispatched ${qty} units of ${currentPart.partNumber} to ${personName}. Valued at $${(qty * currentPart.avgUnitPrice).toFixed(2)}.`
      );
      onSuccess(res.part);
      setIssueQty(50);
    } catch (err: any) {
      setErrorMessage(err.message || 'Outward dispatch failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBatchDispatch = async () => {
    if (queue.length === 0) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      for (const item of queue) {
        const res = await inventoryApi.recordOutward({
          partNumber: item.partNumber,
          quantity: item.quantity,
          location: item.location,
          personName,
          movementType: item.movementType,
          notes: item.notes,
        });
        onSuccess(res.part);
      }

      setToastMessage(`✓ Successfully executed batch dispatch of ${queue.length} items!`);
      setQueue([]);
    } catch (err: any) {
      setErrorMessage(err.message || 'Batch dispatch failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <ArrowUpRight className="w-5 h-5 text-blue-600" />
            <span>Outward Stock Issuance & AI Dispatch</span>
          </h2>
          <p className="text-xs text-slate-500">
            Real-time automated stock verification with camera inspection of reels and work order pick lists
          </p>
        </div>

        {/* Dispatch Mode Selector */}
        <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setDispatchMode('ai_scanner')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              dispatchMode === 'ai_scanner'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Camera className="w-3.5 h-3.5 text-blue-600" />
            <span>AI Camera Scanner</span>
          </button>
          <button
            type="button"
            onClick={() => setDispatchMode('manual')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              dispatchMode === 'manual'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Manual SKU Picker</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {toastMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-2.5 rounded-md flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-emerald-600 font-bold ml-4">
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
        {/* Left Column: AI Camera Scanner OR Manual Dispatch Form */}
        <div className="lg:col-span-7 space-y-4">
          {dispatchMode === 'ai_scanner' ? (
            /* AI Camera & Work Order Scanner View */
            <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <span className="text-sm font-bold text-slate-900 tracking-tight flex items-center space-x-1.5">
                  <Camera className="w-4 h-4 text-blue-600" />
                  <span>Outward AI Scanner (Reel Barcodes & Work Order Sheets)</span>
                </span>

                {/* Simulator Presets */}
                <div className="flex items-center space-x-1.5 text-xs">
                  <span className="text-slate-400 font-medium">Test:</span>
                  <button
                    type="button"
                    onClick={() => simulateOutwardScan('work_order')}
                    className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-[11px] border border-blue-200 hover:bg-blue-100"
                    title="Simulate multi-item printed work order pick list"
                  >
                    Work Order Sheet
                  </button>
                  <button
                    type="button"
                    onClick={() => simulateOutwardScan('reel')}
                    className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] hover:bg-slate-200"
                    title="Simulate single reel label scan"
                  >
                    Reel Scan
                  </button>
                </div>
              </div>

              {/* Camera Viewfinder */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                    <QrCode className="w-4 h-4 text-blue-600" />
                    <span>Live QR & Barcode Camera</span>
                  </span>

                  <div className="flex items-center space-x-1.5">
                    {isCameraActive && (
                      <>
                        <button
                          type="button"
                          onClick={toggleCameraFacing}
                          className="inline-flex items-center space-x-1 px-2 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
                          title="Flip camera"
                        >
                          <FlipHorizontal className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Flip</span>
                        </button>

                        {hasTorch && (
                          <button
                            type="button"
                            onClick={handleToggleTorch}
                            className={`inline-flex items-center space-x-1 px-2 py-1 text-xs font-medium rounded border ${
                              isTorchOn
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                            }`}
                            title="Toggle Torch"
                          >
                            <Zap className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">{isTorchOn ? 'Torch On' : 'Torch'}</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={stopCamera}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded border border-red-200"
                        >
                          <VideoOff className="w-3.5 h-3.5" />
                          <span>Stop</span>
                        </button>
                      </>
                    )}

                    {!isCameraActive && (
                      <button
                        type="button"
                        onClick={() => startCamera()}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Open Camera</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Video Viewport Container: Persistent video ensures videoRef.current is never null */}
                <div className="relative w-full aspect-16/9 bg-slate-900 rounded-md overflow-hidden flex items-center justify-center border border-slate-300">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${isCameraActive ? 'block' : 'hidden'}`}
                  />

                  {isCameraActive && (
                    <>
                      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                        <div className="w-64 h-36 border-2 border-emerald-400 rounded-lg relative flex items-center justify-center shadow-lg overflow-hidden">
                          <div className="absolute top-0 left-0 w-4 h-4 border-t-3 border-l-3 border-emerald-400" />
                          <div className="absolute top-0 right-0 w-4 h-4 border-t-3 border-r-3 border-emerald-400" />
                          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-3 border-l-3 border-emerald-400" />
                          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-3 border-r-3 border-emerald-400" />
                          <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_#34d399] animate-bounce" />
                          <span className="text-[10px] text-white/95 bg-black/70 px-2 py-0.5 rounded font-mono backdrop-blur-xs">
                            Align QR Code, Barcode, or Reel
                          </span>
                        </div>
                        <div className="mt-2.5 flex items-center space-x-2 bg-black/60 px-3 py-1 rounded-full text-[11px] text-emerald-300 font-mono">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          <span>Continuous QR & Barcode Detection Active</span>
                        </div>
                      </div>
                    </>
                  )}

                  {!isCameraActive && (
                    <div className="text-center p-6 text-slate-400 z-10">
                      {capturedImage ? (
                        <div className="space-y-2">
                          <img
                            src={capturedImage}
                            alt="Captured Work Order"
                            className="max-h-48 max-w-full rounded object-contain mx-auto shadow-md"
                          />
                          <p className="text-[11px] text-slate-300">Snapped frame displayed above</p>
                        </div>
                      ) : (
                        <>
                          <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-2 text-slate-400 border border-slate-700">
                            <Camera className="w-7 h-7" />
                          </div>
                          <p className="text-sm font-semibold text-slate-200">Camera inactive</p>
                          <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                            Point camera at component bag, reel barcode, or QR code to auto-populate
                          </p>
                          <button
                            type="button"
                            onClick={() => startCamera()}
                            className="mt-3 inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded text-xs font-semibold shadow-xs"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Open Live Camera</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  <canvas ref={canvasRef} className="hidden" />
                </div>

                {cameraError && (
                  <div className="p-3 bg-amber-50 rounded-md border border-amber-200 text-xs text-amber-900 flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold">Camera Access Note</p>
                      <p>{cameraError}</p>
                    </div>
                  </div>
                )}

                {/* Scan Action Controls */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={captureAndScanOutward}
                    disabled={!isCameraActive || isScanningAI}
                    className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 text-xs font-semibold rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-xs"
                  >
                    {isScanningAI ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying with AI...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-blue-200" />
                        <span>Snap & AI Inspect</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isScanningAI}
                    className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 text-xs font-medium rounded-md text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 text-slate-500" />
                    <span>Upload Pick Sheet / Photo</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Scanned Items with Automated Stock Control */}
              {scannedWorkOrderItems.length > 0 && (
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span>
                        AI Detected Items & Stock Control ({scannedWorkOrderItems.length})
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={handleQueueAllScannedItems}
                      className="px-3 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow-xs"
                    >
                      + Add Verified Items to Dispatch Queue
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-md overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 font-mono">
                          <th className="py-2 px-3">Part #</th>
                          <th className="py-2 px-3">Req Qty</th>
                          <th className="py-2 px-3">Bin Loc</th>
                          <th className="py-2 px-3 text-right">Avail Stock</th>
                          <th className="py-2 px-3 text-right">Est. Cost</th>
                          <th className="py-2 px-3 text-center">Stock Control</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {scannedWorkOrderItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-bold text-blue-600">
                              {item.partNumber}
                              {item.notes && (
                                <span className="block text-[10px] text-slate-400 font-sans font-normal truncate max-w-[140px]">
                                  {item.notes}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-bold text-slate-900">{item.quantity}</td>
                            <td className="py-2 px-3 text-slate-600">{item.location}</td>
                            <td className="py-2 px-3 text-right tabular-nums text-slate-800">
                              {item.availableStock.toLocaleString()}
                            </td>
                            <td className="py-2 px-3 text-right tabular-nums text-slate-700">
                              {formatINR(item.quantity * item.unitPrice)}
                            </td>
                            <td className="py-2 px-3 text-center font-sans">
                              {item.status === 'ok' ? (
                                <span className="inline-flex items-center text-emerald-700 font-semibold text-[11px]">
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-0.5 text-emerald-600" />
                                  Ready
                                </span>
                              ) : item.status === 'shortage' ? (
                                <span className="inline-flex items-center text-red-600 font-bold text-[11px]">
                                  <AlertTriangle className="w-3.5 h-3.5 mr-0.5 text-red-600" />
                                  Shortage
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[11px]">Not Found</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Manual Part Picker Form */
            <form
              onSubmit={handleSingleDispatch}
              className="bg-white rounded-lg border border-slate-200 p-5 shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <span className="text-sm font-bold text-slate-900 tracking-tight flex items-center space-x-1.5">
                  <Package className="w-4 h-4 text-blue-600" />
                  <span>Manual Component Dispatch</span>
                </span>
                <span className="text-[11px] font-mono text-slate-400">Over-Issue Protection Active</span>
              </div>

              {/* Part Selection */}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-700">
                  Select Inventory Component <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Filter part # or value..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-t-md font-mono focus:bg-white focus:outline-hidden"
                  />
                </div>
                <select
                  size={4}
                  value={selectedPartNo}
                  onChange={(e) => setSelectedPartNo(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-white border border-t-0 border-slate-300 rounded-b-md focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                >
                  {matchingParts.map((p) => (
                    <option key={p.id} value={p.partNumber} className="py-1">
                      {p.partNumber} · {p.technicalSpecs?.value || p.category} · Stock: {p.availableStock} (Bin: {p.location})
                    </option>
                  ))}
                </select>
              </div>

              {/* Live Info Box */}
              {currentPart && (
                <div className="p-3.5 rounded-md bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block font-medium">Value & Package</span>
                    <span className="font-semibold text-slate-800 font-mono">
                      {currentPart.technicalSpecs?.value || currentPart.category}
                    </span>
                    <span className="text-slate-500 block text-[11px] font-mono">
                      {currentPart.technicalSpecs?.packageFootprint}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block font-medium">Assigned Location</span>
                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded font-mono font-bold text-xs bg-white text-slate-800 border border-slate-300">
                      {currentPart.location}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block font-medium">Available Stock</span>
                    <span className="font-mono tabular-nums font-bold text-base text-slate-900">
                      {currentPart.availableStock.toLocaleString()}
                    </span>
                    {currentPart.availableStock <= currentPart.minReorderQty && (
                      <span className="text-[10px] text-amber-600 block font-medium">Below Min ({currentPart.minReorderQty})</span>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block font-medium">Running Avg Cost</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-800">
                      {formatINR(currentPart.avgUnitPrice, 3)}
                    </span>
                    <span className="text-[10px] text-slate-400 block font-mono">/ unit</span>
                  </div>
                </div>
              )}

              {/* Row 2: Movement Type & Quantity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Movement Classification
                  </label>
                  <select
                    value={movementType}
                    onChange={(e) => setMovementType(e.target.value as MovementType)}
                    className="w-full px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-hidden"
                  >
                    <option value="OUT">Standard Stock Out (Assembly)</option>
                    <option value="RETURN">Project Allocation / Transfer</option>
                    <option value="LOSS">Defective / Damaged Scrap</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1 flex items-center justify-between">
                    <span>Dispatch Quantity <span className="text-red-500">*</span></span>
                    {currentPart && (
                      <span className="text-[10px] font-mono text-slate-500">
                        Max: {currentPart.availableStock}
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={currentPart?.availableStock || 999999}
                    value={issueQty}
                    onChange={(e) => setIssueQty(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                    className={`w-full px-3 py-2 text-sm font-mono font-bold rounded-md border focus:outline-hidden ${
                      isOverIssue
                        ? 'border-red-500 bg-red-50 text-red-900 focus:ring-red-500'
                        : 'border-slate-300 bg-white focus:ring-2 focus:ring-blue-500'
                    }`}
                  />
                  {isOverIssue && (
                    <span className="text-[11px] text-red-600 mt-1 block font-medium">
                      Over-issue alert: Exceeds available stock by {Number(issueQty) - (currentPart?.availableStock || 0)} units!
                    </span>
                  )}
                </div>
              </div>

              {/* Buttons */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleAddToQueue}
                  disabled={isOverIssue || !issueQty}
                  className="inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md disabled:opacity-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add to Dispatch Queue</span>
                </button>

                <button
                  type="submit"
                  disabled={isOverIssue || !issueQty || isSubmitting}
                  className="inline-flex items-center space-x-2 px-5 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs disabled:opacity-50 transition-colors"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>Submit Direct Dispatch</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right Column: Dispatch Queue & Common Recipient Info */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Dispatch Queue ({queue.length})
                </span>
              </div>
              {queue.length > 0 && (
                <button onClick={() => setQueue([])} className="text-[11px] text-red-600 hover:underline">
                  Clear All
                </button>
              )}
            </div>

            {/* Recipient Operator info for the batch */}
            <div className="space-y-2 p-2.5 rounded bg-slate-50 border border-slate-200 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                  Issued To / Recipient Operator
                </label>
                <input
                  type="text"
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-0.5">
                  Batch Reference / Work Order
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded"
                />
              </div>
            </div>

            {queue.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <p className="text-xs">Queue is currently empty.</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Scan work order sheets on the left or select parts manually to add items to this dispatch batch.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {queue.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-900 block">{item.partNumber}</span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {item.quantity} units · Loc: {item.location} · {formatINR(item.quantity * item.unitPrice)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFromQueue(item.id)}
                      className="p-1 text-slate-400 hover:text-red-600"
                      title="Remove item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {queue.length > 0 && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex justify-between text-xs font-medium text-slate-700">
                  <span>Total Items in Batch:</span>
                  <span className="font-mono font-bold">{queue.reduce((acc, q) => acc + q.quantity, 0)} units</span>
                </div>
                <div className="flex justify-between text-xs font-medium text-slate-700">
                  <span>Total Dispatch Valuation:</span>
                  <span className="font-mono font-bold text-blue-700">
                    {formatINR(queue.reduce((acc, q) => acc + q.quantity * q.unitPrice, 0))}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleBatchDispatch}
                  disabled={isSubmitting}
                  className="w-full mt-2 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md shadow-xs transition-colors flex items-center justify-center space-x-1.5"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>Execute Entire Batch Dispatch</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
