import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  Upload,
  Sparkles,
  Barcode,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Layers,
  ArrowRight,
  Cpu,
  RefreshCw,
  VideoOff,
  QrCode,
  Zap,
  FlipHorizontal,
} from 'lucide-react';
import { Part, StorageLocation, ComponentCategory } from '../types/inventory';
import { inventoryApi } from '../services/api';
import {
  initializeCameraStream,
  LiveScannerEngine,
  toggleTorch,
  decodeFromImageSource,
} from '../utils/scannerEngine';
import { formatINR } from '../utils/currency';

interface InwardScannerProps {
  locations: StorageLocation[];
  parts: Part[];
  preSelectedPart?: Part | null;
  onSuccess: (part: Part) => void;
}

export const InwardScanner: React.FC<InwardScannerProps> = ({
  locations,
  parts,
  preSelectedPart,
  onSuccess,
}) => {
  // Camera state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLiveBarcodeActive, setIsLiveBarcodeActive] = useState(true);
  const [isScanningAI, setIsScanningAI] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [lastBarcodeFound, setLastBarcodeFound] = useState<string | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<'QR_CODE' | 'BARCODE' | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  // Raw OCR debug box state
  const [ocrText, setOcrText] = useState<string>('');

  // Inward Form State
  const [partNumber, setPartNumber] = useState('');
  const [category, setCategory] = useState<ComponentCategory>('Resistor');
  const [makeBrand, setMakeBrand] = useState('');
  const [supplier, setSupplier] = useState('');
  const [quantity, setQuantity] = useState<number | ''>(1000);
  const [unitPrice, setUnitPrice] = useState<number | ''>(0.015);
  const [location, setLocation] = useState('STR1S1B1');
  const [personName, setPersonName] = useState('Alex Vance');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('Distributor reel receipt');
  const [isCritical, setIsCritical] = useState(false);

  // Technical specs
  const [specValue, setSpecValue] = useState('10kΩ');
  const [specTolerance, setSpecTolerance] = useState('±1%');
  const [specFootprint, setSpecFootprint] = useState('0805');
  const [specRating, setSpecRating] = useState('1/8W (0.125W)');
  const [specDielectric, setSpecDielectric] = useState('Thick Film');

  // UI feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerEngineRef = useRef<LiveScannerEngine | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load preselected part if provided
  useEffect(() => {
    if (preSelectedPart) {
      applyExistingPartToForm(preSelectedPart);
    }
  }, [preSelectedPart]);

  const applyExistingPartToForm = (p: Part) => {
    setPartNumber(p.partNumber);
    setCategory(p.category);
    setMakeBrand(p.makeBrand);
    setSupplier(p.supplier);
    setLocation(p.location);
    setDescription(p.description);
    setUnitPrice(p.avgUnitPrice);
    setIsCritical(Boolean(p.isCritical));
    if (p.technicalSpecs) {
      setSpecValue(p.technicalSpecs.value || '');
      setSpecTolerance(p.technicalSpecs.tolerance || '');
      setSpecFootprint(p.technicalSpecs.packageFootprint || '0805');
      setSpecRating(p.technicalSpecs.powerOrVoltageRating || '');
      setSpecDielectric(p.technicalSpecs.dielectricOrType || '');
    }
  };

  // Start Camera Stream with universal mobile support
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

      // Initialize and start real-time QR and Barcode scanner engine
      const engine = new LiveScannerEngine((result) => {
        handleCodeDetected(result.text, result.format);
      }, 1800);
      scannerEngineRef.current = engine;
      engine.start(videoRef.current);
    } catch (err: any) {
      setCameraError(
        err.message || 'Camera permission denied or camera device unavailable. You can upload a photo or use the test simulators below.'
      );
      setIsCameraActive(false);
    }
  };

  // Stop Camera Stream
  const stopCamera = () => {
    if (scannerEngineRef.current) {
      scannerEngineRef.current.stop();
      scannerEngineRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsTorchOn(false);
  };

  // Toggle Camera Facing (Front / Back)
  const toggleCameraFacing = async () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    await startCamera(nextFacing);
  };

  // Toggle Flashlight/Torch
  const handleToggleTorch = async () => {
    const nextState = !isTorchOn;
    const success = await toggleTorch(streamRef.current, nextState);
    if (success) setIsTorchOn(nextState);
  };

  // Handle detected QR or Barcode string
  const handleCodeDetected = (code: string, format: 'QR_CODE' | 'BARCODE' | 'DATA_MATRIX' | 'UNKNOWN') => {
    let cleanCode = code.trim();
    // Parse JSON QR codes if applicable (e.g. manufacturer complex QR)
    if (cleanCode.startsWith('{') && cleanCode.endsWith('}')) {
      try {
        const obj = JSON.parse(cleanCode);
        if (obj.partNumber || obj.pn || obj.sku || obj.mpn) {
          cleanCode = String(obj.partNumber || obj.pn || obj.sku || obj.mpn);
        }
        if (obj.quantity || obj.qty) {
          setQuantity(Number(obj.quantity || obj.qty));
        }
      } catch {
        // Use raw code
      }
    }

    // Strip common distributor 1P / P prefix from DigiKey / Mouser / LCSC
    let candidateSku = cleanCode;
    if (candidateSku.startsWith('1P') || candidateSku.startsWith('1p')) {
      candidateSku = candidateSku.slice(2);
    } else if (candidateSku.startsWith('P') && candidateSku.length > 4 && /[A-Z]/.test(candidateSku[1])) {
      candidateSku = candidateSku.slice(1);
    }

    const sanitized = candidateSku.replace(/[^\w\d-_.]/g, '').toUpperCase();
    if (!sanitized) return;

    setLastBarcodeFound(sanitized);
    setDetectedFormat(format === 'QR_CODE' ? 'QR_CODE' : 'BARCODE');
    setOcrText((prev) => `[LIVE ${format} DETECTED]: ${sanitized}\n` + prev);

    // Check if code matches an existing part number or barcode
    const match = parts.find(
      (p) => p.partNumber === sanitized || (p.barcode && p.barcode.toUpperCase() === sanitized)
    );
    if (match) {
      applyExistingPartToForm(match);
      setToastMessage(`✓ ${format === 'QR_CODE' ? 'QR Code' : 'Barcode'} matched catalog SKU: ${match.partNumber}`);
    } else {
      setPartNumber(sanitized);
      setToastMessage(`✓ ${format === 'QR_CODE' ? 'QR Code' : 'Barcode'} detected: ${sanitized}`);
    }
  };

  // Capture frame and trigger Gemini Multimodal Vision AI
  const captureAndScanWithAI = async () => {
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

        // Send to backend Gemini multimodal route
        const scanResult = await inventoryApi.scanLabel(dataUrl, 'image/jpeg');
        applyScanResult(scanResult);
      }
    } catch (e: any) {
      setErrorMessage(e.message || 'Vision scan failed. Please check inputs.');
    } finally {
      setIsScanningAI(false);
    }
  };

  // Handle file photo upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      setCapturedImage(dataUrl);
      setIsScanningAI(true);
      setErrorMessage(null);

      // Attempt immediate QR / Barcode decoding from the uploaded image
      try {
        const decoded = await decodeFromImageSource(dataUrl);
        if (decoded && decoded.text) {
          handleCodeDetected(decoded.text, decoded.format);
        }
      } catch {
        // Continue to Gemini Multimodal parsing
      }

      try {
        const scanResult = await inventoryApi.scanLabel(dataUrl, file.type || 'image/jpeg');
        applyScanResult(scanResult);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to scan uploaded label');
      } finally {
        setIsScanningAI(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Apply parsed attributes to the inward form
  const applyScanResult = (res: any) => {
    if (!res) return;
    const cleanPartNo = String(res.partNumber || '').trim().toUpperCase();
    setPartNumber(cleanPartNo);
    if (res.category) setCategory(res.category);
    if (res.makeBrand) setMakeBrand(res.makeBrand);
    if (res.supplier) setSupplier(res.supplier);
    if (res.quantity) setQuantity(Number(res.quantity));
    if (res.unitPrice) setUnitPrice(Number(res.unitPrice));
    if (res.suggestedLocation) setLocation(res.suggestedLocation);
    if (res.rawOcrText) setOcrText(res.rawOcrText);

    if (res.technicalSpecs) {
      if (res.technicalSpecs.value) setSpecValue(res.technicalSpecs.value);
      if (res.technicalSpecs.tolerance) setSpecTolerance(res.technicalSpecs.tolerance);
      if (res.technicalSpecs.packageFootprint) setSpecFootprint(res.technicalSpecs.packageFootprint);
      if (res.technicalSpecs.powerOrVoltageRating) setSpecRating(res.technicalSpecs.powerOrVoltageRating);
      if (res.technicalSpecs.dielectricOrType) setSpecDielectric(res.technicalSpecs.dielectricOrType);
    }

    setDescription(`${cleanPartNo} ${res.category || ''} ${res.technicalSpecs?.value || ''}`);

    // Check if this part already exists in catalog
    const existing = parts.find((p) => p.partNumber === cleanPartNo);
    if (existing) {
      setToastMessage(`Recognized ${cleanPartNo} in database. Current stock: ${existing.availableStock} units.`);
    } else {
      setToastMessage(`Extracted new component ${cleanPartNo} from label!`);
    }
  };

  // Quick simulation of realistic distributor bag labels for immediate testing
  const simulateDistributorLabel = (type: 'resistor' | 'capacitor' | 'inductor' | 'diode') => {
    if (type === 'resistor') {
      applyScanResult({
        partNumber: 'RC0805FR-0710KL',
        category: 'Resistor',
        makeBrand: 'Yageo',
        supplier: 'DigiKey',
        quantity: 5000,
        unitPrice: 0.012,
        technicalSpecs: {
          value: '10kΩ',
          tolerance: '±1%',
          packageFootprint: '0805',
          powerOrVoltageRating: '1/8W',
          dielectricOrType: 'Thick Film',
        },
        suggestedLocation: 'STR1S1B1',
        rawOcrText: 'DIGI-KEY PART NO: 311-10.0KCRCT-ND | MFR P/N: RC0805FR-0710KL | DESC: RES SMD 10K OHM 1% 1/8W 0805 | QTY: 5000 | DATE: 202610 | YAGEO',
      });
    } else if (type === 'capacitor') {
      applyScanResult({
        partNumber: 'CL21B104KBCNNNC',
        category: 'Capacitor',
        makeBrand: 'Samsung Electro-Mechanics',
        supplier: 'Mouser',
        quantity: 4000,
        unitPrice: 0.024,
        technicalSpecs: {
          value: '100nF (0.1µF)',
          tolerance: '±10%',
          packageFootprint: '0805',
          powerOrVoltageRating: '50V',
          dielectricOrType: 'X7R Ceramic',
        },
        suggestedLocation: 'STR1S2B1',
        rawOcrText: 'MOUSER PART: 187-CL21B104KBCNNNC | MFR: SAMSUNG | 0805 100NF 50V X7R 10% | QTY: 4000 | REEL ID: 884920',
      });
    } else if (type === 'inductor') {
      applyScanResult({
        partNumber: 'VLS3012ET-100M',
        category: 'Inductor',
        makeBrand: 'TDK Corporation',
        supplier: 'DigiKey',
        quantity: 1000,
        unitPrice: 0.28,
        technicalSpecs: {
          value: '10µH',
          tolerance: '±20%',
          packageFootprint: '0805 (3012 SMD)',
          powerOrVoltageRating: '0.7A / 0.38Ω DCR',
          dielectricOrType: 'Ferrite Core Shielded',
        },
        suggestedLocation: 'STR2S1B1',
        rawOcrText: 'TDK CORP | P/N: VLS3012ET-100M | FIXED IND 10UH 700MA 380 MOHM SMD | QTY: 1000 | LOT: 2610A',
      });
    } else if (type === 'diode') {
      applyScanResult({
        partNumber: '1N4148W-7-F',
        category: 'Diode',
        makeBrand: 'Diodes Inc.',
        supplier: 'LCSC',
        quantity: 3000,
        unitPrice: 0.038,
        technicalSpecs: {
          value: '0.7V Vf @ 10mA',
          tolerance: '4ns Trr',
          packageFootprint: 'SOD-123',
          powerOrVoltageRating: '100V / 300mA',
          dielectricOrType: 'Fast Switching Silicon',
        },
        suggestedLocation: 'STR2S2B1',
        rawOcrText: 'LCSC PART: C8159 | 1N4148W-7-F SOD-123 | FAST SWITCHING DIODE 100V 300MA | QTY: 3000 | DIODES INC',
      });
    }
  };

  // Submit Inward Entry to ERP Ledger
  const handleSaveInward = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!partNumber.trim()) {
      setErrorMessage('Part Number is required.');
      return;
    }
    if (!quantity || Number(quantity) <= 0) {
      setErrorMessage('Quantity must be greater than zero.');
      return;
    }

    try {
      const payload = {
        partNumber: partNumber.trim().toUpperCase(),
        category,
        description: description || `${partNumber.trim().toUpperCase()} ${specValue} ${specFootprint}`,
        makeBrand: makeBrand || 'Generic',
        supplier: supplier || 'Distributor',
        quantity: Number(quantity),
        unitPrice: Number(unitPrice) || 0,
        location,
        personName,
        notes,
        isCritical,
        technicalSpecs: {
          value: specValue,
          tolerance: specTolerance,
          packageFootprint: specFootprint,
          powerOrVoltageRating: specRating,
          dielectricOrType: specDielectric,
        },
      };

      const result = await inventoryApi.recordInward(payload);
      setToastMessage(`✓ Inward intake committed! ${quantity} units logged to ${location}.`);
      onSuccess(result.part);

      // Reset form quantity
      setQuantity('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save inward entry.');
    }
  };

  // Reset form
  const handleResetForm = () => {
    setPartNumber('');
    setDescription('');
    setMakeBrand('');
    setSupplier('');
    setQuantity(1000);
    setUnitPrice(0.015);
    setSpecValue('');
    setOcrText('');
    setCapturedImage(null);
    setLastBarcodeFound(null);
  };

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <Camera className="w-5 h-5 text-blue-600" />
            <span>Inward Intake & Dual-Engine Scanner</span>
          </h2>
          <p className="text-xs text-slate-500">
            Real-time Barcode / QR detection + Gemini Multimodal Vision AI label extraction
          </p>
        </div>

        {/* Quick simulator buttons */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-400 font-medium">Test Label Presets:</span>
          <button
            type="button"
            onClick={() => simulateDistributorLabel('resistor')}
            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px]"
            title="Simulate 10k 0805 Yageo Resistor reel"
          >
            10kΩ Resistor
          </button>
          <button
            type="button"
            onClick={() => simulateDistributorLabel('capacitor')}
            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px]"
            title="Simulate 100nF 0805 MLCC Samsung reel"
          >
            100nF Cap
          </button>
          <button
            type="button"
            onClick={() => simulateDistributorLabel('inductor')}
            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px]"
            title="Simulate 10µH Shielded Inductor TDK"
          >
            10µH Inductor
          </button>
          <button
            type="button"
            onClick={() => simulateDistributorLabel('diode')}
            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[11px]"
            title="Simulate 1N4148 Fast Diode bag"
          >
            1N4148 Diode
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
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-600 font-bold ml-4">
            ×
          </button>
        </div>
      )}

      {/* Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Camera Viewfinder & Image Input */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-xs space-y-3">
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
                      title="Flip front/rear camera"
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
                        title="Toggle Flashlight / Torch"
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

            {/* Video Viewport Container: Video is always mounted so videoRef.current is never null */}
            <div className="relative w-full aspect-4/3 bg-slate-900 rounded-md overflow-hidden flex items-center justify-center border border-slate-300">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${isCameraActive ? 'block' : 'hidden'}`}
              />

              {isCameraActive && (
                <>
                  {/* Targeting Reticle with animated scanning line */}
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                    <div className="w-56 h-40 border-2 border-emerald-400 rounded-lg relative flex items-center justify-center shadow-lg overflow-hidden">
                      {/* Corner Accents */}
                      <div className="absolute top-0 left-0 w-4 h-4 border-t-3 border-l-3 border-emerald-400" />
                      <div className="absolute top-0 right-0 w-4 h-4 border-t-3 border-r-3 border-emerald-400" />
                      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-3 border-l-3 border-emerald-400" />
                      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-3 border-r-3 border-emerald-400" />

                      {/* Moving laser scan line */}
                      <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_#34d399] animate-bounce" />

                      <span className="text-[10px] text-white/95 bg-black/70 px-2 py-0.5 rounded font-mono backdrop-blur-xs">
                        Align QR Code or Barcode
                      </span>
                    </div>

                    <div className="mt-3 flex items-center space-x-2 bg-black/60 px-3 py-1 rounded-full text-[11px] text-emerald-300 font-mono">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>Live QR & Barcode Detection Active</span>
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
                        alt="Captured Reel Label"
                        className="max-h-56 max-w-full rounded object-contain mx-auto shadow-md"
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
                        Tap "Open Camera" to start live QR / barcode detection, or take a picture using your mobile camera
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

            {/* Scanner Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={captureAndScanWithAI}
                disabled={!isCameraActive || isScanningAI}
                className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 text-xs font-semibold rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-xs"
              >
                {isScanningAI ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-blue-200" />
                    <span>Snap & AI Vision</span>
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
                <span>Upload Label Photo</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            {lastBarcodeFound && (
              <div className="text-[11px] bg-emerald-50 p-2 rounded border border-emerald-200 flex items-center justify-between text-emerald-900">
                <span className="font-semibold flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{detectedFormat === 'QR_CODE' ? 'Scanned QR Code:' : 'Scanned Barcode:'}</span>
                </span>
                <span className="font-mono font-bold text-emerald-800">{lastBarcodeFound}</span>
              </div>
            )}
          </div>

          {/* Editable OCR Text Preview & Verification Box (Notebook Phase 2 Requirement) */}
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                OCR Debug & Verification Console
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Editable Preview</span>
            </div>
            <textarea
              rows={4}
              value={ocrText}
              onChange={(e) => setOcrText(e.target.value)}
              placeholder="Raw text extracted from optical camera scan or barcode reader will appear here for verification..."
              className="w-full p-2.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 text-slate-800"
            />
            <p className="text-[11px] text-slate-400">
              Odd characters are automatically sanitized. You can adjust raw detected text above before saving.
            </p>
          </div>
        </div>

        {/* Right Column: Inward Intake Form */}
        <div className="lg:col-span-7">
          <form
            onSubmit={handleSaveInward}
            className="bg-white rounded-lg border border-slate-200 p-5 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <span className="text-sm font-bold text-slate-900 tracking-tight flex items-center space-x-1.5">
                <Cpu className="w-4 h-4 text-blue-600" />
                <span>Inward Receipt Specifications</span>
              </span>
              <button
                type="button"
                onClick={handleResetForm}
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center space-x-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Fields</span>
              </button>
            </div>

            {/* Row 1: Part Number & Component Category */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-8">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Part Number <span className="text-red-500">*</span>
                  <span className="text-[10px] text-slate-400 font-normal ml-2">
                    (AI Auto-filled / Scanned)
                  </span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. RC0805FR-0710KL or CL21B104KBCNNNC"
                  value={partNumber}
                  onChange={(e) => {
                    const clean = e.target.value.toUpperCase();
                    setPartNumber(clean);
                    const match = parts.find((p) => p.partNumber === clean);
                    if (match) applyExistingPartToForm(match);
                  }}
                  className="w-full px-3 py-2 text-sm font-mono font-semibold bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Component Type
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ComponentCategory)}
                  className="w-full px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                >
                  <option value="Resistor">Resistor</option>
                  <option value="Capacitor">Capacitor</option>
                  <option value="Inductor">Inductor</option>
                  <option value="Diode">Diode</option>
                </select>
              </div>
            </div>

            {/* Row 2: Make & Supplier */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Make / Manufacturer Brand
                </label>
                <input
                  type="text"
                  placeholder="e.g. Yageo, Murata, Vishay, TDK, Samsung"
                  value={makeBrand}
                  onChange={(e) => setMakeBrand(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Supplier / Distributor</label>
                <input
                  type="text"
                  placeholder="e.g. DigiKey, Mouser, LCSC, Arrow"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Row 3: Technical Specs specialized for Passives */}
            <div className="p-3 bg-slate-50/80 rounded-md border border-slate-200 space-y-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                Passive Component Technical Parameters
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-500">Value (Ω, F, H, Vf)</label>
                  <input
                    type="text"
                    placeholder="10kΩ / 100nF"
                    value={specValue}
                    onChange={(e) => setSpecValue(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500">Tolerance</label>
                  <input
                    type="text"
                    placeholder="±1%, ±5%"
                    value={specTolerance}
                    onChange={(e) => setSpecTolerance(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500">Package / Footprint</label>
                  <input
                    type="text"
                    placeholder="0805, 0603, SOD-123"
                    value={specFootprint}
                    onChange={(e) => setSpecFootprint(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500">Power / Voltage</label>
                  <input
                    type="text"
                    placeholder="1/8W, 50V, 1A"
                    value={specRating}
                    onChange={(e) => setSpecRating(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            {/* Row 4: Quantity & Unit Price */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Inward Quantity <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 text-sm font-mono font-bold bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Unit Price (₹ INR)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.0001}
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Calculated Batch Value
                </label>
                <div className="px-3 py-2 text-sm font-mono font-bold text-emerald-700 bg-emerald-50/60 border border-emerald-200 rounded-md">
                  {formatINR((Number(quantity) || 0) * (Number(unitPrice) || 0))}
                </div>
              </div>
            </div>

            {/* Row 5: Destination Storage Location Scheme (STR1S1B1 to STR3S4B4) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Destination Storage Coordinate <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center space-x-2">
                  <select
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs font-mono font-semibold bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    {locations.map((loc) => (
                      <option key={loc.code} value={loc.code}>
                        {loc.code} - {loc.label}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Supports Rack (STR1-3), Shelf (S1-4), and Box (B1-4) or open shelves.
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Received By / Technician Name
                </label>
                <input
                  type="text"
                  placeholder="Operator name"
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-hidden"
                />
              </div>
            </div>

            {/* Row 6: Description & Purpose Notes */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Item Description & PO Reference Notes
              </label>
              <input
                type="text"
                placeholder="e.g. 10k Ohm 1% 1/8W 0805 SMD Chip Resistor - DigiKey PO-4482"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-md focus:bg-white focus:outline-hidden"
              />
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input
                type="checkbox"
                id="isCriticalCheckbox"
                checked={isCritical}
                onChange={(e) => setIsCritical(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="isCriticalCheckbox" className="text-xs text-slate-700 font-medium">
                Flag as Critical Production Component (triggers strict reorder notifications)
              </label>
            </div>

            {/* Commit Button */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-3">
              <button
                type="submit"
                className="flex items-center space-x-2 px-6 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-xs transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save Inward Entry</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
