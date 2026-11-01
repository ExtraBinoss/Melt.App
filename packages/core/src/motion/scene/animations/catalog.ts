import type { SceneMotionAnimationPreset, SceneAnimationTarget } from "./model";
import type { AnimationChannel } from "../../animations/model";
const ease = { type: "cubicBezier", x1: 0.42, y1: 0, x2: 0.58, y2: 1 } as const;
const channel = (
  target: SceneAnimationTarget,
  values: number[],
  operation: AnimationChannel["operation"] = "replace",
): AnimationChannel<SceneAnimationTarget> => ({
  target,
  operation,
  points: values.map((value, index) => ({ at: index / (values.length - 1), value, easing: ease })),
});
export const SCENE_MOTION_ANIMATION_PRESETS: readonly SceneMotionAnimationPreset[] = [
  {
    version: 1,
    id: "scene-camera-orbit",
    name: "Camera orbit",
    category: "rotate",
    duration: 8000,
    effects: [],
    channels: [channel({ kind: "camera", property: "yaw" }, [5, -5, 5])],
  },
  {
    version: 1,
    id: "scene-camera-push",
    name: "Camera push",
    category: "move",
    duration: 2000,
    effects: [],
    channels: [channel({ kind: "camera", property: "distance" }, [1, 0.8], "multiply")],
  },
  {
    version: 1,
    id: "scene-light-pulse",
    name: "Light pulse",
    category: "attention",
    duration: 2000,
    effects: [],
    channels: [channel({ kind: "light", property: "intensity" }, [1, 1.8, 1], "multiply")],
  },
  {
    version: 1,
    id: "scene-environment-turn",
    name: "Environment turn",
    category: "rotate",
    duration: 8000,
    effects: [],
    channels: [channel({ kind: "environment", property: "rotation" }, [0, 360], "add")],
  },
];
