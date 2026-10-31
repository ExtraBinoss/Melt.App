import { unzipSync } from "fflate";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, posix } from "node:path";
const packs = {
  prototype: {
    hash: "213b522fb12bcc9b9ac66c4f7581f7c74623293272212e40a70c39936ad3da95",
    source: "https://kenney.nl/assets/prototype-kit",
    download: "https://opengameart.org/sites/default/files/kenney_prototype-kit.zip",
    prefix: "Models/GLB format/",
  },
  nature: {
    hash: "fa7974a0d342bfe63c38664ba9f8ec1a4aab8ea25f099bdc56870e33588c4d9d",
    source: "https://kenney.nl/assets/nature-kit",
    download: "https://opengameart.org/sites/default/files/Nature%20Kit%20%282.1%29.zip",
    prefix: "Models/GLTF format/",
  },
} as const;
const models = [
  ["hexFrame", "prototype", "shape-hollow-hexagon"],
  ["hexArc", "prototype", "shape-hollow-hexagon-half"],
  ["ringFrame", "prototype", "shape-hollow-cylinder"],
  ["ringArc", "prototype", "shape-hollow-cylinder-half"],
  ["rim", "prototype", "shape-hollow-cylinder-detailed"],
  ["halfDisc", "prototype", "shape-cylinder-half-detailed"],
  ["halfHex", "prototype", "shape-hexagon-half"],
  ["prism", "prototype", "shape-triangular-prism-low"],
  ["wedge", "prototype", "shape-slope"],
  ["roundedBlock", "prototype", "shape-cube-rounded"],
  ["puck", "prototype", "shape-cylinder-detailed"],
  ["halfBlock", "prototype", "shape-cube-half"],
  ["rockA", "nature", "rock_largeA"],
  ["rockB", "nature", "rock_largeB"],
  ["rockC", "nature", "rock_largeC"],
  ["rockE", "nature", "rock_largeE"],
] as const;
function embedTextures(input: Uint8Array, folder: string, archive: Record<string, Uint8Array>) {
  const header = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2)
    throw Error("Expected GLB v2");
  const jsonBytes = header.getUint32(12, true);
  const gltf = JSON.parse(new TextDecoder().decode(input.subarray(20, 20 + jsonBytes)));
  const images = gltf.images as
    | { uri?: string; bufferView?: number; mimeType?: string }[]
    | undefined;
  if (!images?.some((image) => image.uri)) return input;
  const start = 28 + jsonBytes,
    binary = input.subarray(start, start + gltf.buffers[0].byteLength);
  const chunks: Uint8Array[] = [binary];
  let size = binary.length;
  for (const image of images)
    if (image.uri) {
      if (!/^[a-zA-Z0-9/_.-]+\.png$/.test(image.uri) || image.uri.includes(".."))
        throw Error("Unsafe model texture");
      const png = archive[posix.join(folder, image.uri)];
      if (!png) throw Error("Missing original model palette");
      const padding = (4 - (size % 4)) % 4;
      if (padding) {
        chunks.push(new Uint8Array(padding));
        size += padding;
      }
      image.bufferView = gltf.bufferViews.length;
      gltf.bufferViews.push({ buffer: 0, byteOffset: size, byteLength: png.length });
      image.mimeType = "image/png";
      delete image.uri;
      chunks.push(png);
      size += png.length;
    }
  const pad = (4 - (size % 4)) % 4;
  if (pad) {
    chunks.push(new Uint8Array(pad));
    size += pad;
  }
  gltf.buffers[0].byteLength = size;
  const json = new TextEncoder().encode(JSON.stringify(gltf)),
    length = Math.ceil(json.length / 4) * 4;
  const output = new Uint8Array(28 + length + size),
    view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, output.length, true);
  view.setUint32(12, length, true);
  view.setUint32(16, 0x4e4f534a, true);
  output.fill(32, 20, 20 + length);
  output.set(json, 20);
  view.setUint32(20 + length, size, true);
  view.setUint32(24 + length, 0x004e4942, true);
  let at = 28 + length;
  for (const chunk of chunks) {
    output.set(chunk, at);
    at += chunk.length;
  }
  return output;
}
export async function bundleKenney(
  directory = "artifacts/cornell",
  output = "apps/web/public/spatial/models",
) {
  await mkdir(output, { recursive: true });
  const archives = new Map<keyof typeof packs, Record<string, Uint8Array>>();
  for (const [id, pack] of Object.entries(packs)) {
    const bytes = await readFile(`${directory}/kenney-${id}.zip`);
    if (createHash("sha256").update(bytes).digest("hex") !== pack.hash)
      throw Error("Kenney archive integrity mismatch");
    const files = unzipSync(bytes);
    archives.set(id as keyof typeof packs, files);
    const license = files["License.txt"];
    if (!license || !new TextDecoder().decode(license).includes("commercial"))
      throw Error("Missing commercial-use license");
    await writeFile(`${output}/Kenney-${id}-LICENSE.txt`, license);
  }
  const records = [];
  for (const [id, packId, file] of models) {
    const pack = packs[packId],
      archive = archives.get(packId)!,
      path = `${pack.prefix}${file}.glb`;
    const original = archive[path];
    if (!original) throw Error(`Missing original ${path}`);
    const data = embedTextures(original, dirname(path), archive);
    await writeFile(`${output}/${id}.glb`, data);
    records.push({
      id,
      nameKey: `modelNames.${id}`,
      file: `spatial/models/${id}.glb`,
      byteLength: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
      author: "Kenney",
      license: "CC0-1.0",
      source: pack.source,
      archive: pack.download,
      archiveSha256: pack.hash,
      original: path,
      originalSha256: createHash("sha256").update(original).digest("hex"),
      modification:
        data === original
          ? "Unmodified"
          : "Embedded original PNG palette; geometry and materials unchanged",
    });
  }
  await mkdir("packages/assets/data/spatial", { recursive: true });
  await writeFile(
    "packages/assets/data/spatial/models.json",
    JSON.stringify(records, null, 2) + "\n",
  );
  console.log(
    `${records.length} CC0 GLBs, ${records.reduce((sum, r) => sum + r.byteLength, 0)} bytes total`,
  );
}
if (import.meta.main) await bundleKenney();
