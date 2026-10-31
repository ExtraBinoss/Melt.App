import {
  Color,
  DirectionalLight,
  HalfFloatType,
  InstancedMesh,
  Light,
  Mesh,
  PerspectiveCamera,
  PointLight,
  RenderTarget,
  Scene,
  SkinnedMesh,
  SpotLight,
  type Material,
  type Texture,
  type WebGPURenderer,
} from "three/webgpu";
import type { SpatialScene } from "@musart/core";
import { compileGpuScene } from "../../compositing/compile";
import type { CaptureMesh } from "./meshes";
import { copySpatialMaterial } from "../material-copy";
import { createSampledLight, registerSampledLights } from "../scene/SampledLights";
interface Proxy {
  source: Mesh;
  mesh: Mesh;
  materials: Map<Material, Material>;
  versions: Map<Material, number>;
}
/** Borrow geometry/textures, own only proxy objects, material copies and instance buffers. */
export class CaptureScene {
  readonly scene = Object.assign(new Scene(), { name: "melt:spatial-reflections" });
  readonly camera = new PerspectiveCamera(90, 1, 0.01, 10000);
  private readonly target = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: true });
  private readonly proxies = new Map<string, Proxy>();
  private lights: Light[] = [];
  private lightKey = "";
  private compiled = "";
  hidden: Mesh | null = null;
  sync(
    items: CaptureMesh[],
    lightScene: Scene,
    settings: SpatialScene,
    environment: Texture | null,
  ) {
    const active = new Set(items.map((item) => item.key));
    for (const [key, proxy] of this.proxies)
      if (!active.has(key)) {
        this.release(proxy);
        this.proxies.delete(key);
      }
    for (const item of items) {
      let proxy = this.proxies.get(item.key);
      if (!proxy) {
        const mesh = item.original.clone(false);
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        proxy = { source: item.original, mesh, materials: new Map(), versions: new Map() };
        this.proxies.set(item.key, proxy);
        this.scene.add(mesh);
      }
      const source = item.original,
        mesh = proxy.mesh;
      mesh.visible = true;
      mesh.matrix.copy(item.mapping).multiply(source.matrixWorld);
      if (mesh instanceof SkinnedMesh && source instanceof SkinnedMesh) {
        mesh.bindMode = source.bindMode;
        mesh.bindMatrix.copy(source.bindMatrix);
        mesh.bindMatrixInverse.copy(source.bindMatrixInverse);
      }
      if (mesh.morphTargetInfluences && source.morphTargetInfluences)
        for (let i = 0; i < source.morphTargetInfluences.length; i++)
          mesh.morphTargetInfluences[i] = source.morphTargetInfluences[i]!;
      if (mesh instanceof InstancedMesh && source instanceof InstancedMesh) {
        mesh.instanceMatrix.copy(source.instanceMatrix);
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor && source.instanceColor) {
          mesh.instanceColor.copy(source.instanceColor);
          mesh.instanceColor.needsUpdate = true;
        }
      }
      const originals = Array.isArray(source.material) ? source.material : [source.material];
      const used = new Set(originals);
      for (const [base, copy] of proxy.materials)
        if (!used.has(base)) {
          copy.dispose();
          proxy.materials.delete(base);
          proxy.versions.delete(base);
        }
      const copies = originals.map((base) => {
        let copy = proxy!.materials.get(base);
        if (!copy) {
          copy = base.clone() as Material;
          proxy!.materials.set(base, copy);
        }
        const transparent = copy.transparent;
        copySpatialMaterial(copy, base);
        copy.opacity = base.opacity * item.opacity;
        copy.transparent ||= copy.opacity < 1;
        if (transparent !== copy.transparent || proxy!.versions.get(base) !== base.version)
          copy.needsUpdate = true;
        proxy!.versions.set(base, base.version);
        return copy;
      });
      mesh.material = Array.isArray(source.material) ? copies : copies[0]!;
    }
    this.syncLights(lightScene, settings);
    this.scene.environment = environment;
    this.scene.environmentIntensity = settings.environment.intensity;
    this.scene.environmentRotation.copy(lightScene.environmentRotation);
    this.scene.background = environment ?? new Color(0);
    this.scene.backgroundIntensity = settings.environment.intensity;
    this.scene.backgroundRotation.copy(lightScene.environmentRotation);
    this.scene.updateMatrixWorld(true);
  }
  private syncLights(original: Scene, settings: SpatialScene) {
    const key = JSON.stringify(settings.lights);
    if (key === this.lightKey) return;
    for (const light of this.lights) {
      this.scene.remove(light);
      if (light instanceof DirectionalLight || light instanceof SpotLight)
        this.scene.remove(light.target);
      if (
        light instanceof DirectionalLight ||
        light instanceof SpotLight ||
        light instanceof PointLight
      )
        light.dispose();
    }
    this.lights = [];
    for (const node of original.children)
      if (node instanceof Light) {
        const light =
          node instanceof DirectionalLight
            ? createSampledLight("directional").copy(node)
            : node instanceof PointLight
              ? createSampledLight("point").copy(node)
              : node instanceof SpotLight
                ? createSampledLight("spot").copy(node)
                : node.clone();
        light.castShadow = false;
        this.scene.add(light);
        this.lights.push(light);
        if (light instanceof DirectionalLight || light instanceof SpotLight)
          this.scene.add(light.target);
      }
    this.lightKey = key;
  }
  async prepare(renderer: WebGPURenderer, canContinue: () => boolean) {
    registerSampledLights(renderer);
    const key = JSON.stringify([
      Boolean(this.scene.environment),
      this.lights.map((light) => light.type),
      [...this.proxies.values()].map((proxy) => [
        proxy.mesh.uuid,
        [...proxy.materials.values()].map((material) => [material.uuid, material.version]),
      ]),
    ]);
    if (key === this.compiled) return;
    const shadow = renderer.shadowMap.enabled;
    try {
      renderer.shadowMap.enabled = false;
      const pending = compileGpuScene(renderer, this.scene, this.camera, this.target, canContinue);
      renderer.shadowMap.enabled = shadow;
      await pending;
      this.compiled = key;
    } finally {
      renderer.shadowMap.enabled = shadow;
    }
  }
  hide(key: string) {
    this.hidden = this.proxies.get(key)?.mesh ?? null;
    if (this.hidden) this.hidden.visible = false;
  }
  show() {
    if (this.hidden) this.hidden.visible = true;
    this.hidden = null;
  }
  get bytes() {
    let bytes = 12;
    for (const { mesh, materials } of this.proxies.values()) {
      bytes += materials.size * 1024;
      if (mesh instanceof InstancedMesh)
        bytes += mesh.instanceMatrix.array.byteLength + (mesh.instanceColor?.array.byteLength ?? 0);
    }
    return bytes;
  }
  private release(proxy: Proxy) {
    this.scene.remove(proxy.mesh);
    for (const material of proxy.materials.values()) material.dispose();
    if (proxy.mesh instanceof InstancedMesh) proxy.mesh.dispose();
    // Skeletons, geometry and original texture pixels are borrowed from SpatialResource.
  }
  dispose() {
    for (const proxy of this.proxies.values()) this.release(proxy);
    for (const light of this.lights)
      if (
        light instanceof DirectionalLight ||
        light instanceof SpotLight ||
        light instanceof PointLight
      )
        light.dispose();
    this.proxies.clear();
    this.lights = [];
    this.lightKey = "";
    this.compiled = "";
    this.scene.clear();
    this.target.dispose();
  }
}
