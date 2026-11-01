import { expect, test } from "@playwright/test";
import { createPage, createProject } from "@musart/core";
const roots = [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"];
test("presets preview without root renders, restore on dismiss and save across projects", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => !!window.musart);
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({ pages: [createPage({ width: 640, height: 360, background: "#123456" })] }),
  );
  await page.getByRole("radio", { name: "Gradient", exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
        .rendererReady === "true",
  );
  const kind = page.getByRole("combobox", { name: "Gradient type" });
  const triggerBox = await kind.boundingBox();
  await kind.click();
  const menu = page.getByRole("listbox");
  await expect(menu).toBeVisible();
  expect(Math.abs((await menu.boundingBox())!.width - triggerBox!.width)).toBeLessThan(2);
  const menuBox = (await menu.boundingBox())!;
  for (const name of ["Linear", "Radial"]) {
    const option = (await menu.getByRole("option", { name, exact: true }).boundingBox())!;
    expect(
      Math.abs(option.x - menuBox.x - (menuBox.x + menuBox.width - option.x - option.width)),
    ).toBeLessThan(2);
  }
  await page.screenshot({ path: "artifacts/background-gradients/type-menu.png" });
  await page.keyboard.press("Escape");
  const before = await page.evaluate(() => window.musart!.snapshot());
  const counters = () =>
    page.evaluate(
      (roots) =>
        roots.map((selector) =>
          Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders),
        ),
      roots,
    );
  const initial = await counters();
  expect(initial.every((value) => value > 0)).toBe(true);
  await page
    .locator(".gradient-library-actions")
    .getByRole("button", { name: "Presets", exact: true })
    .click();
  const swatch = page.getByRole("button", { name: "Gradient 10", exact: true });
  const neutral = await swatch.evaluate((node) => getComputedStyle(node).outlineColor);
  await swatch.hover();
  await expect(swatch).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(140);
  expect(await swatch.evaluate((node) => getComputedStyle(node).outlineColor)).not.toBe(neutral);
  const inputBounds = await page.getByRole("textbox", { name: "Gradient name" }).boundingBox();
  const shadowBounds = await page.locator(".gradient-library-shadow").boundingBox();
  expect(shadowBounds!.y - inputBounds!.y - inputBounds!.height).toBeLessThanOrEqual(5);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(before.revision);
  expect(await counters()).toEqual(initial);
  await page.screenshot({ path: "artifacts/background-gradients/presets.png" });
  await swatch.press("Escape");
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.backgroundGradient),
  ).toEqual(before.project.pages[0]!.backgroundGradient);
  await page
    .locator(".gradient-library-actions")
    .getByRole("button", { name: "Presets", exact: true })
    .click();
  await page.getByRole("button", { name: "Gradient 10", exact: true }).click();
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(before.revision + 1);
  const chosen = await page.evaluate(
    () => window.musart!.snapshot().project.pages[0]!.backgroundGradient,
  );
  await page.evaluate(() => window.musart!.undo());
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.backgroundGradient),
  ).toEqual(before.project.pages[0]!.backgroundGradient);
  await page.evaluate(() => window.musart!.redo());
  await page
    .locator(".gradient-library-actions")
    .getByRole("button", { name: "Presets", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Gradient 10", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("textbox", { name: "Gradient name" }).fill("My gradient");
  await page.getByRole("button", { name: "Save gradient", exact: true }).click();
  await page.getByRole("radio", { name: "Saved", exact: true }).click();
  await expect(page.getByRole("button", { name: "My gradient", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.waitForFunction(() => !!window.musart);
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({ pages: [createPage({ width: 320, height: 240 })] }),
  );
  await page.getByRole("radio", { name: "Gradient", exact: true }).click();
  await page
    .locator(".gradient-library-actions")
    .getByRole("button", { name: "Presets", exact: true })
    .click();
  await page.getByRole("radio", { name: "Saved", exact: true }).click();
  await page.getByRole("button", { name: "My gradient", exact: true }).click();
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.backgroundGradient),
  ).toEqual(chosen);
});
