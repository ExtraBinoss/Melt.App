import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";

export const assetLimit = 25 * 1024 * 1024;
export interface SiteFile {
  path: string;
  bytes: number;
  sha256: string;
  originalBytes?: number;
  originalSha256?: string;
  originalPath?: string;
}
export interface SiteManifest {
  version: 1;
  revision?: string;
  files: SiteFile[];
}
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function* files(folder: string, prefix = ""): AsyncGenerator<string> {
  const entries = await readdir(join(folder, prefix), { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw Error(`Deployment assets cannot contain symlinks: ${path}`);
    if (entry.isDirectory()) yield* files(folder, path);
    else if (entry.isFile()) yield path;
    else throw Error(`Unsupported deployment asset: ${path}`);
  }
}

/** Build an independent HTTP package; never alter Vite's original output or font binaries. */
export async function prepareSite(
  input: string,
  output: string,
  options: { limit?: number; revision?: string } = {},
): Promise<SiteManifest> {
  const source = resolve(input),
    destination = resolve(output);
  const inside = (parent: string, child: string) =>
    child === parent || child.startsWith(parent + sep);
  if (inside(source, destination) || inside(destination, source))
    throw Error("Source and deployment directories must be independent.");
  if (!(await stat(join(source, "index.html"))).isFile())
    throw Error("Missing prerendered index.html.");
  const limit = options.limit ?? assetLimit;
  if (!Number.isSafeInteger(limit) || limit < 1) throw Error("Invalid asset size limit.");
  const temporary = `${destination}.preparing-${randomUUID()}`;
  const backup = `${destination}.previous-${randomUUID()}`;
  const manifest: SiteManifest = { version: 1, revision: options.revision, files: [] };
  let existingHeaders = "",
    previous = false;
  await mkdir(temporary, { recursive: true });
  try {
    for await (const path of files(source)) {
      if (path.endsWith(".map")) continue;
      if (path === "_headers") {
        existingHeaders = await readFile(join(source, path), "utf8");
        continue;
      }
      if (manifest.files.length >= 19999) throw Error("Cloudflare asset count limit exceeded.");
      const size = (await stat(join(source, path))).size;
      if (size > 128 * 1024 * 1024)
        throw Error(`Asset exceeds the preparation memory budget: ${path}`);
      let bytes = await readFile(join(source, path));
      const file: SiteFile = { path, bytes: bytes.length, sha256: digest(bytes) };
      if (bytes.length > limit) {
        if (
          !/^assets\/[\w.-]+\.wasm$/.test(path) ||
          !bytes.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109]))
        )
          throw Error(`Asset exceeds Cloudflare's upload limit: ${path}`);
        file.originalBytes = bytes.length;
        file.originalSha256 = file.sha256;
        file.originalPath = path;
        bytes = gzipSync(bytes, { level: 9 });
        if (bytes.length > limit)
          throw Error(`Compressed asset still exceeds Cloudflare's limit: ${path}`);
        file.path = `${path}.gz`;
        file.bytes = bytes.length;
        file.sha256 = digest(bytes);
      }
      await mkdir(dirname(join(temporary, file.path)), { recursive: true });
      await writeFile(join(temporary, file.path), bytes);
      manifest.files.push(file);
    }
    const headers =
      [
        existingHeaders.trim(),
        "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin",
        "/assets/*\n  Cache-Control: public, max-age=31536000, immutable",
      ]
        .filter(Boolean)
        .join("\n\n") + "\n";
    const headerBytes = Buffer.from(headers);
    await writeFile(join(temporary, "_headers"), headerBytes);
    manifest.files.push({
      path: "_headers",
      bytes: headerBytes.length,
      sha256: digest(headerBytes),
    });
    try {
      await rename(destination, backup);
      previous = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await rename(temporary, destination);
    } catch (error) {
      if (previous) await rename(backup, destination);
      throw error;
    }
    if (previous) await rm(backup, { recursive: true, force: true });
    return manifest;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

/** Reject stale, altered or extra artifact contents before any credential is exposed. */
export async function verifySite(site: string, manifest: SiteManifest, revision: string) {
  if (manifest.version !== 1 || manifest.revision !== revision || !/^[a-f0-9]{40}$/.test(revision))
    throw Error("Deployment artifact does not match the requested GitHub commit.");
  const expected = new Map(manifest.files.map((file) => [file.path, file]));
  if (expected.size !== manifest.files.length || !expected.has("index.html"))
    throw Error("Invalid deployment manifest.");
  for await (const path of files(site)) {
    const file = expected.get(path);
    if (!file) throw Error(`Unexpected deployment asset: ${path}`);
    const bytes = await readFile(join(site, path));
    if (bytes.length !== file.bytes || bytes.length > assetLimit || digest(bytes) !== file.sha256)
      throw Error(`Deployment asset integrity check failed: ${path}`);
    expected.delete(path);
  }
  if (expected.size)
    throw Error(`Deployment assets are missing: ${[...expected.keys()].join(", ")}`);
}

if (import.meta.main) {
  const [operation, input = "dist/client", output = "artifacts/cloudflare/site"] =
    process.argv.slice(2);
  const manifestPath = join(dirname(resolve(output)), "manifest.json");
  if (operation === "prepare") {
    const manifest = await prepareSite(input, output, { revision: process.env.GITHUB_SHA });
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    console.log(
      `Prepared ${manifest.files.length} static assets; ${manifest.files.filter((file) => file.originalBytes).length} use verified gzip transport.`,
    );
  } else if (operation === "verify") {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as SiteManifest;
    await verifySite(output, manifest, process.env.GITHUB_SHA ?? "");
    console.log("Deployment package matches the event commit and recorded file hashes.");
  } else throw Error("Use prepare or verify, followed by the client build and output directory.");
}
