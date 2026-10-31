import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

test("undo/redo pills match the project pill and canvas center through panel/ruler/name changes; zoom UI is opt-in", async ({
  page,
}) => {
  test.setTimeout(60000);
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      id: "history-pill-native",
      name: "Melt",
      pages: [
        createPage({
          width: 640,
          height: 400,
          layers: [
            createLayer("rectangle", {
              id: "item",
              x: 200,
              y: 100,
              width: 200,
              height: 150,
              fill: "#8b5cf6",
            }),
          ],
        }),
      ],
    }),
  );
  await page.waitForFunction(() => {
    const c = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
    return (
      c?.dataset.projectId === "history-pill-native" &&
      c.dataset.rendererReady === "true" &&
      c.dataset.sceneRevision === c.dataset.renderedRevision
    );
  });
  await expect(page.locator(".canvas-controls")).toHaveCount(0);
  await page.evaluate(() => {
    window.musart!.execute({ type: "updateLayers", ids: ["item"], patch: { fill: "#ff0000" } });
    document.querySelector<HTMLElement>(".editor-canvas")!.focus();
  });
  await page.keyboard.press("Control+z");
  const notice = page.locator(".history-notice[role=status]:not([aria-hidden=true])");
  await expect(notice).toHaveAttribute("aria-label", "Undid · Color #8b5cf6");
  await notice.hover();
  const aligned = async () => {
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const n = document.querySelector(".history-notice")!.getBoundingClientRect(),
            p = document.querySelector(".project-pill")!.getBoundingClientRect(),
            c = document.querySelector(".editor-canvas")!.getBoundingClientRect();
          return Math.max(
            Math.abs(n.x + n.width / 2 - c.x - c.width / 2),
            Math.abs(n.y - p.y),
            Math.abs(n.width - p.width),
            Math.abs(n.height - p.height),
          );
        }),
      )
      .toBeLessThan(1.5);
  };
  await aligned();
  await page.waitForTimeout(2200); // Real hover must suspend the two-second reading timer.
  await expect(notice).toBeVisible();
  await page.keyboard.press("Control+Shift+z");
  await expect(notice).toHaveAttribute("aria-label", "Redid · Color #ff0000");
  await page.keyboard.press("Control+z");
  await expect(notice).toHaveAttribute("aria-label", "Undid · Color #8b5cf6");
  const oldCanvas = (await page.locator(".editor-canvas").boundingBox())!,
    handle = (await page.locator('[role="separator"][aria-controls="workspace"]').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x - 110, handle.y + handle.height / 2, { steps: 8 });
  await page.mouse.up();
  await notice.hover();
  expect((await page.locator(".editor-canvas").boundingBox())!.width).toBeLessThan(
    oldCanvas.width - 50,
  );
  await aligned();
  await page.evaluate(() => {
    window.musart!.execute({ type: "updatePage", patch: { rulers: true } });
    window.musart!.execute({ type: "renameProject", name: "A wider project name" });
  });
  await aligned();
  await mkdir("artifacts/vector-inline", { recursive: true });
  await page.screenshot({ path: "artifacts/vector-inline/history-pill-resized.png" });
  await notice.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(notice).toHaveCount(0);
  await page.evaluate(() => {
    window.musart!.execute({ type: "updateLayers", ids: ["item"], patch: { x: 205 } });
    window.musart!.undo();
  });
  await expect(notice).toHaveAttribute("aria-label", "Undid · Transform");
  await page.mouse.move(1200, 900);
  await expect(notice).toHaveCount(0, { timeout: 3500 });
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("preferences");
  await page.getByRole("option", { name: /^Preferences/ }).click();
  await page.getByRole("tab", { name: "Editor", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "Show canvas zoom controls", exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".canvas-controls")).toBeVisible();
  await page.reload();
  await expect(page.locator(".canvas-controls")).toBeVisible();
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});
