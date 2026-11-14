/**
 * High-performance client-side image compressor & optimizer.
 * Downscales smartphone/camera photos (e.g. 12MP/4000x3000) down to ~1280-1400px
 * and compresses to lightweight JPEG (~150-300KB) before sending to AI/OCR engines.
 * Prevents memory exhaustion, payload errors, and timeouts during bulk uploads (e.g. 16+ photos).
 */

export interface CompressedImageResult {
  base64: string;
  mimeType: string;
  width: number;
  height: number;
  originalSizeBytes: number;
  compressedSizeBytes: number;
}

/**
 * Compresses an image File or blob into an optimized base64 JPEG data URL.
 */
export async function compressImageFile(
  file: File | Blob,
  maxDimension = 1400,
  quality = 0.82
): Promise<CompressedImageResult> {
  const originalSizeBytes = file.size;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));

    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (!src) {
        reject(new Error('Empty image data'));
        return;
      }

      // If already small (< 300KB) and not huge, we still create an Image to get dimensions
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image data into bitmap'));

      img.onload = () => {
        let { width, height } = img;

        // Calculate aspect-ratio preserved dimensions
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          reject(new Error('Could not get 2D canvas context'));
          return;
        }

        // Fill white background for transparent PNG/WebP conversions to JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        // Draw downscaled image with high quality smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Export as JPEG with specified quality
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);

        // Rough byte size calculation from base64 length
        const base64Length = compressedBase64.length - (compressedBase64.indexOf(',') + 1);
        const compressedSizeBytes = Math.round((base64Length * 3) / 4);

        resolve({
          base64: compressedBase64,
          mimeType: 'image/jpeg',
          width,
          height,
          originalSizeBytes,
          compressedSizeBytes,
        });
      };

      img.src = src;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Async sleep helper for polite pacing between API requests (prevents 429 rate limits)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
