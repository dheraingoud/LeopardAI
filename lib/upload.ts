/**
 * uploadFile — POST one File to /api/files/upload (Convex file storage).
 * Falls back to an object URL when the endpoint is absent (dev, before the
 * Convex upload route lands) so the input bar still previews + sends a part;
 * the server won't resolve a blob: URL, but the text part still flows.
 * Upgrades transparently once /api/files/upload returns a real storage URL.
 */
export type UploadedFile = { url: string; name: string; mediaType: string };

export async function uploadFile(file: File): Promise<UploadedFile> {
  const fd = new FormData();
  fd.append("file", file);
  try {
    const res = await fetch("/api/files/upload", { method: "POST", body: fd });
    if (!res.ok) throw new Error(`upload ${res.status}`);
    const out = (await res.json()) as Partial<UploadedFile>;
    return {
      url: out.url ?? "",
      name: out.name ?? file.name,
      mediaType: (out.mediaType ?? file.type) || "application/octet-stream",
    };
  } catch {
    return {
      url: URL.createObjectURL(file),
      name: file.name,
      mediaType: file.type || "application/octet-stream",
    };
  }
}
