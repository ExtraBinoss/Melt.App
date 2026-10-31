import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";

test("resize handles stay above composition chrome while blank overlay space and menus remain usable", async ({
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
    createProject({
      pages: [
        createPage({
          id: "stack-board",
          width: 500,
          height: 300,
          layers: [
            createLayer("rectangle", { id: "stack-item", width: 60, height: 60, fill: "#8844ff" }),
          ],
        }),
      ],
    }),
  );
  await expect(
    page.locator('canvas[data-page-id="stack-board"][data-renderer-ready="true"]'),
  ).toBeVisible();
  const board = page.getByTestId("artboard");
  await expect(board).toHaveAttribute("data-view-moving", "false");
  const menu = page.locator(
    '.artboard-heading[data-artboard-id="stack-board"] button[aria-haspopup="menu"]',
  );
  const mode = page
    .locator('.artboard-mode-footer[data-artboard-id="stack-board"] [role="radio"]')
    .first();
  for (const control of [menu, mode]) {
    const target = (await control.boundingBox())!,
      bounds = (await board.boundingBox())!,
      zoom = bounds.width / 500;
    const point = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    await page.evaluate(
      ({ x, y }) => {
        window.musart!.execute({
          type: "updateLayers",
          ids: ["stack-item"],
          patch: { x, y, width: 60, height: 60 },
        });
        window.musart!.select(["stack-item"]);
      },
      { x: (point.x - bounds.x) / zoom, y: (point.y - bounds.y) / zoom },
    );
    const handle = page.locator('.canvas-handle[data-layer-id="stack-item"][data-handle="nw"]');
    await expect(handle).toBeVisible();
    const box = (await handle.boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - point.x)).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - point.y)).toBeLessThan(2);
    expect(
      await page.evaluate(
        (p) => document.elementFromPoint(p.x, p.y)?.classList.contains("canvas-handle"),
        point,
      ),
    ).toBe(true);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x - 12, point.y - 12, { steps: 4 });
    await page.mouse.up();
    expect(
      await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.width),
    ).toBeGreaterThan(60);
    await page.evaluate(() => window.musart!.undo());
    expect(
      await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.width),
    ).toBe(60);
    await page.evaluate(() => window.musart!.select([]));
  }
  await mode.click();
  await expect(mode).toBeChecked();
  await menu.click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.locator(".editor-canvas").focus();
  const before = await page.evaluate(() => {
    const s = window.musart!.snapshot();
    return { project: s.project, canUndo: s.canUndo };
  });
  const pose = (await board.boundingBox())!,
    anchor = { x: pose.x + pose.width / 2, y: pose.y + pose.height / 2 };
  await page.mouse.move(anchor.x, anchor.y);
  await page.keyboard.down("Control");
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, -8);
  await page.keyboard.up("Control");
  await expect(board).toHaveAttribute("data-view-moving", "false");
  expect((await board.boundingBox())!.width).toBeGreaterThan(pose.width);
  expect(
    await page.evaluate(() => {
      const s = window.musart!.snapshot();
      return { project: s.project, canUndo: s.canUndo };
    }),
  ).toEqual(before);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "artifacts/canvas-zoom/handles-and-zoom.png" });
});
