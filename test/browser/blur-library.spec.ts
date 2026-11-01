import { expect, test, type Page } from "@playwright/test";
import type { Asset } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { photographicEffect } from "./support/photographic-effect";
import { densityEnvironment } from "./support/effect-density";

const techniques = ["gaussian", "box", "directional", "spin", "zoom", "lens", "bilateral"] as const;
const settings = {
  centerX: 0.42,
  centerY: 0.36,
  angle: 35,
  spinAngle: 45,
  zoomStrength: 0.8,
  apertureBlades: 5,
  apertureRotation: 17,
  rangeSigma: 0.25,
};
const save = (backend: string, name: string, url: string) =>
  writeFile(
    `artifacts/blur-library/${backend}-${name}.png`,
    Buffer.from(url.split(",")[1]!, "base64"),
  );

async function protectionMetrics(
  inspection: Page,
  original: string,
  plain: string,
  protectedImage: string,
  feather = 16,
) {
  return inspection.evaluate(
    async ({ original, plain, protectedImage, feather }) => {
      const decode = async (src: string) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, image.width, image.height).data;
      };
      const a = await decode(original),
        b = await decode(plain),
        c = await decode(protectedImage);
      let innerMax = 0,
        outerMax = 0,
        featherDifferences = 0,
        partialAlpha = 0;
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 256; x++) {
          const index = (y * 256 + x) * 4;
          const distance = Math.hypot(x + 0.5 - (32 + 192 * 0.42), y + 0.5 - (32 + 192 * 0.36));
          if (c[index + 3]! > 0 && c[index + 3]! < 255) partialAlpha++;
          for (let channel = 0; channel < 4; channel++) {
            if (distance < 30)
              innerMax = Math.max(innerMax, Math.abs(a[index + channel]! - c[index + channel]!));
            if (distance > 33 + feather)
              outerMax = Math.max(outerMax, Math.abs(b[index + channel]! - c[index + channel]!));
            if (
              distance > 34 &&
              distance < 30 + feather &&
              c[index + channel] !== a[index + channel] &&
              c[index + channel] !== b[index + channel]
            )
              featherDifferences++;
          }
        }
      return { innerMax, outerMax, featherDifferences, partialAlpha };
    },
    { original, plain, protectedImage, feather },
  );
}

for (const forceWebGL of [false, true]) {
  const backend = forceWebGL ? "webgl" : "webgpu";
  test(`Blur techniques use genuine kernels, protected source RGBA and bounded GPU transport (${backend})`, async ({
    page,
  }) => {
    test.setTimeout(240000);
    await mkdir("artifacts/blur-library", { recursive: true });
    const d = await photographicEffect(page, "blur", forceWebGL);
    const results: unknown[] = [];
    try {
      await d.load({ amount: 0, scale: 10, settings });
      const original = await d.png();
      const outputs: string[] = [];
      for (const technique of techniques) {
        await d.load({ scale: 10, settings: { ...settings, technique } });
        const plain = await d.png();
        const difference = await d.compare(original, plain);
        expect(difference.meanRGB, technique).toBeGreaterThan(0.01);
        for (const previous of outputs)
          expect((await d.compare(previous, plain)).differentBytes, technique).toBeGreaterThan(0);
        outputs.push(plain);
        await d.load({
          scale: 10,
          settings: { ...settings, technique, protect: true, protectedRadius: 32, feather: 16 },
        });
        const protectedImage = await d.png();
        const protection = await protectionMetrics(d.inspection, original, plain, protectedImage);
        expect(protection.innerMax, technique).toBe(0);
        expect(protection.outerMax, technique).toBe(0);
        expect(protection.featherDifferences, technique).toBeGreaterThan(0);
        expect(protection.partialAlpha, technique).toBeGreaterThan(100);
        await d.load({ amount: 0, scale: 10, settings: { ...settings, technique } });
        expect((await d.compare(original, await d.png())).differentBytes, `${technique} zero`).toBe(
          0,
        );
        await save(backend, technique, plain);
        await save(backend, `${technique}-protected`, protectedImage);
        results.push({ technique, difference, protection });
      }
      await d.load({
        scale: 10,
        settings: { ...settings, protect: true, protectedRadius: 32, feather: 0 },
      });
      const hard = await protectionMetrics(d.inspection, original, outputs[0]!, await d.png(), 0);
      expect(hard.innerMax).toBe(0);
      expect(hard.outerMax).toBe(0);
      await d.load({
        scale: 10,
        settings: { ...settings, protect: true, protectedRadius: 8192, feather: 2048 },
      });
      expect((await d.compare(original, await d.png())).differentBytes).toBe(0);
      await d.load({ scale: 10 });
      const legacy = await d.png();
      await d.load({ scale: 10, settings: { technique: "gaussian" } });
      expect((await d.compare(legacy, await d.png())).differentBytes).toBe(0);

      const silhouette: Asset = {
        id: "white-alpha",
        name: "White silhouette with transparent surroundings",
        mime: "image/png",
        width: 192,
        height: 192,
        dataUrl: await d.inspection.evaluate(() => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 192;
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "white";
          ctx.fillRect(48, 48, 64, 64);
          return canvas.toDataURL("image/png");
        }),
      };
      for (const technique of techniques) {
        await d.load(
          { scale: 10, settings: { ...settings, technique, rangeSigma: 1 } },
          silhouette,
        );
        const output = await d.png();
        const alpha = await d.inspection.evaluate(async (src) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 256;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(image, 0, 0);
          const pixels = ctx.getImageData(0, 0, 256, 256).data;
          let partial = 0,
            minimumWhite = 255;
          for (let i = 0; i < pixels.length; i += 4)
            if (pixels[i + 3]! > 8 && pixels[i + 3]! < 245) {
              partial++;
              minimumWhite = Math.min(minimumWhite, pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
            }
          return { partial, minimumWhite, farAlpha: pixels[(10 * 256 + 10) * 4 + 3] };
        }, output);
        expect(alpha.partial, technique).toBeGreaterThan(100);
        expect(alpha.minimumWhite, technique).toBeGreaterThanOrEqual(253);
        expect(alpha.farAlpha, technique).toBe(0);
        await save(backend, `${technique}-alpha`, output);
        results.push({ technique, alpha });
      }
      // Technique-specific controls must change real decoded output, not just metadata.
      for (const [technique, first, second] of [
        ["directional", { angle: 0 }, { angle: 90 }],
        ["spin", { spinAngle: 0 }, { spinAngle: 90 }],
        ["zoom", { zoomStrength: 0 }, { zoomStrength: 1 }],
        [
          "lens",
          { apertureBlades: 3, apertureRotation: 0 },
          { apertureBlades: 7, apertureRotation: 37 },
        ],
        ["bilateral", { rangeSigma: 0.01 }, { rangeSigma: 1 }],
      ] as const) {
        await d.load({ scale: 10, settings: { ...settings, technique, ...first } });
        const firstOutput = await d.png();
        await d.load({ scale: 10, settings: { ...settings, technique, ...second } });
        expect(
          (await d.compare(firstOutput, await d.png())).differentBytes,
          technique,
        ).toBeGreaterThan(100);
      }
      const environment = await densityEnvironment(page);
      expect(environment.backend).toBe(backend);
      expect(environment.reads.gpu + environment.reads.webgl + environment.reads.canvas).toBe(0);
      expect(d.errors).toEqual([]);
      await writeFile(
        `artifacts/blur-library/${backend}.json`,
        JSON.stringify({ results, hard, environment, errors: d.errors }, null, 2),
      );
    } finally {
      await d.close();
    }
  });

  test(`Blur reuses radial handles with imperative previews, one-entry undo and cancellation (${backend})`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await mkdir("artifacts/blur-library", { recursive: true });
    const d = await photographicEffect(page, "blur", forceWebGL);
    const snapshot = () =>
      page.evaluate(() => {
        const state = window.musart!.snapshot();
        return { revision: state.revision, effect: state.project.pages[0]!.layers[0]!.effects[0]! };
      });
    const commits = () =>
      page.evaluate(() =>
        [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
          (selector) =>
            Number(document.querySelector(selector)?.getAttribute("data-react-renders") ?? 0),
        ),
      );
    try {
      await d.load({ scale: 10, settings: { protect: true, protectedRadius: 32, feather: 16 } });
      await page.evaluate(() => window.musart!.select(["blur-image"]));
      const initial = await snapshot();
      await page
        .locator(
          `.layer-row[data-layer-id="blur-image"] [data-attachment-effect-id="${initial.effect.id}"]`,
        )
        .click();
      const center = page.locator('.effect-gizmo [data-handle="center"]');
      await expect(center).toBeVisible();
      await page.locator(".layer-attachment-popover").evaluate(async (element) => {
        await Promise.all(
          element
            .getAnimations({ subtree: true })
            .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
            .map((a) => a.finished.catch(() => undefined)),
        );
      });
      const box = (await center.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      const beforeDrag = await snapshot(),
        beforeCommits = await commits();
      await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2 + 12, { steps: 8 });
      expect(await snapshot()).toEqual(beforeDrag);
      expect(await commits()).toEqual(beforeCommits);
      await page.mouse.up();
      const moved = await snapshot();
      expect(moved.revision).toBe(beforeDrag.revision + 1);
      expect(Number(moved.effect.settings!.centerX)).toBeCloseTo(0.5 + 24 / 192, 3);
      expect(Number(moved.effect.settings!.centerY)).toBeCloseTo(0.5 + 12 / 192, 3);
      await page.evaluate(() => window.musart!.undo());
      expect((await snapshot()).effect).toEqual(beforeDrag.effect);
      await page.evaluate(() => window.musart!.redo());
      expect((await snapshot()).effect).toEqual(moved.effect);
      const outer = page.locator('.effect-gizmo [data-handle="radius"]');
      await outer.focus();
      const beforeRadius = await snapshot();
      await page.keyboard.down("ArrowRight");
      await page.keyboard.down("ArrowRight");
      expect(await snapshot()).toEqual(beforeRadius);
      await page.keyboard.up("ArrowRight");
      const widened = await snapshot();
      expect(widened.revision).toBe(beforeRadius.revision + 1);
      expect(widened.effect.settings!.protectedRadius).toBe(32);
      expect(widened.effect.settings!.feather).toBe(18);
      const cancelBox = (await center.boundingBox())!;
      await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y + cancelBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(cancelBox.x + 36, cancelBox.y + 18, { steps: 4 });
      await page.keyboard.press("Escape");
      await page.mouse.up();
      expect(await snapshot()).toEqual(widened);
      await page.screenshot({ path: `artifacts/blur-library/${backend}-handles.png` });
      expect(d.errors).toEqual([]);
      await writeFile(
        `artifacts/blur-library/${backend}-interaction.json`,
        JSON.stringify({ initial, moved, widened, beforeCommits }, null, 2),
      );
    } finally {
      await d.close();
    }
  });
}
