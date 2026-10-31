import {
  createSpatialScene,
  type EnginePort,
  type Layer,
  type SpatialLayer,
  type SpatialMotionProperty,
  type SpatialScene,
} from "@musart/core";
import { MathUtils, type Object3D } from "three/webgpu";
import type { createStore } from "jotai/vanilla";
type Store = ReturnType<typeof createStore>;
import { previewAtom } from "../../state/session/editor";
import {
  captureMotionEdit,
  isMotionEditCurrent,
  motionLayerCommands,
  motionPreviewPatch,
  type MotionEditOrigin,
} from "../../state/session/motion-edit";
import type { PreviewValue } from "../../state/session/preview-source";
import type { SpatialEditTool } from "../../state/session/spatial-editing";
import type { SceneController } from "../session/scene-controller";
function current(engine: EnginePort, origin: MotionEditOrigin) {
  const selection = engine.getSnapshot().selection;
  return (
    isMotionEditCurrent(engine, origin) &&
    selection.length === origin.snapshot.selection.length &&
    selection.every((id, index) => id === origin.snapshot.selection[index])
  );
}
/** Choose the equivalent Euler pose nearest the preceding drag sample, retaining authored turns. */
function continuousRotation(values: number[], previous: number[]) {
  const alternatives = [values, [values[0]! + 180, 180 - values[1]!, values[2]! + 180]];
  const candidates = alternatives.map((pose) =>
    pose.map((value, index) => value + 360 * Math.round((previous[index]! - value) / 360)),
  );
  const score = (pose: number[]) =>
    pose.reduce((sum, value, index) => sum + (value - previous[index]!) ** 2, 0);
  return score(candidates[0]!) <= score(candidates[1]!) ? candidates[0]! : candidates[1]!;
}
const fields = {
  translate: ["x", "y", "z"],
  rotate: ["rotationX", "rotationY", "rotationZ"],
  scale: ["scaleX", "scaleY", "scaleZ"],
} as const;
/** All high-frequency updates stay on the retained scene port; only release creates history. */
export class SpatialGesture {
  private held: {
    origin: MotionEditOrigin;
    layer: Layer;
    tool: SpatialEditTool;
    patch: Partial<Layer>;
    rotation: number[];
  } | null = null;
  private orbit: {
    origin: MotionEditOrigin;
    scene: SpatialScene;
    value: SpatialScene;
    preview: PreviewValue | null;
  } | null = null;
  constructor(
    private readonly engine: EnginePort,
    private readonly controller: SceneController,
    private readonly store: Store,
  ) {}
  get active() {
    return Boolean(this.held || this.orbit);
  }
  begin(layerId: string, tool: SpatialEditTool) {
    this.cancel();
    const targets = fields[tool].map((key) => ({
      kind: "layer" as const,
      layerId,
      property: `spatial.${key}` as SpatialMotionProperty,
    }));
    const origin = captureMotionEdit(this.engine, targets);
    const page = origin.snapshot.project.pages.find((item) => item.id === origin.snapshot.pageId)!;
    const layer = page.layers.find((item) => item.id === layerId);
    if (layer?.spatial?.enabled) {
      const pose =
        this.controller.read().page.layers.find((item) => item.id === layerId)?.spatial ??
        layer.spatial;
      this.held = {
        origin,
        layer,
        tool,
        patch: {},
        rotation: [pose.rotationX, pose.rotationY, pose.rotationZ],
      };
    }
  }
  object(object: Object3D) {
    const held = this.held;
    if (!held || !current(this.engine, held.origin)) return this.cancel();
    const values =
      held.tool === "translate"
        ? object.position.toArray()
        : held.tool === "rotate"
          ? continuousRotation(
              [object.rotation.x, object.rotation.y, object.rotation.z].map(MathUtils.radToDeg),
              held.rotation,
            )
          : object.scale.toArray().map((value) => Math.max(0.001, Math.min(100, value)));
    if (held.tool === "rotate") held.rotation = values;
    const spatial: SpatialLayer = { ...held.layer.spatial! };
    fields[held.tool].forEach((key, index) => {
      spatial[key] = values[index]!;
    });
    held.patch = { spatial };
    this.controller.setGesture(
      [
        {
          layerId: held.layer.id,
          patch: motionPreviewPatch(this.engine, held.origin, [held.layer.id], held.patch),
        },
      ],
      null,
      this,
    );
  }
  beginOrbit() {
    this.cancel();
    const origin = captureMotionEdit(this.engine);
    const page = origin.snapshot.project.pages.find((item) => item.id === origin.snapshot.pageId)!;
    const scene = page.spatial ?? createSpatialScene();
    this.orbit = { origin, scene, value: scene, preview: null };
  }
  camera(camera: Object3D) {
    const held = this.orbit;
    if (!held || !current(this.engine, held.origin)) return this.cancel();
    const p = camera.position;
    const zoom =
      "isOrthographicCamera" in camera && "zoom" in camera && typeof camera.zoom === "number"
        ? camera.zoom
        : 1;
    const radius = p.length(),
      distance = radius / zoom;
    held.value = {
      ...held.scene,
      camera: {
        ...held.scene.camera,
        distance: Math.max(0.2, Math.min(100, distance)),
        yaw: MathUtils.radToDeg(Math.atan2(p.x, p.z)),
        pitch: Math.max(-89.9, Math.min(89.9, MathUtils.radToDeg(Math.asin(p.y / radius)))),
      },
    };
    held.preview = { target: "page", patch: { spatial: held.value } };
    this.store.set(previewAtom, held.preview);
  }
  commit() {
    const held = this.held,
      orbit = this.orbit;
    this.cancel();
    if (held && Object.keys(held.patch).length && current(this.engine, held.origin)) {
      const commands = motionLayerCommands(this.engine, held.origin, [held.layer.id], held.patch);
      if (commands.length) this.engine.transaction(commands);
    }
    if (
      orbit &&
      current(this.engine, orbit.origin) &&
      JSON.stringify(orbit.scene.camera) !== JSON.stringify(orbit.value.camera)
    )
      this.engine.execute({ type: "updatePage", patch: { spatial: orbit.value } });
  }
  invalidate() {
    const origin = this.held?.origin ?? this.orbit?.origin;
    if (origin && !current(this.engine, origin)) this.cancel();
  }
  cancel() {
    this.held = null;
    const orbit = this.orbit;
    this.orbit = null;
    if (orbit?.preview && this.store.get(previewAtom) === orbit.preview)
      this.store.set(previewAtom, null);
    this.controller.clearGesture(this);
  }
}
