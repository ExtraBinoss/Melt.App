import { expect, test } from "@playwright/test";
import { createEffect, type Effect } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { photographicEffect } from "./support/photographic-effect";
import { densityEnvironment } from "./support/effect-density";

for (const forceWebGL of [false, true])
  test(`Blur protection retains preceding effects and matches preview density (${forceWebGL ? "webgl" : "webgpu"})`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const d = await photographicEffect(page, "blur", forceWebGL);
    try {
      const id = await d.load({ amount: 0, scale: 8 });
      const exposure = createEffect("exposure", { amount: 0.7 });
      const update = async (blur: Effect) => {
        await page.evaluate(
          (effects) =>
            window.musart!.transaction([
              { type: "updateLayers", ids: ["blur-image"], patch: { effects } },
            ]),
          [exposure, blur],
        );
        await d.ready(id);
      };
      await update(createEffect("blur", { amount: 0, scale: 8 }));
      const original = await d.png();
      for (const technique of [
        "gaussian",
        "box",
        "directional",
        "spin",
        "zoom",
        "lens",
        "bilateral",
      ]) {
        await update(
          createEffect("blur", {
            scale: 8,
            settings: { technique, protect: true, protectedRadius: 8192 },
          }),
        );
        expect((await d.compare(original, await d.png())).differentBytes, technique).toBe(0);
      }
      const densityId = await d.load({
        scale: 8,
        settings: {
          technique: "lens",
          apertureBlades: 5,
          apertureRotation: 17,
          protect: true,
          centerX: 0.3,
          centerY: 0.7,
          protectedRadius: 24,
          feather: 16,
        },
      });
      const zooms = await d.matchedZooms(densityId);
      const environment = await densityEnvironment(page);
      expect(environment.reads.gpu + environment.reads.webgl + environment.reads.canvas).toBe(0);
      expect(d.errors).toEqual([]);
      await mkdir("artifacts/blur-library", { recursive: true });
      await writeFile(
        `artifacts/blur-library/${d.backend}-transport.json`,
        JSON.stringify({ zooms, environment }, null, 2),
      );
    } finally {
      await d.close();
    }
  });
