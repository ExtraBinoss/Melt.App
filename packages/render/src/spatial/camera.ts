import { DEFAULT_SPATIAL_SCENE, type Composition, type SpatialScene } from "@musart/core";
import {
  MathUtils,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  type Object3D,
  type CoordinateSystem,
} from "three/webgpu";
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
/** The same physical camera gate serves display, triangle picking and reframed exports. */
export function updateCompositionCamera(
  camera: SpatialCamera,
  page: Composition,
  coordinateSystem: CoordinateSystem,
) {
  const settings = page.spatial ?? DEFAULT_SPATIAL_SCENE,
    viewport = settings.viewport;
  camera.coordinateSystem = coordinateSystem;
  updateSpatialCamera(
    camera,
    settings.camera,
    (viewport?.width ?? page.width) / (viewport?.height ?? page.height),
  );
  if (viewport) {
    camera.projectionMatrix.premultiply(
      new Matrix4().set(
        viewport.width / page.width,
        0,
        0,
        (viewport.width - 2 * viewport.x) / page.width - 1,
        0,
        viewport.height / page.height,
        0,
        1 - (viewport.height - 2 * viewport.y) / page.height,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
      ),
    );
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
}
