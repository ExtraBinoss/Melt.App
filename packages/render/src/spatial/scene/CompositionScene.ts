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
  type Texture,
  type WebGPURenderer,
} from "three/webgpu";
import type { GpuResource } from "../../cache/GpuResourceCache";
import { SourceIdentities } from "../../cache/source-identities";
import { createSpatialDependencySignatures } from "../../cache/spatial-signatures";
import { compileGpuScene } from "../../compositing/compile";
import { assertTextureSize, gpuTextureLimit } from "../../cache/texture-limits";
import { updateCompositionCamera } from "../camera";
import { SpatialResource, type SpatialNativeLight } from "../SpatialResource";
import type { ReflectionSource } from "../reflections/model";
import { DepthBindings } from "./DepthBindings";
import { DepthScopes } from "./DepthScopes";
import { SharedShadows } from "./SharedShadows";
import { registerSampledLights } from "./SampledLights";
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
  private shadowsReady = false;
  private depthSignature = "";
  private shadowSignature = "";
  private readonly sourceStamps = new Map<string, string>();
  private readonly sourceMeshes = new Map<string, Mesh[]>();
  private depthScope: string | null = null;
  private scopes: DepthScopes | null = null;
  private readonly meshSources = new Map<Mesh, string>();
  stamp = "";
  closed = false;
  constructor(
    private readonly renderer: WebGPURenderer,
    settings: SpatialScene,
  ) {
    this.settings = settings;
    registerSampledLights(renderer);
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
      this.signatureBytes +
      this.owner.bytes +
      this.depthTarget.width * this.depthTarget.height * 8 +
      this.depth.bytes
    );
  }
  get targets() {
    return this.owner.targets + 1;
  }
  private get signatureBytes() {
    return (
      (this.depthSignature.length +
        this.shadowSignature.length +
        this.stamp.length +
        [...this.sourceStamps.values()].reduce((size, stamp) => size + stamp.length, 0)) *
      2
    );
  }
  projectedBytes(width: number, height: number, count: number) {
    return (
      this.identities.stats().bytes +
      this.signatureBytes +
      this.owner.bytes +
      width * height * 8 +
      count * 8192
    );
  }
  sync(
    page: Composition,
    settings: SpatialScene,
    sources: ReflectionSource[],
    environment: Texture | null,
    scale: number,
  ) {
    this.settings = settings;
    this.scopes = new DepthScopes(
      page,
      sources.map(({ layer }) => layer.id),
    );
    this.depth.restore();
    this.meshSources.clear();
    this.sourceMeshes.clear();
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
      const meshes: Mesh[] = [];
      resource.root.traverse((node) => {
        if (node instanceof Mesh) {
          this.meshSources.set(node, layer.id);
          meshes.push(node);
        }
      });
      this.sourceMeshes.set(layer.id, meshes);
    }
    this.scene.updateMatrixWorld(true);
    const density = Math.max(
      scale,
      ...sources.map((s) =>
        s.layer.effects.some((e) => e.enabled) || s.layer.mask?.enabled || s.layer.clipping
          ? 1
          : scale,
      ),
    );
    const depthWidth = Math.max(1, Math.ceil(page.width * density)),
      depthHeight = Math.max(1, Math.ceil(page.height * density));
    const limit = gpuTextureLimit(this.renderer);
    assertTextureSize(depthWidth, depthHeight, limit);
    if (this.depthTarget.width !== depthWidth || this.depthTarget.height !== depthHeight)
      this.depthReady = false;
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
      const reference =
        layer.effects.some((e) => e.enabled) || layer.mask?.enabled || layer.clipping;
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
    const signatures = createSpatialDependencySignatures(
      page,
      settings,
      sources.map(({ layer, resource }) => ({
        layer,
        contentIdentity: resource.content.uuid,
        worldMatrix: geometry.worldMatrix(layer.id),
        visible: index.isVisible(layer.id),
        inheritedOpacity: index.ancestors(layer.id).map((parent) => parent.opacity),
      })),
      environment?.uuid ?? null,
      (signature) => this.identities.intern(signature),
    );
    if (this.depthSignature !== signatures.depth) this.depthReady = false;
    if (this.shadowSignature !== signatures.shadows) this.shadowsReady = false;
    this.depthSignature = signatures.depth;
    this.shadowSignature = signatures.shadows;
    if (!this.depthReady) this.depthScope = null;
    this.sourceStamps.clear();
    for (const { layer } of sources)
      this.sourceStamps.set(
        layer.id,
        `${this.scene.uuid}:${this.identities.intern(signatures.source(layer.id)!)}`,
      );
    this.stamp = `${this.scene.uuid}:${this.identities.intern(signatures.composite)}`;
  }
  sourceStamp(id: string) {
    return this.sourceStamps.get(id);
  }
  bindingStats() {
    return this.depth.stats();
  }
  bounds(id: string) {
    return this.transports.get(id);
  }
  /** An inactive cached rig must not retain borrowed source geometry or texture pixels. */
  releaseSources() {
    this.depth.restore();
    for (const anchor of this.anchors.values()) anchor.clear();
    this.sources.clear();
    this.meshSources.clear();
    this.sourceMeshes.clear();
    this.sourceStamps.clear();
    this.identities.clear();
    this.stamp = "";
    this.scopes = null;
    this.depthReady = false;
    this.shadowsReady = false;
    this.depthSignature = "";
    this.shadowSignature = "";
    this.depthScope = null;
    this.depth.prune(new Set());
    this.compiledDepth = "";
    this.compiledColor = "";
  }
  async prepare(canContinue: () => boolean) {
    const source = this.sources.values().next().value as ReflectionSource | undefined;
    if (!source) return;
    const state = this.renderer.shadowMap.enabled;
    this.depth.sync(this.meshSources.keys());
    try {
      this.renderer.shadowMap.enabled = this.settings.shadows;
      this.depth.bind(this.meshSources.keys(), "depth");
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
      this.depth.bind(this.meshSources.keys(), "color");
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
      const scope = this.scopes!.scope(layer.id);
      if (!this.depthReady || this.depthScope !== scope || !this.shadowsReady) {
        if (!this.shadowsReady) this.shadows.begin();
        for (const anchor of this.anchors.values()) anchor.visible = true;
        this.scene.traverse((node) => {
          const light = node as SpatialNativeLight;
          if (light.shadow) light.shadow.autoUpdate = !this.shadowsReady;
        });
        this.depth.bind(this.meshSources.keys(), "depth", (mesh) =>
          this.scopes!.writes(this.meshSources.get(mesh)!, scope),
        );
        // A failed or interrupted prepass must never leave the previous scope marked usable.
        this.depthReady = false;
        this.depthScope = null;
        renderer.setRenderTarget(this.depthTarget);
        try {
          renderer.render(this.scene, this.camera);
        } finally {
          this.scene.traverse((node) => {
            const light = node as SpatialNativeLight;
            if (light.shadow) light.shadow.autoUpdate = false;
          });
        }
        this.depth.restore();
        this.depthReady = true;
        this.shadowsReady = true;
        this.depthScope = scope;
      }
      for (const [id, anchor] of this.anchors) anchor.visible = id === layer.id;
      resource.root.visible = true;
      this.depth.occlusion.value = this.maskSources.has(layer.id) ? 0 : 1;
      this.depth.bind(this.sourceMeshes.get(layer.id)!, "color");
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
