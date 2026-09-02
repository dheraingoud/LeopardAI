/**
 * uploadFile — inline the file as a data: URL. There is no server upload
 * endpoint (/api/files/upload never existed; probing it wasted ~13s per file
 * on a dev-server 500). Data URLs survive the trip to the model — a blob:
 * object URL would die server-side ("URL scheme must be http, https, or data").
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
  return {
    url: await fileToDataUrl(file),
    name: file.name,
    mediaType: file.type || "application/octet-stream",
  };
}
