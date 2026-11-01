import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { inspectImage, contactSheetRegions } from "./support/image-probe";
import { libraryStressProject } from "./support/library-stress";
import { libraryFrame } from "./support/library-observer";

test("50-image source dependencies invalidate effect pixels and restore them on undo without readbacks", async ({
  page,
}) => {
  test.setTimeout(90000);
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  const fixture = await libraryStressProject();
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => window.musart!.load(project), fixture.project);
  const initial = await libraryFrame(page, fixture.project.id);
  await expect(page.locator(".editor-gpu-scene > .canvas-loading")).toBeHidden();
  const board = page.getByTestId("artboard");
  const first = await board.screenshot();
  const witness = await inspectImage(page, first, contactSheetRegions);
  expect(witness.colors).toBeGreaterThan(30);
  for (const region of witness.regions) {
    expect(region.opaque).toBeGreaterThan(0.98);
    expect(region.backgroundDistance).toBeGreaterThan(10);
  }
  const image = fixture.project.pages[0]!.layers.find((layer) => layer.id === "stress-image-0")!;
  await page.evaluate(
    (effects) =>
      window.musart!.execute({ type: "updateLayers", ids: ["stress-image-0"], patch: { effects } }),
    image.effects.map((effect) =>
      effect.type === "contrast" ? { ...effect, amount: 0.98 } : effect,
    ),
  );
  const changed = await libraryFrame(page, fixture.project.id, initial.renders);
  const second = await board.screenshot();
  const changedWitness = await inspectImage(page, second, contactSheetRegions);
  expect(changedWitness.regions[0]!.hash).not.toBe(witness.regions[0]!.hash);
  await page.evaluate(() => window.musart!.undo());
  const restored = await libraryFrame(page, fixture.project.id, changed.renders);
  const third = await board.screenshot();
  expect(third.equals(first)).toBe(true);
  const reads = await page.evaluate(() => window.__musartVideoReadbacks);
  expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  expect(restored.cacheBytes).toBeLessThanOrEqual(restored.maxBytes);
  expect(initial.sourceDependencies).toBeDefined();
  expect(restored.sourceDependencies).toBeDefined();
  expect(restored.sourceDependencies!.hits).toBeGreaterThan(initial.sourceDependencies!.hits);
  await mkdir("artifacts/source-dependencies", { recursive: true });
  for (const [name, bytes] of [
    ["initial", first],
    ["changed", second],
    ["undo", third],
  ] as const)
    await writeFile(`artifacts/source-dependencies/${name}.png`, bytes);
  await writeFile(
    "artifacts/source-dependencies/report.json",
    JSON.stringify({ initial, changed, restored, reads, witness, changedWitness }, null, 2),
  );
});
