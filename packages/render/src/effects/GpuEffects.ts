import { hasEffectTreatment } from "./shared/active";
import { compileGpuScene } from "../compositing/compile";
import {
  ASCII_DEFAULT_CHARACTERS,
  createEffect,
  getEffectDefinition,
  resolveEffectSettings,
  resolveGradientSettings,
  type Effect,
} from "@musart/core";
import {
  DataTexture,
  Vector4,
  RGBAFormat,
  UnsignedByteType,
  Mesh,
  MeshBasicNodeMaterial,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  RenderTarget,
  Scene,
  type Texture,
  type UniformNode,
  type TextureNode,
  type WebGPURenderer,
} from "three/webgpu";
import { texture, uniform, uv } from "three/tsl";
import { GlyphAtlasCache } from "./ascii/cache";
import type { GlyphAtlasBinding } from "./ascii/binding";
import { assertTextureSize, gpuTextureLimit } from "../cache/texture-limits";
import { effectStages, type EffectStage } from "./pipeline";
import { compositeEffect } from "./shared/compositing/node";
import { sampleEffect, type EffectDimensions } from "./shared/context";
import { createEffectUniforms, updateEffectUniforms, type EffectUniforms } from "./shared/uniforms";
import { EffectTargetPool } from "./shared/target-pool";

// The shared copy graph has no effect-specific parameters. Keep its uniform
// schema independent of whichever effect first requests a backdrop copy.
const COPY_EFFECT = createEffect("brightness");

function effectPassKey(effect: Effect, stage: EffectStage): string {
  const advanced =
    stage.final && Boolean(effect.composite || (effect.blendMode && effect.blendMode !== "normal"));
  return stage.key + (advanced ? ":composite" : "");
}
export interface TemporalEffectInput {
  readonly texture?: Texture;
  readonly phase: number;
  readonly bounds?: import("@musart/core").Bounds;
  readonly content?: import("@musart/core").Bounds;
}
export type TemporalEffectInputs = ReadonlyMap<string, TemporalEffectInput>;
interface EffectPass {
  readonly temporal?: NonNullable<import("./shared/context").EffectNodeContext["temporal"]>;
  readonly material: MeshBasicNodeMaterial;
  readonly source: TextureNode<"vec4">;
  readonly backdrop: TextureNode<"vec4">;
  readonly controls: EffectUniforms;
  readonly images: Map<
    string,
    { texture: TextureNode<"vec4">; enabled: UniformNode<"float", number> }
  >;
  readonly glyph: { characters: string; binding: GlyphAtlasBinding | null };
}
export interface GpuEffectStats {
  /** Successful draws since this operator was constructed. */
  readonly passes: number;
  readonly targets: number;
  /** Owned scratch and atlas bytes; caller-owned output textures are excluded. */
  readonly bytes: number;
  readonly materials: number;
}

/** Shared-renderer GPU operator. Intermediate and result pixels remain on the device. */
export class GpuEffects {
  private readonly scene = Object.assign(new Scene(), { name: "melt:effects" });
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly passes = new Map<string, EffectPass>();
  private readonly compiled = new WeakSet<EffectPass>();
  private mesh: Mesh<PlaneGeometry, MeshBasicNodeMaterial> | null = null;
  private readonly atlases = new GlyphAtlasCache();
  private readonly surfaces = new EffectTargetPool();
  private renderedPasses = 0;
  private disposed = false;

  private neutral: DataTexture | null = null;
  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly imageInput?: (assetId: string) => Texture,
  ) {}
  private neutralImage(): DataTexture {
    if (!this.neutral) {
      this.neutral = new DataTexture(
        new Uint8Array([128, 128, 128, 255]),
        1,
        1,
        RGBAFormat,
        UnsignedByteType,
      );
      this.neutral.needsUpdate = true;
    }
    return this.neutral;
  }

  private getGlyphAtlas = (): Texture => {
    assertTextureSize(256, 16, gpuTextureLimit(this.renderer));
    return this.atlases.get();
  };
  private characters(effect: Effect): string {
    return effect.type === "ascii"
      ? String(resolveEffectSettings(effect).characters)
      : ASCII_DEFAULT_CHARACTERS;
  }
  private glyphTexture(characters: string): Texture {
    assertTextureSize(Array.from(characters).length * 16, 16, gpuTextureLimit(this.renderer));
    return this.atlases.get(characters);
  }
  private getPass(
    effect: Effect,
    stage: EffectStage,
    input: Texture,
    original: Texture,
    width: number,
    height: number,
    logical: EffectDimensions,
    bindImages = true,
    temporalInput?: TemporalEffectInput,
  ): EffectPass {
    const advanced =
      stage.final &&
      Boolean(effect.composite || (effect.blendMode && effect.blendMode !== "normal"));
    const passKey = effectPassKey(effect, stage);
    const uniformEffect = stage.key === "copy" ? COPY_EFFECT : effect;
    let pass = this.passes.get(passKey);
    if (!pass) {
      const source = texture(input),
        backdrop = texture(original);
      const controls = createEffectUniforms(uniformEffect, width, height, logical);
      const glyph: EffectPass["glyph"] = { characters: this.characters(effect), binding: null };
      const images: EffectPass["images"] = new Map();
      const temporal = getEffectDefinition(effect.type).temporal
        ? {
            source: texture(this.neutralImage()),
            flipY: uniform(1),
            enabled: uniform(0),
            region: uniform(new Vector4(0, 0, 1, 1)),
            phase: uniform(1),
          }
        : undefined;
      const node = stage.builder({
        temporal,
        bindImageInput: (key) => {
          let binding = images.get(key);
          if (!binding) {
            binding = { texture: texture(this.neutralImage()), enabled: uniform(0) };
            images.set(key, binding);
          }
          return binding;
        },
        source,
        backdrop,
        controls,
        getGlyphAtlas: this.getGlyphAtlas,
        bindGlyphAtlas: () =>
          (glyph.binding ??= {
            texture: texture(this.glyphTexture(glyph.characters)),
            count: uniform(Array.from(glyph.characters).length),
          }),
      });
      const material = new MeshBasicNodeMaterial({
        depthTest: false,
        depthWrite: false,
        blending: NoBlending,
        toneMapped: false,
      });
      material.name = passKey;
      material.fragmentNode = stage.final
        ? compositeEffect(
            sampleEffect(backdrop, { ...controls, sourceFlipY: controls.backdropFlipY }, uv()),
            node,
            controls,
            advanced,
          )
        : node;
      pass = { material, source, backdrop, controls, glyph, images, temporal };
      this.passes.set(passKey, pass);
    }
    for (const [key, binding] of pass.images) {
      const assetId = effect.inputs?.[key];
      if (assetId && bindImages && !this.imageInput)
        throw Error("Effect image resolver is unavailable");
      binding.texture.value =
        assetId && bindImages ? this.imageInput!(assetId) : this.neutralImage();
      binding.enabled.value = assetId ? 1 : 0;
    }
    if (pass.temporal) {
      pass.temporal.source.value = temporalInput?.texture ?? this.neutralImage();
      pass.temporal.flipY.value = temporalInput?.texture?.isRenderTargetTexture ? 1 : 0;
      pass.temporal.enabled.value = temporalInput?.texture ? 1 : 0;
      pass.temporal.phase.value =
        temporalInput?.phase ?? Number(resolveEffectSettings(effect).progress);
    }
    pass.source.value = input;
    pass.backdrop.value = original;
    pass.controls.sourceFlipY.value = input.isRenderTargetTexture ? 1 : 0;
    pass.controls.backdropFlipY.value = original.isRenderTargetTexture ? 1 : 0;
    const origin = logical.origin ?? { x: 0, y: 0 };
    const content = temporalInput?.content;
    const effectLogical = content
      ? { ...logical, content: { ...content, x: content.x - origin.x, y: content.y - origin.y } }
      : logical;
    updateEffectUniforms(pass.controls, uniformEffect, width, height, effectLogical);
    if (pass.temporal) {
      const bounds = temporalInput?.bounds;
      pass.temporal.region.value.set(
        bounds ? (origin.x - bounds.x) / bounds.width : 0,
        bounds ? 1 - (origin.y - bounds.y + logical.height) / bounds.height : 0,
        bounds ? logical.width / bounds.width : 1,
        bounds ? logical.height / bounds.height : 1,
      );
    }
    pass.glyph.characters = this.characters(effect);
    if (pass.glyph.binding) {
      pass.glyph.binding.texture.value = this.glyphTexture(pass.glyph.characters);
      pass.glyph.binding.count.value = Array.from(pass.glyph.characters).length;
    }
    if (stage.treatment) {
      pass.controls.amount.value = 1;
      pass.controls.scale.value = resolveGradientSettings(effect.settings).size;
    }
    return pass;
  }
  async prepare(
    effects: readonly Effect[],
    target: RenderTarget,
    width: number,
    height: number,
    canContinue?: () => boolean,
  ): Promise<void> {
    if (this.disposed) throw new Error("L’opérateur d’effets a été fermé.");
    const blocks = effects.map((effect) => ({ effect, stages: effectStages(effect) }));
    // Warmup attachments can be 1×1 while width/height describe logical uniforms.
    // Only distinct multi-stage sampler identities need a pooled texture here.
    const needsBackdrop = blocks.some(
      ({ effect, stages }) =>
        stages.length > 1 &&
        stages.some((stage) => {
          const pass = this.passes.get(effectPassKey(effect, stage));
          return !pass || !this.compiled.has(pass);
        }),
    );
    if (needsBackdrop)
      assertTextureSize(target.width, target.height, gpuTextureLimit(this.renderer));
    const surfaces = needsBackdrop ? this.surfaces.acquire(target.width, target.height, 1) : [];
    for (const { effect, stages } of blocks) {
      for (const stage of stages) {
        const existing = this.passes.get(effectPassKey(effect, stage));
        if (existing && this.compiled.has(existing)) continue;
        const pass = this.getPass(
          effect,
          stage,
          target.texture,
          // Three deduplicates sampled bindings by texture UUID at compilation.
          // Multi-stage finishes need distinct source/backdrop bindings at warmup.
          stage.final && stages.length > 1 ? surfaces[0]!.texture : target.texture,
          width,
          height,
          {
            width,
            height,
          },
          false,
        );
        if (this.compiled.has(pass)) continue;
        if (!this.mesh) {
          this.mesh = new Mesh(this.geometry, pass.material);
          this.scene.add(this.mesh);
        } else this.mesh.material = pass.material;
        await compileGpuScene(this.renderer, this.scene, this.camera, target, canContinue);
        if (this.disposed) throw new Error("L’opérateur d’effets a été fermé.");
        this.compiled.add(pass);
      }
    }
  }
  private draw(pass: EffectPass, target: RenderTarget): void {
    if (pass.source.value === target.texture || pass.backdrop.value === target.texture)
      throw new Error("Effect pass cannot sample its output target.");
    if (!this.mesh) {
      this.mesh = new Mesh(this.geometry, pass.material);
      this.scene.add(this.mesh);
    } else this.mesh.material = pass.material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
    this.renderedPasses++;
  }
  /** Retained surfaces and allocation peaks stay charged to the shared hard GPU budget. */
  projectedBytes(width: number, height: number, effects: readonly Effect[]): number {
    const enabled = effects.filter(
      (effect) => effect.enabled && getEffectDefinition(effect.type).source !== "geometry",
    );
    const stages = enabled.map((effect) => effectStages(effect));
    const total = stages.reduce((sum, block) => sum + block.length, 0);
    if (total) assertTextureSize(width, height, gpuTextureLimit(this.renderer));
    const count =
      Number(total > 1) + Number(stages.some((block, index) => index > 0 && block.length > 1));
    const glyphs = enabled
      .filter(
        (effect) =>
          effect.type === "ascii" ||
          (effect.type === "gradient" &&
            resolveGradientSettings(effect.settings).treatment === "ascii"),
      )
      .map((effect) => this.characters(effect));
    return (
      this.surfaces.projectedBytes(width, height, count) +
      this.atlases.projectedBytes(glyphs) +
      (this.neutral ||
      enabled.some(
        (effect) =>
          getEffectDefinition(effect.type).inputs?.length ||
          getEffectDefinition(effect.type).temporal,
      )
        ? 4
        : 0)
    );
  }

  /**
   * Output belongs to the caller and remains valid after other layers are processed.
   * The returned texture is source when every effect is disabled, otherwise output.texture.
   * Source must differ from output.texture to prevent a GPU feedback loop.
   */
  apply(
    source: Texture,
    width: number,
    height: number,
    effects: readonly Effect[],
    output: RenderTarget,
    logical: EffectDimensions = { width, height },
    temporal?: TemporalEffectInputs,
  ): Texture {
    if (this.disposed) throw new Error("L’opérateur d’effets a été fermé.");
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1)
      throw new Error("Dimensions GPU invalides.");
    if (
      !Number.isFinite(logical.width) ||
      !Number.isFinite(logical.height) ||
      logical.width <= 0 ||
      logical.height <= 0
    )
      throw new Error("Invalid logical effect dimensions.");
    const enabled = effects.filter(
      (effect) =>
        hasEffectTreatment(effect) && getEffectDefinition(effect.type).source !== "geometry",
    );
    if (!enabled.length) return source;
    if (source === output.texture)
      throw new Error("La source et la cible GPU doivent être distinctes.");
    assertTextureSize(width, height, gpuTextureLimit(this.renderer));
    output.setSize(width, height);
    const blocks = enabled.map((effect) => ({ effect, stages: effectStages(effect) }));
    const total = blocks.reduce((sum, block) => sum + block.stages.length, 0);
    const needsBackdrop = blocks.some((block, index) => index > 0 && block.stages.length > 1);
    const surfaces = this.surfaces.acquire(
      width,
      height,
      Number(total > 1) + Number(needsBackdrop),
    );
    const scratch = surfaces[0];
    const backdrop = surfaces[1];
    const previous = this.renderer.getRenderTarget();
    let input = source,
      index = 0;
    try {
      for (const block of blocks) {
        let original = input;
        if (block.stages.length > 1 && input !== source) {
          const copy: EffectStage = {
            key: "copy",
            builder: ({ source, controls }) => sampleEffect(source, controls, uv()),
            final: false,
          };
          this.draw(
            this.getPass(block.effect, copy, input, input, width, height, logical),
            backdrop!,
          );
          original = backdrop!.texture;
        }
        for (const stage of block.stages) {
          const target = (total - index++) % 2 === 1 ? output : scratch!;
          this.draw(
            this.getPass(
              block.effect,
              stage,
              input,
              original,
              width,
              height,
              logical,
              true,
              temporal?.get(block.effect.id),
            ),
            target,
          );
          input = target.texture;
        }
      }
      return output.texture;
    } finally {
      this.renderer.setRenderTarget(previous);
    }
  }

  stats(): GpuEffectStats {
    return {
      passes: this.renderedPasses,
      targets: this.surfaces.targets,
      bytes: this.surfaces.bytes + this.atlases.bytes() + (this.neutral ? 4 : 0),
      materials: this.passes.size,
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.surfaces.dispose();
    this.atlases.dispose();
    this.neutral?.dispose();
    this.neutral = null;
    for (const pass of this.passes.values()) pass.material.dispose();
    this.passes.clear();
    if (this.mesh) this.scene.remove(this.mesh);
    this.mesh = null;
    this.geometry.dispose();
  }
}
