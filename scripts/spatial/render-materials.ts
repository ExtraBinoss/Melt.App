/** Bake genuine native spheres, one source at a time, using the production GPU graph. */
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type * as Core from "../../packages/core/src/index";
import type * as Render from "../../packages/render/src/index";
import { installReadbackProbe } from "../../test/browser/support/readback-probe";
const base = process.env.SPATIAL_PREVIEW_URL ?? "http://127.0.0.1:6100";
const atlasKind = process.env.SPATIAL_ATLAS_KIND ?? "all";
if (atlasKind !== "all" && atlasKind !== "environments")
  throw Error("SPATIAL_ATLAS_KIND must be all or environments");
interface AtlasMetadata {
  version: number;
  cellSize: number;
  columns: number;
  materials: {
    file: string;
    width: number;
    height: number;
    entries: string[];
  };
  environments: AtlasMetadata["materials"];
}
const metadataPath = "apps/web/public/spatial/catalog-atlas.json";
const previousMetadata =
  atlasKind === "environments"
    ? (JSON.parse(await readFile(metadataPath, "utf8")) as AtlasMetadata)
    : null;
if (
  previousMetadata &&
  (previousMetadata.version !== 2 ||
    previousMetadata.cellSize !== 160 ||
    previousMetadata.columns !== 8 ||
    !previousMetadata.materials?.entries?.length)
)
  throw Error("Environment-only baking requires the existing compatible material atlas metadata");
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
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/__spatial-catalog-atlas", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Melt native material and environment atlas</title>",
    }),
  );
  await page.goto(`${base}/__spatial-catalog-atlas`);
  const result = await page.evaluate(
    async (input) => {
      const [core, renderer] = await Promise.all([
        import(input.core) as Promise<typeof Core>,
        import(input.renderer) as Promise<typeof Render>,
      ]);
      const cellSize = 160,
        columns = 8;
      const session = renderer.createRenderSession({ maxBytes: 128 * 1024 * 1024 });
      const frames: {
        kind: "materials" | "environments";
        id: string;
        stats: ReturnType<typeof session.stats>;
      }[] = [];
      async function bake(kind: "materials" | "environments") {
        const entries =
          kind === "materials" ? core.SPATIAL_MATERIALS : core.SPATIAL_ENVIRONMENT_PRESETS;
        const atlas = document.createElement("canvas");
        atlas.width = columns * cellSize;
        atlas.height = Math.ceil(entries.length / columns) * cellSize;
        const context = atlas.getContext("2d")!;
        const positions = [];
        for (const [index, entry] of entries.entries()) {
          const scene = core.createSpatialScene();
          scene.reflections = { mode: "environment", quality: "draft" };
          scene.camera = { projection: "perspective", yaw: 0, pitch: 0, distance: 4.2, fov: 35 };
          scene.lights[0]!.id = "catalog-key";
          scene.lights[0]!.intensity = kind === "materials" ? 3 : 0;
          if (kind === "environments") scene.environment.preset = entry.id;
          const material =
            kind === "materials" ? core.spatialMaterial(entry.id) : core.spatialMaterial("chrome");
          const page = core.createPage({
            id: "catalog-page",
            width: 256,
            height: 256,
            background: "#1C1D23",
            spatial: scene,
            layers: [
              core.createLayer("rectangle", {
                id: "catalog-sphere",
                x: 0,
                y: 0,
                width: 256,
                height: 256,
                fill: material.color,
                spatial: {
                  ...core.createSpatialLayer("sphere"),
                  castShadow: false,
                  receiveShadow: false,
                  material: { ...material.settings },
                },
              }),
            ],
          });
          const position = {
            id: entry.id,
            x: (index % columns) * cellSize,
            y: Math.floor(index / columns) * cellSize,
            width: cellSize,
            height: cellSize,
          };
          await session.withCanvasFrame(
            page,
            {},
            (canvas) => {
              context.drawImage(canvas, position.x, position.y, cellSize, cellSize);
            },
            { scale: cellSize / 256 },
          );
          positions.push(position);
          frames.push({ kind, id: entry.id, stats: session.stats() });
        }
        return {
          file: `${kind}.webp`,
          width: atlas.width,
          height: atlas.height,
          entries: positions,
          image: atlas.toDataURL("image/webp", 0.96),
        };
      }
      try {
        const materials = input.atlasKind === "environments" ? null : await bake("materials"),
          environments = await bake("environments");
        return {
          materials,
          environments,
          frames,
          reads: window.__musartVideoReadbacks,
          cellSize,
          columns,
        };
      } finally {
        await session.dispose();
      }
    },
    {
      atlasKind,
      core: `/@fs${resolve("packages/core/src/index.ts")}`,
      renderer: `/@fs${resolve("packages/render/src/index.ts")}`,
    },
  );
  if (errors.length) throw Error(`Native catalog errors: ${errors.join("; ")}`);
  if (
    result.reads &&
    [result.reads.gpu, result.reads.webgl, result.reads.canvas, result.reads.videoFrame].some(
      (count) => count !== 0,
    )
  )
    throw Error(`Production pixel readback detected: ${JSON.stringify(result.reads)}`);
  await mkdir("apps/web/public/spatial", { recursive: true });
  for (const atlas of [result.materials, result.environments]) {
    if (!atlas) continue;
    await writeFile(
      `apps/web/public/spatial/${atlas.file}`,
      Buffer.from(atlas.image.split(",")[1]!, "base64"),
    );
  }
  const metadata = (atlas: NonNullable<typeof result.materials>) => {
    const { image, entries, ...value } = atlas;
    void image;
    return { ...value, entries: entries.map(({ id }) => id) };
  };
  const materials = result.materials ? metadata(result.materials) : previousMetadata!.materials;
  const environments = metadata(result.environments);
  await writeFile(
    metadataPath,
    JSON.stringify(
      { version: 2, cellSize: result.cellSize, columns: result.columns, materials, environments },
      null,
      2,
    ),
  );
  await mkdir("artifacts/spatial-catalogs", { recursive: true });
  await writeFile(
    `artifacts/spatial-catalogs/atlas-report${atlasKind === "environments" ? "-environments" : ""}.json`,
    JSON.stringify({ frames: result.frames, reads: result.reads, errors }, null, 2),
  );
  console.log(
    `Rendered ${result.materials?.entries.length ?? 0} materials and ${environments.entries.length} environments as native spheres; production readbacks: ${JSON.stringify(result.reads)}`,
  );
} finally {
  await browser.close();
}
