import { expect, it } from "vitest";
import { createEffect } from "@musart/core";
import { RenderTarget, Texture } from "three/webgpu";
import { GpuEffects } from "../../../src/effects/GpuEffects";
import { makeGpuRenderer } from "../../gpu-fixture";

it("bounds all seven technique materials and reuses their targets across fifty images and live changes", async () => {
  const { fake, renderer } = makeGpuRenderer(),
    gpu = new GpuEffects(renderer);
  const source = new Texture(),
    output = new RenderTarget(64, 48);
  const techniques = [
    "gaussian",
    "box",
    "directional",
    "spin",
    "zoom",
    "lens",
    "bilateral",
  ] as const;
  try {
    for (const technique of techniques) {
      const effect = createEffect("blur", { settings: { technique } });
      await gpu.prepare([effect], output, 64, 48);
      gpu.apply(source, 64, 48, [effect], output);
    }
    const warm = gpu.stats();
    expect(warm).toMatchObject({ materials: 9, targets: 1, bytes: 64 * 48 * 4 });
    const compiles = fake.compileAsync.mock.calls.length;
    for (let index = 0; index < 50; index++) {
      const effect = createEffect("blur", {
        amount: index / 50,
        settings: {
          technique: techniques[index % techniques.length],
          protect: true,
          protectedRadius: index,
          feather: index % 3,
          apertureBlades: 3 + (index % 10),
        },
      });
      await gpu.prepare([effect], output, 64, 48);
      gpu.apply(source, 64, 48, [effect], output);
    }
    expect(fake.compileAsync).toHaveBeenCalledTimes(compiles);
    expect(gpu.stats()).toMatchObject({
      materials: warm.materials,
      targets: warm.targets,
      bytes: warm.bytes,
    });
    gpu.dispose();
    expect(gpu.stats()).toMatchObject({ materials: 0, targets: 0, bytes: 0 });
  } finally {
    gpu.dispose();
    source.dispose();
    output.dispose();
  }
});
