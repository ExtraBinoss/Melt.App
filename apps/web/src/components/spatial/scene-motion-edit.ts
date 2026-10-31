import {
  applySceneMotionValues,
  compareMotionTime,
  listSceneMotionProperties,
  resolveSceneMotionProperty,
  sceneMotionAddress,
  type Command,
  type Composition,
  type EnginePort,
  type SceneMotionPropertyTarget,
  type SpatialScene,
} from "@musart/core";
import { captureMotionEdit, isMotionEditCurrent } from "../../state/session/motion-edit";
import { createMotionTransport } from "../../services/motion/transport";

export function captureSceneMotionEdit(
  engine: EnginePort,
  page: Composition,
  settings = page.spatial,
) {
  const origin = captureMotionEdit(engine);
  const frame = createMotionTransport(engine).readFrame() ?? page;
  return {
    ...origin,
    page,
    propertiesPage: settings ? { ...page, spatial: settings } : page,
    frame: frame.spatial || !settings ? frame : { ...frame, spatial: settings },
  };
}
export type SceneMotionEdit = ReturnType<typeof captureSceneMotionEdit>;
export function isSceneMotionEditCurrent(engine: EnginePort, origin: SceneMotionEdit): boolean {
  return isMotionEditCurrent(engine, origin);
}
function changedSceneProperties(
  origin: SceneMotionEdit,
  scene: SpatialScene,
  hint?: SceneMotionPropertyTarget,
) {
  const proposed = { ...origin.page, spatial: scene };
  return listSceneMotionProperties(proposed).filter((descriptor) => {
    const before = resolveSceneMotionProperty(origin.propertiesPage, descriptor.target);
    return (
      before &&
      (before.value !== descriptor.value ||
        (hint && sceneMotionAddress(hint) === sceneMotionAddress(descriptor.target)))
    );
  });
}
/** Unchanged scene channels retain their sampled values during a single-property draft. */
export function sceneMotionPreview(
  origin: SceneMotionEdit,
  scene: SpatialScene,
  hint?: SceneMotionPropertyTarget,
): SpatialScene {
  if (origin.mode !== "motion") return scene;
  const touched = new Set(
    changedSceneProperties(origin, scene, hint).map(({ target }) => sceneMotionAddress(target)),
  );
  const proposed = { ...origin.page, spatial: scene };
  const preserve = listSceneMotionProperties(origin.frame).filter(
    ({ target }) =>
      !touched.has(sceneMotionAddress(target)) && resolveSceneMotionProperty(proposed, target),
  );
  return applySceneMotionValues(proposed, preserve).spatial!;
}
/** One atomic transaction restores canonical keyed fields and writes their current-time keys. */
export function sceneMotionCommands(
  engine: EnginePort,
  origin: SceneMotionEdit,
  scene: SpatialScene,
  hint?: SceneMotionPropertyTarget,
): Command[] {
  if (!isSceneMotionEditCurrent(engine, origin)) return [];
  if (origin.mode !== "motion") return [{ type: "updatePage", patch: { spatial: scene } }];
  let proposed: Composition = { ...origin.page, spatial: scene };
  const commands: Command[] = [];
  for (const descriptor of changedSceneProperties(origin, scene, hint)) {
    const armed = origin.page.motion?.sceneProperties?.some(
      (property) =>
        property.keyframes.length > 0 &&
        sceneMotionAddress(property.target) === sceneMotionAddress(descriptor.target),
    );
    if (!origin.auto && !armed) continue;
    const base = resolveSceneMotionProperty(origin.propertiesPage, descriptor.target)!;
    commands.push({
      type: "upsertMotionKeyframe",
      target: descriptor.target,
      value: descriptor.value,
      time: origin.time,
    });
    proposed = applySceneMotionValues(proposed, [{ target: descriptor.target, value: base.value }]);
  }
  if (JSON.stringify(proposed.spatial) !== JSON.stringify(origin.page.spatial))
    commands.unshift({ type: "updatePage", patch: { spatial: proposed.spatial } });
  return commands;
}
export function addSceneMotionKey(engine: EnginePort, target: SceneMotionPropertyTarget): void {
  const transport = createMotionTransport(engine);
  transport.pause();
  const state = transport.read();
  if (state.mode !== "motion") return;
  const snapshot = engine.getSnapshot();
  const page =
    transport.readFrame() ??
    snapshot.project.pages.find((item) => item.id === state.compositionId)!;
  const descriptor = resolveSceneMotionProperty(page, target);
  if (descriptor)
    engine.execute({
      type: "upsertMotionKeyframe",
      target,
      value: descriptor.value,
      time: state.time,
    });
}
export function removeSceneMotionKey(engine: EnginePort, target: SceneMotionPropertyTarget): void {
  const transport = createMotionTransport(engine);
  transport.pause();
  const state = transport.read();
  const snapshot = engine.getSnapshot();
  const page = snapshot.project.pages.find((item) => item.id === state.compositionId);
  const property = page?.motion?.sceneProperties?.find(
    (property) => sceneMotionAddress(property.target) === sceneMotionAddress(target),
  );
  const key = property?.keyframes.find((key) => compareMotionTime(key.time, state.time) === 0);
  if (key) engine.execute({ type: "deleteMotionKeyframe", keyframeId: key.id });
}
