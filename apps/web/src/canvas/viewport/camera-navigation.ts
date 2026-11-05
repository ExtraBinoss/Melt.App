export interface CameraNavigation {
  begin(): void;
  zoomBy(factor: number): void;
  end(): void;
  cancel(): void;
}
const cameras = new WeakMap<HTMLElement, CameraNavigation>();

/** A retained viewport borrows the active workspace's camera; stale touch owners become inert. */
export function registerCameraNavigation(element: HTMLElement, camera: CameraNavigation) {
  let active = true;
  const lease: CameraNavigation = {
    begin: () => { if (active) camera.begin(); },
    zoomBy: (factor) => { if (active) camera.zoomBy(factor); },
    end: () => { if (active) camera.end(); },
    cancel: () => { if (active) camera.cancel(); },
  };
  cameras.set(element, lease);
  return () => {
    active = false;
    if (cameras.get(element) === lease) cameras.delete(element);
    camera.cancel();
  };
}
export const readCameraNavigation = (element: HTMLElement) => cameras.get(element);
