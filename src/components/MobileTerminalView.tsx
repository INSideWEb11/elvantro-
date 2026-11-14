import React, { useState, useRef, useEffect } from 'react';
import {
  Smartphone,
  Camera,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Radio,
  SlidersHorizontal,
  RotateCcw,
  FlipHorizontal,
  Package,
  Boxes,
  ExternalLink,
  ChevronRight,
  X,
  Upload,
  Image as ImageIcon,
  Sparkles,
  FileText,
  Tag,
  Building,
} from 'lucide-react';
import { Part, StorageLocation, AIScanResult, ComponentCategory } from '../types/inventory';
import { inventoryApi } from '../services/api';
import {
  initializeCameraStream,
  LiveScannerEngine,
  toggleTorch,
  decodeFromImageSource,
  ScanDetectionResult,
} from '../utils/scannerEngine';
import { formatINR } from '../utils/currency';
import { compressImageFile } from '../utils/imageCompressor';

interface MobileTerminalViewProps {
  terminalId: string;
  parts: Part[];
  locations: StorageLocation[];
  onRefreshInventory: () => void;
  onSwitchToFullWeb: () => void;
}

export const MobileTerminalView: React.FC<MobileTerminalViewProps> = ({
  terminalId,
  parts,
  locations,
  onRefreshInventory,
  onSwitchToFullWeb,
}) => {
  const [activeMode, setActiveMode] = useState<'scan' | 'inward' | 'outward' | 'browse'>('scan');
  const [scannerSubMode, setScannerSubMode] = useState<'barcode' | 'ai_ocr'>('barcode');
  const [pushToDesktop, setPushToDesktop] = useState(true);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  // Active scanned part & AI OCR state
  const [scannedPart, setScannedPart] = useState<Part | null>(null);
  const [lastRawCode, setLastRawCode] = useState<string | null>(null);
  const [lastScanFormat, setLastScanFormat] = useState<string | null>(null);
  const [aiScanResult, setAiScanResult] = useState<AIScanResult | null>(null);
  const [isAiScanning, setIsAiScanning] = useState(false);
  const [selectedPhotoPreview, setSelectedPhotoPreview] = useState<string | null>(null);

  // Quick Action form state
  const [actionQty, setActionQty] = useState(100);
  const [actionLocation, setActionLocation] = useState('STR1S1B1');
  const [actionPrice, setActionPrice] = useState(0.45);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Search filter for Browse mode
  const [searchQuery, setSearchQuery] = useState('');

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerEngineRef = useRef<LiveScannerEngine | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Auto-pair terminal session on mount
  useEffect(() => {
    inventoryApi.pairTerminal(terminalId, 'Android Companion Scanner', 'Android');
  }, [terminalId]);

  // Start Camera
  const startCamera = async (targetFacing?: 'environment' | 'user') => {
    try {
      setCameraError(null);
      if (!videoRef.current) return;

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (scannerEngineRef.current) {
        scannerEngineRef.current.stop();
        scannerEngineRef.current = null;
      }

      const facing = targetFacing || facingMode;
      const res = await initializeCameraStream(videoRef.current, facing);
      streamRef.current = res.stream;
      setHasTorch(res.hasTorch);
      setFacingMode(res.activeFacingMode);
      setIsCameraActive(true);

      // Only start continuous barcode decoding loop if in barcode sub-mode
      if (scannerSubMode === 'barcode') {
        const engine = new LiveScannerEngine((result: ScanDetectionResult) => {
          handleCodeDetected(result.text, result.format);
        }, 1800);

        scannerEngineRef.current = engine;
        engine.start(videoRef.current);
      }
    } catch (err: any) {
      setCameraError(err.message || 'Camera access denied or unavailable.');
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
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    await startCamera(next);
  };

  const handleToggleTorch = async () => {
    const nextState = !isTorchOn;
    const ok = await toggleTorch(streamRef.current, nextState);
    if (ok) setIsTorchOn(nextState);
  };

  // Start/stop camera on tab or sub-mode switch
  useEffect(() => {
    if (activeMode === 'scan') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [activeMode, scannerSubMode]);

  // Handle scanned barcode/QR code
  const handleCodeDetected = async (code: string, format: string) => {
    let clean = code.trim().toUpperCase();

    // Check JSON QR
    if (clean.startsWith('{') && clean.endsWith('}')) {
      try {
        const obj = JSON.parse(clean);
        clean = String(obj.partNumber || obj.pn || obj.sku || obj.mpn || clean).toUpperCase();
      } catch {}
    }
    if (clean.startsWith('1P')) clean = clean.slice(2);

    const sanitized = clean.replace(/[^\w\d-_.]/g, '');
    if (!sanitized) return;

    setLastRawCode(sanitized);
    setLastScanFormat(format);

    // Find in catalog
    const matched = parts.find(
      (p) => p.partNumber.toUpperCase() === sanitized || (p.barcode && p.barcode.toUpperCase() === sanitized)
    );

    if (matched) {
      setScannedPart(matched);
      setActionLocation(matched.location);
      setActionPrice(matched.avgUnitPrice);
      setStatusMessage(`Found in Catalog: ${matched.partNumber} (${matched.availableStock} in stock)`);
    } else {
      setScannedPart(null);
      setActionLocation('STR1S1B1');
      setActionPrice(0.45);
      setStatusMessage(`Scanned new code: ${sanitized}`);
    }

    // Push to Desktop if enabled
    if (pushToDesktop) {
      await inventoryApi.pushTerminalScan(terminalId, sanitized, format);
    }
  };

  // ---------------------------------------------------------------------------
  // GALLERY PHOTO UPLOAD & OCR PROCESSING
  // ---------------------------------------------------------------------------
  const handleGalleryFileSelect = async (file: File) => {
    if (!file) return;

    try {
      setIsAiScanning(true);
      setStatusMessage(`Compressing & reading photo "${file.name}"...`);

      // 1. Client-side downscaling & compression
      const compressed = await compressImageFile(file, 1400, 0.82);
      setSelectedPhotoPreview(compressed.base64);

      if (scannerSubMode === 'barcode') {
        // Try decoding QR or barcode from image
        try {
          const barcodeRes = await decodeFromImageSource(compressed.base64);
          if (barcodeRes && barcodeRes.text) {
            handleCodeDetected(barcodeRes.text, barcodeRes.format);
            setStatusMessage(`✓ Decoded ${barcodeRes.format} from gallery photo: ${barcodeRes.text}`);
            setIsAiScanning(false);
            return;
          }
        } catch {
          // No barcode detected, switch to AI OCR
        }

        // If no barcode was found in barcode mode, offer automatic AI OCR
        setStatusMessage(`No barcode detected. Analyzing label text via AI Vision OCR...`);
      }

      // 2. Multimodal AI Vision OCR
      const ocrRes = await inventoryApi.scanReelLabel(compressed.base64, 'image/jpeg', file.name);
      const data = ocrRes.data;

      if (data && data.partNumber) {
        setAiScanResult(data);
        setLastRawCode(data.partNumber);
        setLastScanFormat('AI OCR');
        setActionLocation(data.suggestedLocation || 'STR1S1B1');
        setActionQty(data.quantity || 1000);
        setActionPrice(data.unitPrice || 0.45);

        // Check if part exists in catalog
        const matched = parts.find((p) => p.partNumber.toUpperCase() === data.partNumber.toUpperCase());
        if (matched) {
          setScannedPart(matched);
        } else {
          setScannedPart(null);
        }

        setStatusMessage(`✓ AI OCR detected: ${data.partNumber} (${data.category})`);

        if (pushToDesktop) {
          await inventoryApi.pushTerminalScan(terminalId, data.partNumber, 'AI_OCR_LABEL');
        }
      }
    } catch (err: any) {
      setStatusMessage(`❌ Error reading photo: ${err.message}`);
    } finally {
      setIsAiScanning(false);
    }
  };

  // Capture frame from active live video for AI OCR
  const handleSnapLiveCameraOcr = async () => {
    if (!videoRef.current) return;
    try {
      setIsAiScanning(true);
      setStatusMessage('Capturing camera frame and analyzing label text...');

      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(video.videoWidth || 1280, 1400);
      canvas.height = Math.round((canvas.width * (video.videoHeight || 720)) / (video.videoWidth || 1280));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.85);
      setSelectedPhotoPreview(base64);

      const ocrRes = await inventoryApi.scanReelLabel(base64, 'image/jpeg', 'camera_snap.jpg');
      const data = ocrRes.data;

      if (data && data.partNumber) {
        setAiScanResult(data);
        setLastRawCode(data.partNumber);
        setLastScanFormat('AI OCR');
        setActionLocation(data.suggestedLocation || 'STR1S1B1');
        setActionQty(data.quantity || 1000);
        setActionPrice(data.unitPrice || 0.45);

        const matched = parts.find((p) => p.partNumber.toUpperCase() === data.partNumber.toUpperCase());
        if (matched) {
          setScannedPart(matched);
        } else {
          setScannedPart(null);
        }

        setStatusMessage(`✓ AI OCR detected: ${data.partNumber} (${data.category})`);

        if (pushToDesktop) {
          await inventoryApi.pushTerminalScan(terminalId, data.partNumber, 'AI_CAMERA_LABEL');
        }
      }
    } catch (err: any) {
      setStatusMessage(`❌ Frame capture error: ${err.message}`);
    } finally {
      setIsAiScanning(false);
    }
  };

  // Quick Inward Action
  const handleExecuteInward = async () => {
    if (!lastRawCode && !scannedPart) return;
    const partNo = scannedPart ? scannedPart.partNumber : lastRawCode!;
    setIsSubmitting(true);
    try {
      await inventoryApi.recordInward({
        partNumber: partNo,
        category: aiScanResult?.category || scannedPart?.category || 'Resistor',
        description: aiScanResult
          ? `${aiScanResult.makeBrand || ''} ${aiScanResult.technicalSpecs?.value || ''} ${partNo}`.trim()
          : scannedPart?.description || `${partNo} Component`,
        quantity: actionQty,
        unitPrice: actionPrice || scannedPart?.avgUnitPrice || 0.45,
        location: actionLocation,
        personName: 'Android Mobile Terminal',
        notes: `Mobile terminal receipt (${terminalId}) ${lastScanFormat ? `[${lastScanFormat}]` : ''}`,
      });
      onRefreshInventory();
      setStatusMessage(`✅ Inward completed: +${actionQty} for ${partNo} at ${formatINR(actionPrice)}`);
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (e: any) {
      setStatusMessage(`❌ Error: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Outward Action
  const handleExecuteOutward = async () => {
    if (!scannedPart) {
      setStatusMessage('Please select or scan an existing catalog component first.');
      return;
    }
    if (scannedPart.availableStock < actionQty) {
      setStatusMessage(`❌ Insufficient stock (${scannedPart.availableStock} available).`);
      return;
    }

    setIsSubmitting(true);
    try {
      await inventoryApi.recordOutward({
        partNumber: scannedPart.partNumber,
        quantity: actionQty,
        personName: 'Android Mobile Terminal',
        purpose: 'Production / Lab Dispatch',
        notes: `Dispatched via Android scanner (${terminalId})`,
      });
      onRefreshInventory();
      setStatusMessage(`✅ Outward completed: -${actionQty} for ${scannedPart.partNumber}`);
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (e: any) {
      setStatusMessage(`❌ Error: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter parts for Browse mode
  const filteredParts = parts.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.partNumber.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.location.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col font-sans pb-16">
      {/* Hidden file input for mobile photo gallery */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleGalleryFileSelect(e.target.files[0]);
          }
        }}
        className="hidden"
      />

      {/* Top Header */}
      <header className="bg-slate-950 border-b border-slate-800 px-4 py-3 sticky top-0 z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <h1 className="font-bold text-sm tracking-tight text-white">ELENTORY MOBILE</h1>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <p className="text-[10px] font-mono text-slate-400">
                TERMINAL: <strong className="text-blue-400">{terminalId}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onRefreshInventory}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 border border-slate-700"
              title="Refresh Sync"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onSwitchToFullWeb}
              className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg flex items-center space-x-1"
            >
              <span>Full ERP</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </button>
          </div>
        </div>
      </header>

      {/* Sync bar */}
      <div className="bg-slate-850 border-b border-slate-800 px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-1.5 text-slate-300">
          <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span className="text-[11px]">Real-Time Desktop Push:</span>
        </div>
        <button
          type="button"
          onClick={() => setPushToDesktop(!pushToDesktop)}
          className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
            pushToDesktop ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}
        >
          {pushToDesktop ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div className="bg-blue-600/90 text-white px-4 py-2 text-xs flex items-center justify-between animate-in fade-in">
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage(null)} className="text-white font-bold ml-2">
            ×
          </button>
        </div>
      )}

      {/* Main Mode View */}
      <div className="flex-1 p-4 max-w-lg mx-auto w-full space-y-4">
        {/* CAMERA SCANNER TAB */}
        {activeMode === 'scan' && (
          <div className="space-y-3">
            {/* SUB-MODE SWITCHER: Live Barcode vs AI OCR */}
            <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setScannerSubMode('barcode');
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition-all ${
                  scannerSubMode === 'barcode'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Live Barcode / QR</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setScannerSubMode('ai_ocr');
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 transition-all ${
                  scannerSubMode === 'ai_ocr'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>AI Label & Component OCR</span>
              </button>
            </div>

            {/* Viewfinder Card */}
            <div className="relative rounded-2xl overflow-hidden bg-black border border-slate-800 aspect-video max-h-72 flex items-center justify-center shadow-2xl">
              <video
                ref={videoRef}
                className={`w-full h-full object-cover ${isCameraActive ? 'block' : 'hidden'}`}
                playsInline
                autoPlay
                muted
              />

              {/* Viewfinder target box */}
              {isCameraActive && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                  <div
                    className={`w-60 h-36 border-2 rounded-xl relative flex items-center justify-center ${
                      scannerSubMode === 'barcode'
                        ? 'border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]'
                        : 'border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
                    }`}
                  >
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-current" />
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-current" />
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-current" />
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-current" />
                    <div
                      className={`absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent ${
                        scannerSubMode === 'barcode'
                          ? 'via-emerald-400 shadow-[0_0_8px_#34d399]'
                          : 'via-purple-400 shadow-[0_0_8px_#c084fc]'
                      } to-transparent animate-pulse`}
                    />
                    <span className="text-[10px] text-white font-mono bg-black/75 px-2.5 py-0.5 rounded backdrop-blur-xs">
                      {scannerSubMode === 'barcode' ? 'Target QR or Barcode' : 'Align Component Label / Reel Text'}
                    </span>
                  </div>
                </div>
              )}

              {/* Inactive fallback */}
              {!isCameraActive && (
                <div className="text-center p-6 text-slate-400 z-10">
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-2 text-slate-400 border border-slate-700">
                    <Camera className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-semibold text-slate-200">Camera Paused</p>
                  <button
                    type="button"
                    onClick={() => startCamera()}
                    className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                  >
                    Activate Camera
                  </button>
                </div>
              )}

              {cameraError && (
                <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-4 text-center text-red-400 text-xs z-20">
                  <AlertTriangle className="w-8 h-8 mb-2" />
                  <span>{cameraError}</span>
                  <button
                    type="button"
                    onClick={() => startCamera()}
                    className="mt-3 px-3 py-1 bg-red-600 text-white rounded text-xs"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* AI Scanning Spinner Overlay */}
              {isAiScanning && (
                <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center p-4 text-center text-blue-300 text-xs z-30 backdrop-blur-xs">
                  <RefreshCw className="w-8 h-8 animate-spin text-blue-400 mb-2" />
                  <p className="font-bold">Multimodal AI OCR Processing...</p>
                  <p className="text-[11px] text-slate-400">Extracting component label, MPN, specs, and price in INR (₹)</p>
                </div>
              )}
            </div>

            {/* Mobile Scan & Upload Actions Bar */}
            <div className="grid grid-cols-2 gap-2">
              {/* BUTTON A: Choose from Phone Gallery */}
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                disabled={isAiScanning}
                className="py-2.5 px-3 bg-slate-800 hover:bg-slate-750 active:bg-slate-700 border border-slate-700 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all shadow-xs"
              >
                <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Gallery Photo</span>
              </button>

              {/* BUTTON B: Mode Action (Snap frame in OCR mode, or Lens Flip in Barcode mode) */}
              {scannerSubMode === 'ai_ocr' ? (
                <button
                  type="button"
                  onClick={handleSnapLiveCameraOcr}
                  disabled={isAiScanning || !isCameraActive}
                  className="py-2.5 px-3 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all shadow-md disabled:opacity-50"
                >
                  <Camera className="w-4 h-4 shrink-0" />
                  <span>Snap & OCR Label</span>
                </button>
              ) : (
                <div className="flex items-center space-x-1.5">
                  {hasTorch && (
                    <button
                      type="button"
                      onClick={handleToggleTorch}
                      className={`p-2.5 rounded-xl border text-xs font-semibold transition-colors flex-1 flex items-center justify-center ${
                        isTorchOn
                          ? 'bg-amber-500 text-slate-900 border-amber-400'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                      title="Torch"
                    >
                      <Zap className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={toggleCameraFacing}
                    className="p-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 rounded-xl transition-colors flex-1 flex items-center justify-center"
                    title="Flip Camera"
                  >
                    <FlipHorizontal className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* AI OCR RESULT DETAILS CARD (NEW!) */}
            {aiScanResult && (
              <div className="bg-gradient-to-br from-slate-800 via-purple-950/30 to-slate-800 rounded-2xl p-4 border border-purple-500/40 space-y-3 shadow-xl animate-in fade-in">
                <div className="flex items-center justify-between border-b border-purple-500/30 pb-2">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wider">
                      AI Label OCR Extraction
                    </span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-bold border border-purple-500/30">
                    {aiScanResult.category}
                  </span>
                </div>

                <div>
                  <h4 className="font-mono font-bold text-base text-white">{aiScanResult.partNumber}</h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {aiScanResult.makeBrand || 'Component'} · {aiScanResult.technicalSpecs?.value || ''}{' '}
                    {aiScanResult.technicalSpecs?.packageFootprint ? `[${aiScanResult.technicalSpecs.packageFootprint}]` : ''}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 bg-slate-900/80 p-2.5 rounded-xl border border-slate-750 text-center text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Reel Qty</span>
                    <span className="font-mono font-bold text-white text-sm">
                      {aiScanResult.quantity.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Storage Bin</span>
                    <span className="font-mono font-bold text-amber-400 text-sm">
                      {aiScanResult.suggestedLocation || 'STR1S1B1'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Unit Price (₹)</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {formatINR(aiScanResult.unitPrice, 4)}
                    </span>
                  </div>
                </div>

                {aiScanResult.rawOcrText && (
                  <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400 line-clamp-2">
                    OCR: {aiScanResult.rawOcrText}
                  </div>
                )}

                {/* Direct Actions on Scanned OCR Part */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setActionQty(aiScanResult.quantity || 1000);
                      setActionLocation(aiScanResult.suggestedLocation || 'STR1S1B1');
                      setActionPrice(aiScanResult.unitPrice || 0.45);
                      setActiveMode('inward');
                    }}
                    className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 shadow-sm"
                  >
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    <span>Receive (+Inward)</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await inventoryApi.pushTerminalScan(terminalId, aiScanResult.partNumber, 'AI_OCR');
                      setStatusMessage(`⚡ Relayed ${aiScanResult.partNumber} to Desktop ERP!`);
                    }}
                    className="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center space-x-1.5 shadow-sm"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Relay to Desktop</span>
                  </button>
                </div>
              </div>
            )}

            {/* Standard Barcode Detection Result Card */}
            {(lastRawCode || scannedPart) && !aiScanResult && (
              <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 space-y-3 shadow-lg">
                <div className="flex items-center justify-between border-b border-slate-700/80 pb-2.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                    Latest Detection ({lastScanFormat || 'CODE'})
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                    {lastRawCode}
                  </span>
                </div>

                {scannedPart ? (
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-sm text-white">{scannedPart.partNumber}</h4>
                        <p className="text-xs text-slate-400">{scannedPart.description}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        {scannedPart.category}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-slate-900/80 p-2.5 rounded-xl border border-slate-750 text-center text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Stock</span>
                        <span className="font-mono font-bold text-white text-sm">
                          {scannedPart.availableStock}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Location</span>
                        <span className="font-mono font-bold text-amber-400 text-sm">
                          {scannedPart.location}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Unit Price</span>
                        <span className="font-mono font-bold text-emerald-400 text-sm">
                          {formatINR(scannedPart.avgUnitPrice)}
                        </span>
                      </div>
                    </div>

                    {/* Quick action buttons */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setActionPrice(scannedPart.avgUnitPrice);
                          setActiveMode('inward');
                        }}
                        className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-1 shadow-xs"
                      >
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                        <span>Receive (+Stock)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveMode('outward');
                        }}
                        className="py-2 px-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-1 shadow-xs"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>Dispatch (-Stock)</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-amber-300">
                      Code is not yet in inventory catalog. You can receive it directly as a new SKU:
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveMode('inward')}
                      className="w-full py-2 px-3 bg-emerald-600 text-white rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5"
                    >
                      <ArrowDownLeft className="w-4 h-4" />
                      <span>Create & Inward "{lastRawCode}"</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* INWARD RECEIVING TAB */}
        {activeMode === 'inward' && (
          <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-4">
            <div className="flex items-center space-x-2 border-b border-slate-700 pb-3">
              <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold text-sm text-white">Quick Inward Receiving</h3>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Part Number</label>
                <input
                  type="text"
                  value={scannedPart ? scannedPart.partNumber : lastRawCode || ''}
                  onChange={(e) => setLastRawCode(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  placeholder="e.g. RC0805FR-0710KL"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Intake Quantity</label>
                  <input
                    type="number"
                    min={1}
                    value={actionQty}
                    onChange={(e) => setActionQty(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Unit Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={actionPrice}
                    onChange={(e) => setActionPrice(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Storage Location Bin</label>
                <select
                  value={actionLocation}
                  onChange={(e) => setActionLocation(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                >
                  {locations.slice(0, 36).map((loc) => (
                    <option key={loc.code} value={loc.code}>
                      {loc.code} (Rack {loc.rack}, Shelf {loc.shelf}, Bin {loc.box || 'Open'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  disabled={isSubmitting || (!lastRawCode && !scannedPart)}
                  onClick={handleExecuteInward}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center space-x-2 shadow-lg"
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  <span>{isSubmitting ? 'Recording Inward...' : `Confirm Intake of ${actionQty} Units`}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* OUTWARD DISPATCH TAB */}
        {activeMode === 'outward' && (
          <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-4">
            <div className="flex items-center space-x-2 border-b border-slate-700 pb-3">
              <ArrowUpRight className="w-5 h-5 text-blue-400" />
              <h3 className="font-bold text-sm text-white">Quick Outward Dispatch</h3>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Target Component</label>
                {scannedPart ? (
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-700">
                    <span className="font-bold text-white block font-mono">{scannedPart.partNumber}</span>
                    <span className="text-slate-400 text-[11px]">{scannedPart.description}</span>
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className="text-emerald-400 font-bold font-mono">
                        Available: {scannedPart.availableStock} pcs
                      </span>
                      <span className="text-amber-400 font-mono">{scannedPart.location}</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-700 text-slate-400">
                    No part selected. Scan a code in the camera tab or choose from Browse.
                  </div>
                )}
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Dispatch Quantity</label>
                <input
                  type="number"
                  min={1}
                  max={scannedPart?.availableStock || 99999}
                  value={actionQty}
                  onChange={(e) => setActionQty(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  disabled={isSubmitting || !scannedPart || actionQty > (scannedPart?.availableStock || 0)}
                  onClick={handleExecuteOutward}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center space-x-2 shadow-lg"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  <span>{isSubmitting ? 'Dispatching...' : `Confirm Issue of ${actionQty} Units`}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BROWSE CATALOG TAB */}
        {activeMode === 'browse' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search catalog by part number or specs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
              />
            </div>

            <div className="space-y-2">
              {filteredParts.map((p) => (
                <div
                  key={p.id}
                  onClick={() => {
                    setScannedPart(p);
                    setLastRawCode(p.partNumber);
                    setAiScanResult(null);
                    setActiveMode('scan');
                  }}
                  className="bg-slate-800 hover:bg-slate-750 p-3 rounded-xl border border-slate-700 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-xs text-white font-mono">{p.partNumber}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-700 text-slate-300 font-mono">
                        {p.location}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{p.description}</p>
                  </div>

                  <div className="text-right shrink-0 ml-3">
                    <span className="font-mono font-bold text-xs text-emerald-400 block">
                      {p.availableStock} pcs
                    </span>
                    <span className="text-[10px] text-slate-400">{formatINR(p.avgUnitPrice)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Sticky Mobile Navigation Tabs */}
      <nav className="fixed bottom-0 inset-x-0 bg-slate-950 border-t border-slate-800 px-4 py-2 z-40 flex items-center justify-around">
        <button
          type="button"
          onClick={() => setActiveMode('scan')}
          className={`flex flex-col items-center space-y-1 text-xs font-semibold py-1 px-3 rounded-lg transition-colors ${
            activeMode === 'scan' ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Camera className="w-5 h-5" />
          <span className="text-[11px]">Scanner & OCR</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMode('inward')}
          className={`flex flex-col items-center space-y-1 text-xs font-semibold py-1 px-3 rounded-lg transition-colors ${
            activeMode === 'inward' ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ArrowDownLeft className="w-5 h-5" />
          <span className="text-[11px]">Inward (+)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMode('outward')}
          className={`flex flex-col items-center space-y-1 text-xs font-semibold py-1 px-3 rounded-lg transition-colors ${
            activeMode === 'outward' ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ArrowUpRight className="w-5 h-5" />
          <span className="text-[11px]">Outward (-)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMode('browse')}
          className={`flex flex-col items-center space-y-1 text-xs font-semibold py-1 px-3 rounded-lg transition-colors ${
            activeMode === 'browse' ? 'text-purple-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Boxes className="w-5 h-5" />
          <span className="text-[11px]">Parts ({parts.length})</span>
        </button>
      </nav>
    </div>
  );
};
