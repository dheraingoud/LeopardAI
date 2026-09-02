/**
 * uploadFile — POST one File to /api/files/upload (Convex file storage).
 * Falls back to an inline data: URL when the endpoint is absent/failing so
 * the part still reaches the model — a blob: object URL would die server-side
 * ("URL scheme must be http, https, or data").
 */
export type UploadedFile = { url: string; name: string; mediaType: string };

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function uploadFile(file: File): Promise<UploadedFile> {
  const mediaType = file.type || "application/octet-stream";
  try {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/files/upload", { method: "POST", body: fd });
    if (!res.ok) throw new Error(`upload ${res.status}`);
    const out = (await res.json()) as Partial<UploadedFile>;
    if (out.url) {
      return { url: out.url, name: out.name ?? file.name, mediaType: out.mediaType ?? mediaType };
    }
    throw new Error("upload returned no url");
  } catch {
    return { url: await fileToDataUrl(file), name: file.name, mediaType };
  }
}
