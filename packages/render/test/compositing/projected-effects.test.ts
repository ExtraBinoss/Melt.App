import { expect, test, vi } from "vitest";
import { createEffect, createLayer, createPage, createSpatialLayer } from "@musart/core";
import { Matrix3, RenderTarget, Texture } from "three/webgpu";
import type { Bounds } from "@musart/core";
import type { GpuResourceCache } from "../../src/cache/GpuResourceCache";
import type { EffectResources } from "../../src/compositing/effect-resources";
import type { GpuPasses } from "../../src/compositing/passes";
import type { EffectDimensions } from "../../src/effects/shared/context";
import { finishLayerSource } from "../../src/compositing/finish-layer";
import { projectedEffectBounds } from "../../src/compositing/projected-effects";

test("every effect stack receives authored reference pixels across changing spatial camera projections", () => {
  const targets: RenderTarget[] = [];
  const source = new Texture();
  try {
    for (const type of ["shatter", "grain", "halftone"] as const)
      for (const magnification of [0.8, 1.25, 2]) {
        const layer = createLayer("text", {
          width: 200,
          height: 100,
          spatial: createSpatialLayer("extrude"),
          effects: [createEffect(type)],
        });
        const original: Bounds = {
          x: 32,
          y: -16,
          width: 200 * magnification,
          height: 100 * magnification,
        };
        const projection = new Matrix3().set(
          1 / magnification,
          0,
          -32 / magnification,
          0,
          1 / magnification,
          16 / magnification,
          0,
          0,
          1,
        );
        let dimensions: EffectDimensions | undefined;
        let raster: readonly number[] | undefined;
        const result = finishLayerSource(
          layer,
          createPage({ layers: [layer] }),
          1,
          {
            texture: source,
            width: original.width,
            height: original.height,
            bounds: original,
            premultiplied: true,
          },
          {
            effectProjection: projection.elements,
            target(_role, width, height) {
              const target = new RenderTarget(width, height);
              targets.push(target);
              return target;
            },
            passes: { projectTo: vi.fn(), copyTo: vi.fn() } as unknown as GpuPasses,
            cache: { ensureCapacity: vi.fn(), synchronize: vi.fn() } as unknown as GpuResourceCache,
            effects: {
              projectedBytes: () => 0,
              apply(
                _texture: Texture,
                width: number,
                height: number,
                _effects: unknown,
                output: RenderTarget,
                logical: EffectDimensions,
              ) {
                raster = [width, height];
                dimensions = logical;
                return output.texture;
              },
            } as unknown as EffectResources,
            mask: () => {
              throw Error("Unexpected mask");
            },
            maskSource: () => {
              throw Error("Unexpected mask");
            },
            image: () => {
              throw Error("Unexpected image");
            },
          },
        );
        expect(dimensions!.content).toMatchObject({ width: 200, height: 100 });
        expect(raster).toEqual([dimensions!.width, dimensions!.height]);
        expect(Number.isInteger(dimensions!.content!.x)).toBe(true);
        expect(Number.isInteger(dimensions!.content!.y)).toBe(true);
        expect(result.bounds).toEqual(original);
        expect(result.premultiplied).toBe(true);
      }
  } finally {
    source.dispose();
    for (const target of targets) target.dispose();
  }
});

test("the authored lattice conservatively includes fractional margins and rejects a projection horizon", () => {
  expect(
    projectedEffectBounds({ x: -0.2, y: 1.4, width: 5.1, height: 4.2 }, new Matrix3(), 1),
  ).toEqual({ x: -1, y: 1, width: 6, height: 5 });
  const horizon = new Matrix3().set(1, 0, 0, 0, 1, 0, 0, 0, 0);
  expect(() => projectedEffectBounds({ x: 0, y: 0, width: 100, height: 100 }, horizon, 1)).toThrow(
    /horizon/,
  );
});
