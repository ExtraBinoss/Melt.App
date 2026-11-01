import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createProject, createPage, createLayer, createEffect } from "@musart/core";
const fixture = (id: string) =>
  createProject({
    id,
    pages: [
      createPage({
        width: 240,
        height: 160,
        layers: [
          createLayer("rectangle", {
            id: "item",
            fill: "#8757ff",
            effects: [createEffect("displace", { id: "fx" })],
          }),
        ],
      }),
    ],
  });
async function ready(page: Page, id: string) {
  await page.waitForFunction((id) => {
    const c = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
    return (
      c?.projectId === id && c.rendererReady === "true" && c.sceneRevision === c.renderedRevision
    );
  }, id);
}
async function picker(page: Page) {
  const attachment = page.locator('[data-attachment-effect-id="fx"]');
  if ((await attachment.getAttribute("aria-pressed")) !== "true") await attachment.click();
  await page.getByRole("button", { name: /Displacement map/ }).click();
  await expect(page.locator(".texture-picker")).toBeVisible();
}
test("texture uploads persist across projects, embed originals and undo exactly once", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["item"]);
  }, fixture("texture-first"));
  await ready(page, "texture-first");
  const before = await page.evaluate(() => window.musart!.snapshot().revision);
  await picker(page);
  const buffer = await readFile("apps/web/public/textures/normal.png");
  await page
    .locator('.texture-picker input[type="file"]')
    .setInputFiles({ name: "custom-normal.png", mimeType: "image/png", buffer });
  await expect(page.locator(".texture-picker")).toHaveCount(0);
  await ready(page, "texture-first");
  const selected = await page.evaluate(() => {
    const s = window.musart!.snapshot();
    return {
      revision: s.revision,
      id: s.project.pages[0]!.layers[0]!.effects[0]!.inputs?.map,
      assets: Object.keys(s.project.assets),
    };
  });
  expect(selected.revision).toBe(before + 1);
  expect(selected.id).toMatch(/^texture-/);
  expect(selected.assets).toEqual([selected.id]);
  await page.evaluate(() => window.musart!.undo());
  expect(await page.evaluate(() => Object.keys(window.musart!.snapshot().project.assets))).toEqual(
    [],
  );
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["item"]);
  }, fixture("texture-second"));
  await ready(page, "texture-second");
  await picker(page);
  await page.getByRole("radio", { name: "My textures", exact: true }).click();
  await page.getByRole("button", { name: "custom-normal.png", exact: true }).click();
  await expect(page.locator(".texture-picker")).toHaveCount(0);
  await ready(page, "texture-second");
  expect(
    await page.evaluate(
      () => window.musart!.snapshot().project.pages[0]!.layers[0]!.effects[0]!.inputs?.map,
    ),
  ).toBe(selected.id);
  await picker(page);
  await page.getByRole("radio", { name: "My textures", exact: true }).click();
  await page.getByRole("button", { name: "Delete custom-normal.png", exact: true }).click();
  await expect(page.getByRole("button", { name: "custom-normal.png", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      (id) => Boolean(window.musart!.snapshot().project.assets[id!]),
      selected.id,
    ),
  ).toBe(true);
});
