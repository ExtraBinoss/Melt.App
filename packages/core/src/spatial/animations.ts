import type { MotionAnimationPreset, AnimationChannel } from "../motion/animations/model";
import type { SpatialMotionProperty } from "./motion";
function channel(
  property: SpatialMotionProperty,
  values: number[],
  operation: AnimationChannel["operation"] = "add",
): AnimationChannel {
  return {
    target: { kind: "layer", property },
    operation,
    points: values.map((value, index) => ({ at: index / (values.length - 1), value })),
  };
}
const preset = (
  id: string,
  name: string,
  category: MotionAnimationPreset["category"],
  channels: AnimationChannel[],
  duration = 2000,
): MotionAnimationPreset => ({
  version: 1,
  id: `spatial-${id}`,
  name,
  category,
  channels,
  effects: [],
  duration,
});
export const SPATIAL_ANIMATIONS: MotionAnimationPreset[] = [
  preset("spin", "3D · Spin", "rotate", [channel("spatial.rotationY", [0, 360])]),
  preset("turn", "3D · Turn in", "rotate", [channel("spatial.rotationY", [-90, 0])], 800),
  preset(
    "tumble",
    "3D · Tumble",
    "rotate",
    [channel("spatial.rotationX", [0, 360]), channel("spatial.rotationY", [0, 360])],
    3000,
  ),
  preset("rock", "3D · Rock", "attention", [
    channel("spatial.rotationX", [0, -15, 15, 0]),
    channel("spatial.rotationZ", [0, 8, -8, 0]),
  ]),
  preset("float", "3D · Float", "move", [
    channel("spatial.y", [0, 0.2, 0]),
    channel("spatial.rotationY", [-8, 8, -8]),
  ]),
  preset(
    "grow",
    "3D · Grow",
    "scale",
    ["scaleX", "scaleY", "scaleZ"].map((axis) =>
      channel(`spatial.${axis}` as SpatialMotionProperty, [0.01, 1.08, 1], "multiply"),
    ),
    800,
  ),
  preset(
    "extrude",
    "3D · Extrude",
    "scale",
    [channel("spatial.depth", [0.001, 0.3], "replace")],
    1000,
  ),
];
