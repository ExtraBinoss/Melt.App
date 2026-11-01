import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spatialProvenance } from "./spatial-provenance";
import { createLayer, createPage, createProject } from "../../packages/core/src/document/factories";
import { EditorEngine } from "../../packages/core/src/session/engine";
import type { Composition } from "../../packages/core/src/document/model";
import type { LayerGeometryIndex } from "../../packages/core/src/layers/geometry-index";
import { createTimelineHoverSource } from "../../apps/web/src/state/motion/hover";
import { frameGeometry } from "../../apps/web/src/canvas/selection/frame-geometry";
interface GeometryModule {
  createLayerGeometryIndex(page: Composition): LayerGeometryIndex;
}
interface HoverModule {
  createTimelineHoverSource: typeof createTimelineHoverSource;
}
const baselineRoot = process.env.MUSART_SPATIAL_BASELINE;
if (!baselineRoot)
  throw new Error("MUSART_SPATIAL_BASELINE must identify the frozen baseline worktree.");
const baselineGeometry = (await import(
  pathToFileURL(resolve(baselineRoot, "packages/core/src/layers/geometry-index.ts")).href
)) as GeometryModule;
const baselineHover = (await import(
  pathToFileURL(resolve(baselineRoot, "apps/web/src/state/motion/hover.ts")).href
)) as HoverModule;
const sizes = (process.env.MUSART_SPATIAL_SIZES ?? "500,1000").split(",").map(Number);
if (sizes.some((size) => ![500, 1000, 10000].includes(size))) throw new Error("Unsupported size");
let checksum = 0;
const rows = [];
for (const size of sizes)
  for (const evaluated of [false, true]) {
    const engine = new EditorEngine(
      createProject({
        pages: [
          createPage({
            layers: Array.from({ length: size }, (_, at) =>
              createLayer("rectangle", { id: `${at}`, x: at * 10, width: 8, height: 8 }),
            ),
          }),
        ],
      }),
    );
    const page = engine.getSnapshot().project.pages[0]!;
    const frame = {
      page: evaluated
        ? { ...page, layers: page.layers.map((layer) => ({ ...layer, rotation: 17 })) }
        : page,
    };
    for (const strategy of ["baseline", "indexed"] as const) {
      const hover =
        strategy === "baseline"
          ? baselineHover.createTimelineHoverSource(engine)
          : createTimelineHoverSource(engine);
      const geometry = () =>
        strategy === "baseline"
          ? baselineGeometry.createLayerGeometryIndex(frame.page)
          : frameGeometry(frame);
      const stop = hover.subscribe(() => {
        const target = hover.read();
        if (!target) return;
        const index = geometry(),
          layer = index.byId.get(target.layerId);
        if (layer && index.isVisible(layer.id)) checksum += index.worldMatrix(layer.id)[4];
      });
      const run = () => {
        const start = performance.now();
        for (let at = 0; at < 128; at++) {
          const release = hover.show(page.id, `${(at * 67) % size}`);
          release();
        }
        return ((performance.now() - start) * 1000) / 128;
      };
      run();
      const raw = Array.from({ length: 7 }, run),
        sorted = [...raw].sort((a, b) => a - b);
      rows.push({
        size,
        evaluated,
        strategy,
        hoverMicroseconds: { median: sorted[3], p95: sorted[6], raw },
      });
      stop();
    }
  }
const output = process.env.MUSART_SPATIAL_REPORT ?? "artifacts/spatial-index/hover.json";
mkdirSync(resolve(output, ".."), { recursive: true });
writeFileSync(
  output,
  JSON.stringify(
    {
      environment: spatialProvenance(),
      baselineRoot,
      boundary:
        "Actual hover lease validation/publication/subscription + known-ID geometry/world-matrix path, canonical and evaluated frames. CPU only: DOM painting/presentation measured separately by native browser cohort. No point queries for known-ID hover.",
      checksum,
      rows,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ report: output, checksum, rows }, null, 2));
