import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Smartphone,
  QrCode,
  CheckCircle2,
  Copy,
  ExternalLink,
  RefreshCw,
  X,
  Radio,
  Zap,
  ArrowRight,
  ShieldCheck,
  Download,
  Check,
} from 'lucide-react';
import { inventoryApi } from '../services/api';

interface AndroidCompanionModalProps {
  isOpen: boolean;
  onClose: () => void;
  terminalId: string;
  onTerminalIdChange: (newId: string) => void;
  isPaired: boolean;
  pairedDevice?: { name: string; platform: string; lastActive: string };
  onOpenMobileTerminalView: () => void;
}

export const AndroidCompanionModal: React.FC<AndroidCompanionModalProps> = ({
  isOpen,
  onClose,
  terminalId,
  onTerminalIdChange,
  isPaired,
  pairedDevice,
  onOpenMobileTerminalView,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [recentRelayedScans, setRecentRelayedScans] = useState<any[]>([]);

  // Generate pairing URL
  const pairingUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?pair=${encodeURIComponent(terminalId)}&mode=terminal`
    : `http://localhost:3000/?pair=${terminalId}&mode=terminal`;

  // Draw QR code onto canvas
  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    QRCode.toCanvas(
      canvasRef.current,
      pairingUrl,
      {
        width: 220,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      },
      (err) => {
        if (err) {
          // Fallback or retry
        }
      }
    );
  }, [isOpen, pairingUrl]);

  // Poll for live paired status and scans while modal is open
  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const interval = setInterval(async () => {
      try {
        const pollRes = await inventoryApi.pollTerminal(terminalId);
        if (!active) return;
        if (pollRes.scans && pollRes.scans.length > 0) {
          setRecentRelayedScans((prev) => [...pollRes.scans, ...prev].slice(0, 8));
        }
      } catch {
        // Silent poll error catch
      }
    }, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isOpen, terminalId]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(pairingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleRegenerateId = () => {
    setIsRefreshing(true);
    const newId = `TRM-${Math.floor(1000 + Math.random() * 9000)}`;
    onTerminalIdChange(newId);
    setTimeout(() => setIsRefreshing(false), 400);
  };

  const handleDisconnect = async () => {
    await inventoryApi.disconnectTerminal(terminalId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full overflow-hidden text-slate-800 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Android App & Mobile Scanner Link
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  REAL-TIME SYNC
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Connect your Android phone to the live inventory database via QR Code
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Pairing Status Banner */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between transition-colors ${
              isPaired
                ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                : 'bg-amber-50 border-amber-200 text-amber-950'
            }`}
          >
            <div className="flex items-center space-x-3">
              <span className="relative flex h-3 w-3">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isPaired ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-3 w-3 ${
                    isPaired ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
              </span>
              <div>
                <p className="text-xs font-bold flex items-center space-x-1.5">
                  <span>{isPaired ? 'Android Device Connected & Active' : 'Waiting for Android Scanner to Scan QR'}</span>
                </p>
                <p className="text-[11px] opacity-80">
                  {isPaired
                    ? `Paired Device: ${pairedDevice?.name || 'Android Companion Terminal'}`
                    : 'Scan the QR code below using your phone camera or barcode scanner'}
                </p>
              </div>
            </div>

            {isPaired && (
              <button
                type="button"
                onClick={handleDisconnect}
                className="text-xs px-2.5 py-1 text-red-600 hover:bg-red-100 rounded-md font-semibold transition-colors border border-red-200"
              >
                Disconnect
              </button>
            )}
          </div>

          {/* QR Code and Quick Details Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Left: QR Canvas */}
            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl border border-slate-200 shadow-inner">
              <div className="p-2 bg-white rounded-lg shadow-sm border border-slate-200">
                <canvas ref={canvasRef} className="rounded" />
              </div>

              <div className="mt-3 flex items-center space-x-2">
                <span className="text-[11px] text-slate-500 font-mono">Unique Terminal ID:</span>
                <span className="text-xs font-mono font-bold bg-slate-900 text-emerald-400 px-2 py-0.5 rounded shadow-xs">
                  {terminalId}
                </span>
                <button
                  type="button"
                  onClick={handleRegenerateId}
                  title="Generate new ID"
                  className="p-1 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-200 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* Right: Pairing Link & Steps */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Direct Pairing URL (Open on Mobile)
                </label>
                <div className="flex items-center space-x-1.5">
                  <input
                    type="text"
                    readOnly
                    value={pairingUrl}
                    className="flex-1 text-xs font-mono bg-slate-100 border border-slate-300 rounded-lg px-2.5 py-2 text-slate-700 truncate"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 shrink-0 transition-colors shadow-xs"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* 3 Steps */}
              <div className="space-y-2 text-xs">
                <div className="flex items-start space-x-2">
                  <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 mt-0.5 text-[10px]">
                    1
                  </span>
                  <span className="text-slate-600">
                    Open your <strong>Android Phone Camera</strong> or Chrome browser and point it at the QR code.
                  </span>
                </div>

                <div className="flex items-start space-x-2">
                  <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 mt-0.5 text-[10px]">
                    2
                  </span>
                  <span className="text-slate-600">
                    The mobile companion opens instantly with the <strong>same database & live inventory</strong>.
                  </span>
                </div>

                <div className="flex items-start space-x-2">
                  <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 mt-0.5 text-[10px]">
                    3
                  </span>
                  <span className="text-slate-600">
                    Tap <strong>Chrome Menu (⋮) → 'Add to Home screen'</strong> to install it as an Android App.
                  </span>
                </div>
              </div>

              {/* Open in This Browser button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenMobileTerminalView();
                  }}
                  className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 transition-colors"
                >
                  <Smartphone className="w-4 h-4 text-slate-600" />
                  <span>Preview Mobile Terminal Mode on this screen</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </div>
            </div>
          </div>

          {/* Relayed Phone Scans Feed */}
          {recentRelayedScans.length > 0 && (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>Live Scans Received from Android Phone ({recentRelayedScans.length})</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Pushed via WiFi Gun Relay</span>
              </div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {recentRelayedScans.map((scan, i) => (
                  <div
                    key={scan.id || i}
                    className="flex items-center justify-between bg-white px-3 py-1.5 rounded border border-slate-200 text-xs font-mono"
                  >
                    <span className="font-bold text-blue-700">{scan.code}</span>
                    <span className="text-slate-500 text-[11px] truncate max-w-[200px]">
                      {scan.description || scan.format}
                    </span>
                    <span className="text-[10px] text-emerald-600 font-semibold">
                      Stock: {scan.availableStock ?? 'Live'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Android PWA Capabilities Card */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 flex items-start space-x-3 text-xs text-blue-900">
            <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Android App Features Included:</p>
              <p className="text-[11px] text-blue-800 mt-0.5 leading-relaxed">
                • <strong>Shared Live Database:</strong> Stock updates made on Android instantly update your desktop screen.
                <br />
                • <strong>Universal Scanner & Gallery Upload:</strong> Live camera scanner + upload photos directly from your phone gallery/camera roll.
                <br />
                • <strong>AI Label & Component OCR:</strong> Instant OCR reads reels, bag tags, and invoices with automatic Indian Rupee (₹ INR) pricing.
                <br />
                • <strong>Full Web App Preserved:</strong> Switch between Mobile Handheld Gun and Full Desktop ERP anytime.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Session ID: <strong className="font-mono text-slate-700">{terminalId}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
