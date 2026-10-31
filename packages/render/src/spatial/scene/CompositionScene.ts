import {
  createLayer,
  createLayerGeometryIndex,
  createSpatialLayer,
  SpatialGeometry,
  type Bounds,
  type Composition,
  type Layer,
  type SpatialScene,
} from "@musart/core";
import {
  Color,
  DepthTexture,
  FloatType,
  Group,
  Matrix4,
  Mesh,
  PCFShadowMap,
  RenderTarget,
  type Camera,
  type Material,
  type Texture,
  type WebGPURenderer,
} from "three/webgpu";
import type { GpuResource } from "../../cache/GpuResourceCache";
import { SourceIdentities } from "../../cache/source-identities";
import { compileGpuScene } from "../../compositing/compile";
import { assertTextureSize, gpuTextureLimit } from "../../cache/texture-limits";
import { updateCompositionCamera } from "../camera";
import { SpatialResource, type SpatialNativeLight } from "../SpatialResource";
import type { ReflectionSource } from "../reflections/model";
import { DepthBindings } from "./DepthBindings";
import { SharedShadows } from "./SharedShadows";
import { projectedTransport, transportProjection } from "./projection";

/** One world, camera and light rig per composition. Sources keep independent effect surfaces. */
export class CompositionScene implements GpuResource {
  private readonly owner: SpatialResource;
  readonly depthTarget = new RenderTarget(1, 1, {
    depthBuffer: true,
    depthTexture: new DepthTexture(1, 1, FloatType),
  });
  private readonly depth: DepthBindings;
  private readonly shadows = new SharedShadows();
  private readonly identities = new SourceIdentities(512, 2 * 1024 * 1024);
  private readonly anchors = new Map<string, Group>();
  private readonly sources = new Map<string, ReflectionSource>();
  private readonly maskSources = new Set<string>();
  private readonly visibleSources = new Set<string>();
  private readonly transports = new Map<string, Bounds>();
  private readonly projection = new Map<string, Matrix4>();
  private settings: SpatialScene;
  private compiledDepth = "";
  private compiledColor = "";
  private depthReady = false;
  stamp = "";
  closed = false;
  constructor(
    private readonly renderer: WebGPURenderer,
    settings: SpatialScene,
  ) {
    this.settings = settings;
    this.owner = new SpatialResource(new Group(), [], settings);
    this.owner.scene.name = "melt:composition-3d";
    this.depth = new DepthBindings(renderer, this.depthTarget.depthTexture!);
  }
  get scene() {
    return this.owner.scene;
  }
  get camera() {
    return this.owner.camera;
  }
  get bytes() {
    return (
      this.identities.stats().bytes +
      this.owner.bytes +
      this.depthTarget.width * this.depthTarget.height * 8 +
      this.depth.bytes
    );
  }
  get targets() {
    return this.owner.targets + 1;
  }
  projectedBytes(width: number, height: number, count: number) {
    return this.identities.stats().bytes + this.owner.bytes + width * height * 8 + count * 8192;
  }
  sync(
    page: Composition,
    settings: SpatialScene,
    sources: ReflectionSource[],
    environment: Texture | null,
    scale: number,
  ) {
    this.settings = settings;
    for (const anchor of this.anchors.values()) anchor.clear();
    const active = new Set(sources.map((s) => s.layer.id));
    for (const [id, anchor] of this.anchors)
      if (!active.has(id)) {
        this.scene.remove(anchor);
        this.anchors.delete(id);
      }
    this.sources.clear();
    this.maskSources.clear();
    this.visibleSources.clear();
    this.transports.clear();
    this.projection.clear();
    const fake = createLayer("group", {
      id: "__spatial_scene_rig",
      width: page.width,
      height: page.height,
      spatial: createSpatialLayer("group"),
    });
    this.owner.update(fake, settings, environment, 1, 1);
    this.shadows.sync(this.scene);
    updateCompositionCamera(this.camera, page, this.renderer.coordinateSystem);
    const index = createLayerGeometryIndex(page);
    const geometry = new SpatialGeometry(page, index.byId);
    for (const source of sources) {
      const { layer, resource } = source;
      let anchor = this.anchors.get(layer.id);
      if (!anchor) {
        anchor = new Group();
        anchor.matrixAutoUpdate = false;
        this.anchors.set(layer.id, anchor);
        this.scene.add(anchor);
      }
      anchor.matrix.fromArray(geometry.anchorMatrix(layer.id));
      anchor.add(resource.root);
      const mask = index.isMaskSource(layer.id);
      if (mask) this.maskSources.add(layer.id);
      if (index.isVisible(layer.id)) this.visibleSources.add(layer.id);
      resource.root.visible = !mask && this.visibleSources.has(layer.id);
      this.sources.set(layer.id, source);
    }
    this.scene.updateMatrixWorld(true);
    const density = Math.max(
      scale,
      ...sources.map((s) =>
        s.layer.effects.some((e) => e.enabled) || s.layer.mask?.enabled ? 1 : scale,
      ),
    );
    const depthWidth = Math.max(1, Math.ceil(page.width * density)),
      depthHeight = Math.max(1, Math.ceil(page.height * density));
    const limit = gpuTextureLimit(this.renderer);
    assertTextureSize(depthWidth, depthHeight, limit);
    this.depthTarget.setSize(depthWidth, depthHeight);
    this.depth.viewProjection.value
      .copy(this.camera.projectionMatrix)
      .multiply(this.camera.matrixWorldInverse);
    for (const { layer, resource } of sources) {
      const bounds = projectedTransport(page, layer, resource.root, this.camera, geometry);
      this.transports.set(layer.id, bounds);
      const crop = transportProjection(page, layer, bounds, geometry)
        .invert()
        .multiply(this.camera.projectionMatrix);
      this.projection.set(layer.id, crop);
      const reference = layer.effects.some((e) => e.enabled) || layer.mask?.enabled;
      assertTextureSize(
        Math.max(1, Math.ceil(bounds.width * (reference ? 1 : scale))),
        Math.max(1, Math.ceil(bounds.height * (reference ? 1 : scale))),
        limit,
      );
      resource.target.setSize(
        Math.max(1, Math.ceil(bounds.width * (reference ? 1 : scale))),
        Math.max(1, Math.ceil(bounds.height * (reference ? 1 : scale))),
      );
      (resource.camera as Camera).copy(this.camera, false);
      resource.camera.projectionMatrix.copy(crop);
      resource.camera.projectionMatrixInverse.copy(crop).invert();
    }
    this.depthReady = false;
    this.stamp = `${this.scene.uuid}:${this.identities.intern(
      JSON.stringify([
        page.width,
        page.height,
        settings,
        sources.map(({ layer, resource }) => [
          layer.id,
          resource.content.uuid,
          geometry.worldMatrix(layer.id),
          layer.opacity,
          index.isVisible(layer.id),
          index.ancestors(layer.id).map((parent) => parent.opacity),
          layer.fill,
          layer.fillGradient,
          layer.spatial,
          layer.vector?.parts?.map((p) => [p.fill, p.opacity]),
        ]),
      ]),
    )}`;
  }
  bounds(id: string) {
    return this.transports.get(id);
  }
  /** An inactive cached rig must not retain borrowed source geometry or texture pixels. */
  releaseSources() {
    this.depth.restore();
    for (const anchor of this.anchors.values()) anchor.clear();
    this.sources.clear();
    this.depth.prune(new Set());
    this.compiledDepth = "";
    this.compiledColor = "";
  }
  async prepare(canContinue: () => boolean) {
    const source = this.sources.values().next().value as ReflectionSource | undefined;
    if (!source) return;
    const state = this.renderer.shadowMap.enabled;
    const materials = new Set<Material>();
    this.scene.traverse((node) => {
      if (node instanceof Mesh)
        for (const m of Array.isArray(node.material) ? node.material : [node.material])
          materials.add(m);
    });
    this.depth.prune(materials);
    try {
      this.renderer.shadowMap.enabled = this.settings.shadows;
      this.depth.apply(this.scene, "depth");
      const depthKey = this.shaderKey("depth");
      if (depthKey !== this.compiledDepth) {
        const pending = compileGpuScene(
          this.renderer,
          this.scene,
          this.camera,
          this.depthTarget,
          canContinue,
        );
        this.depth.restore();
        await pending;
        this.compiledDepth = depthKey;
      }
      this.depth.restore();
      this.renderer.shadowMap.enabled = this.settings.shadows;
      for (const source of this.sources.values()) source.resource.root.visible = true;
      this.depth.apply(this.scene, "color");
      const key = this.shaderKey("color");
      if (key !== this.compiledColor) {
        const pending = compileGpuScene(
          this.renderer,
          this.scene,
          this.camera,
          source.resource.target,
          canContinue,
        );
        this.depth.restore();
        await pending;
        this.compiledColor = key;
      }
    } finally {
      this.depth.restore();
      this.renderer.shadowMap.enabled = state;
      for (const [id, source] of this.sources)
        source.resource.root.visible = !this.maskSources.has(id) && this.visibleSources.has(id);
    }
  }
  private shaderKey(mode: "depth" | "color") {
    return JSON.stringify([
      this.camera.type,
      this.settings.shadows,
      this.settings.lights.map((l) => [l.id, l.type, l.enabled, l.castShadow]),
      Boolean(this.scene.environment),
      this.depth.key(mode),
    ]);
  }
  render(layer: Layer) {
    const resource = this.sources.get(layer.id)?.resource;
    if (!resource || resource.closed) throw Error("Shared 3D source is not prepared");
    const renderer = this.renderer,
      target = renderer.getRenderTarget(),
      face = renderer.getActiveCubeFace(),
      mip = renderer.getActiveMipmapLevel(),
      auto = renderer.autoClear,
      shadow = renderer.shadowMap.enabled,
      type = renderer.shadowMap.type,
      alpha = renderer.getClearAlpha(),
      color = renderer.getClearColor(new Color()),
      projection = this.camera.projectionMatrix.clone(),
      inverse = this.camera.projectionMatrixInverse.clone();
    try {
      renderer.shadowMap.enabled = this.settings.shadows;
      renderer.shadowMap.type = PCFShadowMap;
      renderer.autoClear = true;
      renderer.setClearColor(0, 0);
      if (!this.depthReady) {
        this.shadows.begin();
        for (const anchor of this.anchors.values()) anchor.visible = true;
        this.scene.traverse((node) => {
          const light = node as SpatialNativeLight;
          if (light.shadow) light.shadow.autoUpdate = true;
        });
        this.depth.apply(this.scene, "depth");
        renderer.setRenderTarget(this.depthTarget);
        renderer.render(this.scene, this.camera);
        this.depth.restore();
        this.scene.traverse((node) => {
          const light = node as SpatialNativeLight;
          if (light.shadow) light.shadow.autoUpdate = false;
        });
        this.depthReady = true;
      }
      for (const [id, anchor] of this.anchors) anchor.visible = id === layer.id;
      resource.root.visible = true;
      this.depth.occlusion.value = this.maskSources.has(layer.id) ? 0 : 1;
      this.depth.apply(this.scene, "color");
      this.camera.projectionMatrix.copy(this.projection.get(layer.id)!);
      this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
      renderer.setRenderTarget(resource.target);
      renderer.render(this.scene, this.camera);
    } finally {
      this.depth.restore();
      this.camera.projectionMatrix.copy(projection);
      this.camera.projectionMatrixInverse.copy(inverse);
      resource.root.visible = !this.maskSources.has(layer.id) && this.visibleSources.has(layer.id);
      for (const anchor of this.anchors.values()) anchor.visible = true;
      renderer.setRenderTarget(target, face, mip);
      renderer.autoClear = auto;
      renderer.shadowMap.enabled = shadow;
      renderer.shadowMap.type = type;
      renderer.setClearColor(color, alpha);
    }
    return resource.target;
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.releaseSources();
    for (const anchor of this.anchors.values()) anchor.clear();
    this.anchors.clear();
    this.sources.clear();
    this.depth.dispose();
    this.shadows.dispose();
    this.depthTarget.dispose();
    this.owner.dispose();
  }
}
