import { expect, test } from "@playwright/test";
import {
  createLayer,
  createPage,
  createProject,
  getWorldBounds,
  type Composition,
} from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

const ids = ["primitive", "masked", "blend", "text"];
function fixture() {
  return createProject({
    pages: [
      createPage({
        id: "affine-page",
        width: 640,
        height: 480,
        background: "transparent",
        layers: [
          createLayer("group", {
            id: "outer",
            x: 0,
            y: 0,
            width: 640,
            height: 480,
            scaleX: 0.9,
            scaleY: 1.1,
            affine: [1, 0.05, 0.1, 1],
          }),
          createLayer("group", {
            id: "inner",
            parentId: "outer",
            x: 180,
            y: 110,
            width: 300,
            height: 240,
            rotation: 17,
            scaleX: 1.4,
            scaleY: 0.8,
            affine: [-1, 0.15, 0.35, 1],
          }),
          createLayer("rectangle", {
            id: "primitive",
            parentId: "inner",
            x: 40,
            y: 45,
            width: 45,
            height: 35,
            radius: 7,
            fill: "#ff3055",
          }),
          createLayer("rectangle", {
            id: "masked",
            parentId: "inner",
            x: 160,
            y: 45,
            width: 50,
            height: 42,
            fill: "#32cfff",
            mask: { layerId: "mask", enabled: true, inverted: false },
          }),
          createLayer("ellipse", {
            id: "mask",
            parentId: "inner",
            x: 160,
            y: 45,
            width: 50,
            height: 42,
            maskSource: true,
            fill: "#ffffff",
          }),
          createLayer("rectangle", {
            id: "blend",
            parentId: "inner",
            x: 50,
            y: 130,
            width: 50,
            height: 40,
            rotation: 12,
            fill: "#ffcc33",
            blendMode: "multiply",
          }),
          createLayer("text", {
            id: "text",
            parentId: "inner",
            x: 145,
            y: 125,
            width: 120,
            height: 45,
            text: "Affine",
            fontSize: 30,
            fill: "#99ff77",
          }),
        ],
      }),
    ],
  });
}

for (const forceWebGL of [false, true])
  for (const operation of ["ungroup", "reparent"] as const)
    test(`preserves native reflected/sheared masked and batched sources on ${operation} (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
      page,
    }) => {
      test.setTimeout(120000);
      await installReadbackProbe(page);
      if (forceWebGL)
        await page.addInitScript(() =>
          Object.defineProperty(navigator, "gpu", { value: undefined }),
        );
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/?automation=1");
      await page.waitForFunction(() => Boolean(window.musart));
      const project = fixture(),
        composition: Composition = project.pages[0]!;
      const bounds = ids.map((id) => ({ id, ...getWorldBounds(composition, id) }));
      await page.evaluate((project) => window.musart!.load(project), project);
      const options = { format: "png" as const, scale: 2, forceWebGL };
      const before = await page.evaluate((options) => window.musart!.render(options), options);
      await page.evaluate(
        ({ operation, ids }) => {
          if (operation === "ungroup")
            window.musart!.execute({ type: "ungroupLayers", ids: ["inner"] });
          else
            window.musart!.transaction(
              [...ids, "mask"].map((id) => ({
                type: "reorderLayer" as const,
                id,
                index: 0,
                parentId: null,
              })),
            );
        },
        { operation, ids },
      );
      const after = await page.evaluate((options) => window.musart!.render(options), options);
      const inspector = await page.context().newPage();
      try {
        const results = await inspector.evaluate(
          async ({ before, after, bounds }) => {
            const decode = async (url: string) => {
              const image = new Image();
              image.src = url;
              await image.decode();
              const canvas = document.createElement("canvas");
              canvas.width = image.width;
              canvas.height = image.height;
              const ctx = canvas.getContext("2d")!;
              ctx.drawImage(image, 0, 0);
              return ctx.getImageData(0, 0, canvas.width, canvas.height);
            };
            const a = await decode(before),
              b = await decode(after);
            if (a.width !== b.width || a.height !== b.height)
              throw new Error("Export dimensions changed");
            return bounds.map((region) => {
              let covered = 0,
                bad = 0,
                error = 0;
              for (
                let y = Math.max(0, Math.floor(region.y * 2) - 3);
                y < Math.min(a.height, Math.ceil((region.y + region.height) * 2) + 3);
                y++
              )
                for (
                  let x = Math.max(0, Math.floor(region.x * 2) - 3);
                  x < Math.min(a.width, Math.ceil((region.x + region.width) * 2) + 3);
                  x++
                ) {
                  const i = (y * a.width + x) * 4,
                    aa = a.data[i + 3]!,
                    ba = b.data[i + 3]!;
                  if (!aa && !ba) continue;
                  covered++;
                  let maximum = Math.abs(aa - ba);
                  for (let c = 0; c < 3; c++) {
                    const difference = Math.abs(
                      (a.data[i + c]! * aa) / 255 - (b.data[i + c]! * ba) / 255,
                    );
                    error += difference;
                    maximum = Math.max(maximum, difference);
                  }
                  bad += Number(maximum > 32);
                }
              return {
                id: region.id,
                covered,
                badFraction: bad / covered,
                mean: error / (covered * 3),
              };
            });
          },
          { before, after, bounds },
        );
        for (const result of results) {
          expect(result.covered, result.id).toBeGreaterThan(100);
          // The removed intermediate raster changes edge reconstruction, never source placement.
          expect(result.badFraction, result.id).toBeLessThan(0.08);
          expect(result.mean, result.id).toBeLessThan(6);
        }
        await page.evaluate(() => window.musart!.undo());
        const undone = await page.evaluate((options) => window.musart!.render(options), options);
        expect(undone).toBe(before);
        const reads = await page.evaluate(() => window.__musartVideoReadbacks);
        expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
        expect(errors).toEqual([]);
        const directory = "artifacts/affine-hierarchy",
          key = `${forceWebGL ? "webgl" : "webgpu"}-${operation}`;
        await mkdir(directory, { recursive: true });
        for (const [name, data] of [
          ["before", before],
          ["after", after],
        ] as const)
          await writeFile(
            `${directory}/${key}-${name}.png`,
            Buffer.from(data.split(",")[1]!, "base64"),
          );
        await writeFile(
          `${directory}/${key}.json`,
          JSON.stringify({ results, reads, errors }, null, 2),
        );
      } finally {
        await inspector.close();
      }
    });
