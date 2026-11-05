/** Bake offline-pack tiles with the native graph; browsing never prepares 3D sources. */
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { STUDIO_PACK, parseManifest } from "../../apps/web/src/services/assets/studio/integrity";
import { installReadbackProbe } from "../../test/browser/support/readback-probe";
import type * as Render from "../../packages/render/src/index";
import type * as Documents from "../../apps/web/src/components/spatial/library/document";
import type * as Models from "../../apps/web/src/services/assets/spatial-library";

const base = process.env.SPATIAL_PREVIEW_URL ?? "http://127.0.0.1:6100";
const manifest = parseManifest(
  new Uint8Array(await readFile(`apps/web/public/${STUDIO_PACK.manifestFile}`)),
);
const files = unzipSync(new Uint8Array(await readFile(`apps/web/public/${STUDIO_PACK.file}`)));
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/opt/google/chrome/chrome",
  args: [
    "--no-sandbox",
    "--enable-unsafe-webgpu",
    "--use-angle=vulkan",
    "--enable-features=Vulkan",
  ],
});
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  await installReadbackProbe(page);
  await page.route("**/spatial/models/studio-*.glb", (route) => {
    const key = new URL(route.request().url()).pathname.replace(/^\//, "");
    const bytes = files[key];
    return bytes
      ? route.fulfill({ body: Buffer.from(bytes), contentType: "model/gltf-binary" })
      : route.abort();
  });
  await page.route("**/__pack-atlas", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Melt pack atlas</title>",
    }),
  );
  page.on("console", (message) => {
    if (message.text().startsWith("[pack-atlas]")) console.log(message.text());
  });
  await page.goto(`${base}/__pack-atlas`);
  const result = await page.evaluate(
    async (input) => {
      const [render, docs, models] = await Promise.all([
        import(input.render) as Promise<typeof Render>,
        import(input.documents) as Promise<typeof Documents>,
        import(input.models) as Promise<typeof Models>,
      ]);
      const size = 96,
        columns = 16,
        rows = Math.ceil(input.entries.length / columns);
      const atlas = document.createElement("canvas");
      atlas.width = columns * size;
      atlas.height = rows * size;
      const context = atlas.getContext("2d")!;
      const store = new models.SpatialLibraryModels(),
        controller = new AbortController();
      const session = render.createRenderSession({ maxBytes: 96 * 1024 * 1024 });
      let peakBytes = 0;
      try {
        for (const [index, model] of input.entries.entries()) {
          const asset = await store.load(model, controller.signal);
          const project = docs.spatialLibraryDocument(
            {
              id: model.id,
              kind: "model",
              model,
              index,
              nameKey: model.nameKey,
              originalMaterials: true,
            },
            asset,
          );
          await session.withCanvasFrame(
            project.pages[0]!,
            project.assets,
            (canvas) => {
              context.drawImage(
                canvas,
                (index % columns) * size,
                Math.floor(index / columns) * size,
                size,
                size,
              );
            },
            { scale: size / 256 },
          );
          peakBytes = Math.max(peakBytes, session.stats()?.cacheBytes ?? 0);
          if (index % 24 === 0) console.log(`[pack-atlas] ${index + 1}/${input.entries.length}`);
        }
        return {
          image: atlas.toDataURL("image/webp", 0.9),
          size,
          columns,
          rows,
          count: input.entries.length,
          peakBytes,
          reads: window.__musartVideoReadbacks,
        };
      } finally {
        controller.abort();
        store.clear();
        await session.dispose();
      }
    },
    {
      entries: manifest.models,
      render: `/@fs${resolve("packages/render/src/index.ts")}`,
      documents: `/@fs${resolve("apps/web/src/components/spatial/library/document.ts")}`,
      models: `/@fs${resolve("apps/web/src/services/assets/spatial-library.ts")}`,
    },
  );
  const bytes = Buffer.from(result.image.split(",")[1]!, "base64");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const file = `spatial/packs/previews-${sha256}.webp`;
  await writeFile(`apps/web/public/${file}`, bytes);
  const { image, peakBytes, reads, ...metadata } = result;
  await writeFile(
    "apps/web/src/services/assets/studio/posters.json",
    JSON.stringify(
      {
        file,
        sha256,
        byteLength: bytes.length,
        manifestSha256: STUDIO_PACK.manifestSha256,
        ...metadata,
      },
      null,
      2,
    ) + "\n",
  );
  await mkdir("artifacts/studio/pack-atlas", { recursive: true });
  await writeFile(
    "artifacts/studio/pack-atlas/report.json",
    JSON.stringify({ ...metadata, sha256, byteLength: bytes.length, peakBytes, reads }, null, 2) +
      "\n",
  );
  console.log(`Baked ${result.count} native posters: ${bytes.length} bytes`);
} finally {
  await browser.close();
}
