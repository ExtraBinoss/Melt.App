import {
  DEFAULT_SPATIAL_SCENE,
  SPATIAL_LAYOUT_SPAN,
  type Composition,
  type Layer,
} from "@musart/core";
import type { Point } from "../../canvas/viewport/view";
import { i18n } from "../../state/i18n";

/** Drop positions are page pixels; spatial anchors live on the scene's editable Z=0 plane. */
export function libraryPlacementPoint(page: Composition, point: Point): Point {
  const camera = (page.spatial ?? DEFAULT_SPATIAL_SCENE).camera;
  const viewport = page.spatial?.viewport;
  const width = viewport?.width ?? page.width,
    height = viewport?.height ?? page.height;
  const x = (2 * (point.x + (viewport?.x ?? 0))) / width - 1;
  const y = 1 - (2 * (point.y + (viewport?.y ?? 0))) / height;
  const yaw = (camera.yaw * Math.PI) / 180,
    pitch = (camera.pitch * Math.PI) / 180;
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  const right = [cy, 0, -sy],
    up = [-sy * sp, cp, -cy * sp],
    forward = [-sy * cp, -sp, -cy * cp];
  const origin = [camera.distance * sy * cp, camera.distance * sp, camera.distance * cy * cp];
  const reach = Math.tan((camera.fov * Math.PI) / 360);
  const direction = [...forward];
  for (let axis = 0; axis < 3; axis++) {
    const offset = (right[axis]! * x * reach * width) / height + up[axis]! * y * reach;
    if (camera.projection === "perspective") direction[axis]! += offset;
    else origin[axis]! += offset * camera.distance;
  }
  if (Math.abs(direction[2]!) < 1e-8) throw new Error(i18n.t("libraryDropPlaneUnavailable"));
  const distance = -origin[2]! / direction[2]!;
  if (distance < 0 || !Number.isFinite(distance))
    throw new Error(i18n.t("libraryDropPlaneUnavailable"));
  const unit = SPATIAL_LAYOUT_SPAN / height;
  return {
    x: (origin[0]! + direction[0]! * distance) / unit + width / 2 - (viewport?.x ?? 0),
    y: height / 2 - (origin[1]! + direction[1]! * distance) / unit - (viewport?.y ?? 0),
  };
}

export function placeLibraryLayer(page: Composition, layer: Layer, point?: Point): Layer {
  const center = point
    ? layer.spatial?.enabled
      ? libraryPlacementPoint(page, point)
      : point
    : { x: page.width / 2, y: page.height / 2 };
  layer.x = center.x - layer.width / 2;
  layer.y = center.y - layer.height / 2;
  return layer;
}
