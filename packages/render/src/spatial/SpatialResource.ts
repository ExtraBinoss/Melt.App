import { preserveTransmissionCoverage } from "./material-output";
import { spatialVectorPaint } from "./vector-paint";
import { spatialTextPaint } from "./text-paint";
import type { Layer, SpatialScene } from "@musart/core";
import {
  AnimationMixer,
  Color,
  DirectionalLight,
  Group,
  HalfFloatType,
  MathUtils,
  Mesh,
  InstancedMesh,
  MeshPhysicalNodeMaterial,
  PCFShadowMap,
  PointLight,
  RenderTarget,
  Scene,
  SpotLight,
  Texture,
  type AnimationClip,
  type BufferGeometry,
  type Object3D,
  type WebGPURenderer,
} from "three/webgpu";
import type { GpuResource } from "../cache/GpuResourceCache";
import { compileGpuScene } from "../compositing/compile";
import {
  createSpatialCamera,
  updateSpatialCamera,
  updateSpatialObject,
  type SpatialCamera,
} from "./camera";
import { disposeModel } from "./glb";
export type SpatialNativeLight = DirectionalLight | PointLight | SpotLight;
/** A normal layer's lit 3D source. Layout, blend, mask and effects remain in the document graph. */
export class SpatialResource implements GpuResource {
  readonly scene = new Scene();
  readonly root = new Group();
  readonly material = new MeshPhysicalNodeMaterial();
  readonly target = new RenderTarget(1, 1, { type: HalfFloatType, depthBuffer: true, samples: 4 });
  camera: SpatialCamera;
  closed = false;
  private readonly lights = new Map<string, SpatialNativeLight>();
  private readonly originalMaterials = new Map<Mesh, Mesh["material"]>();
  private readonly mixer: AnimationMixer | null;
  private animation = -1;
  private compiledKey = "";
  private modelMaterials = false;
  private paint: { update: (layer: Layer) => void } | null = null;
  private shadowBytes = 0;
  private readonly contentBytes: number;
  readonly inventory: { meshes: number; vertices: number; triangles: number };
  constructor(
    readonly content: Object3D,
    readonly clips: readonly AnimationClip[],
    settings: SpatialScene,
  ) {
    preserveTransmissionCoverage(this.material);
    this.scene.add(this.root);
    this.root.add(content);
    this.camera = createSpatialCamera(settings.camera, 1);
    this.mixer = clips.length ? new AnimationMixer(content) : null;
    content.traverse((node) => {
      if (node instanceof Mesh) this.originalMaterials.set(node, node.material);
    });
    this.contentBytes = this.measureGeometryBytes();
    this.inventory = this.measureInventory();
  }
  static primitive(geometry: BufferGeometry, settings: SpatialScene, layer: Layer) {
    const resource = new SpatialResource(
      new Mesh(geometry, new MeshPhysicalNodeMaterial()),
      [],
      settings,
    );
    resource.paint =
      layer.kind === "vector"
        ? spatialVectorPaint(resource.material, layer.vector?.parts?.length ?? 1)
        : spatialTextPaint(resource.material);
    preserveTransmissionCoverage(resource.material);
    return resource;
  }
  get targets() {
    return 1 + [...this.lights.values()].filter((light) => light.shadow.map).length;
  }
  private measureInventory() {
    let vertices = 0,
      triangles = 0;
    for (const mesh of this.originalMaterials.keys()) {
      const instances = mesh instanceof InstancedMesh ? mesh.count : 1;
      vertices += (mesh.geometry.getAttribute("position")?.count ?? 0) * instances;
      triangles +=
        ((mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position")?.count ?? 0) / 3) *
        instances;
    }
    return { meshes: this.originalMaterials.size, vertices, triangles };
  }
  get geometryBytes() {
    return this.contentBytes;
  }
  private measureGeometryBytes() {
    const geometries = new Set<BufferGeometry>(),
      textures = new Set<Texture>();
    for (const [mesh, value] of this.originalMaterials) {
      geometries.add(mesh.geometry);
      for (const material of Array.isArray(value) ? value : [value])
        for (const property of Object.values(material))
          if (property instanceof Texture) textures.add(property);
    }
    let bytes = 0;
    for (const mesh of this.originalMaterials.keys())
      if (mesh instanceof InstancedMesh) {
        bytes += mesh.instanceMatrix.array.byteLength + (mesh.instanceColor?.array.byteLength ?? 0);
      }
    for (const geometry of geometries) {
      for (const attribute of Object.values(geometry.attributes))
        bytes += attribute.array.byteLength;
      bytes += geometry.index?.array.byteLength ?? 0;
      for (const attributes of Object.values(geometry.morphAttributes))
        for (const attribute of attributes ?? []) bytes += attribute.array.byteLength;
    }
    for (const texture of textures) {
      const image = texture.image as { width?: number; height?: number } | null;
      bytes += ((image?.width ?? 0) * (image?.height ?? 0) * 4 * 4) / 3;
    }
    return Math.ceil(bytes);
  }
  get bytes() {
    return this.geometryBytes + this.target.width * this.target.height * 56 + this.shadowBytes;
  }
  projectedBytes(width: number, height: number) {
    return this.geometryBytes + width * height * 56 + this.shadowBytes;
  }
  update(
    layer: Layer,
    settings: SpatialScene,
    environment: Texture | null,
    width: number,
    height: number,
  ) {
    if (this.closed) throw Error("3D source was disposed");
    const spatial = layer.spatial!;
    this.modelMaterials = spatial.source === "glb" && spatial.useModelMaterials;
    this.target.setSize(width, height);
    const perspective = settings.camera.projection === "perspective";
    if ((this.camera.type === "PerspectiveCamera") !== perspective)
      this.camera = createSpatialCamera(settings.camera, layer.width / layer.height);
    else updateSpatialCamera(this.camera, settings.camera, layer.width / layer.height);
    updateSpatialObject(this.root, spatial);
    this.scene.environment = environment;
    this.scene.environmentIntensity = settings.environment.intensity;
    this.scene.environmentRotation.set(0, MathUtils.degToRad(settings.environment.rotation), 0);
    this.paint?.update(layer);
    this.material.color.set(layer.fill === "transparent" ? "#000000" : layer.fill);
    const m = spatial.material;
    const previous = this.shaderKey();
    for (const property of [
      "metalness",
      "roughness",
      "transmission",
      "ior",
      "clearcoat",
      "clearcoatRoughness",
      "sheen",
      "iridescence",
      "emissiveIntensity",
      "opacity",
    ] as const)
      this.material[property] = m[property];
    this.material.sheenColor.copy(this.material.color);
    this.material.emissive.copy(this.material.color);
    this.material.transparent =
      m.opacity < 1 ||
      m.transmission > 0 ||
      Boolean(layer.fillGradient) ||
      layer.fill.length === 9 ||
      layer.kind === "vector";
    this.material.thickness = spatial.depth;
    this.material.depthWrite = m.opacity === 1 && m.transmission === 0;
    this.material.toneMapped = false;
    if (previous !== this.shaderKey()) this.material.needsUpdate = true;
    for (const [mesh, original] of this.originalMaterials) {
      mesh.material =
        spatial.source === "glb" && spatial.useModelMaterials ? original : this.material;
      mesh.castShadow = spatial.castShadow;
      mesh.receiveShadow = spatial.receiveShadow;
    }
    this.updateLights(settings);
    if (this.mixer) {
      if (this.animation !== spatial.clip) {
        this.mixer.stopAllAction();
        this.animation = spatial.clip;
        if (spatial.clip >= 0 && this.clips[spatial.clip])
          this.mixer.clipAction(this.clips[spatial.clip]!).play();
      }
      this.mixer.setTime(spatial.clipTime);
    }
  }
  private shaderKey() {
    return [
      this.material.transmission > 0,
      this.material.clearcoat > 0,
      this.material.sheen > 0,
      this.material.iridescence > 0,
      this.material.transparent,
    ].join(":");
  }
  private updateLights(settings: SpatialScene) {
    const present = new Set(settings.lights.map((light) => light.id));
    for (const [id, light] of this.lights)
      if (!present.has(id)) {
        this.scene.remove(light);
        if (!(light instanceof PointLight)) this.scene.remove(light.target);
        light.shadow.dispose();
        this.lights.delete(id);
      }
    this.shadowBytes = 0;
    for (const config of settings.lights) {
      let light = this.lights.get(config.id);
      const type =
        config.type === "directional"
          ? DirectionalLight
          : config.type === "point"
            ? PointLight
            : SpotLight;
      if (light && !(light instanceof type)) {
        this.scene.remove(light);
        if (!(light instanceof PointLight)) this.scene.remove(light.target);
        light.shadow.dispose();
        this.lights.delete(config.id);
        light = undefined;
      }
      if (!light) {
        light = new type();
        this.lights.set(config.id, light);
        this.scene.add(light);
      }
      light.color.set(config.color);
      light.intensity = config.intensity;
      light.visible = config.enabled;
      light.position.set(config.x, config.y, config.z);
      light.castShadow = settings.shadows && config.castShadow && config.enabled;
      light.shadow.mapSize.set(
        light instanceof PointLight ? 256 : 512,
        light instanceof PointLight ? 256 : 512,
      );
      light.shadow.bias = -0.0005;
      light.shadow.normalBias = 0.02;
      light.shadow.radius = config.softness * 4;
      if (!(light instanceof PointLight)) {
        light.target.position.set(config.targetX, config.targetY, config.targetZ);
        this.scene.add(light.target);
      }
      if (light instanceof SpotLight) {
        light.angle = MathUtils.degToRad(config.angle);
        light.penumbra = config.softness;
      }
      if (light.castShadow || light.shadow.map)
        this.shadowBytes += light instanceof PointLight ? 8 * 1024 * 1024 : 4 * 1024 * 1024;
    }
  }
  async prepare(renderer: WebGPURenderer, settings: SpatialScene, canContinue: () => boolean) {
    const key = JSON.stringify([
      this.camera.type,
      this.modelMaterials,
      this.shaderKey(),
      Boolean(this.scene.environment),
      settings.shadows,
      settings.lights.filter((l) => l.enabled).map((l) => [l.id, l.type, l.castShadow]),
    ]);
    if (this.compiledKey === key) return;
    const shadow = renderer.shadowMap.enabled;
    let pending: Promise<void>;
    try {
      renderer.shadowMap.enabled = settings.shadows;
      pending = compileGpuScene(renderer, this.scene, this.camera, this.target, canContinue);
    } finally {
      renderer.shadowMap.enabled = shadow;
    }
    await pending;
    this.compiledKey = key;
  }
  render(renderer: WebGPURenderer, settings: SpatialScene) {
    const target = renderer.getRenderTarget(),
      auto = renderer.autoClear,
      shadow = renderer.shadowMap.enabled,
      shadowType = renderer.shadowMap.type,
      alpha = renderer.getClearAlpha(),
      color = renderer.getClearColor(new Color());
    try {
      renderer.shadowMap.enabled = settings.shadows;
      renderer.shadowMap.type = PCFShadowMap;
      renderer.autoClear = true;
      renderer.setClearColor(0, 0);
      renderer.setRenderTarget(this.target);
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.setRenderTarget(target);
      renderer.setClearColor(color, alpha);
      renderer.autoClear = auto;
      renderer.shadowMap.enabled = shadow;
      renderer.shadowMap.type = shadowType;
    }
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.mixer?.stopAllAction();
    this.mixer?.uncacheRoot(this.content);
    // Restore imported ownership before disposing originals and their image bitmaps.
    for (const [mesh, material] of this.originalMaterials) mesh.material = material;
    disposeModel(this.content);
    this.material.dispose();
    this.target.dispose();
    for (const light of this.lights.values()) light.shadow.dispose();
    this.lights.clear();
    this.originalMaterials.clear();
    this.scene.clear();
  }
}
