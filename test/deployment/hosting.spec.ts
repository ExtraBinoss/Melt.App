import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SiteManifest } from "../../scripts/deploy/package";

test("Cloudflare serves prerendered routes, correct missing-asset status and byte-exact WASM to a native browser", async ({
  page,
  request,
}) => {
  const manifest = JSON.parse(
    readFileSync(resolve("artifacts/cloudflare/manifest.json"), "utf8"),
  ) as SiteManifest;
  const wasm = manifest.files.find((file) => file.originalSha256);
  expect(wasm, "The actual ONNX runtime must remain available after packaging.").toBeDefined();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const loaded = await page.evaluate(async (path) => {
    const response = await fetch(`/${path}`);
    const bytes = await response.arrayBuffer();
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return {
      status: response.status,
      type: response.headers.get("content-type"),
      encoding: response.headers.get("content-encoding"),
      bytes: bytes.byteLength,
      sha256: [...new Uint8Array(hash)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(""),
      validWasm: WebAssembly.validate(bytes),
    };
  }, wasm!.originalPath!);
  expect(loaded).toMatchObject({
    status: 200,
    type: "application/wasm",
    encoding: "gzip",
    bytes: wasm!.originalBytes,
    sha256: wasm!.originalSha256,
    validWasm: true,
  });
  for (const path of ["/tools", "/dashboard?template=example", "/editor?project=example"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");
  }
  expect((await request.get("/assets/missing.wasm")).status()).toBe(404);
  expect((await request.get("/assets/missing.js.map")).status()).toBe(404);
  await page.goto("/dashboard");
  await expect(page.locator(".project-dashboard")).toBeVisible();
});
