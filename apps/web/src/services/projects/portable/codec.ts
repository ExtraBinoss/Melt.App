import { isOriginalMediaAsset, validateProject, type Project } from "@musart/core";
import type { MediaOriginalInput } from "../media/model";
import { portableAssets } from "./assets";
import { MAX_ARCHIVE_BYTES, MAX_DOCUMENT_BYTES, pack, unpack } from "./zip";

interface Reference {
  path: string;
  sha256: string;
}
interface Manifest {
  format: "melt-project";
  version: 1;
  project: Project;
  files: Record<string, Reference>;
}
const extension = (mime: string) =>
  ({
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/vnd.radiance": "hdr",
    "image/x-exr": "exr",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "audio/flac": "flac",
    "audio/aac": "aac",
    "model/gltf-binary": "glb",
  })[mime] ?? "bin";
async function hash(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function dataUrl(blob: Blob, mime: string) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return `data:${mime};base64,${btoa(binary)}`;
}
export async function encodeProject(
  project: Project,
  originals: readonly MediaOriginalInput[],
): Promise<Blob> {
  validateProject(project);
  const portable = structuredClone(project),
    files = new Map<string, Blob>();
  portable.assets = { ...portable.assets };
  if (portable.replay) {
    portable.replay.initial.assets = { ...portable.replay.initial.assets };
    portable.replay.assets = { ...portable.replay.assets };
  }
  const references: Record<string, Reference> = Object.create(null);
  let total = 0;
  for (const [scope, assets] of portableAssets(portable).entries()) {
    for (const asset of Object.values(assets)) {
      let blob: Blob;
      if (isOriginalMediaAsset(asset)) {
        const original = originals.find(
          (item) =>
            item.originalId === asset.originalId && item.contentRevision === asset.contentRevision,
        );
        if (!original || original.blob.size !== asset.byteLength)
          throw Error(`Missing original: ${asset.name}`);
        blob = original.blob;
      } else {
        if (!asset.dataUrl.startsWith("data:")) throw Error("Embedded original is missing.");
        blob = await (await fetch(asset.dataUrl)).blob();
      }
      if (blob.size > MAX_ARCHIVE_BYTES) throw Error("Project archive exceeds 512 MiB.");
      const sha256 = await hash(blob),
        path = `assets/${sha256}.${extension(asset.mime)}`;
      if (!files.has(path)) {
        total += blob.size;
        files.set(path, blob);
      }
      if (total > MAX_ARCHIVE_BYTES) throw Error("Project archive exceeds 512 MiB.");
      references[`${scope}/${asset.id}`] = { path, sha256 };
      if (!isOriginalMediaAsset(asset)) assets[asset.id] = { ...asset, dataUrl: path };
    }
  }
  const manifest: Manifest = {
    format: "melt-project",
    version: 1,
    project: portable,
    files: references,
  };
  const document = new Blob([JSON.stringify(manifest)], { type: "application/json" });
  if (document.size > MAX_DOCUMENT_BYTES) throw Error("Project document exceeds 32 MiB.");
  files.set("project.json", document);
  return pack(files);
}
export async function decodeProject(
  blob: Blob,
): Promise<{ project: Project; originals: MediaOriginalInput[] }> {
  const files = await unpack(blob);
  const manifest = JSON.parse(await files.get("project.json")!.text()) as Manifest;
  if (
    !manifest ||
    manifest.format !== "melt-project" ||
    manifest.version !== 1 ||
    !manifest.project?.assets ||
    !manifest.files ||
    typeof manifest.files !== "object"
  )
    throw Error("Unsupported project archive.");
  const originals: MediaOriginalInput[] = [],
    used = new Set(["project.json"]);
  const verified = new Map<string, string>();
  let referenceCount = 0;
  for (const [scope, assets] of portableAssets(manifest.project).entries()) {
    for (const asset of Object.values(assets)) {
      referenceCount++;
      const key = `${scope}/${asset.id}`;
      const ref = Object.hasOwn(manifest.files, key) ? manifest.files[key] : undefined;
      if (!ref || typeof ref.path !== "string" || !/^[a-f0-9]{64}$/.test(ref.sha256))
        throw Error(`Missing original: ${asset.name}`);
      const source = files.get(ref.path);
      if (!source) throw Error(`Missing archive entry: ${ref.path}`);
      const digest = verified.get(ref.path) ?? (await hash(source));
      if (digest !== ref.sha256) throw Error(`Damaged archive entry: ${ref.path}`);
      verified.set(ref.path, digest);
      used.add(ref.path);
      if (isOriginalMediaAsset(asset)) {
        if (source.size !== asset.byteLength) throw Error("Original media length mismatch.");
        if (
          !originals.some(
            (item) =>
              item.originalId === asset.originalId &&
              item.contentRevision === asset.contentRevision,
          )
        )
          originals.push({
            originalId: asset.originalId,
            contentRevision: asset.contentRevision,
            blob: source.slice(0, source.size, asset.mime),
          });
      } else {
        if (asset.dataUrl !== ref.path) throw Error("Original path mismatch.");
        asset.dataUrl = await dataUrl(source, asset.mime);
      }
    }
  }
  if (Object.keys(manifest.files).length !== referenceCount || used.size !== files.size)
    throw Error("Unexpected project archive entries.");
  validateProject(manifest.project);
  return { project: manifest.project, originals };
}
