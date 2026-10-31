import { chromium } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { installReadbackProbe } from "../../test/browser/support/readback-probe";
const base = process.env.SPATIAL_PREVIEW_URL ?? "http://127.0.0.1:6100";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/opt/google/chrome/chrome",
  args: [
    "--no-sandbox",
    "--enable-unsafe-webgpu",
    "--enable-unsafe-swiftshader",
    "--use-angle=vulkan",
    "--enable-features=Vulkan",
  ],
});
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  await installReadbackProbe(page);
  await page.route("**/__spatial-library-atlas", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Melt native 3D library atlas</title>",
    }),
  );
  await page.goto(`${base}/__spatial-library-atlas`);
  const result = await page.evaluate(
    async (input) => {
      const [renderer, catalog, documents, models] = await Promise.all([
        import(input.renderer) as Promise<typeof import("../../packages/render/src/index")>,
        import(input.catalog) as Promise<
          typeof import("../../apps/web/src/components/spatial/library/catalog")
        >,
        import(input.document) as Promise<
          typeof import("../../apps/web/src/components/spatial/library/document")
        >,
        import(input.models) as Promise<
          typeof import("../../apps/web/src/services/assets/spatial-library")
        >,
      ]);
      const size = 160,
        atlas = document.createElement("canvas");
      atlas.width = catalog.SPATIAL_LIBRARY_COLUMNS * size;
      atlas.height = catalog.SPATIAL_LIBRARY_ROWS * size;
      const context = atlas.getContext("2d")!;
      const store = new models.SpatialLibraryModels(),
        controller = new AbortController();
      const session = renderer.createRenderSession({ maxBytes: 128 * 1024 * 1024 });
      const frames = [];
      try {
        for (const entry of catalog.SPATIAL_LIBRARY_ENTRIES) {
          const asset =
            entry.kind === "model" ? await store.load(entry.model, controller.signal) : undefined;
          const project = documents.spatialLibraryDocument(entry, asset);
          await session.withCanvasFrame(
            project.pages[0]!,
            project.assets,
            (canvas) => {
              context.drawImage(
                canvas,
                (entry.index % catalog.SPATIAL_LIBRARY_COLUMNS) * size,
                Math.floor(entry.index / catalog.SPATIAL_LIBRARY_COLUMNS) * size,
                size,
                size,
              );
            },
            { scale: size / 256 },
          );
          frames.push({ id: entry.id, stats: session.stats() });
        }
        return {
          image: atlas.toDataURL("image/webp", 0.96),
          frames,
          reads: window.__musartVideoReadbacks,
        };
      } finally {
        controller.abort();
        store.clear();
        await session.dispose();
      }
    },
    {
      renderer: `/@fs${resolve("packages/render/src/index.ts")}`,
      catalog: `/@fs${resolve("apps/web/src/components/spatial/library/catalog.ts")}`,
      document: `/@fs${resolve("apps/web/src/components/spatial/library/document.ts")}`,
      models: `/@fs${resolve("apps/web/src/services/assets/spatial-library.ts")}`,
    },
  );
  await mkdir("artifacts/spatial-library", { recursive: true });
  await writeFile(
    "apps/web/public/spatial/library.webp",
    Buffer.from(result.image.split(",")[1]!, "base64"),
  );
  const { image, ...report } = result;
  await writeFile("artifacts/spatial-library/atlas-report.json", JSON.stringify(report, null, 2));
  console.log(
    `Rendered ${result.frames.length} genuine native library previews; production readbacks: ${JSON.stringify(result.reads)}`,
  );
} finally {
  await browser.close();
}
