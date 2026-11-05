import { expect, test } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
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
              name: "Rectangle",
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
  await expect(notice).toHaveAttribute("aria-label", "Undo · Change Fill #8b5cf6 · Rectangle");
  await notice.hover();
  await expect(notice.locator("span")).toHaveJSProperty(
    "scrollWidth",
    await notice.locator("span").evaluate((node) => node.clientWidth),
  );
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
            Math.max(0, p.width - n.width),
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
  await expect(notice).toHaveAttribute("aria-label", "Redo · Change Fill #ff0000 · Rectangle");
  await page.keyboard.press("Control+z");
  await expect(notice).toHaveAttribute("aria-label", "Undo · Change Fill #8b5cf6 · Rectangle");
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
  await expect(notice).toHaveAttribute("aria-label", "Undo · Change Position X 200px · Rectangle");
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

test("background color input and numeric/effect edits announce the actual restored property and value", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select([]);
    },
    createProject({
      id: "history-values-native",
      pages: [
        createPage({
          name: "Composition",
          background: "#123456",
          width: 640,
          height: 400,
          layers: [
            createLayer("rectangle", {
              id: "item",
              name: "Rectangle",
              x: 200,
              effects: [createEffect("blur", { id: "blur", amount: 0.57 })],
            }),
          ],
        }),
      ],
    }),
  );
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
    return (
      canvas?.dataset.projectId === "history-values-native" &&
      canvas.dataset.rendererReady === "true" &&
      canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
    );
  });
  const hex = page.getByRole("textbox", { name: "Hex color", exact: true }),
    notice = page.locator(".history-notice[role=status]:not([aria-hidden=true])");
  await hex.fill("#654321");
  await hex.press("Enter");
  await page.locator(".editor-canvas").focus();
  await page.keyboard.press("Control+z");
  await expect(notice).toHaveAttribute(
    "aria-label",
    "Undo · Change Background #123456 · Composition",
  );
  await page.keyboard.press("Control+Shift+z");
  await expect(notice).toHaveAttribute(
    "aria-label",
    "Redo · Change Background #654321 · Composition",
  );
  await page.evaluate(() =>
    window.musart!.execute({ type: "updateLayers", ids: ["item"], patch: { x: 212.75 } }),
  );
  await page.keyboard.press("Control+z");
  await expect(notice).toHaveAttribute("aria-label", "Undo · Change Position X 200px · Rectangle");
  await page.keyboard.press("Control+Shift+z");
  await expect(notice).toHaveAttribute(
    "aria-label",
    "Redo · Change Position X 212.75px · Rectangle",
  );
  await page.evaluate(() => {
    const effect = window.musart!.snapshot().project.pages[0]!.layers[0]!.effects[0]!;
    window.musart!.execute({
      type: "updateLayers",
      ids: ["item"],
      patch: { effects: [{ ...effect, amount: 0.25 }] },
    });
  });
  await page.keyboard.press("Control+z");
  await expect(notice).toHaveAttribute("aria-label", "Undo · Change Blur · Amount 57% · Rectangle");
  await page.keyboard.press("Control+Shift+z");
  await expect(notice).toHaveAttribute("aria-label", "Redo · Change Blur · Amount 25% · Rectangle");
});

for (const mode of ["classic", "studio"] as const)
  test(`${mode} library successes, undo/redo and actual import errors share a workspace-local feedback slot`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.addInitScript(() => {
      localStorage.setItem("musart.language", "en");
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    });
    await page.goto(`/editor?automation=1&workspace=${mode}`);
    await page.waitForFunction(() => Boolean(window.musart));
    await page.evaluate(
      (project) => window.musart!.load(project),
      createProject({
        id: `feedback-slot-${mode}`,
        pages: [createPage({ width: 640, height: 400, layers: [] })],
      }),
    );
    const inherited = await page.evaluate(() => ({
      body: document.body.getAttribute("style"),
      root: document.documentElement.getAttribute("style"),
    }));
    await page.getByRole("button", { name: "3D", exact: true }).click();
    await page
      .locator(".spatial-library")
      .getByRole("button", { name: "Sphere", exact: true })
      .click();
    const card = page.locator(".editor-notice.notice-card:not([aria-hidden=true])"),
      anchor = page.locator(".editor-notice-anchor"),
      history = page.locator(".history-notice:not([aria-hidden=true])");
    await expect(card).toContainText("Sphere added");
    await expect(anchor).toHaveAttribute(
      "data-notice-placement",
      mode === "studio" ? "bottom-right" : "top-center",
    );
    const aligned = async () => {
      await expect
        .poll(() =>
          page.evaluate((mode) => {
            const portal = document.querySelector(".editor-notice-anchor")!.getBoundingClientRect(),
              local = document.querySelector(".history-notice-anchor")!.getBoundingClientRect();
            return mode === "studio"
              ? Math.max(
                  Math.abs(portal.right - local.right),
                  Math.abs(portal.bottom - local.bottom),
                )
              : Math.max(
                  Math.abs(portal.top - local.top),
                  Math.abs(portal.left + portal.width / 2 - local.left - local.width / 2),
                );
          }, mode),
        )
        .toBeLessThan(1.5);
    };
    await card.hover();
    await aligned();
    if (mode === "studio") {
      await page.setViewportSize({ width: 390, height: 844 });
      await card.hover();
      await aligned();
      const bounds = (await card.boundingBox())!,
        bar = (await page.locator(".studio-object-bar-anchor").boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(bar.y - 8);
    }
    await page.evaluate(() => window.musart!.undo());
    await expect(history).toContainText("Undo · Add Sphere");
    await expect(card).toHaveCount(0);
    await page.evaluate(() => window.musart!.redo());
    await expect(history).toContainText("Redo · Add Sphere");
    await page.locator('input[type="file"][multiple]').setInputFiles({
      name: "broken.png",
      mimeType: "image/png",
      buffer: Buffer.from("invalid image bytes"),
    });
    await expect(card).toHaveAttribute("role", "alert");
    await expect(history).toHaveCount(0);
    await card.hover();
    await aligned();
    expect(
      await page.evaluate(() => ({
        body: document.body.getAttribute("style"),
        root: document.documentElement.getAttribute("style"),
      })),
    ).toEqual(inherited);
  });
