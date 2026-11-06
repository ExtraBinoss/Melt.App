/** Bake every SDK catalog preview once; runtime menus only load the immutable image atlas. */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type * as Core from "../../packages/core/src/index";
import type * as Render from "../../packages/render/src/index";
import type * as Sources from "./source-scenes";
import { catalogAttribution, loadCatalogOriginals } from "./photo-assets";
import { installReadbackProbe } from "../../test/browser/support/readback-probe";

const base = process.env.EFFECT_PREVIEW_URL ?? "http://127.0.0.1:6100";
const originals = await loadCatalogOriginals();
const auditOriginals = originals.map(({ dataUrl: _dataUrl, ...source }) => source);
const reportPath = "artifacts/effect-catalog/atlas-report.json";
await mkdir("artifacts/effect-catalog", { recursive: true });
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
const errors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
    if (message.text().startsWith("[effect-catalog]")) console.log(message.text());
  });
  await installReadbackProbe(page);
  await page.route("**/__effect-catalog-atlas", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Melt photographic effect atlas</title>",
    }),
  );
  await page.goto(`${base}/__effect-catalog-atlas`);
  const result = await page.evaluate(
    async (input) => {
      const [core, renderer, sources] = await Promise.all([
        import(input.core) as Promise<typeof Core>,
        import(input.renderer) as Promise<typeof Render>,
        import(input.sources) as Promise<typeof Sources>,
      ]);
      const cellWidth = 240,
        cellHeight = 180,
        columns = 8;
      const entries = Object.values(core.EFFECT_CATALOG).filter(
        (entry) => !entry.retired && !entry.source,
      );
      const assets: Record<string, Core.Asset> = {};
      const decodedOriginals = [];
      // One bounded decode of each immutable original, shared by all authored scenes.
      for (const original of input.originals) {
        const response = await fetch(original.dataUrl);
        const bitmap = await createImageBitmap(await response.blob());
        try {
          if (
            bitmap.width > 4096 ||
            bitmap.height > 4096 ||
            bitmap.width * bitmap.height > 8_000_000
          )
            throw new Error(`Oversized catalog original: ${original.file}`);
          assets[original.id] = {
            id: original.id,
            name: original.file,
            mime: original.mime,
            width: bitmap.width,
            height: bitmap.height,
            dataUrl: original.dataUrl,
          };
          const { dataUrl: _dataUrl, ...audit } = original;
          decodedOriginals.push({ ...audit, width: bitmap.width, height: bitmap.height });
        } finally {
          bitmap.close();
        }
      }
      const atlas = document.createElement("canvas");
      atlas.width = columns * cellWidth;
      atlas.height = Math.ceil(entries.length / columns) * cellHeight;
      const context = atlas.getContext("2d");
      if (!context) throw new Error("Atlas encoder canvas unavailable");
      context.fillStyle = "#17202c";
      context.fillRect(0, 0, atlas.width, atlas.height);
      const failures: { type: Core.EffectType; reason: string }[] = [];
      const scenes: Sources.CatalogScene[] = [];
      for (const entry of entries) {
        try {
          const scene = sources.createEffectCatalogScene(entry.type);
          const validateProject: typeof Core.validateProject = core.validateProject;
          validateProject(core.createProject({ pages: [scene.composition], assets }));
          scenes.push(scene);
        } catch (error) {
          failures.push({ type: entry.type, reason: String(error) });
        }
      }
      const frames: {
        type: Core.EffectType;
        stats: ReturnType<ReturnType<typeof renderer.createRenderSession>["stats"]>;
      }[] = [];
      const session = renderer.createRenderSession({ maxBytes: 64 * 1024 * 1024 });
      try {
        // Refuse partial output: never publish placeholders as successful native previews.
        if (!failures.length)
          for (const [index, scene] of scenes.entries()) {
            const type = scene.effect.type;
            try {
              let composition = scene.composition;
              let motionFrame: Core.MotionFramePlan | undefined;
              if (scene.sampleTime !== undefined) {
                const project = core.createProject({ pages: [composition], assets });
                const program = core.compileMotion(project, { compositionId: composition.id });
                motionFrame = core.evaluateMotion(program, {
                  value: Math.round(scene.sampleTime * 1000),
                  rate: 1000,
                });
                composition = core.applyMotionFrame(program, motionFrame);
              }
              await session.withCanvasFrame(
                composition,
                assets,
                (canvas) => {
                  if (canvas.width !== cellWidth || canvas.height !== cellHeight)
                    throw new Error(
                      `Unexpected native output size ${canvas.width} × ${canvas.height}`,
                    );
                  context.drawImage(
                    canvas,
                    (index % columns) * cellWidth,
                    Math.floor(index / columns) * cellHeight,
                  );
                },
                { motionFrame, maxImageDimension: 720, imageSourceScale: 1 },
              );
              const stats = session.stats();
              if (!stats || stats.readbacks !== 0)
                throw new Error("Native frame reports pixel readbacks");
              if (scene.scene === "depth" && !stats.spatial?.sources)
                throw new Error("Depth scene rendered without native spatial sources");
              frames.push({ type, stats });
              console.info(`[effect-catalog] ${index + 1}/${scenes.length} ${scene.title}`);
            } catch (error) {
              failures.push({ type, reason: String(error) });
              break;
            }
          }
        return {
          image: failures.length ? null : atlas.toDataURL("image/webp", 0.94),
          entries: entries.map(({ type }) => type),
          sources: scenes.map(({ composition: _composition, ...scene }) => ({
            type: scene.effect.type,
            ...scene,
          })),
          documents: scenes.map(({ composition }) => composition),
          originals: decodedOriginals,
          columns,
          cellWidth,
          cellHeight,
          width: atlas.width,
          height: atlas.height,
          frames,
          failures,
          reads: window.__musartVideoReadbacks,
        };
      } finally {
        await session.dispose();
      }
    },
    {
      core: `/@fs${resolve("packages/core/src/index.ts")}`,
      renderer: `/@fs${resolve("packages/render/src/index.ts")}`,
      sources: `/@fs${resolve("scripts/effects/source-scenes.ts")}`,
      originals,
    },
  );
  const { image, frames, reads, documents, failures, ...metadata } = result;
  const readbackFailure =
    reads && [reads.gpu, reads.webgl, reads.canvas, reads.videoFrame].some((count) => count !== 0);
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        status: !image || failures.length || errors.length || readbackFailure ? "failed" : "baked",
        ...metadata,
        frames,
        reads,
        documents,
        failures,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  if (failures.length) throw new Error(`Native catalog bake failed: ${JSON.stringify(failures)}`);
  if (errors.length) throw new Error(`Effect atlas browser errors: ${errors.join("; ")}`);
  if (readbackFailure) throw new Error(`Production readback detected: ${JSON.stringify(reads)}`);
  if (!image?.startsWith("data:image/webp;base64,"))
    throw new Error("Native atlas WebP encoding failed");
  const bytes = Buffer.from(image.split(",")[1]!, "base64");
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const file = `catalog-${contentHash.slice(0, 24)}.webp`;
  await mkdir("apps/web/public/effects", { recursive: true });
  await writeFile(`apps/web/public/effects/${file}`, bytes);
  const attribution = "apps/web/public/effects/ATTRIBUTION.md";
  await writeFile(
    `${attribution}.tmp`,
    catalogAttribution(file, metadata.entries.length, auditOriginals),
  );
  await rename(`${attribution}.tmp`, attribution);
  const manifest = "apps/web/src/components/layers/catalog/effect-atlas.json";
  const { sources, ...runtimeMetadata } = metadata;
  const sourceFiles: string[] = [];
  for (let index = 0; index < sources.length; index += 10) {
    const name = `effect-atlas-sources-${contentHash.slice(0, 12)}-${index / 10 + 1}.json`;
    const path = `apps/web/src/components/layers/catalog/${name}`;
    await writeFile(
      `${path}.tmp`,
      JSON.stringify(sources.slice(index, index + 10), null, 2) + "\n",
    );
    await rename(`${path}.tmp`, path);
    sourceFiles.push(name);
  }
  await writeFile(
    `${manifest}.tmp`,
    JSON.stringify({ version: 3, file, contentHash, ...runtimeMetadata, sourceFiles }, null, 2) +
      "\n",
  );
  // Existing atlas files stay valid until this final atomic manifest replacement succeeds.
  await rename(`${manifest}.tmp`, manifest);
  console.log(
    `Published ${metadata.entries.length} photographic SDK previews: ${file}; readbacks ${JSON.stringify(reads)}`,
  );
} catch (error) {
  console.error(`[effect-catalog] Publication stopped; previous atlas retained. ${String(error)}`);
  throw error;
} finally {
  await browser.close();
}
