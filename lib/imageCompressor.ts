/**
 * Client-side image compression using the native Canvas API.
 * Iteratively reduces quality until the output is under targetKB.
 */

export interface CompressResult {
  blob: Blob;
  base64: string;
  sizeKB: number;
}

export async function compressForStorage(
  file: File,
  opts: { maxWidthPx?: number; quality?: number; targetKB?: number } = {},
): Promise<CompressResult> {
  const { maxWidthPx = 1280, quality = 0.75, targetKB = 100 } = opts;
  const targetBytes = targetKB * 1024;

  const objectUrl = URL.createObjectURL(file);

  try {
    const { width, height } = await loadImageDimensions(objectUrl);

    // Scale down if wider than maxWidthPx (maintaining aspect ratio)
    const scale = maxWidthPx < width ? maxWidthPx / width : 1;
    const drawWidth = Math.round(width * scale);
    const drawHeight = Math.round(height * scale);

    // Start at the requested quality and work downward
    let q = quality;
    let blob: Blob | null = null;

    while (q >= 0.3) {
      blob = await drawToBlob(objectUrl, drawWidth, drawHeight, q);

      if (blob.size <= targetBytes) {
        break;
      }

      q = Math.round((q - 0.1) * 100) / 100; // avoid floating-point drift
    }

    if (!blob) {
      throw new Error("Image compression failed: could not produce a blob.");
    }

    const base64 = await blobToBase64(blob);
    const sizeKB = Math.round(blob.size / 1024);

    return { blob, base64, sizeKB };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// --- internal helpers ---

function loadImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(`Failed to load image from ${src}`));
    img.src = src;
  });
}

function drawToBlob(
  src: string,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas 2D context not available"));
      return;
    }

    // Disable image smoothing to keep edges crisp when scaling down
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error("Canvas toBlob returned null"));
        },
        "image/webp",
        quality,
      );
    };
    img.onerror = () => reject(new Error(`Failed to load image from ${src}`));
    img.src = src;
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // reader.result is a string like "data:...;base64,XXXXX"
      const dataUrl = reader.result as string;
      const commaIdx = dataUrl.indexOf(",");
      resolve(commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl);
    };
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}