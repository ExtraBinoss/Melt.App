import { unzipSync, zipSync } from "fflate";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { embedTextures } from "./bundle-kenney";
const sources = {
  nature: {
    sha256: "fa7974a0d342bfe63c38664ba9f8ec1a4aab8ea25f099bdc56870e33588c4d9d",
    source: "https://kenney.nl/assets/nature-kit",
    archive: "https://opengameart.org/sites/default/files/Nature%20Kit%20%282.1%29.zip",
    prefix: "Models/GLTF format/",
  },
  prototype: {
    sha256: "213b522fb12bcc9b9ac66c4f7581f7c74623293272212e40a70c39936ad3da95",
    source: "https://kenney.nl/assets/prototype-kit",
    archive: "https://opengameart.org/sites/default/files/kenney_prototype-kit.zip",
    prefix: "Models/GLB format/",
  },
};
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
export async function bundleStudioPack(directory = "artifacts/cornell") {
  const files: Record<string, Uint8Array> = {},
    models = [];
  for (const [family, source] of Object.entries(sources)) {
    const bytes = await readFile(`${directory}/kenney-${family}.zip`);
    if (hash(bytes) !== source.sha256) throw Error("Archive integrity mismatch");
    const archive = unzipSync(bytes),
      license = archive["License.txt"];
    if (!license || !new TextDecoder().decode(license).includes("commercial"))
      throw Error("Missing CC0 license");
    files[`licenses/Kenney-${family}.txt`] = license;
    for (const original of Object.keys(archive).sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    )) {
      if (!original.startsWith(source.prefix) || !original.endsWith(".glb")) continue;
      const basename = original.slice(source.prefix.length, -4);
      if (!/^[\w-]+$/.test(basename)) throw Error("Invalid source name");
      const id = `studio-${family}-${basename.replaceAll("_", "-")}`,
        data = embedTextures(archive[original]!, dirname(original), archive),
        file = `spatial/models/${id}.glb`;
      if (data.length > 256 * 1024) throw Error(`Model too large: ${original}`);
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const gltf = JSON.parse(
        new TextDecoder().decode(data.subarray(20, 20 + view.getUint32(12, true))),
      );
      if (
        gltf.images?.some((image: { uri?: string }) => image.uri) ||
        gltf.buffers?.some((buffer: { uri?: string }) => buffer.uri)
      )
        throw Error("External model resource");
      if (files[file]) throw Error("Duplicate model");
      files[file] = data;
      models.push({
        id,
        name: basename.replaceAll(/[_-]/g, " "),
        family,
        nameKey: id,
        file,
        byteLength: data.length,
        sha256: hash(data),
        author: "Kenney",
        license: "CC0-1.0",
        source: source.source,
        archive: source.archive,
        archiveSha256: source.sha256,
        original,
        originalSha256: hash(archive[original]!),
        modification:
          data === archive[original]
            ? "Unmodified"
            : "Embedded original PNG palette; geometry and materials unchanged",
      });
    }
  }
  const manifest = {
    version: 1,
    id: "kenney-creative-v1",
    models,
    licenses: Object.entries(files)
      .filter(([file]) => file.startsWith("licenses/"))
      .map(([file, data]) => ({ file, byteLength: data.length, sha256: hash(data) })),
  };
  // One metadata record followed by one original/model record per line.
  // The catalog stays bounded and reviewable without a multi-thousand-line JSON array.
  const { models: entries, ...metadata } = manifest;
  const manifestBytes = new TextEncoder().encode(
    [JSON.stringify(metadata), ...entries.map((entry) => JSON.stringify(entry))].join("\n") + "\n",
  );
  const zip = zipSync(files, { level: 6, mtime: new Date("2026-01-01T00:00:00Z") });
  const zipHash = hash(zip),
    manifestHash = hash(manifestBytes);
  const output = "apps/web/public/spatial/packs";
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/${zipHash}.zip`, zip);
  await writeFile(`${output}/${manifestHash}.jsonl`, manifestBytes);
  for (const [file, data] of Object.entries(files))
    if (file.startsWith("licenses/")) {
      // Readable copies use repository line endings; ZIP entries retain exact upstream bytes.
      const notice = new TextDecoder()
        .decode(data)
        .replace(/\r+\n?/g, "\n")
        .replace(/[ \t]+$/gm, "");
      await writeFile(`${output}/${file.slice(9)}`, notice);
    }
  const descriptor = {
    id: manifest.id,
    count: models.length,
    byteLength: zip.length,
    unpackedBytes: Object.values(files).reduce((sum, data) => sum + data.length, 0),
    sha256: zipHash,
    file: `spatial/packs/${zipHash}.zip`,
    manifestSha256: manifestHash,
    manifestBytes: manifestBytes.length,
    manifestFile: `spatial/packs/${manifestHash}.jsonl`,
  };
  await writeFile(
    "apps/web/src/services/assets/studio/pack.json",
    JSON.stringify(descriptor, null, 2) + "\n",
  );
  console.log(JSON.stringify(descriptor));
}
if (import.meta.main) await bundleStudioPack();
