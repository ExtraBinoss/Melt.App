import { DEFAULT_SPATIAL_SCENE } from "../spatial/defaults";
import {
  CAMERA_MOTION_SCHEMAS,
  ENVIRONMENT_MOTION_SCHEMAS,
  LIGHT_MOTION_SCHEMAS,
} from "../motion/scene/properties";
import type { SpatialScene } from "../spatial/model";
import { watchFields, type HistoryContext } from "./collector";

/** The command already owns this scene: inspect its small registered owners, never the project. */
export function captureScene(
  context: HistoryContext,
  read: () => SpatialScene | undefined,
  proposed: SpatialScene | undefined,
): void {
  const original = read();
  const baseline = original ?? {
    ...DEFAULT_SPATIAL_SCENE,
    lights: (proposed?.lights ?? []).map((light, index) => ({
      ...(DEFAULT_SPATIAL_SCENE.lights[index] ?? DEFAULT_SPATIAL_SCENE.lights[0]!),
      id: light.id,
    })),
  };
  const current = () => read() ?? baseline;
  const compositionId = context.page.id;
  watchFields(
    context,
    { kind: "camera", compositionId },
    Object.keys(CAMERA_MOTION_SCHEMAS),
    () => current().camera,
    proposed?.camera,
  );
  watchFields(
    context,
    { kind: "environment", compositionId },
    [...Object.keys(ENVIRONMENT_MOTION_SCHEMAS), "preset", "assetId"],
    () => current().environment,
    proposed?.environment,
  );
  watchFields(
    context,
    { kind: "composition", compositionId },
    ["shadows", "reflections.mode", "reflections.quality"],
    current,
    proposed,
  );
  const before = new Map(baseline.lights.map((light) => [light.id, light]));
  const afterIds = new Set(proposed?.lights.map((light) => light.id));
  for (const [lightId, light] of before) {
    const owner = { kind: "light", compositionId, lightId } as const;
    if (!afterIds.has(lightId)) context.history.action("delete", owner);
    else
      watchFields(
        context,
        owner,
        Object.keys(LIGHT_MOTION_SCHEMAS),
        () => current().lights.find((item) => item.id === lightId) ?? light,
        proposed?.lights.find((item) => item.id === lightId),
      );
  }
  for (const light of proposed?.lights ?? [])
    if (!before.has(light.id))
      context.history.action("add", { kind: "light", compositionId, lightId: light.id });
}
