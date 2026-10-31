import { expect, it, vi } from "vitest";
import { createEffect } from "@musart/core";
import { RenderTarget, Texture, type Mesh } from "three/webgpu";
import { GpuEffects } from "../../src/effects/GpuEffects";
import { makeGpuRenderer } from "../gpu-fixture";

it("alternates exact-size multi-stage surfaces without disposing outputs or sampling a draw target", async () => {
  const { fake, renderer } = makeGpuRenderer(),
    gpu = new GpuEffects(renderer);
  const source = new Texture(),
    wide = new RenderTarget(40, 12),
    tall = new RenderTarget(12, 40);
  const effects = [createEffect("brightness"), createEffect("blur"), createEffect("shadow")];
  const draws: RenderTarget[] = [];
  fake.render.mockImplementation((scene) => {
    const target = fake.getRenderTarget()!;
    const passes = (
      gpu as unknown as {
        passes: Map<
          string,
          {
            material: unknown;
            source: { value: Texture };
            backdrop: { value: Texture };
            controls: { logicalResolution: { value: { x: number; y: number } } };
          }
        >;
      }
    ).passes;
    const current = [...passes.values()].find(
      (pass) => pass.material === (scene.children[0] as Mesh).material,
    )!;
    expect(current.source.value).not.toBe(target.texture);
    expect(current.backdrop.value).not.toBe(target.texture);
    expect(current.controls.logicalResolution.value).toMatchObject({ x: 80, y: 24 });
    draws.push(target);
  });
  const dispose = vi.spyOn(RenderTarget.prototype, "dispose");
  try {
    // Preparation uses the same charged pool, with distinct compiled sampler bindings.
    await gpu.prepare(effects, wide, 40, 12);
    await gpu.prepare([createEffect("gradient", { enabled: false })], wide, 40, 12);
    expect(gpu.stats().targets).toBe(1);
    expect(gpu.projectedBytes(40, 12, effects)).toBe(40 * 12 * 8);
    for (const output of [wide, tall]) {
      gpu.apply(source, output.width, output.height, effects, output, { width: 80, height: 24 });
    }
    const owned = [...new Set(draws)].filter((target) => target !== wide && target !== tall);
    expect(owned).toHaveLength(4);
    expect(gpu.stats()).toMatchObject({ targets: 4, bytes: 40 * 12 * 16 });
    const baselineDraws = draws.length;
    for (let index = 0; index < 20; index++) {
      const output = index % 2 ? tall : wide;
      expect(gpu.projectedBytes(output.width, output.height, effects)).toBe(gpu.stats().bytes);
      expect(
        gpu.apply(source, output.width, output.height, effects, output, { width: 80, height: 24 }),
      ).toBe(output.texture);
    }
    expect(draws.length).toBeGreaterThan(baselineDraws);
    expect([...new Set(draws)].filter((target) => target !== wide && target !== tall)).toEqual(
      owned,
    );
    expect(dispose).not.toHaveBeenCalled();
    gpu.dispose();
    expect(dispose).toHaveBeenCalledTimes(4);
    expect(dispose.mock.instances).not.toContain(wide);
    expect(dispose.mock.instances).not.toContain(tall);
  } finally {
    gpu.dispose();
    source.dispose();
    wide.dispose();
    tall.dispose();
    dispose.mockRestore();
  }
});

it("charges tiny warmup attachments rather than image-sized logical uniforms, including disabled shaders", async () => {
  const { fake, renderer } = makeGpuRenderer();
  const gpu = new GpuEffects(renderer),
    target = new RenderTarget(1, 1);
  const enabled = [createEffect("blur")],
    disabled = enabled.map((effect) => ({ ...effect, enabled: false }));
  try {
    const projection = gpu.projectedBytes(1, 1, enabled);
    expect(projection).toBe(4);
    await gpu.prepare(disabled, target, 1920, 1080);
    expect(gpu.stats()).toMatchObject({ targets: 1, bytes: projection, passes: 0, materials: 2 });
    expect(fake.compileAsync).toHaveBeenCalledTimes(2);
    await gpu.prepare(disabled, target, 3840, 2160);
    expect(fake.compileAsync).toHaveBeenCalledTimes(2);
    expect(gpu.stats().bytes).toBe(4);
  } finally {
    gpu.dispose();
    target.dispose();
  }
});

it("does not resurrect prepared surfaces or materials when disposal interrupts shader compilation", async () => {
  const { fake, renderer } = makeGpuRenderer();
  const gpu = new GpuEffects(renderer),
    target = new RenderTarget(1, 1);
  let complete!: () => void;
  fake.compileAsync.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  const pending = gpu.prepare([createEffect("blur")], target, 1920, 1080);
  gpu.dispose();
  complete();
  await expect(pending).rejects.toThrow("fermé");
  expect(gpu.stats()).toMatchObject({ targets: 0, bytes: 0, materials: 0 });
  expect(fake.compileAsync).toHaveBeenCalledOnce();
  target.dispose();
});

it("reuses one schema-independent backdrop copy pass across different multi-stage effect types", () => {
  const { renderer } = makeGpuRenderer();
  const gpu = new GpuEffects(renderer),
    source = new Texture(),
    output = new RenderTarget(8, 6);
  const gradient = createEffect("gradient", { settings: { treatment: "glass" } });
  const blur = createEffect("blur"),
    shadow = createEffect("shadow");
  try {
    gpu.apply(source, 8, 6, [createEffect("brightness"), gradient, blur, shadow], output);
    // One brightness + three gradient + two blur + two shadow + one generic copy.
    expect(gpu.stats()).toMatchObject({ materials: 9, targets: 2 });
    const passes = (gpu as unknown as { passes: Map<string, unknown> }).passes;
    const copy = passes.get("copy");
    expect(copy).toBeDefined();
    for (const stack of [
      [blur, gradient, shadow],
      [shadow, blur, gradient],
    ]) {
      gpu.apply(source, 8, 6, stack, output);
      expect(passes.get("copy")).toBe(copy);
      expect(gpu.stats()).toMatchObject({ materials: 9, targets: 2 });
    }
  } finally {
    gpu.dispose();
    source.dispose();
    output.dispose();
  }
});
