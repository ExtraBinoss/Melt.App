import type { Composition } from "@musart/core";
import { LinearSRGBColorSpace, NoToneMapping, WebGPURenderer } from "three/webgpu";
import { GpuCompositor } from "../../../packages/render/src/compositing/GpuCompositor";
import { SpatialSelectionContour } from "../../../packages/render/src/spatial/SelectionContour";
import {
  createSpatialCamera,
  updateCompositionCamera,
} from "../../../packages/render/src/spatial/camera";

export async function captureSelectionContours(pages: Composition[], forceWebGL: boolean) {
  const renderer = new WebGPURenderer({ forceWebGL, alpha: false, antialias: false });
  await renderer.init();
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0, 1);
  const compositor = new GpuCompositor(renderer, { maxBytes: 128 * 1024 * 1024 });
  const results = [];
  let contour: SpatialSelectionContour | null = null;
  try {
    for (const page of pages) {
      contour?.dispose();
      contour = null;
      for (const { zoom, density, distance } of [
        { zoom: 0.65, density: 0.65, distance: 5 },
        { zoom: 1.4, density: 0.7, distance: 4.5 },
        { zoom: 1.4, density: 2.8, distance: 4 },
      ]) {
        const images: string[] = [];
        const sizes = [];
        const displaySize = { width: page.width * zoom, height: page.height * zoom };
        for (const mediaMode of ["exact", "preview"] as const) {
          const next = {
            ...page,
            spatial: { ...page.spatial!, camera: { ...page.spatial!.camera, distance } },
            layers: page.layers.map((layer) => ({
              ...layer,
              fill: mediaMode === "exact" ? "#000001" : "#000002",
            })),
          };
          const frame = await compositor.render(next, {}, { scale: density, mediaMode });
          const source = compositor.spatialSource(page.layers[0]!.id)!;
          contour ??= new SpatialSelectionContour(source);
          const camera = createSpatialCamera(next.spatial!.camera, page.width / page.height);
          updateCompositionCamera(camera, next, renderer.coordinateSystem);
          renderer.setSize(frame.width, frame.height, false);
          renderer.setRenderTarget(null);
          renderer.autoClear = true;
          contour.render(renderer, source, camera, 1, displaySize);
          images.push(renderer.domElement.toDataURL());
          sizes.push({
            used: source.target.viewport.toArray(),
            capacity: [source.target.width, source.target.height],
          });
        }
        results.push({ kind: page.layers[0]!.kind, zoom, density, displaySize, images, sizes });
      }
    }
    return { results, reads: window.__musartVideoReadbacks };
  } finally {
    contour?.dispose();
    await compositor.dispose();
    await renderer.dispose();
  }
}
