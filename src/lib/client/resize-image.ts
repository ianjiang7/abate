// Shrinks phone photos in the browser before upload, so several fit in one request.

const MAX_DIMENSION = 1600;
const QUALITY = 0.82;
const MAX_ORIGINAL_BYTES = 1_500_000;

export async function resizeImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob) throw new Error("encode failed");
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    // Formats the browser can't decode (some HEIC files): send small originals as-is.
    if (file.size <= MAX_ORIGINAL_BYTES) return file;
    throw new Error("We couldn't read that photo. Try taking a new one or choosing a different photo.");
  }
}
