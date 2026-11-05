import {
  compileMotion,
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
  EditorEngine,
  type SceneAnimationOwner,
  type SceneMotionAnimationPreset,
} from "@musart/core";

/** Native depth and asymmetric objects make camera motion visible, using the export sampler. */
export function createSceneAnimationPreviewDocument(
  preset: SceneMotionAnimationPreset,
  duration: number,
) {
  const spatial = createSpatialScene();
  spatial.reflections = { mode: "environment", quality: "draft" };
  spatial.camera = { ...spatial.camera, yaw: 0, pitch: 15 };
  spatial.lights = [{ ...spatial.lights[0]!, id: "preview-light" }];
  const engine = new EditorEngine(
    createProject({
      id: "scene-animation-preview",
      pages: [
        createPage({
          id: "preview",
          width: 192,
          height: 144,
          background: "#20232b",
          spatial,
          layers: [
            createLayer("rectangle", {
              id: "box",
              x: 38,
              y: 30,
              width: 72,
              height: 84,
              fill: "#a9a0ff",
              spatial: {
                ...createSpatialLayer("box"),
                rotationY: -20,
                z: 0.25,
              },
            }),
            createLayer("ellipse", {
              id: "sphere",
              x: 108,
              y: 55,
              width: 44,
              height: 44,
              fill: "#f8c67d",
              spatial: { ...createSpatialLayer("sphere"), z: -0.45 },
            }),
          ],
        }),
      ],
    }),
  );
  const kind = preset.channels[0]!.target.kind;
  if (kind !== "camera" && kind !== "environment" && kind !== "light")
    throw Error("This animation needs its original effect for preview");
  const owner: SceneAnimationOwner =
    kind === "light"
      ? { kind, compositionId: "preview", lightId: "preview-light" }
      : { kind, compositionId: "preview" };
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.transaction([
    { type: "setMotionDuration", duration: { value: duration, rate: 1000 } },
    {
      type: "addMotionAnimation",
      owner,
      preset,
      start: { value: 0, rate: 1 },
      duration: { value: duration, rate: 1000 },
    },
  ]);
  return compileMotion(engine.getSnapshot().project, {
    compositionId: "preview",
  });
}
