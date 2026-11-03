const ACCEPTED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
]);
/** Bounded signature detection, independent of the filename or OS MIME guess. */
export function detectImageFormat(bytes: Uint8Array): string | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)) return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "image/gif";
  if (ascii(4, 8) === "ftyp" && /avif|avis/.test(ascii(8, 64))) return "image/avif";
  const text = new TextDecoder()
    .decode(bytes)
    .replace(/^\uFEFF/, "")
    .replace(/^\s*<\?xml[\s\S]*?\?>/, "")
    .replace(/^(?:\s*<!--[\s\S]*?-->)*\s*/, "");
  return /^<svg(?:\s|>)/i.test(text) ? "image/svg+xml" : null;
}
export class ImageImportError extends Error {
  constructor(
    readonly code:
      | "IMAGE_FORMAT_UNSUPPORTED"
      | "IMAGE_TOO_LARGE"
      | "IMAGE_DIMENSIONS_INVALID"
      | "IMAGE_READ_FAILED"
      | "IMAGE_DECODE_FAILED",
    readonly fileName: string,
    message: string,
    cause?: unknown,
  ) {
    super(`${fileName}: ${message}`, { cause });
    this.name = "ImageImportError";
  }
}
export async function normalizeImageFile(file: File): Promise<File> {
  if (ACCEPTED.has(file.type)) return file;
  let bytes: Uint8Array;
  try {
    bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        reader.result instanceof ArrayBuffer
          ? resolve(new Uint8Array(reader.result))
          : reject(new Error("Invalid file header."));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file.slice(0, 4096));
    });
  } catch (cause) {
    throw new ImageImportError(
      "IMAGE_READ_FAILED",
      file.name,
      "The file could not be read. Try selecting it again.",
      cause,
    );
  }
  const type = detectImageFormat(bytes);
  if (!type)
    throw new ImageImportError(
      "IMAGE_FORMAT_UNSUPPORTED",
      file.name,
      "Unrecognized image format. Choose a JPEG, PNG, WebP, AVIF, GIF or SVG image; renaming a file does not convert it.",
    );
  return new File([file], file.name, { type, lastModified: file.lastModified });
}
