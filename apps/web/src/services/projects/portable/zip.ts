import { Unzip, UnzipInflate, Zip, ZipPassThrough } from "fflate";
export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;
const safePath = (path: string) =>
  path === "project.json" || /^assets\/[a-f0-9]{64}\.[a-z0-9]+$/.test(path);

/** Native encoded media stays in Blob chunks, without one combined Uint8Array. */
export async function pack(files: ReadonlyMap<string, Blob>): Promise<Blob> {
  if (files.size > 10001 || !files.has("project.json"))
    throw Error("Invalid project archive inventory.");
  const chunks: BlobPart[] = [];
  let total = 0;
  const zip = new Zip((error, data) => {
    if (error) throw error;
    total += data.byteLength;
    if (total > MAX_ARCHIVE_BYTES) throw Error("Project archive exceeds 512 MiB.");
    chunks.push(data as Uint8Array<ArrayBuffer>);
  });
  try {
    for (const [path, blob] of files) {
      if (!safePath(path)) throw Error("Invalid archive path.");
      const entry = new ZipPassThrough(path);
      zip.add(entry);
      const reader = blob.stream().getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          entry.push(value, false);
        }
        entry.push(new Uint8Array(), true);
      } finally {
        reader.releaseLock();
      }
    }
    zip.end();
    return new Blob(chunks, { type: "application/zip" });
  } finally {
    zip.terminate();
  }
}

export async function unpack(blob: Blob): Promise<Map<string, Blob>> {
  if (blob.size > MAX_ARCHIVE_BYTES) throw Error("Project archive exceeds 512 MiB.");
  const tail = new Uint8Array(await blob.slice(-65557).arrayBuffer());
  let end = -1;
  const view = new DataView(tail.buffer);
  for (let i = tail.length - 22; i >= 0; i--) {
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === tail.length
    ) {
      end = i;
      break;
    }
  }
  if (
    end < 0 ||
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    view.getUint16(end + 8, true) !== view.getUint16(end + 10, true) ||
    view.getUint32(end + 12, true) + view.getUint32(end + 16, true) !==
      blob.size - tail.length + end
  )
    throw Error("Incomplete or unsupported project archive.");
  const expectedEntries = view.getUint16(end + 10, true);
  const files = new Map<string, Blob>(),
    names = new Set<string>();
  let total = 0,
    completed = 0;
  const unzip = new Unzip((entry) => {
    if (!safePath(entry.name) || names.has(entry.name) || names.size >= 10001)
      throw Error("Invalid or duplicate archive path.");
    names.add(entry.name);
    if ((entry.originalSize ?? 0) > MAX_ARCHIVE_BYTES)
      throw Error("Archive entry exceeds its budget.");
    const chunks: BlobPart[] = [];
    let size = 0;
    entry.ondata = (error, data, final) => {
      if (error) throw error;
      total += data.byteLength;
      size += data.byteLength;
      if (total > MAX_ARCHIVE_BYTES || (entry.name === "project.json" && size > MAX_DOCUMENT_BYTES))
        throw Error("Expanded project archive exceeds its budget.");
      chunks.push(data as Uint8Array<ArrayBuffer>);
      if (final) {
        files.set(entry.name, new Blob(chunks));
        completed++;
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  const reader = blob.stream().getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      unzip.push(value, false);
    }
    unzip.push(new Uint8Array(), true);
  } finally {
    reader.releaseLock();
  }
  if (completed !== names.size || completed !== expectedEntries || !files.has("project.json"))
    throw Error("Incomplete project archive.");
  return files;
}
