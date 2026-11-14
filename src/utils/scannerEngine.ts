import jsQR from 'jsqr';
import { BrowserMultiFormatReader } from '@zxing/library';

export interface ScanDetectionResult {
  text: string;
  format: 'QR_CODE' | 'BARCODE' | 'DATA_MATRIX' | 'UNKNOWN';
  source: 'jsqr' | 'zxing' | 'barcode_detector';
}

export interface CameraStreamResult {
  stream: MediaStream;
  hasTorch: boolean;
  activeFacingMode: 'environment' | 'user';
}

// Global audio context for scan feedback
let audioContext: AudioContext | null = null;

export function playSuccessBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioContext || audioContext.state === 'suspended') {
      audioContext = new AudioCtx();
    }
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1800, audioContext.currentTime + 0.08);
    gain.gain.setValueAtTime(0.12, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + 0.12);
  } catch {
    // Audio feedback is non-critical
  }
}

/**
 * Universal Mobile & Desktop camera stream initializer.
 * Handles iOS Safari inline video policies, camera permissions, and fallbacks.
 */
export async function initializeCameraStream(
  videoElement: HTMLVideoElement,
  preferredFacingMode: 'environment' | 'user' = 'environment'
): Promise<CameraStreamResult> {
  // Ensure video element has all mobile inline playback attributes
  videoElement.setAttribute('playsinline', 'true');
  videoElement.setAttribute('webkit-playsinline', 'true');
  videoElement.muted = true;
  videoElement.autoplay = true;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Camera access API is not supported in this browser. Please use photo upload or a secure HTTPS connection.');
  }

  let stream: MediaStream | null = null;
  let activeFacingMode = preferredFacingMode;

  // Attempt 1: Ideal facingMode and standard resolution
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: preferredFacingMode },
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
      },
      audio: false,
    });
  } catch {
    // Attempt 2: Simple constraint fallback (essential for some mobile browsers)
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: preferredFacingMode },
        audio: false,
      });
    } catch {
      // Attempt 3: Any available video device
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        activeFacingMode = 'user';
      } catch (finalErr: any) {
        if (finalErr.name === 'NotAllowedError' || finalErr.name === 'PermissionDeniedError') {
          throw new Error('Camera permission denied. Please allow camera permissions in your mobile browser settings.');
        } else if (finalErr.name === 'NotFoundError' || finalErr.name === 'DevicesNotFoundError') {
          throw new Error('No camera found on this device. Please use photo upload.');
        } else if (finalErr.name === 'NotReadableError' || finalErr.name === 'TrackStartError') {
          throw new Error('Camera is currently in use by another app or browser tab.');
        }
        throw new Error(finalErr.message || 'Unable to access camera.');
      }
    }
  }

  videoElement.srcObject = stream;

  // iOS Safari requires explicit play() call after setting srcObject
  try {
    await videoElement.play();
  } catch {
    // If auto-play policy temporarily blocks, user interaction will start it
  }

  // Check if camera track supports torch (flashlight)
  let hasTorch = false;
  try {
    const track = stream.getVideoTracks()[0];
    const capabilities = (track.getCapabilities ? track.getCapabilities() : {}) as any;
    hasTorch = Boolean(capabilities && capabilities.torch);
  } catch {
    hasTorch = false;
  }

  return { stream, hasTorch, activeFacingMode };
}

/**
 * Toggle flashlight/torch on mobile rear camera if supported.
 */
export async function toggleTorch(stream: MediaStream | null, enable: boolean): Promise<boolean> {
  if (!stream) return false;
  try {
    const track = stream.getVideoTracks()[0];
    if (!track) return false;
    const capabilities = (track.getCapabilities ? track.getCapabilities() : {}) as any;
    if (capabilities && capabilities.torch) {
      await (track as any).applyConstraints({
        advanced: [{ torch: enable }],
      });
      return true;
    }
  } catch {
    // Torch control not supported
  }
  return false;
}

/**
 * Detects QR code or Barcode from an image file / base64 string.
 */
export async function decodeFromImageSource(source: string | HTMLImageElement): Promise<ScanDetectionResult | null> {
  return new Promise((resolve) => {
    const img = source instanceof HTMLImageElement ? source : new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // 1. Try jsQR for QR codes
        const qr = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });
        if (qr && qr.data && qr.data.trim()) {
          resolve({
            text: qr.data.trim(),
            format: 'QR_CODE',
            source: 'jsqr',
          });
          return;
        }

        // 2. Try ZXing
        const zxingReader = new BrowserMultiFormatReader();
        zxingReader
          .decodeFromImageElement(img)
          .then((res) => {
            if (res) {
              const text = res.getText ? res.getText() : String(res);
              resolve({
                text: text.trim(),
                format: 'BARCODE',
                source: 'zxing',
              });
            } else {
              resolve(null);
            }
          })
          .catch(() => {
            resolve(null);
          });
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);

    if (typeof source === 'string') {
      img.src = source;
    }
  });
}

/**
 * Real-time Scanner controller class.
 * Continuously polls video frames with dual-engine (jsQR + ZXing) without log spam or unhandled rejections.
 */
export class LiveScannerEngine {
  private videoElement: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private zxingReader: BrowserMultiFormatReader;
  private isScanning = false;
  private animFrameId: number | null = null;
  private timerId: any = null;
  private onDetectedCallback: (result: ScanDetectionResult) => void;
  private lastScannedText = '';
  private lastScannedTime = 0;
  private debounceMs = 2000;

  constructor(onDetected: (result: ScanDetectionResult) => void, debounceMs = 2000) {
    this.onDetectedCallback = onDetected;
    this.debounceMs = debounceMs;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.zxingReader = new BrowserMultiFormatReader();
  }

  public start(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
    this.isScanning = true;
    this.lastScannedText = '';
    this.lastScannedTime = 0;

    // Start throttled frame evaluation loop (every 75ms = ~13 fps, lightweight on mobile)
    const scanTick = async () => {
      if (!this.isScanning || !this.videoElement) return;

      if (this.videoElement.readyState >= 2 && this.videoElement.videoWidth > 0) {
        await this.evaluateCurrentFrame();
      }

      if (this.isScanning) {
        this.timerId = setTimeout(() => {
          this.animFrameId = requestAnimationFrame(scanTick);
        }, 75);
      }
    };

    this.timerId = setTimeout(() => {
      this.animFrameId = requestAnimationFrame(scanTick);
    }, 150);
  }

  public stop() {
    this.isScanning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    try {
      this.zxingReader.reset();
    } catch {
      // Ignore reset error
    }
    this.videoElement = null;
  }

  private async evaluateCurrentFrame() {
    if (!this.videoElement || !this.ctx) return;
    const video = this.videoElement;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw <= 0 || vh <= 0) return;

    // Scale down for processing efficiency on mobile (max 640px)
    const scale = Math.min(1, 640 / Math.max(vw, vh));
    const targetW = Math.floor(vw * scale);
    const targetH = Math.floor(vh * scale);

    this.canvas.width = targetW;
    this.canvas.height = targetH;
    this.ctx.drawImage(video, 0, 0, targetW, targetH);

    // 1. ENGINE A: jsQR (Ultra fast & robust QR code scanner)
    try {
      const imgData = this.ctx.getImageData(0, 0, targetW, targetH);
      const qrCode = jsQR(imgData.data, imgData.width, imgData.height, {
        inversionAttempts: 'attemptBoth',
      });

      if (qrCode && qrCode.data && qrCode.data.trim()) {
        const text = qrCode.data.trim();
        this.handleHit({
          text,
          format: 'QR_CODE',
          source: 'jsqr',
        });
        return;
      }
    } catch {
      // Frame skip
    }

    // 2. ENGINE B: Native BarcodeDetector if available
    try {
      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'upc_a', 'data_matrix'],
        });
        const barcodes = await detector.detect(this.canvas);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          const val = barcodes[0].rawValue.trim();
          if (val) {
            this.handleHit({
              text: val,
              format: barcodes[0].format?.toLowerCase().includes('qr') ? 'QR_CODE' : 'BARCODE',
              source: 'barcode_detector',
            });
            return;
          }
        }
      }
    } catch {
      // Native detector frame skip
    }

    // 3. ENGINE C: ZXing BrowserMultiFormatReader on canvas for 1D Barcodes & DataMatrix
    try {
      const zxResult = await this.zxingReader.decodeFromImageElement(this.canvas as any);
      if (zxResult) {
        const text = zxResult.getText ? zxResult.getText() : String(zxResult);
        if (text && text.trim()) {
          this.handleHit({
            text: text.trim(),
            format: 'BARCODE',
            source: 'zxing',
          });
        }
      }
    } catch {
      // Standard frame skip when no barcode is in frame - do NOT log
    }
  }

  private handleHit(result: ScanDetectionResult) {
    const now = Date.now();
    if (result.text === this.lastScannedText && now - this.lastScannedTime < this.debounceMs) {
      return; // Debounced
    }
    this.lastScannedText = result.text;
    this.lastScannedTime = now;
    playSuccessBeep();
    this.onDetectedCallback(result);
  }
}
