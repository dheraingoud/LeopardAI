/**
 * Gzip compression / decompression for SQL files using the native
 * browser CompressionStream / DecompressionStream APIs (no external deps).
 */

/**
 * Compress a plain-text string into a gzipped Blob.
 * Uses CompressionStream('gzip') under the hood — supported in all modern browsers.
 */
export async function compressSQLFile(text: string): Promise<Blob> {
  const encoder = new TextEncoder();
  const inputChunk = encoder.encode(text);

  const compressionStream = new CompressionStream("gzip");
  const writable = compressionStream.writable;
  const readable = compressionStream.readable;

  const writer = writable.getWriter();
  writer.write(inputChunk);
  writer.close();

  const chunks: Uint8Array[] = [];
  const reader = readable.getReader();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Assemble into a single Uint8Array
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return new Blob([result], { type: "application/gzip" });
}

/**
 * Decompress a gzipped Blob back into a plain-text string.
 * Uses DecompressionStream('gzip') under the hood.
 */
export async function decompressSQLFile(blob: Blob): Promise<string> {
  const decompressStream = new DecompressionStream("gzip");
  const writable = decompressStream.writable;
  const readable = decompressStream.readable;

  const blobBuffer = await blob.arrayBuffer();
  const inputChunk = new Uint8Array(blobBuffer);

  const writer = writable.getWriter();
  writer.write(inputChunk);
  writer.close();

  const chunks: Uint8Array[] = [];
  const reader = readable.getReader();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Assemble into a single Uint8Array
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return new TextDecoder().decode(result);
}