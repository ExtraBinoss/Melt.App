import { expect, test, type Page } from "@playwright/test";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
} from "../../packages/core/src/index";

async function location(page: Page, x: number, y: number) {
  const bounds = (await page.getByTestId("artboard").boundingBox())!;
  return { x: bounds.x + (x * bounds.width) / 640, y: bounds.y + (y * bounds.height) / 480 };
}
async function click(page: Page, x: number, y: number) {
  const at = await location(page, x, y);
  await page.mouse.click(at.x, at.y);
}
async function count(page: Page) {
  return page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length);
}

for (const workspace of ["classic", "studio"] as const) {
  test(`${workspace}: visible foreground clicks and opt-in repeated creation use the real canvas`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.addInitScript(() => {
      localStorage.setItem("musart.language", "en");
      localStorage.setItem("musart.editor-tutorial.v1", "done");
      localStorage.removeItem("musart.keep-creation-tool.v1");
    });
    await page.goto(`/editor?automation=1&workspace=${workspace}`);
    await page.waitForFunction(() => !!window.musart);
    const canvas = page.locator(".editor-gpu-scene canvas");
    if (workspace === "classic") {
      const project = createProject({
        pages: [
          createPage({
            id: "background-pick",
            width: 640,
            height: 480,
            spatial: createSpatialScene(),
            layers: [
              createLayer("rectangle", {
                id: "backdrop",
                name: "Background",
                width: 640,
                height: 480,
                x: 0,
                y: 0,
                radius: 0,
                background: true,
                fill: "#ece9f2",
              }),
              createLayer("text", {
                id: "title",
                text: "MELT",
                name: "3D title",
                x: 150,
                y: 120,
                width: 300,
                height: 150,
                fontSize: 90,
                fontFamily: "Inter Variable",
                fill: "#6d28d9",
                spatial: createSpatialLayer("extrude"),
              }),
            ],
          }),
        ],
      });
      await page.evaluate((project) => {
        window.musart!.load(project);
        window.musart!.select(["backdrop"]);
      }, project);
      await expect(canvas).toHaveAttribute("data-page-id", "background-pick", { timeout: 40000 });
      await expect(canvas).toHaveAttribute("data-renderer-ready", "true", { timeout: 40000 });
      const pixel = await page.evaluate(async () => {
        const modulePath = "/src/canvas/selection/hit.ts";
        const { canvasHit } = await import(/* @vite-ignore */ modulePath);
        const page = window.musart!.snapshot().project.pages[0]!;
        for (let y = 125; y < 300; y += 10)
          for (let x = 150; x < 460; x += 10)
            if (
              [
                [0, 0],
                [-3, 0],
                [3, 0],
                [0, -3],
                [0, 3],
              ].every(
                ([dx, dy]) =>
                  canvasHit(page, { x: x + dx!, y: y + dy! }, true)?.layer.id === "title",
              )
            )
              return { x, y };
        throw Error("The real native text mesh was not pickable");
      });
      const before = await page.evaluate(() => window.musart!.snapshot());
      const at = await location(page, pixel.x, pixel.y);
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.mouse.up();
      expect(await page.evaluate(() => window.musart!.snapshot().selection)).toEqual(["title"]);
      expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before.project);
      expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);

      // An intentional drag retains the tree-selected backdrop and commits only once.
      await page.evaluate(() => window.musart!.select(["backdrop"]));
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.mouse.move(at.x + 30, at.y + 20, { steps: 5 });
      await page.mouse.up();
      const after = await page.evaluate(() => window.musart!.snapshot());
      expect(after.selection).toEqual(["backdrop"]);
      expect(after.revision).toBe(before.revision + 1);
      expect(after.project.pages[0]!.layers[1]).toEqual(before.project.pages[0]!.layers[1]);
      await page.evaluate(() => window.musart!.undo());
      expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before.project);
    }

    await page.evaluate(
      (project) => window.musart!.load(project),
      createProject({ pages: [createPage({ id: "tool-insertion", width: 640, height: 480 })] }),
    );
    await expect(canvas).toHaveAttribute("data-page-id", "tool-insertion", { timeout: 40000 });
    await expect(canvas).toHaveAttribute("data-renderer-ready", "true", { timeout: 40000 });
    const surface = page.getByTestId("editor-canvas");
    await surface.focus();
    await page.keyboard.press("t");
    await expect(surface).toHaveAttribute("data-canvas-tool", "text");
    await click(page, 80, 80);
    await expect(surface).toHaveAttribute("data-canvas-tool", "pointer");
    expect(await count(page)).toBe(1);
    await click(page, 590, 420);
    expect(await count(page)).toBe(1);

    await page.keyboard.press("Control+k");
    await page.getByRole("combobox", { name: "Search Melt", exact: true }).fill("editor settings");
    await page.getByRole("option", { name: /Editor settings & snapping distance/ }).click();
    const preferences = page.getByRole("dialog", { name: "Preferences", exact: true });
    const keep = preferences.getByRole("switch", {
      name: "Keep creation tool active",
      exact: true,
    });
    await expect(keep).not.toBeChecked();
    const documentBefore = await page.evaluate(() => window.musart!.snapshot().project);
    await keep.click();
    expect(await page.evaluate(() => localStorage.getItem("musart.keep-creation-tool.v1"))).toBe(
      "true",
    );
    expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(documentBefore);
    await page.keyboard.press("Escape");
    await surface.focus();
    await page.keyboard.press("t");
    for (const expected of [2, 3]) {
      await click(page, 120, 220);
      expect(await count(page)).toBe(expected);
      await expect(surface).toHaveAttribute("data-canvas-tool", "text");
      await expect(page.locator(".canvas-handle")).toHaveCount(0);
    }
    await page.keyboard.press("v");
    await expect(surface).toHaveAttribute("data-canvas-tool", "pointer");
    await click(page, 590, 450);
    expect(await count(page)).toBe(3);
    await page.keyboard.press("u");
    for (const expected of [4, 5]) {
      await click(page, 420, 300);
      expect(await count(page)).toBe(expected);
      await expect(surface).toHaveAttribute("data-canvas-tool", "shape");
    }
    await page.keyboard.press("v");
    await expect(surface).toHaveAttribute("data-canvas-tool", "pointer");
    await page.evaluate(() => window.musart!.undo());
    expect(await count(page)).toBe(4);
    await page.evaluate(() => window.musart!.redo());
    expect(await count(page)).toBe(5);
  });
}
