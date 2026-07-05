/**
 * Lossless compression for Convex storage.
 * Uses LZ-string UTF-16 encoding — ~60-75% size reduction on JSON/SQL payloads.
 * Falls back to raw string if compression fails or produces larger output.
 */
import LZString from "lz-string";

const COMPRESSED_PREFIX = "\u0001LZ:";

export function compressForStorage(data: string): string {
  try {
    const compressed = LZString.compressToUTF16(data);
    if (compressed && compressed.length < data.length) {
      return COMPRESSED_PREFIX + compressed;
    }
  } catch {
    // fall through to raw
  }
  return data;
}

export function decompressFromStorage(data: string): string {
  if (!data) return data;
  if (!data.startsWith(COMPRESSED_PREFIX)) return data; // raw/legacy
  try {
    const inner = data.slice(COMPRESSED_PREFIX.length);
    const decompressed = LZString.decompressFromUTF16(inner);
    return decompressed ?? data;
  } catch {
    return data;
  }
}

/** Compress a JSON-serializable object for storage. */
export function compressJson<T>(value: T): string {
  return compressForStorage(JSON.stringify(value));
}

/** Decompress and parse a JSON value. Throws if parse fails. */
export function decompressJson<T>(stored: string): T {
  return JSON.parse(decompressFromStorage(stored)) as T;
}

/** Estimate savings as a human-readable string, e.g. "61% smaller" */
export function compressionRatio(original: string, compressed: string): string {
  if (!original.length) return "0%";
  const ratio = 1 - compressed.length / original.length;
  return `${Math.round(ratio * 100)}% smaller`;
}
