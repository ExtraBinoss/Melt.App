import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";

test("performance icon opens a fresh copyable report with a full-width target selector and clipped accordions", async ({
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  const rectangle = createLayer("rectangle", {
    id: "budget-shape",
    width: 64,
    height: 64,
    fill: "#8b5cf6",
  });
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ width: 192, height: 128, layers: [rectangle] })] }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({
    type: "upsertMotionKeyframe",
    target: { kind: "layer", layerId: rectangle.id, property: "x" },
    time: { value: 0, rate: 1 },
    value: 0,
  });
  engine.execute({
    type: "upsertMotionKeyframe",
    target: { kind: "layer", layerId: rectangle.id, property: "x" },
    time: { value: 1, rate: 1 },
    value: 48,
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((data) => window.musart!.load(data), engine.getSnapshot().project);
  await expect(page.locator(".editor-gpu-scene canvas")).toHaveAttribute(
    "data-renderer-ready",
    "true",
  );
  const trigger = page
    .locator(".artboard-performance-footer")
    .getByRole("button", { name: "Performance", exact: true });
  expect(await trigger.textContent()).toBe("");
  await trigger.click();
  const popup = page.locator(".composition-performance-popover");
  await expect(popup).toBeFocused();
  const copy = popup.getByRole("button", { name: "Copy report", exact: true });
  await expect(copy).toBeEnabled();
  const target = popup.getByRole("combobox", { name: "Target frame rate" });
  const a = (await target.boundingBox())!;
  await target.click();
  const b = (await page.getByRole("listbox").boundingBox())!;
  expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
  await page.getByRole("option", { name: "144 fps", exact: true }).click();
  await expect(popup).toBeVisible();
  await popup
    .locator(".composition-performance-domains")
    .getByRole("button", { name: /^GPU/ })
    .click();
  await expect
    .poll(() =>
      popup
        .locator(".composition-performance-viewport")
        .evaluate((node) => node.scrollWidth - node.clientWidth),
    )
    .toBeLessThanOrEqual(0);
  await copy.click();
  await expect(popup.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  const report = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(report).toMatchObject({ sampleCount: 12, targetFps: 144 });
  expect(report.contributions.cpu.length).toBeGreaterThan(0);
  expect(
    report.contributions.cpu.reduce((sum: number, part: { value: number }) => sum + part.value, 0),
  ).toBeCloseTo(report.cpu.value, 5);
  await page.mouse.click(30, 120);
  await expect(popup).toBeHidden();
  await trigger.click();
  await expect(copy).toBeEnabled();
  await copy.click();
  await expect(popup.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  const fresh = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(fresh.measuredAt).toBeGreaterThan(report.measuredAt);
  expect(fresh.targetFps).toBe(60);
  await page.screenshot({ path: "artifacts/composition-performance-ui.png" });
});
