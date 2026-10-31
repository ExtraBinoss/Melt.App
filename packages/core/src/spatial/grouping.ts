import type { Composition, Layer } from "../document/model";
import { getDescendants } from "../layers/geometry";
const layout = new Set(["x", "y", "width", "height", "rotation", "scaleX", "scaleY"]);
/** Fixed native parents can be retained as affine bases; animated layout requires timed baking. */
export function canUngroupSpatial(page: Composition, group: Layer): boolean {
  if (!group.spatial?.enabled || group.spatial.source !== "group") return false;
  const children = new Set(getDescendants(page, [group.id]).map((layer) => layer.id));
  return !page.motion?.tracks.some((track) => {
    if (track.layerId === group.id)
      return (
        track.start.value !== 0 ||
        track.end !== null ||
        track.properties.some((p) => p.keyframes.length) ||
        !!track.animations?.length
      );
    if (!children.has(track.layerId)) return false;
    return (
      track.properties.some(
        (p) => p.target.kind === "layer" && layout.has(p.target.property) && p.keyframes.length,
      ) ||
      track.animations?.some((animation) =>
        animation.preset.channels.some(
          (channel) => channel.target.kind === "layer" && layout.has(channel.target.property),
        ),
      )
    );
  });
}
