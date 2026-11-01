import { expect, test } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { libraryFrame } from "./support/library-observer";
import { densityEnvironment } from "./support/effect-density";
import { imageDifference } from "./support/photographic-effect";
import { zoomViewport } from "./support/viewport";

test("fifty photographs share the seven Blur kernels within the GPU cache and reuse stable targets", async ({
  page,
}) => {
  test.setTimeout(120000);
  await mkdir("artifacts/blur-library", { recursive: true });
  await installReadbackProbe(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const photo = await readFile("apps/web/public/benchmark/06-boathouse-1.jpg");
  const techniques = [
    "gaussian",
    "box",
    "directional",
    "spin",
    "zoom",
    "lens",
    "bilateral",
  ] as const;
  const project = createProject({
    assets: {
      photo: {
        id: "photo",
        name: "Boathouse photograph",
        width: 1280,
        height: 960,
        mime: "image/jpeg",
        dataUrl: `data:image/jpeg;base64,${photo.toString("base64")}`,
      },
    },
    pages: [
      createPage({
        width: 512,
        height: 256,
        background: "transparent",
        layers: Array.from({ length: 50 }, (_, index) =>
          createLayer("image", {
            id: `blur-load-${index}`,
            x: 8 + (index % 10) * 50,
            y: 8 + Math.floor(index / 10) * 48,
            width: 32,
            height: 24,
            assetId: "photo",
            effects: [
              createEffect("blur", {
                amount: 0.5,
                scale: 2,
                settings: {
                  technique: techniques[index % techniques.length],
                  protect: index % 2 === 0,
                  protectedRadius: 4,
                  feather: 3,
                  angle: 30,
                  rangeSigma: 0.3,
                },
              }),
            ],
          }),
        ),
      }),
    ],
  });
  await page.evaluate((project) => window.musart!.load(project), project);
  await page.getByTestId("artboard").hover();
  await zoomViewport(page, 1);
  await page.waitForFunction(() => {
    const board = document.querySelector<HTMLElement>('[data-testid="artboard"]');
    const data = board?.querySelector<HTMLCanvasElement>("canvas")?.dataset;
    return (
      board?.dataset.viewMoving === "false" &&
      Number(data?.renderWidth) === 512 &&
      Number(data?.renderHeight) === 256 &&
      data?.sceneRevision === data?.renderedRevision
    );
  });
  const initial = await libraryFrame(page, project.id);
  expect(initial.cacheBytes).toBeLessThanOrEqual(initial.maxBytes);
  expect(initial.uploads).toBeGreaterThan(0);
  const png = () => page.evaluate(() => window.musart!.render({ format: "png" }));
  const first = await png();
  const setAmount = (amount: number) =>
    page.evaluate((amount) => {
      const layers = window.musart!.snapshot().project.pages[0]!.layers;
      window.musart!.transaction(
        layers.map((layer) => ({
          type: "updateLayers" as const,
          ids: [layer.id],
          patch: { effects: layer.effects.map((effect) => ({ ...effect, amount })) },
        })),
      );
    }, amount);
  // The second canonical frame lazily creates the shared composition back buffer.
  // Account for it explicitly before asserting effect-target reuse on later frames.
  await setAmount(0.75);
  const firstEdit = await libraryFrame(page, project.id, initial.renders);
  expect(firstEdit.targets).toBeLessThanOrEqual(initial.targets + 1);
  expect(firstEdit.cacheBytes).toBeLessThanOrEqual(initial.cacheBytes + 512 * 256 * 4);
  await page.evaluate(() => window.musart!.undo());
  const warm = await libraryFrame(page, project.id, firstEdit.renders);
  await setAmount(1);
  const changed = await libraryFrame(page, project.id, warm.renders);
  const second = await png();
  const inspection = await page.context().newPage();
  try {
    await writeFile(
      "artifacts/blur-library/fifty-photos-allocation.json",
      JSON.stringify({ initial, firstEdit, warm, changed }, null, 2),
    );
    expect((await imageDifference(inspection, first, second)).differentBytes).toBeGreaterThan(1000);
    expect(changed.targets).toBe(warm.targets);
    expect(changed.uploads).toBe(warm.uploads);
    expect(changed.cacheBytes).toBeLessThanOrEqual(changed.maxBytes);
    await page.evaluate(() => window.musart!.undo());
    const restored = await libraryFrame(page, project.id, changed.renders);
    expect((await imageDifference(inspection, first, await png())).differentBytes).toBe(0);
    expect(restored.targets).toBe(warm.targets);
    expect(restored.uploads).toBe(warm.uploads);
    const environment = await densityEnvironment(page);
    expect(environment.reads.gpu + environment.reads.webgl + environment.reads.canvas).toBe(0);
    expect(errors).toEqual([]);
    await writeFile(
      "artifacts/blur-library/fifty-photos.png",
      Buffer.from(second.split(",")[1]!, "base64"),
    );
    await writeFile(
      "artifacts/blur-library/fifty-photos.json",
      JSON.stringify({ initial, firstEdit, warm, changed, restored, environment, errors }, null, 2),
    );
  } finally {
    await inspection.close();
  }
});
