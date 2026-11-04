import type { SpatialModelDefinition } from "@musart/assets";
import descriptor from "./pack.json";
export { descriptor as STUDIO_PACK };
export type StudioModel = SpatialModelDefinition & { name: string; family: string };
export interface PackFile {
  file: string;
  byteLength: number;
  sha256: string;
}
export interface StudioManifest {
  version: 1;
  id: string;
  models: StudioModel[];
  licenses: PackFile[];
}
export async function verifyBytes(
  bytes: Uint8Array,
  expected: Pick<PackFile, "byteLength" | "sha256">,
) {
  if (bytes.length !== expected.byteLength) throw Error("Pack size mismatch");
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  if (digest !== expected.sha256) throw Error("Pack integrity mismatch");
}
export async function readBounded(
  response: Response,
  expected: Pick<PackFile, "byteLength" | "sha256">,
  signal: AbortSignal,
  progress?: (bytes: number) => void,
) {
  signal.throwIfAborted();
  if (!response.ok || Number(response.headers.get("content-length")) > expected.byteLength) {
    await response.body?.cancel();
    throw Error("Pack download failed");
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("Missing pack stream");
  const bytes = new Uint8Array(expected.byteLength);
  let offset = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > bytes.length) throw Error("Pack exceeds byte budget");
      bytes.set(value, offset);
      offset += value.length;
      progress?.(offset);
    }
    await verifyBytes(bytes.subarray(0, offset), expected);
    signal.throwIfAborted();
    return bytes;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
export function parseManifest(bytes: Uint8Array): StudioManifest {
  const [metadata, ...models] = new TextDecoder()
    .decode(bytes)
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const manifest = { ...metadata, models } as StudioManifest;
  if (
    manifest.id !== descriptor.id ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.models) ||
    manifest.models.length !== descriptor.count ||
    !Array.isArray(manifest.licenses) ||
    manifest.licenses.length !== 2
  )
    throw Error("Invalid pack manifest");
  const paths = new Set<string>();
  let total = 0;
  for (const item of [...manifest.models, ...manifest.licenses]) {
    if (
      !item ||
      typeof item.file !== "string" ||
      !/^[a-f0-9]{64}$/.test(item.sha256) ||
      !Number.isSafeInteger(item.byteLength) ||
      item.byteLength <= 0 ||
      item.byteLength > 256 * 1024 ||
      paths.has(item.file)
    )
      throw Error("Invalid pack entry");
    const isModel = "id" in item;
    if (
      isModel
        ? !/^spatial\/models\/studio-[a-zA-Z0-9-]+\.glb$/.test(item.file)
        : !/^licenses\/Kenney-(nature|prototype)\.txt$/.test(item.file)
    )
      throw Error("Invalid pack path");
    if (
      isModel &&
      (item.file !== `spatial/models/${item.id}.glb` ||
        typeof item.name !== "string" ||
        item.name.length > 160 ||
        !["nature", "prototype"].includes(item.family))
    )
      throw Error("Invalid model description");
    paths.add(item.file);
    total += item.byteLength;
  }
  if (total !== descriptor.unpackedBytes) throw Error("Invalid pack budget");
  return manifest;
}
