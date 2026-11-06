import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
const roots = [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"];
test("named palettes open beside the color picker, preserve locks and preview global changes without document commits", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => !!window.musart);
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["palette-owner"]);
    },
    createProject({
      pages: [
        createPage({
          id: "palette-page",
          width: 400,
          height: 300,
          layers: [
            createLayer("rectangle", {
              id: "palette-owner",
              name: "Palette owner",
              x: 50,
              y: 50,
              width: 200,
              height: 150,
              fill: "#e26d3f",
            }),
          ],
        }),
      ],
    }),
  );
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
        .rendererReady === "true",
  );
  const shortcut = page.locator(".inspector .color-control .palette-shortcut").first();
  await expect(shortcut).toBeVisible();
  const body = await page.evaluate(() => ({
    overflow: document.body.style.overflow,
    pointer: document.body.style.pointerEvents,
    style: document.body.getAttribute("style"),
  }));
  await shortcut.click();
  const popover = page.locator("[data-palette-popover]");
  await expect(popover).toBeVisible();
  await expect(page.locator("[data-effect-color-popover]")).toHaveCount(0);
  expect(
    await page.evaluate(() => ({
      overflow: document.body.style.overflow,
      pointer: document.body.style.pointerEvents,
      style: document.body.getAttribute("style"),
    })),
  ).toEqual(body);
  await popover.getByRole("button", { name: "New palette", exact: true }).click();
  await popover.getByRole("textbox", { name: "Palette name", exact: true }).fill("Company");
  await popover.getByRole("button", { name: "Add current color", exact: true }).click();
  const editor = popover.locator(".palette-editor");
  await editor.getByRole("textbox", { name: "Color value", exact: true }).nth(1).fill("#264653");
  await editor.getByRole("button", { name: "Lock 2", exact: true }).click();
  await editor.getByRole("button", { name: "Update palette", exact: true }).click();
  await expect(popover).toHaveAttribute("data-state", "open");
  await expect(popover.locator(".palette-browser")).toHaveAttribute("aria-busy", "false");
  await editor.getByRole("checkbox", { name: "Link as document color", exact: true }).check();
  await editor.getByRole("button", { name: "1 #e26d3f", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.colors?.length))
    .toBe(1);
  const before = await page.evaluate(() => window.musart!.snapshot());
  const counters = () =>
    page.evaluate(
      (selectors) =>
        selectors.map(
          (selector) => document.querySelector<HTMLElement>(selector)?.dataset.reactRenders,
        ),
      roots,
    );
  const counts = await counters();
  const canvas = page.locator(".editor-gpu-scene canvas");
  const canonical = await canvas.screenshot();
  await editor.getByRole("button", { name: "Generate harmonious variation", exact: true }).click();
  await expect(
    editor.getByRole("textbox", { name: "Color value", exact: true }).nth(1),
  ).toHaveValue("#264653");
  const generated = await editor
    .getByRole("textbox", { name: "Color value", exact: true })
    .first()
    .inputValue();
  expect(generated).not.toBe("#e26d3f");
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(before.revision);
  expect(await counters()).toEqual(counts);
  await expect.poll(async () => Buffer.compare(await canvas.screenshot(), canonical)).not.toBe(0);
  await page.screenshot({ path: "artifacts/designer-ux/palette-variation.png" });
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before.project);
  await expect.poll(async () => Buffer.compare(await canvas.screenshot(), canonical)).toBe(0);
  await editor.getByRole("button", { name: "Generate harmonious variation", exact: true }).click();
  await editor.getByRole("button", { name: "Apply", exact: true }).click();
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(before.revision + 1);
  expect(
    await editor.getByRole("textbox", { name: "Palette name", exact: true }).inputValue(),
  ).toBe("Company variation");
  await page.evaluate(() => window.musart!.undo());
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before.project);
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(shortcut).toBeFocused();
  await shortcut.click();
  await popover.getByRole("combobox", { name: "Saved palettes", exact: true }).click();
  await page.getByRole("option", { name: "Company", exact: true }).click();
  await expect(popover.getByRole("textbox", { name: "Palette name", exact: true })).toHaveValue(
    "Company",
  );
  await expect(
    popover
      .locator(".palette-editor")
      .getByRole("textbox", { name: "Color value", exact: true })
      .first(),
  ).toHaveValue("#e26d3f");
  await popover.getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(popover.getByRole("textbox", { name: "Palette name", exact: true })).toHaveValue(
    "Company 2",
  );
  await page.keyboard.press("Escape");
  await page.reload();
  await page.waitForFunction(() => !!window.musart);
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["palette-owner"]);
  }, before.project);
  await page.locator(".inspector .color-control .palette-shortcut").first().click();
  await page.getByRole("combobox", { name: "Saved palettes", exact: true }).click();
  await expect(page.getByRole("option", { name: "Company", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Company 2", exact: true })).toBeVisible();
});
