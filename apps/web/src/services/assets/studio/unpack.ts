import { unzipSync } from "fflate";
import type { StudioManifest } from "./integrity";
/** ZIP headers are checked before allocating any inflated entry. */
export function unpackStudioZip(bytes: Uint8Array, manifest: StudioManifest) {
  const expected = new Map(
    [...manifest.models, ...manifest.licenses].map((item) => [item.file, item]),
  );
  const seen = new Set<string>();
  const files = unzipSync(bytes, {
    filter: (entry) => {
      const item = expected.get(entry.name);
      if (!item || seen.has(entry.name) || entry.originalSize !== item.byteLength)
        throw Error("Unexpected pack ZIP entry");
      seen.add(entry.name);
      return true;
    },
  });
  if (seen.size !== expected.size || Object.keys(files).length !== expected.size)
    throw Error("Missing pack ZIP entry");
  return files;
}
