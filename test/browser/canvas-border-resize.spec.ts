import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
test("whole selection borders resize through the shared gesture and cancel or undo atomically", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => !!window.musart);
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["target"]);
    },
    createProject({
      pages: [
        createPage({
          width: 640,
          height: 480,
          layers: [
            createLayer("rectangle", { id: "target", x: 180, y: 120, width: 240, height: 160 }),
          ],
        }),
      ],
    }),
  );
  const frame = page.locator('.canvas-selection[data-layer-id="target"]');
  const canvas = page.locator(".editor-gpu-scene canvas");
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true");
  await expect(frame.locator(".canvas-resize-edge")).toHaveCount(4);
  for (const side of ["e", "w", "n", "s"] as const) {
    const before = await page.evaluate(() => window.musart!.snapshot().project),
      box = (await frame.boundingBox())!,
      zoom = box.width / 240;
    // Quarter of the edge: deliberately outside every visible point/side grip.
    const x = side === "e" ? box.x + box.width : side === "w" ? box.x : box.x + box.width * 0.25;
    const y = side === "s" ? box.y + box.height : side === "n" ? box.y : box.y + box.height * 0.25;
    const horizontal = side === "e" || side === "w",
      delta = (side === "e" || side === "s" ? -1 : 1) * 40 * zoom;
    await page.mouse.move(x, y);
    expect(
      await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.classList.contains("canvas-resize-edge"),
        { x, y },
      ),
    ).toBe(true);
    await page.keyboard.down("Alt");
    await page.mouse.down();
    await page.mouse.move(x + (horizontal ? delta : 0), y + (horizontal ? 0 : delta), { steps: 4 });
    expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before);
    await page.mouse.up();
    await page.keyboard.up("Alt");
    const changed = await page.evaluate(
      () => window.musart!.snapshot().project.pages[0]!.layers[0]!,
    );
    expect(Math.round(changed.width)).toBe(horizontal ? 200 : 240);
    expect(Math.round(changed.height)).toBe(horizontal ? 160 : 120);
    await page.evaluate(() => window.musart!.undo());
    expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before);
    await expect(canvas).toHaveAttribute("data-renderer-ready", "true");
  }
  const box = (await frame.boundingBox())!;
  await page.mouse.move(box.x + box.width, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 30, box.y + box.height * 0.25);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(
    await page.evaluate(() =>
      Math.round(window.musart!.snapshot().project.pages[0]!.layers[0]!.width),
    ),
  ).toBe(240);
});
