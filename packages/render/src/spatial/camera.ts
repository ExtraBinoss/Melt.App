import type { SpatialScene } from "@musart/core";
import { MathUtils, OrthographicCamera, PerspectiveCamera, type Object3D } from "three/webgpu";
export type SpatialCamera = OrthographicCamera | PerspectiveCamera;
export function createSpatialCamera(
  settings: SpatialScene["camera"],
  aspect: number,
): SpatialCamera {
  const camera =
    settings.projection === "perspective"
      ? new PerspectiveCamera(settings.fov, aspect, 0.01, 5000)
      : new OrthographicCamera(-aspect, aspect, 1, -1, 0.01, 5000);
  updateSpatialCamera(camera, settings, aspect);
  return camera;
}
export function updateSpatialCamera(
  camera: SpatialCamera,
  settings: SpatialScene["camera"],
  aspect: number,
) {
  camera.zoom = 1;
  const yaw = MathUtils.degToRad(settings.yaw),
    pitch = MathUtils.degToRad(settings.pitch);
  camera.position.set(
    settings.distance * Math.sin(yaw) * Math.cos(pitch),
    settings.distance * Math.sin(pitch),
    settings.distance * Math.cos(yaw) * Math.cos(pitch),
  );
  camera.lookAt(0, 0, 0);
  if (camera instanceof PerspectiveCamera) {
    camera.fov = settings.fov;
    camera.aspect = aspect;
  } else {
    const half = settings.distance * Math.tan(MathUtils.degToRad(settings.fov / 2));
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
  }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
export function updateSpatialObject(
  object: Object3D,
  spatial: import("@musart/core").SpatialLayer,
) {
  object.position.set(spatial.x, spatial.y, spatial.z);
  object.rotation.set(
    ...([spatial.rotationX, spatial.rotationY, spatial.rotationZ].map(MathUtils.degToRad) as [
      number,
      number,
      number,
    ]),
  );
  object.scale.set(spatial.scaleX, spatial.scaleY, spatial.scaleZ);
  object.updateMatrixWorld(true);
}
