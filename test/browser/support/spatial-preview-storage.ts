import type { Composition } from "@musart/core";
import { createRenderSession } from "../../../packages/render/src/index";
import { CompositionScene } from "../../../packages/render/src/spatial/scene/CompositionScene";
import type { SpatialResource } from "../../../packages/render/src/spatial/SpatialResource";

/** Static imports observe the same classes as the renderer, including under Vite HMR. */
export async function capturePreviewStorage(page: Composition, forceWebGL: boolean) {
  const originalSync = CompositionScene.prototype.sync;
  const targets = new Map<SpatialResource, () => void>();
  const snapshots: { used: number[]; capacity: number[] }[] = [];
  let allocations = 0;
  CompositionScene.prototype.sync = function (...args) {
    for (const { resource } of args[2]) {
      if (targets.has(resource)) continue;
      const changed = () => {
        allocations++;
      };
      targets.set(resource, changed);
      resource.target.addEventListener("dispose", changed);
    }
    originalSync.apply(this, args);
    for (const { resource } of args[2])
      snapshots.push({
        used: [resource.target.viewport.z, resource.target.viewport.w],
        capacity: [resource.target.width, resource.target.height],
      });
  };
  const results = [];
  try {
    for (const mediaMode of ["preview", "exact"] as const) {
      allocations = 0;
      snapshots.length = 0;
      const session = createRenderSession({ forceWebGL, maxBytes: 128 * 1024 * 1024 });
      try {
        const images: string[] = [];
        for (const distance of [4.5, 4.48, 4.46, 4.48]) {
          const scene = page.spatial!;
          const next = { ...page, spatial: { ...scene, camera: { ...scene.camera, distance } } };
          images.push(
            await session.withCanvasFrame(next, {}, (canvas) => canvas.toDataURL(), { mediaMode }),
          );
        }
        results.push({
          mediaMode,
          images,
          allocations,
          snapshots: [...snapshots],
          backend: session.stats()?.backend,
        });
      } finally {
        await session.dispose();
      }
    }
    return { results, reads: window.__musartVideoReadbacks };
  } finally {
    for (const [resource, listener] of targets)
      resource.target.removeEventListener("dispose", listener);
    CompositionScene.prototype.sync = originalSync;
  }
}
