import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import { prepareSite, verifySite } from "../../../scripts/deploy/package";

let root: string, source: string, output: string;
const revision = "a".repeat(40);
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "melt-deployment-"));
  source = join(root, "client");
  output = join(root, "package/site");
  await mkdir(join(source, "assets"), { recursive: true });
  await writeFile(join(source, "index.html"), "<!doctype html><h1>Melt</h1>");
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("oversized WASM is lossless HTTP gzip, source maps stay private and the source build is unchanged", async () => {
  const original = Buffer.concat([Buffer.from([0, 97, 115, 109]), Buffer.alloc(4096, 42)]);
  await writeFile(join(source, "assets/runtime-12345678.wasm"), original);
  await writeFile(join(source, "assets/app.js.map"), "private debugging metadata");
  const manifest = await prepareSite(source, output, { limit: 1024, revision });
  const packed = await readFile(join(output, "assets/runtime-12345678.wasm.gz"));
  expect(packed.length).toBeLessThan(1024);
  expect(gunzipSync(packed)).toEqual(original);
  expect(await readFile(join(source, "assets/runtime-12345678.wasm"))).toEqual(original);
  await expect(readFile(join(output, "assets/app.js.map"))).rejects.toThrow();
  const headers = await readFile(join(output, "_headers"), "utf8");
  expect(headers).not.toContain("Content-Encoding");
  expect(manifest.files.find((file) => file.originalPath?.endsWith(".wasm"))?.originalBytes).toBe(
    original.length,
  );
  await expect(verifySite(output, manifest, revision)).resolves.toBeUndefined();
});

test("unsupported or incompressible oversized assets fail without replacing the previous good package", async () => {
  await prepareSite(source, output, { revision });
  const previous = await readFile(join(output, "index.html"));
  await writeFile(join(source, "large.bin"), Buffer.alloc(2048));
  await expect(prepareSite(source, output, { limit: 1024 })).rejects.toThrow("upload limit");
  expect(await readFile(join(output, "index.html"))).toEqual(previous);
  await rm(join(source, "large.bin"));
  await writeFile(
    join(source, "assets/large.wasm"),
    Buffer.concat([Buffer.from([0, 97, 115, 109]), randomBytes(4096)]),
  );
  await expect(prepareSite(source, output, { limit: 1024 })).rejects.toThrow("Compressed asset");
  expect(await readFile(join(output, "index.html"))).toEqual(previous);
});

test("overlapping directories and symlink assets cannot overwrite or leak files", async () => {
  await expect(prepareSite(source, join(source, "nested"))).rejects.toThrow("independent");
  await writeFile(join(root, "private.txt"), "not a public asset");
  await symlink(join(root, "private.txt"), join(source, "private.txt"));
  await expect(prepareSite(source, output)).rejects.toThrow("symlinks");
  expect(await readFile(join(root, "private.txt"), "utf8")).toBe("not a public asset");
});

test("stale commits and altered, missing or extra files are rejected before publication", async () => {
  const manifest = await prepareSite(source, output, { revision });
  await expect(verifySite(output, manifest, "b".repeat(40))).rejects.toThrow("commit");
  await writeFile(join(output, "extra.txt"), "unexpected");
  await expect(verifySite(output, manifest, revision)).rejects.toThrow("Unexpected");
  await rm(join(output, "extra.txt"));
  await writeFile(join(output, "index.html"), "tampered");
  await expect(verifySite(output, manifest, revision)).rejects.toThrow("integrity");
  await rm(join(output, "index.html"));
  await expect(verifySite(output, manifest, revision)).rejects.toThrow("missing");
});
