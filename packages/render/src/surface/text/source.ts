import { strokedTextNode } from "./stroke";
import { TextDiagnostics } from "./diagnostics";
import { MorphResource, morphResourceKey, sourceMorph } from "../morph/resource";
import { buildMorphAtlasAsync } from "../morph/atlas";
import { textMorph } from "../morph/text";
import { compileGpuScene } from "../../compositing/compile";
import type { Composition, Layer } from "@musart/core";
import {
  DoubleSide,
  CustomBlending,
  MaxEquation,
  Mesh,
  MeshBasicNodeMaterial,
  OneFactor,
  OrthographicCamera,
  Scene,
  type InstancedBufferGeometry,
  type RenderTarget,
  type WebGPURenderer,
} from "three/webgpu";
import { vec4 } from "three/tsl";
import { GpuResourceCache, type GpuResource } from "../../cache/GpuResourceCache";
import { FontRepository, normalizeFontFamily, type FontResolver, type OutlineFont } from "./fonts";
import { buildCurveAtlas, type CurveAtlas } from "./atlas";
import { layoutText, type PlacedGlyph } from "./layout";
import { glyphGeometry, updateGlyphGeometry } from "./geometry";
import { glyphCoverage } from "./coverage";
import { glyphVertex } from "./vertex";
import { textPaint, textPaintNode, updateTextPaint } from "./paint";

export function textGeometryKey(layer: Layer): string {
  return JSON.stringify([
    normalizeFontFamily(layer.fontFamily),
    layer.fontWeight,
    layer.fontSize,
    layer.text,
    layer.width,
    layer.height,
    layer.lineHeight,
    layer.letterSpacing,
    layer.textAlign,
    layer.strokeWidth,
  ]);
}

/** Per-layer outline identity excludes continuous layout; document edits still invalidate pixels. */
export function textResourceKey(layer: Layer): string {
  const morph = sourceMorph(layer);
  if (morph) return `morph:${morphResourceKey(layer, morph)}`;
  return JSON.stringify([
    layer.id,
    normalizeFontFamily(layer.fontFamily),
    layer.fontWeight,
    layer.text,
    layer.strokeWidth > 0,
  ]);
}

export class TextResource implements GpuResource {
  readonly targets = 0;
  readonly scene = Object.assign(new Scene(), { name: "melt:text" });
  readonly paint = textPaint();
  readonly camera: OrthographicCamera;
  readonly atlas: CurveAtlas;
  readonly geometry: InstancedBufferGeometry;
  readonly material: MeshBasicNodeMaterial;
  readonly bytes: number;
  private closed = false;
  private compiled = false;
  private layoutKey: string;
  private readonly glyphIds: readonly number[];

  constructor(
    layer: Layer,
    font: OutlineFont,
    layout: PlacedGlyph[] = layoutText(layer, font),
    readonly supportsStroke = layer.strokeWidth > 0,
  ) {
    this.layoutKey = textGeometryKey(layer);
    this.glyphIds = layout.map((item) => item.glyph.index);
    let atlas: CurveAtlas | undefined,
      geometry: InstancedBufferGeometry | undefined,
      material: MeshBasicNodeMaterial | undefined;
    try {
      atlas = buildCurveAtlas(
        layout.map(({ glyph }) => glyph),
        font.unitsPerEm,
      );
      geometry = glyphGeometry(layer, layout, atlas, font.unitsPerEm);
      material = new MeshBasicNodeMaterial({
        transparent: true,
        premultipliedAlpha: true,
        blending: CustomBlending,
        blendEquation: MaxEquation,
        blendEquationAlpha: MaxEquation,
        blendSrc: OneFactor,
        blendDst: OneFactor,
        blendSrcAlpha: OneFactor,
        blendDstAlpha: OneFactor,
        depthTest: false,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      });
      this.camera = new OrthographicCamera(0, layer.width, 0, layer.height, 0, 100);
      this.camera.position.z = 10;
      const vertex = glyphVertex();
      material.positionNode = vertex.position;
      const paint = textPaintNode(this.paint, vertex.pixel),
        coverage = glyphCoverage(atlas.texture, atlas.width, vertex.coordinate);
      material.fragmentNode = supportsStroke
        ? strokedTextNode(atlas, vertex.coordinate, paint, coverage, this.paint)
        : vec4(paint.rgb, paint.a.mul(coverage));
      const mesh = new Mesh(geometry, material);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.atlas = atlas;
      this.geometry = geometry;
      this.material = material;
      this.bytes =
        atlas.bytes +
        Object.values(geometry.attributes).reduce(
          (sum, attribute) => sum + attribute.array.byteLength,
          0,
        ) +
        (geometry.index?.array.byteLength ?? 0);
    } catch (error) {
      this.scene.clear();
      material?.dispose();
      geometry?.dispose();
      atlas?.texture.dispose();
      throw error;
    }
  }
  matchesLayout(layer: Layer): boolean {
    return this.layoutKey === textGeometryKey(layer);
  }
  canUpdateLayout(layout: PlacedGlyph[]): boolean {
    return (
      layout.length === this.glyphIds.length &&
      layout.every((item, index) => item.glyph.index === this.glyphIds[index])
    );
  }
  updateLayout(layer: Layer, layout: PlacedGlyph[], unitsPerEm: number): void {
    if (!this.canUpdateLayout(layout)) throw new Error("Text layout changed its glyph topology.");
    updateGlyphGeometry(this.geometry, layer, layout, this.atlas, unitsPerEm);
    this.camera.right = layer.width;
    this.camera.bottom = layer.height;
    this.camera.updateProjectionMatrix();
    this.layoutKey = textGeometryKey(layer);
  }
  get glyphCount() {
    return this.glyphIds.length;
  }
  async prepare(
    renderer: WebGPURenderer,
    target: RenderTarget,
    canContinue?: () => boolean,
  ): Promise<boolean> {
    if (this.compiled) return false;
    await compileGpuScene(renderer, this.scene, this.camera, target, canContinue);
    this.compiled = true;
    return true;
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.scene.clear();
    this.material.dispose();
    this.geometry.dispose();
    this.atlas.texture.dispose();
  }
}

/** Font parsing/layout are cached preparation; paint and analytical glyph coverage run in TSL. */
export class TextSources {
  readonly diagnostics = new TextDiagnostics();
  parses = 0;
  passes = 0;
  private readonly fonts: FontRepository;
  private readonly pending = new Map<string, Promise<void>>();
  private disposed = false;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly cache: GpuResourceCache,
    options: { fontResolver?: FontResolver } = {},
  ) {
    this.fonts = new FontRepository({ resolver: options.fontResolver });
  }
  async prepare(
    page: Composition,
    options: { target?: RenderTarget; canContinue?: () => boolean; profile?: boolean } = {},
  ): Promise<void> {
    this.assertOpen();
    this.diagnostics.enabled = !!options.profile;
    const active = new Set<TextResource | MorphResource>();
    const prepareResource = async (resource: TextResource | MorphResource) => {
      active.add(resource);
      if (!options.target) return;
      const start = this.diagnostics.start();
      if (await resource.prepare(this.renderer, options.target, options.canContinue)) {
        this.diagnostics.compilations++;
        this.diagnostics.end("compile", start);
      }
    };
    const byParent = new Map<string | null, Layer[]>();
    for (const layer of page.layers) {
      const siblings = byParent.get(layer.parentId) ?? [];
      siblings.push(layer);
      byParent.set(layer.parentId, siblings);
    }
    const parents: (string | null)[] = [null];
    while (parents.length) {
      for (const layer of byParent.get(parents.pop()!) ?? []) {
        if (!layer.visible || (layer.opacity === 0 && page.motion?.mode !== "motion")) continue;
        if (layer.kind === "group") parents.push(layer.id);
        if (layer.kind !== "text" || layer.spatial?.enabled) continue;
        this.assertOpen();
        const entry = this.resourceEntry(layer),
          key = entry.key;
        let resource = entry.resource;
        if (resource?.matchesLayout(layer)) {
          this.diagnostics.cacheHits++;
          await prepareResource(resource);
          continue;
        }
        let job = this.pending.get(key);
        if (!job) {
          job = this.prepareLayer(layer, key, options.canContinue).finally(() => {
            if (this.pending.get(key) === job) this.pending.delete(key);
          });
          this.pending.set(key, job);
        }
        await job;
        resource = this.cache.get<TextResource | MorphResource>(key);
        if (resource) await prepareResource(resource);
      }
    }
    this.assertOpen();
    this.diagnostics.inventory = {
      glyphs: 0,
      morphShapes: 0,
      morphStates: 0,
      morphSegments: 0,
      maxBandCurves: 0,
      atlasBytes: 0,
    };
    const inventory = this.diagnostics.inventory;
    for (const resource of active) {
      inventory.atlasBytes += resource.atlas.bytes;
      if (resource instanceof MorphResource) {
        inventory.morphShapes += resource.atlas.shapes.length;
        inventory.morphStates += resource.atlas.shapes.reduce(
          (n, shape) => n + shape.frames.length,
          0,
        );
        inventory.morphSegments += resource.atlas.segments;
        inventory.maxBandCurves = Math.max(inventory.maxBandCurves, resource.atlas.maxBandCurves);
      } else inventory.glyphs += resource.glyphCount;
    }
  }
  stats() {
    return this.diagnostics.stats();
  }
  private async prepareLayer(
    layer: Layer,
    key: string,
    canContinue?: () => boolean,
  ): Promise<void> {
    const fontStarted = this.diagnostics.start();
    const lease = await this.fonts.acquire(layer.fontFamily, layer.fontWeight);
    this.diagnostics.end("font", fontStarted);
    try {
      this.assertOpen();
      const layoutStarted = this.diagnostics.start();
      const layout = layoutText(layer, lease.font);
      this.diagnostics.shapings++;
      this.diagnostics.end("shaping", layoutStarted);
      const existing = this.cache.get<TextResource | MorphResource>(key);
      if (existing instanceof TextResource && existing.canUpdateLayout(layout)) {
        existing.updateLayout(layer, layout, lease.font.unitsPerEm);
        return;
      }
      const effect = sourceMorph(layer);
      let resource: TextResource | MorphResource;
      if (effect) {
        const contourStarted = this.diagnostics.start();
        const definition = textMorph(layer, effect, lease.font, layout);
        this.diagnostics.end("contours", contourStarted);
        const atlasStarted = this.diagnostics.start();
        const atlas = await buildMorphAtlasAsync(definition, {
          profile: this.diagnostics.enabled,
          canContinue: () => !this.disposed && (canContinue?.() ?? true),
        });
        this.diagnostics.end("atlas", atlasStarted);
        if (atlas.preparation)
          for (const phase of ["correspondence", "simplification", "packing"] as const)
            this.diagnostics.sample(phase, atlas.preparation[phase]);
        try {
          this.assertOpen();
          resource = new MorphResource(layer, effect, definition, atlas);
        } catch (error) {
          atlas.texture.dispose();
          throw error;
        }
      } else {
        const atlasStarted = this.diagnostics.start();
        resource = new TextResource(
          layer,
          lease.font,
          layout,
          layer.strokeWidth > 0 || (existing instanceof TextResource && existing.supportsStroke),
        );
        this.diagnostics.end("atlas", atlasStarted);
      }
      if (this.disposed) {
        resource.dispose();
        this.assertOpen();
      }
      // The GPU resource contains copied curves and no longer depends on its font face.
      this.cache.set(key, resource);
      this.parses++;
      this.diagnostics.rebuilds++;
    } finally {
      lease.release();
    }
  }
  private assertOpen(): void {
    if (this.disposed) throw new Error("Text source is disposed.");
  }
  private resourceEntry(layer: Layer) {
    const key = `text:${textResourceKey(layer)}`,
      resource = this.cache.get<TextResource | MorphResource>(key);
    if (resource || layer.strokeWidth > 0 || sourceMorph(layer)) return { key, resource };
    // Reuse an already compiled outline graph without aliasing ownership in the cache.
    const strokedKey = `text:${textResourceKey({ ...layer, strokeWidth: 1 })}`,
      stroked = this.cache.get<TextResource>(strokedKey);
    return stroked instanceof TextResource
      ? { key: strokedKey, resource: stroked }
      : { key, resource };
  }
  render(layer: Layer, target: RenderTarget): void {
    this.assertOpen();
    const { resource } = this.resourceEntry(layer);
    if (!resource?.matchesLayout(layer)) throw new Error("Text outline source was not prepared.");
    const updateStarted = this.diagnostics.start();
    updateTextPaint(resource.paint, layer);
    if (resource instanceof MorphResource) {
      resource.update(layer, sourceMorph(layer)!);
      this.diagnostics.morphUpdates++;
    }
    this.diagnostics.end("update", updateStarted);
    const previous = this.renderer.getRenderTarget(),
      auto = this.renderer.autoClear;
    try {
      this.renderer.autoClear = false;
      this.renderer.setRenderTarget(target);
      const drawStarted = this.diagnostics.start();
      this.renderer.render(resource.scene, resource.camera);
      this.diagnostics.end("draw", drawStarted);
      this.diagnostics.draws++;
      this.passes++;
    } finally {
      this.renderer.setRenderTarget(previous);
      this.renderer.autoClear = auto;
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending.clear();
    this.fonts.clear();
  }
}
