/// <reference lib="webworker" />
import { buildSpatialGeometry, geometryPayload } from "./geometry-build";
import type { SpatialGeometryJob } from "./geometry-model";
self.onmessage = (event: MessageEvent<{ id: number; job: SpatialGeometryJob }>) => {
  const { id, job } = event.data;
  try {
    const geometry = buildSpatialGeometry(job);
    try {
      const value = geometryPayload(geometry);
      self.postMessage(
        { id, value },
        {
          transfer: [
            ...value.attributes.map((attribute) => attribute.buffer),
            ...(value.index ? [value.index] : []),
          ],
        },
      );
    } finally {
      geometry.dispose();
    }
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : "3D geometry preparation failed",
    });
  }
};
