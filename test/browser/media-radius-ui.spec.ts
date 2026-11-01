import { expect, test } from "@playwright/test";
import { createProject, createPage, createLayer } from "@musart/core";
const roots = [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"];
test("media radius uses imperative previews, cancels cleanly and commits one undoable edit", async ({
  page,
}) => {
  page.setDefaultTimeout(12000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  const photo = {
    id: "photo",
    name: "Photo",
    mime: "image/svg+xml",
    width: 64,
    height: 64,
    dataUrl:
      "data:image/svg+xml;base64," +
      btoa(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#8757ff"/></svg>',
      ),
  };
  const project = createProject({
    assets: { photo },
    pages: [
      createPage({
        width: 128,
        height: 128,
        layers: [
          createLayer("image", {
            id: "item",
            assetId: "photo",
            x: 32,
            y: 32,
            width: 64,
            height: 64,
          }),
        ],
      }),
    ],
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["item"]);
  }, project);
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
    return (
      canvas?.dataset.rendererReady === "true" &&
      canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
    );
  });
  const radius = page.getByRole("textbox", { name: "Corner radius", exact: true });
  await radius.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.musart!.snapshot().revision);
  const counters = () =>
    page.evaluate(
      (roots) =>
        roots.map((selector) =>
          Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders),
        ),
      roots,
    );
  const initial = await counters();
  expect(initial.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
  await radius.fill("24");
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(before);
  expect(await counters()).toEqual(initial);
  await radius.press("Escape");
  await expect(radius).toHaveValue("0");
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(before);
  await radius.fill("24");
  await radius.press("Tab");
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.radius),
  ).toBe(24);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(before + 1);
  await page.screenshot({ path: "artifacts/media-rounding/inspector-radius.png" });
  await page.evaluate(() => window.musart!.undo());
  await expect(radius).toHaveValue("0");
  await page.evaluate(() => window.musart!.redo());
  await expect(radius).toHaveValue("24");
});
