import type { SpatialEnvironmentPreset } from "@musart/core";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  BackSide,
  BoxGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene,
} from "three/webgpu";

/** Keep legacy documents on their original native scene, including its exact tint operation. */
const legacyTints: Readonly<Record<string, string>> = {
  studio: "#FFFFFF",
  sunset: "#FFB781",
  dawn: "#E0C6FF",
  night: "#8D9AD8",
  neon: "#D59BFF",
  warm: "#FFE1BC",
  cool: "#BDDDFF",
  gallery: "#F2ECE5",
  overcast: "#D3DBE6",
  contrast: "#AAAAAA",
  softbox: "#EEEEFF",
};

/** Renderer-owned native lightboxes; radiance stays on GPU through PMREM. */
export function createProceduralEnvironment(preset: SpatialEnvironmentPreset) {
  const legacyTint = legacyTints[preset.id];
  if (legacyTint) {
    const scene = new RoomEnvironment(),
      tint = new Color(legacyTint);
    scene.traverse((node) => {
      if (node instanceof Mesh)
        for (const material of Array.isArray(node.material) ? node.material : [node.material])
          if ("color" in material && material.color instanceof Color) material.color.multiply(tint);
    });
    return { scene, dispose: () => scene.dispose() };
  }
  const scene = new Scene();
  scene.background = new Color(preset.background);
  const box = new BoxGeometry(1, 1, 1),
    plane = new PlaneGeometry(1, 1);
  const roomMaterial = new MeshBasicMaterial({ color: preset.roomColor, side: BackSide });
  const room = new Mesh(box, roomMaterial);
  room.scale.set(...preset.roomSize);
  scene.add(room);
  const materials = [roomMaterial];
  for (const panel of preset.panels) {
    const material = new MeshBasicMaterial({
      color: new Color(panel.color).multiplyScalar(panel.intensity),
      side: DoubleSide,
    });
    materials.push(material);
    const lightbox = new Mesh(plane, material);
    lightbox.position.set(...panel.position);
    lightbox.scale.set(panel.size[0], panel.size[1], 1);
    lightbox.lookAt(0, 0, 0);
    scene.add(lightbox);
  }
  return {
    scene,
    dispose() {
      scene.clear();
      box.dispose();
      plane.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
