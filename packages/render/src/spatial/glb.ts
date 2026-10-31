import { SPATIAL_MODEL_EXTENT } from "@musart/core";
import {
  AnimationClip,
  Box3,
  Mesh,
  InstancedMesh,
  Object3D,
  Texture,
  Vector3,
  LoadingManager,
  Light,
  type WebGPURenderer,
} from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
export interface GlbMetadata {
  animations: { name: string; duration: number }[];
  vertices: number;
  meshes: number;
}
/** Self-contained binary input only. External GLB URLs never silently fetch other assets. */
export function inspectGlb(buffer: ArrayBuffer) {
  if (buffer.byteLength < 20 || buffer.byteLength > 64 * 1024 * 1024)
    throw Error("Invalid GLB size");
  const header = new DataView(buffer);
  if (
    header.getUint32(0, true) !== 0x46546c67 ||
    header.getUint32(4, true) !== 2 ||
    header.getUint32(8, true) !== buffer.byteLength ||
    header.getUint32(16, true) !== 0x4e4f534a
  )
    throw Error("Invalid GLB header");
  const length = header.getUint32(12, true);
  if (length > 4 * 1024 * 1024 || length + 20 > buffer.byteLength)
    throw Error("Invalid GLB manifest");
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length))) as {
    buffers?: { uri?: string }[];
    images?: { uri?: string }[];
    accessors?: { count?: number }[];
    meshes?: { primitives?: unknown[] }[];
    nodes?: {
      mesh?: number;
      extensions?: Record<string, { attributes?: Record<string, number> }>;
    }[];
    extensionsUsed?: string[];
  };
  for (const reference of [...(json.buffers ?? []), ...(json.images ?? [])])
    if (reference.uri && !reference.uri.startsWith("data:"))
      throw Error("GLB must embed its original resources");
  if (
    (json.nodes?.length ?? 0) > 2048 ||
    (json.meshes?.length ?? 0) > 256 ||
    (json.images?.length ?? 0) > 32
  )
    throw Error("GLB exceeds the scene budget");
  let elements = 0;
  for (const a of json.accessors ?? []) {
    if (!Number.isSafeInteger(a.count) || a.count! < 0) throw Error("Invalid GLB accessor");
    elements += a.count!;
  }
  let instances = 0;
  for (const node of json.nodes ?? []) {
    const attributes = node.extensions?.EXT_mesh_gpu_instancing?.attributes;
    const accessor = attributes ? json.accessors?.[Object.values(attributes)[0]!] : undefined;
    instances += attributes ? (accessor?.count ?? 0) : node.mesh === undefined ? 0 : 1;
  }
  if (instances > 8192) throw Error("GLB exceeds the instance budget");
  if (elements > 6_000_000) throw Error("GLB exceeds the geometry budget");
  return json;
}
export async function loadGlb(buffer: ArrayBuffer, renderer?: WebGPURenderer): Promise<GLTF> {
  const json = inspectGlb(buffer);
  const loader = new GLTFLoader();
  const disposers: (() => void)[] = [];
  try {
    if (json.extensionsUsed?.includes("KHR_draco_mesh_compression")) {
      const { DRACOLoader } = await import("three/addons/loaders/DRACOLoader.js");
      const [{ default: wrapper }, { default: wasm }] = await Promise.all([
        import("three/addons/libs/draco/gltf/draco_wasm_wrapper.js?url"),
        import("three/addons/libs/draco/gltf/draco_decoder.wasm?url"),
      ]);
      const manager = new LoadingManager().setURLModifier((url) =>
        url.endsWith(".wasm") ? wasm : wrapper,
      );
      const decoder = new DRACOLoader(manager).setDecoderConfig({ type: "wasm" }).setWorkerLimit(1);
      loader.setDRACOLoader(decoder);
      disposers.push(() => decoder.dispose());
    }
    if (
      json.extensionsUsed?.some(
        (name) => name === "EXT_meshopt_compression" || name === "KHR_meshopt_compression",
      )
    ) {
      const { MeshoptDecoder } = await import("three/addons/libs/meshopt_decoder.module.js");
      loader.setMeshoptDecoder(MeshoptDecoder);
    }
    if (json.extensionsUsed?.includes("KHR_texture_basisu")) {
      if (!renderer) throw Error("Compressed texture preparation needs the active renderer");
      const [{ KTX2Loader }, { default: script }, { default: wasm }] = await Promise.all([
        import("three/addons/loaders/KTX2Loader.js"),
        import("three/addons/libs/basis/basis_transcoder.js?url"),
        import("three/addons/libs/basis/basis_transcoder.wasm?url"),
      ]);
      const manager = new LoadingManager().setURLModifier((url) =>
        url.endsWith(".wasm") ? wasm : script,
      );
      const ktx = new KTX2Loader(manager).setWorkerLimit(1).detectSupport(renderer);
      loader.setKTX2Loader(ktx);
      disposers.push(() => ktx.dispose());
    }
    return await loader.parseAsync(buffer, "");
  } finally {
    for (const release of disposers) release();
  }
}
export function glbMetadata(root: Object3D, animations: readonly AnimationClip[]): GlbMetadata {
  let vertices = 0,
    meshes = 0,
    pixels = 0,
    lights = 0;
  const textures = new Set<Texture>();
  root.traverse((node) => {
    if (node instanceof Light) lights++;
    if (!(node instanceof Mesh)) return;
    meshes++;
    vertices +=
      (node.geometry.getAttribute("position")?.count ?? 0) *
      (node instanceof InstancedMesh ? node.count : 1);
    for (const material of Array.isArray(node.material) ? node.material : [node.material])
      for (const value of Object.values(material))
        if (value instanceof Texture) textures.add(value);
  });
  for (const texture of textures) {
    const image = texture.image as { width?: number; height?: number } | null;
    const width = image?.width ?? 0,
      height = image?.height ?? 0;
    if (width > 4096 || height > 4096) throw Error("GLB texture exceeds 4096 pixels");
    pixels += width * height;
  }
  if (meshes > 256 || vertices > 1_000_000 || pixels > 32_000_000 || lights > 8)
    throw Error("GLB exceeds the rendering budget");
  return {
    animations: animations.map((clip, i) => ({
      name: clip.name || String(i + 1),
      duration: clip.duration,
    })),
    vertices,
    meshes,
  };
}
export function normalizeModel(root: Object3D) {
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root),
    size = box.getSize(new Vector3()),
    center = box.getCenter(new Vector3());
  const extent = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(extent) || extent <= 0) throw Error("GLB has no renderable bounds");
  // Put normalization on a parent so authored animation tracks retain their original transforms.
  const wrapper = new Object3D();
  wrapper.scale.setScalar(SPATIAL_MODEL_EXTENT / extent);
  wrapper.position.copy(center).multiplyScalar(-SPATIAL_MODEL_EXTENT / extent);
  wrapper.add(root);
  return wrapper;
}
export { disposeModel, disposeModels } from "./model-disposal";
