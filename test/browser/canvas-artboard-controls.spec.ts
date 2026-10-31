import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { zoomViewport } from "./support/viewport";

declare global {
  interface Window {
    __artboardInsertion?: {
      before: { x: number; y: number };
      frames: { x: number; y: number; at: number }[];
      done: boolean;
    };
  }
}
test("canvas-side additions persist in all directions, avoid occupied space and reframe without a first-frame jump", async ({
  page,
}) => {
  test.setTimeout(90000);
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem("musart.language")) localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await mkdir("artifacts/artboard-controls", { recursive: true });
  for (const side of ["right", "top", "bottom", "left"] as const) {
    const project = createProject({
      id: `canvas-add-${side}`,
      pages: [
        createPage({
          id: "source",
          name: "Source",
          width: 640,
          height: 400,
          background: "#ffffff",
          layers: [
            createLayer("rectangle", { x: 50, y: 50, width: 160, height: 110, fill: "#8b5cf6" }),
          ],
        }),
      ],
    });
    await page.evaluate((project) => window.musart!.load(project), project);
    const active = page.getByTestId("artboard");
    await expect(active).toHaveAttribute("data-artboard-id", "source");
    await page.waitForFunction(() => {
      const c = document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas');
      return (
        c?.dataset.rendererReady === "true" &&
        c.dataset.renderedRevision === c.dataset.sceneRevision
      );
    });
    await expect(active).toHaveAttribute("data-view-moving", "false");
    await page.evaluate(() => window.musart!.flushThumbnails());
    const footer = page.locator('.artboard-mode-footer[data-artboard-id="source"]');
    const board = (await active.boundingBox())!,
      mode = (await footer.boundingBox())!;
    expect(mode.x + mode.width).toBeLessThanOrEqual(board.x + board.width);
    expect(mode.y + mode.height).toBeLessThanOrEqual(board.y + board.height);
    const counters = () =>
      page.evaluate(() =>
        [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
          (selector) => document.querySelector<HTMLElement>(selector)?.dataset.reactRenders,
        ),
      );
    const before = await counters();
    const point = {
      x:
        side === "left"
          ? board.x - 34
          : side === "right"
            ? board.x + board.width + 34
            : board.x + board.width / 2,
      y:
        side === "top"
          ? board.y - 66
          : side === "bottom"
            ? board.y + board.height + 34
            : board.y + board.height / 2,
    };
    await page.mouse.move(point.x, point.y);
    const add = page.getByTestId("canvas-add-artboard");
    await expect(add).toHaveAttribute("data-visible", "true");
    await expect(add).toHaveAttribute("data-side", side);
    expect(await counters()).toEqual(before);
    await add.hover();
    await expect(page.getByRole("tooltip", { name: "Add artboard", exact: true })).toBeVisible();
    await page.evaluate(() => {
      const target = document.querySelector<HTMLElement>(
        '.canvas-artboard-backdrop[data-artboard-id="source"]',
      )!;
      const rect = target.getBoundingClientRect();
      const evidence = {
        before: { x: rect.x, y: rect.y },
        frames: [] as { x: number; y: number; at: number }[],
        done: false,
      };
      window.__artboardInsertion = evidence;
      const start = (event: PointerEvent) => {
        if (!(event.target instanceof Element) || !event.target.closest(".canvas-add-artboard"))
          return;
        document.removeEventListener("pointerdown", start, true);
        const at = performance.now();
        const frame = () => {
          const r = target.getBoundingClientRect();
          evidence.frames.push({ x: r.x, y: r.y, at: performance.now() - at });
          if (performance.now() - at < 250) requestAnimationFrame(frame);
          else evidence.done = true;
        };
        requestAnimationFrame(frame);
      };
      document.addEventListener("pointerdown", start, true);
    });
    await add.click();
    await expect
      .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages.length))
      .toBe(2);
    await page.waitForFunction(() => window.__artboardInsertion?.done);
    const evidence = await page.evaluate(() => window.__artboardInsertion!);
    expect(evidence.frames.length).toBeGreaterThan(2);
    expect(evidence.frames[0]!.x).toBeCloseTo(evidence.before.x, 0);
    expect(evidence.frames[0]!.y).toBeCloseTo(evidence.before.y, 0);
    expect(evidence.frames[1]!.x).toBeCloseTo(evidence.before.x, 0);
    expect(evidence.frames[1]!.y).toBeCloseTo(evidence.before.y, 0);
    const saved = await page.evaluate(() => window.musart!.snapshot().project);
    const inserted = saved.pages[1]!.canvasPosition!,
      source = saved.pages[0]!.canvasPosition!;
    expect(Math.sign(inserted.x - source.x)).toBe(side === "left" ? -1 : side === "right" ? 1 : 0);
    expect(Math.sign(inserted.y - source.y)).toBe(side === "top" ? -1 : side === "bottom" ? 1 : 0);
    expect(await page.locator(".artboard-heading .canvas-add-artboard").count()).toBe(0);
    await writeFile(`artifacts/artboard-controls/${side}.json`, JSON.stringify(evidence, null, 2));
    if (side === "left") {
      await page.mouse.move(30, 30);
      await page.getByTestId("editor-canvas").hover({ position: { x: 300, y: 250 } });
      await zoomViewport(page, 0.2);
      const small = page.locator('.artboard-mode-footer[data-active="true"]');
      const dimensions = await small.boundingBox();
      expect(dimensions?.width).toBeLessThan(mode.width);
      const activeBounds = (await active.boundingBox())!;
      expect(dimensions!.x + dimensions!.width).toBeLessThanOrEqual(
        activeBounds.x + activeBounds.width,
      );
      expect(dimensions!.y + dimensions!.height).toBeLessThanOrEqual(
        activeBounds.y + activeBounds.height,
      );
      const collisions = await page.evaluate(() => {
        const f = document
          .querySelector('.artboard-mode-footer[data-active="true"]')!
          .getBoundingClientRect();
        return [...document.querySelectorAll(".artboard-heading")].some((node) => {
          const h = node.getBoundingClientRect();
          return f.left < h.right && f.right > h.left && f.top < h.bottom && f.bottom > h.top;
        });
      });
      expect(collisions).toBe(false);
      await page.screenshot({ path: "artifacts/artboard-controls/overview.png" });
      await page.evaluate(async () => {
        await window.musart!.save();
        localStorage.setItem("musart.language", "fr");
      });
      await page.reload();
      await page.waitForFunction(() => Boolean(window.musart));
      expect(
        (await page.evaluate(() => window.musart!.snapshot().project)).pages.map(
          (p) => p.canvasPosition,
        ),
      ).toEqual(saved.pages.map((p) => p.canvasPosition));
      const reloaded = (await page
        .locator('.canvas-artboard-backdrop[data-artboard-id="source"]')
        .boundingBox())!;
      await page.mouse.move(reloaded.x + reloaded.width / 2, reloaded.y - 66);
      await expect(add).toHaveAttribute("data-visible", "true");
      await expect(add).toHaveAttribute("aria-label", "Ajouter un plan de travail");
      await expect(page.getByRole("radio", { name: "Statique", exact: true })).toBeAttached();
    } else {
      await page.evaluate(() => window.musart!.undo());
      expect((await page.evaluate(() => window.musart!.snapshot().project)).pages).toHaveLength(1);
      expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
    }
  }
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});

test("Arabic canvas controls and vector dialog retain RTL text and usable native focus", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "ar");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["vector"]);
    },
    createProject({
      id: "rtl-controls",
      pages: [
        createPage({
          id: "rtl-page",
          name: "لوحة",
          width: 640,
          height: 400,
          layers: [
            createLayer("vector", {
              id: "vector",
              x: 50,
              y: 50,
              width: 220,
              height: 180,
              fill: "#8b5cf6",
              vector: { viewBox: "0 0 200 160", path: "M20 20L180 20L180 140L20 140Z" },
            }),
            createLayer("text", {
              id: "rtl-text",
              text: "Melt",
              x: 300,
              y: 80,
              width: 220,
              height: 100,
              fontFamily: "Inter",
            }),
          ],
        }),
      ],
    }),
  );
  await expect(page.getByTestId("artboard")).toHaveAttribute("data-artboard-id", "rtl-page");
  await expect(page.getByTestId("artboard")).toHaveAttribute("data-view-moving", "false");
  const bounds = (await page.getByTestId("artboard").boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width + 34, bounds.y + bounds.height / 2);
  const add = page.getByRole("button", { name: "إضافة لوح رسم", exact: true });
  await expect(add).toHaveAttribute("data-visible", "true");
  await add.hover();
  await expect(page.getByRole("tooltip", { name: "إضافة لوح رسم", exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "ثابت", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "تحرير النقاط", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "تحرير نقاط SVG", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".vector-anchor")).toHaveCount(4);
  await expect(dialog.getByText("تدوير الزاوية", { exact: true })).toBeVisible();
  const box = (await dialog.boundingBox())!,
    size = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(size.width);
  await page.screenshot({ path: "artifacts/artboard-controls/arabic-vector.png" });
  await dialog.getByRole("button", { name: "تم", exact: true }).click();
  await expect(page.getByRole("button", { name: "تحرير النقاط", exact: true })).toBeFocused();
  await page.evaluate(() => window.musart!.select(["rtl-text"]));
  await page.getByRole("combobox", { name: "الخط", exact: true }).click();
  const list = page.getByRole("listbox", { name: "الخطوط", exact: true });
  await expect(list).toBeVisible();
  const specimen = list
    .getByRole("option", { name: "Inter", exact: true })
    .locator('[data-font-preview-state="ready"]');
  await expect(specimen).toHaveText("Melt · Aa Bb · 0123");
  await page.screenshot({ path: "artifacts/artboard-controls/arabic-fonts.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("combobox", { name: "الخط", exact: true })).toBeFocused();
});
