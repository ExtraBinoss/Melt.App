import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

test("all four side handles shrink on one axis with shared rounded binary ink and one undo", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  const layer = createLayer("rectangle", {
    id: "side-target",
    x: 180,
    y: 120,
    width: 240,
    height: 160,
    fill: "#ffffff",
    fillGradient: {
      kind: "linear",
      angle: 0,
      stops: [
        { offset: 0, color: "#fff" },
        { offset: 1, color: "#000" },
      ],
    },
  });
  const project = createProject({
    pages: [createPage({ width: 640, height: 480, layers: [layer] })],
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["side-target"]);
  }, project);
  const canvas = page.locator(".editor-gpu-scene canvas");
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true");
  const frame = page.locator('.canvas-selection[data-layer-id="side-target"]');
  await expect(frame.locator(".canvas-handle")).toHaveCount(9);
  const styles = await frame.locator(".canvas-handle").evaluateAll((nodes) =>
    nodes.map((node) => {
      const css = getComputedStyle(node);
      return {
        color: css.backgroundColor,
        radius: parseFloat(css.borderRadius),
        filter: css.backdropFilter,
      };
    }),
  );
  expect(new Set(styles.map((style) => style.color)).size).toBe(1);
  expect(["rgb(0, 0, 0)", "rgb(255, 255, 255)"]).toContain(styles[0]!.color);
  expect(styles.every((style) => style.radius > 0 && style.filter === "none")).toBe(true);
  for (const side of ["e", "w", "n", "s"]) {
    const before = await page.evaluate(() => window.musart!.snapshot().project);
    const shape = (await frame.boundingBox())!,
      handle = (await frame.locator(`.canvas-handle[data-handle="${side}"]`).boundingBox())!;
    const horizontal = side === "e" || side === "w",
      scale = shape.width / 240;
    const delta = (side === "e" || side === "s" ? -1 : 1) * 40 * scale;
    await page.keyboard.down("Alt");
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      handle.x + handle.width / 2 + (horizontal ? delta : 0),
      handle.y + handle.height / 2 + (horizontal ? 0 : delta),
      { steps: 5 },
    );
    expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before);
    await page.mouse.up();
    await page.keyboard.up("Alt");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const layer = window.musart!.snapshot().project.pages[0]!.layers[0]!;
          return { width: Math.round(layer.width), height: Math.round(layer.height) };
        }),
      )
      .toEqual(horizontal ? { width: 200, height: 160 } : { width: 240, height: 120 });
    await page.evaluate(() => window.musart!.undo());
    expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before);
    await expect(canvas).toHaveAttribute("data-renderer-ready", "true");
  }
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  await page.screenshot({ path: "artifacts/canvas-side-handles.png" });
});
