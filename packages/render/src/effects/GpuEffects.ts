import { compileGpuScene } from "../compositing/compile";
import {
  ASCII_DEFAULT_CHARACTERS,
  getEffectDefinition,
  resolveEffectSettings,
  resolveGradientSettings,
  type Effect,
} from "@musart/core";
import {
  Mesh,
  MeshBasicNodeMaterial,
  NearestFilter,
  NoBlending,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  RenderTarget,
  Scene,
  UnsignedByteType,
  type Texture,
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

function effectPassKey(effect: Effect, stage: EffectStage): string {
  const advanced =
    stage.final && Boolean(effect.composite || (effect.blendMode && effect.blendMode !== "normal"));
  return stage.key + (advanced ? ":composite" : "");
}
interface EffectPass {
  readonly material: MeshBasicNodeMaterial;
  readonly source: TextureNode<"vec4">;
  readonly backdrop: TextureNode<"vec4">;
  readonly controls: EffectUniforms;
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
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly passes = new Map<string, EffectPass>();
  private readonly compiled = new WeakSet<EffectPass>();
  private mesh: Mesh<PlaneGeometry, MeshBasicNodeMaterial> | null = null;
  private readonly atlases = new GlyphAtlasCache();
  private scratch: RenderTarget | null = null;
  private backdrop: RenderTarget | null = null;
  private renderedPasses = 0;
  private disposed = false;

  constructor(private readonly renderer: WebGPURenderer) {}

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
  ): EffectPass {
    const advanced =
      stage.final &&
      Boolean(effect.composite || (effect.blendMode && effect.blendMode !== "normal"));
    const passKey = effectPassKey(effect, stage);
    let pass = this.passes.get(passKey);
    if (!pass) {
      const source = texture(input),
        backdrop = texture(original);
      const controls = createEffectUniforms(effect, width, height, logical);
      const glyph: EffectPass["glyph"] = { characters: this.characters(effect), binding: null };
      const node = stage.builder({
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
      pass = { material, source, backdrop, controls, glyph };
      this.passes.set(passKey, pass);
    }
    pass.source.value = input;
    pass.backdrop.value = original;
    pass.controls.sourceFlipY.value = input.isRenderTargetTexture ? 1 : 0;
    pass.controls.backdropFlipY.value = original.isRenderTargetTexture ? 1 : 0;
    updateEffectUniforms(pass.controls, effect, width, height, logical);
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
    for (const effect of effects) {
      const stages = effectStages(effect);
      for (const stage of stages) {
        const existing = this.passes.get(effectPassKey(effect, stage));
        if (existing && this.compiled.has(existing)) continue;
        const pass = this.getPass(
          effect,
          stage,
          target.texture,
          stage.final && effectStages(effect).length > 1
            ? this.getBackdrop(width, height).texture
            : target.texture,
          width,
          height,
          {
            width,
            height,
          },
        );
        if (this.compiled.has(pass)) continue;
        if (!this.mesh) {
          this.mesh = new Mesh(this.geometry, pass.material);
          this.scene.add(this.mesh);
        } else this.mesh.material = pass.material;
        await compileGpuScene(this.renderer, this.scene, this.camera, target, canContinue);
        this.compiled.add(pass);
      }
    }
  }
  private draw(pass: EffectPass, target: RenderTarget): void {
    if (!this.mesh) {
      this.mesh = new Mesh(this.geometry, pass.material);
      this.scene.add(this.mesh);
    } else this.mesh.material = pass.material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
    this.renderedPasses++;
  }
  /** Allocation high-water mark remains accounted for until explicit disposal. */
  projectedBytes(width: number, height: number, effects: readonly Effect[]): number {
    const enabled = effects.filter(
      (effect) => effect.enabled && getEffectDefinition(effect.type).source !== "geometry",
    );
    const stages = enabled.reduce((sum, effect) => sum + effectStages(effect).length, 0);
    if (stages) assertTextureSize(width, height, gpuTextureLimit(this.renderer));
    const scratch =
      stages > 1
        ? width * height * 4
        : this.scratch
          ? this.scratch.width * this.scratch.height * 4
          : 0;
    const backdrop = enabled.some((effect) => effectStages(effect).length > 1)
      ? width * height * 4
      : this.backdrop
        ? this.backdrop.width * this.backdrop.height * 4
        : 0;
    const glyphs = enabled
      .filter(
        (effect) =>
          effect.type === "ascii" ||
          (effect.type === "gradient" &&
            resolveGradientSettings(effect.settings).treatment === "ascii"),
      )
      .map((effect) => this.characters(effect));
    return scratch + backdrop + this.atlases.projectedBytes(glyphs);
  }
  private getBackdrop(width: number, height: number): RenderTarget {
    this.backdrop ??= new RenderTarget(width, height, {
      depthBuffer: false,
      type: UnsignedByteType,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
    });
    this.backdrop.texture.colorSpace = NoColorSpace;
    this.backdrop.setSize(width, height);
    return this.backdrop;
  }
  private getScratch(width: number, height: number): RenderTarget {
    if (!this.scratch) {
      this.scratch = new RenderTarget(width, height, {
        depthBuffer: false,
        type: UnsignedByteType,
        minFilter: NearestFilter,
        magFilter: NearestFilter,
      });
      this.scratch.texture.colorSpace = NoColorSpace;
    }
    this.scratch.setSize(width, height);
    return this.scratch;
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
      (effect) => effect.enabled && getEffectDefinition(effect.type).source !== "geometry",
    );
    if (!enabled.length) return source;
    if (source === output.texture)
      throw new Error("La source et la cible GPU doivent être distinctes.");
    assertTextureSize(width, height, gpuTextureLimit(this.renderer));
    output.setSize(width, height);
    const blocks = enabled.map((effect) => ({ effect, stages: effectStages(effect) }));
    const total = blocks.reduce((sum, block) => sum + block.stages.length, 0);
    const scratch = total > 1 ? this.getScratch(width, height) : null;
    const previous = this.renderer.getRenderTarget();
    let input = source,
      index = 0;
    try {
      for (const block of blocks) {
        let original = input;
        if (block.stages.length > 1 && input !== source) {
          const backdrop = this.getBackdrop(width, height);
          const copy: EffectStage = {
            key: "copy",
            builder: ({ source, controls }) => sampleEffect(source, controls, uv()),
            final: false,
          };
          this.draw(
            this.getPass(block.effect, copy, input, input, width, height, logical),
            backdrop,
          );
          original = backdrop.texture;
        }
        for (const stage of block.stages) {
          const target = (total - index++) % 2 === 1 ? output : scratch!;
          this.draw(
            this.getPass(block.effect, stage, input, original, width, height, logical),
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
      targets: Number(Boolean(this.scratch)) + Number(Boolean(this.backdrop)),
      bytes:
        (this.scratch ? this.scratch.width * this.scratch.height * 4 : 0) +
        this.atlases.bytes() +
        (this.backdrop ? this.backdrop.width * this.backdrop.height * 4 : 0),
      materials: this.passes.size,
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.backdrop?.dispose();
    this.backdrop = null;
    this.scratch?.dispose();
    this.scratch = null;
    this.atlases.dispose();
    for (const pass of this.passes.values()) pass.material.dispose();
    this.passes.clear();
    if (this.mesh) this.scene.remove(this.mesh);
    this.mesh = null;
    this.geometry.dispose();
  }
}
