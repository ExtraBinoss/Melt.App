import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createLayer, createPage, createSpatialLayer, createSpatialScene } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

test("native source material synchronization is linear and sibling passes only bind their own meshes", async ({
  page,
}) => {
  test.setTimeout(120000);
  await installReadbackProbe(page);
  await page.route("**/bindings-witness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Native source bindings</title>",
    }),
  );
  await page.goto("/bindings-witness");
  const settings = createSpatialScene();
  settings.reflections = { mode: "environment", quality: "draft" };
  settings.camera.yaw = 0;
  settings.camera.pitch = 0;
  const pages = [4, 12].map((count) =>
    createPage({
      id: `bindings-${count}`,
      width: 192,
      height: 192,
      spatial: settings,
      layers: Array.from({ length: count }, (_, index) =>
        createLayer("rectangle", {
          id: `source-${index}`,
          width: 32,
          height: 32,
          x: (index % 4) * 45,
          y: Math.floor(index / 4) * 50,
          fill: "#EE5533",
          spatial: createSpatialLayer("box"),
        }),
      ),
    }),
  );
  const result = await page.evaluate(
    async (input) => {
      const witness = (await import(
        input.witnessUrl
      )) as typeof import("./support/spatial-dependency-witness");
      return witness.runSourceBindingsWitness(input.pages);
    },
    {
      pages,
      witnessUrl: `/@fs${resolve("test/browser/support/spatial-dependency-witness.ts")}`,
    },
  );
  await mkdir("artifacts/scene-bindings", { recursive: true });
  await writeFile(
    "artifacts/scene-bindings/operation-counts.json",
    JSON.stringify(result, (key, value: unknown) => (key === "image" ? undefined : value), 2),
  );
  for (const { count, first, paint, restored } of result.results) {
    for (const sample of [first, paint, restored]) {
      expect(sample.synchronizations).toEqual([{ count: count * 3, meshes: count }]);
      expect(sample.passes).toHaveLength(count);
      expect(sample.passes.every((pass) => pass.sync === 0)).toBe(true);
    }
    expect(first.passes.map((pass) => pass.assignments)).toEqual([
      count + 1,
      ...Array<number>(count - 1).fill(1),
    ]);
    expect(paint.passes.every((pass) => pass.assignments === 1)).toBe(true);
    expect(restored.passes.every((pass) => pass.assignments === 1)).toBe(true);
    expect(first.image).not.toBe(paint.image);
    expect(restored.image).toBe(first.image);
  }
  expect(result.readbacks).toMatchObject({ gpu: 0, canvas: 0, webgl: 0 });
});
