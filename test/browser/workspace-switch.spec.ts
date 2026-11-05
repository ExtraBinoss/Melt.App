import { createLayer, createPage, createProject } from "@musart/core";
import { expect, test, type Page } from "@playwright/test";

async function choose(page: Page, mode: "Classic" | "Studio") {
  const selector = page.locator(".project-workspace-select");
  if (!(await selector.isVisible())) await page.locator(".project-pill").click();
  await selector.click();
  await page.getByRole("option", { name: mode, exact: true }).click();
}

test("workspace changes retain the canvas and document, with a full-width native selector and compact pending status", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1&workspace=classic", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.musart), undefined, { timeout: 60000 });
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      name: "My winter studio",
      pages: [
        createPage({
          width: 320,
          height: 240,
          layers: [createLayer("rectangle", { width: 120, height: 80 })],
        }),
      ],
    }),
  );
  const canvas = page.locator('.editor-gpu-scene canvas[data-renderer-ready="true"]').first();
  await expect(canvas).toBeVisible();
  const retained = await canvas.elementHandle();
  const documentBefore = await page.evaluate(() => window.musart!.snapshot().project);
  const bodyStyle = await page.locator("body").getAttribute("style");
  await page.locator(".project-pill").click();
  const selector = page.locator(".project-workspace-select");
  expect(
    await selector.evaluate((node) => {
      const parent = node.parentElement!;
      const style = getComputedStyle(parent);
      const contentWidth =
        parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return Math.abs(node.getBoundingClientRect().width - contentWidth);
    }),
  ).toBeLessThan(2);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/ui/studio/StudioChrome.tsx*", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await choose(page, "Studio");
    const loading = page.locator("[data-workspace-transition-loader]");
    await expect(loading).toBeVisible();
    const dimensions = await loading.boundingBox();
    expect(dimensions!.width).toBeLessThan(360);
    expect(dimensions!.height).toBeLessThan(120);
    await expect(loading).toContainText("Switching to Studio");
    await expect(loading).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(loading).toHaveCSS("box-shadow", "none");
    await expect(loading.locator(".ui-throbber")).toHaveCount(1);
    await expect(page.locator(".canvas-loading:visible")).toHaveCount(0);
    await page.screenshot({ path: "artifacts/studio/workspace-switch-loading.png" });
  } finally {
    release();
  }
  await expect(page.locator(".workspace-mode-root")).toHaveAttribute(
    "data-workspace-mode",
    "studio",
  );
  await expect(page.locator(".workspace-mode-root")).toHaveAttribute(
    "data-workspace-transition",
    "idle",
  );
  await choose(page, "Classic");
  await expect(page.locator(".workspace-mode-root")).toHaveAttribute(
    "data-workspace-mode",
    "classic",
  );
  await expect(page.locator(".workspace-mode-root")).toHaveAttribute(
    "data-workspace-transition",
    "idle",
  );
  expect(
    await retained!.evaluate(
      (node) => node.isConnected && node === document.querySelector(".editor-gpu-scene canvas"),
    ),
  ).toBe(true);
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(documentBefore);
  expect(await page.locator("body").getAttribute("style")).toBe(bodyStyle);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await choose(page, "Studio");
  await choose(page, "Classic");
  await expect(page.locator(".workspace-mode-root")).toHaveAttribute(
    "data-workspace-mode",
    "classic",
  );
  await expect(page.locator(".workspace-mode-root")).toHaveAttribute(
    "data-workspace-transition",
    "idle",
  );
});
