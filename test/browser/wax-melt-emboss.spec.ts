import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { imageDifference } from "./support/photographic-effect";
import type * as Witness from "./support/wax-melt-emboss";

async function coverage(page: Page, a: string, b: string) {
  return page.evaluate(
    async ({ a, b }) => {
      async function pixels(url: string) {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, image.width, image.height);
      }
      const left = await pixels(a),
        right = await pixels(b);
      let alphaError = 0,
        outside = 0,
        below = 0,
        rightward = 0,
        maskedRight = 0;
      for (let i = 0; i < right.data.length; i += 4) {
        const alpha = right.data[i + 3]!,
          x = (i / 4) % right.width,
          y = Math.floor(i / 4 / right.width);
        alphaError = Math.max(alphaError, Math.abs(left.data[i + 3]! - alpha));
        if (left.data[i + 3]! === 0) outside += alpha;
        if (y >= 69) below += alpha;
        if (x >= 89) rightward += alpha;
        if (x >= 65) maskedRight += alpha;
      }
      return { alphaError, outside, below, rightward, maskedRight };
    },
    { a, b },
  );
}

for (const forceWebGL of [false, true]) {
  test(`Wax, Melt and Emboss SDK exports via ${forceWebGL ? "WebGL" : "WebGPU"}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installReadbackProbe(page);
    await page.route("**/__material-treatments", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Native material treatments</title>",
      }),
    );
    await page.goto("/__material-treatments");
    const photo = {
      id: "photo",
      name: "Photographic calibration",
      mime: "image/jpeg",
      width: 512,
      height: 512,
      dataUrl: `data:image/jpeg;base64,${(await readFile("apps/web/public/benchmark/50-waterfall-5.jpg")).toString("base64")}`,
    };
    const result = await page.evaluate(
      async ({ forceWebGL, photo, path }) =>
        ((await import(/* @vite-ignore */ path)) as typeof Witness).materialTreatmentWitness(
          forceWebGL,
          photo,
        ),
      { forceWebGL, photo, path: `/@fs${resolve("test/browser/support/wax-melt-emboss.ts")}` },
    );
    const inspector = await page.context().newPage();
    const directory = `artifacts/material-treatments/${forceWebGL ? "webgl" : "webgpu"}`;
    await mkdir(directory, { recursive: true });
    const metrics = [];
    try {
      const compare = (a: string, b: string) => imageDifference(inspector, a, b);
      for (const variant of result.variants) {
        expect(
          (await compare(result.baseline, variant.zero)).maxByte,
          `${variant.type} zero`,
        ).toBeLessThanOrEqual(2);
        const changed = await compare(result.baseline, variant.image);
        expect(changed.differentBytes, `${variant.type} visible`).toBeGreaterThan(50);
        for (const key of ["partial", "alternate", "localized"] as const)
          expect(
            (await compare(variant.image, variant[key])).differentBytes,
            `${variant.type} ${key}`,
          ).toBeGreaterThan(10);
        for (const scope of ["group", "composition"] as const) {
          expect(
            (await compare(result.baseline, variant[scope])).differentBytes,
            `${variant.type} ${scope}`,
          ).toBeGreaterThan(50);
          expect(
            (
              await compare(
                result.baseline,
                scope === "group" ? variant.groupZero : variant.compositionZero,
              )
            ).maxByte,
            `${variant.type} ${scope} zero`,
          ).toBeLessThanOrEqual(2);
        }
        expect(
          (await coverage(inspector, result.baseline, variant.masked)).maskedRight,
          `${variant.type} masked`,
        ).toBe(0);
        if (variant.type !== "melt")
          expect(
            (await coverage(inspector, result.baseline, variant.image)).alphaError,
            `${variant.type} alpha`,
          ).toBeLessThanOrEqual(1);
        await writeFile(
          `${directory}/${variant.type}.png`,
          Buffer.from(variant.image.split(",")[1]!, "base64"),
        );
        metrics.push({ type: variant.type, changed });
      }
      for (const [index, mode] of result.embossModes.entries()) {
        expect(
          (await coverage(inspector, result.stamp, mode.image)).alphaError,
          `${mode.mode} alpha`,
        ).toBeLessThanOrEqual(1);
        expect(
          (await compare(result.stamp, mode.image)).differentBytes,
          `${mode.mode} relief`,
        ).toBeGreaterThan(50);
        for (const previous of result.embossModes.slice(0, index))
          expect(
            (await compare(previous.image, mode.image)).differentBytes,
            `${previous.mode}/${mode.mode}`,
          ).toBeGreaterThan(20);
        await writeFile(
          `${directory}/emboss-${mode.mode}.png`,
          Buffer.from(mode.image.split(",")[1]!, "base64"),
        );
      }
      expect(
        (await coverage(inspector, result.stamp, result.waxStamp)).alphaError,
      ).toBeLessThanOrEqual(1);
      const down = await coverage(inspector, result.stamp, result.meltStamp);
      const horizontal = await coverage(inspector, result.stamp, result.meltHorizontal);
      expect(down.below, "Melt drips below source silhouette").toBeGreaterThan(100);
      expect(horizontal.rightward, "Melt drips rightward").toBeGreaterThan(100);
      expect(
        (await compare(result.meltStamp, result.meltPhase)).differentBytes,
        "Melt authored phase",
      ).toBeGreaterThan(20);
      expect(
        (await compare(result.meltStamp, result.meltRepeat)).maxByte,
        "Melt random-access replay",
      ).toBe(0);
      expect(
        (await compare(result.order[0]!, result.order[1]!)).differentBytes,
        "stack order",
      ).toBeGreaterThan(20);
      for (const key of ["stamp", "waxStamp", "meltStamp", "meltHorizontal"] as const)
        await writeFile(
          `${directory}/${key}.png`,
          Buffer.from(result[key].split(",")[1]!, "base64"),
        );
      const reads = await page.evaluate(() => window.__musartVideoReadbacks);
      expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
      expect(result.stats.cacheBytes).toBeLessThanOrEqual(result.stats.maxBytes);
      expect(errors).toEqual([]);
      await writeFile(
        `${directory}/report.json`,
        JSON.stringify(
          {
            metrics,
            down,
            horizontal,
            reads,
            stats: result.stats,
            browser: page.context().browser()?.version(),
          },
          null,
          2,
        ),
      );
      if (!forceWebGL) {
        const stats = await page.evaluate(
          async ({ photo, path }) =>
            ((await import(/* @vite-ignore */ path)) as typeof Witness).materialTreatmentLoad(
              photo,
            ),
          { photo, path: `/@fs${resolve("test/browser/support/wax-melt-emboss.ts")}` },
        );
        expect(stats.cacheBytes).toBeLessThanOrEqual(stats.maxBytes);
        expect(stats.uploads).toBe(1);
        expect(stats.readbacks).toBe(0);
        expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
          gpu: 0,
          webgl: 0,
          canvas: 0,
        });
        await writeFile(
          "artifacts/material-treatments/50-images.json",
          JSON.stringify(stats, null, 2),
        );
      }
    } finally {
      await inspector.close();
    }
  });
}
