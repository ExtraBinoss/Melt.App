import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { createPage, createProject } from "../../packages/core/src/index";
test("compact native library previews share one hovered canvas and insert original-material CC0 models with one undo", async ({
  page,
}) => {
  test.setTimeout(90000);
  await mkdir("artifacts/spatial-library", { recursive: true });
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({ pages: [createPage({ width: 512, height: 512 })] }),
  );
  await expect(page.locator(".editor-gpu-scene canvas")).toHaveAttribute(
    "data-renderer-ready",
    "true",
    { timeout: 30000 },
  );
  const before = await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
  await page.locator(".toolbar").getByRole("button", { name: "3D", exact: true }).click();
  const library = page.locator(".spatial-library"),
    preview = library.locator(".spatial-library-preview");
  await expect(library.locator(".spatial-object")).toHaveCount(21);
  await expect(preview).toHaveCount(0);
  await expect(library.getByRole("button", { name: "Add", exact: true })).toHaveCount(0);
  await expect(library.getByRole("button", { name: "3D text", exact: true })).toHaveCount(0);
  await library.getByRole("button", { name: "Box", exact: true }).hover();
  await expect(preview).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  const first = await preview.locator("canvas").elementHandle();
  expect(first).not.toBeNull();
  await library.getByRole("button", { name: "Torus knot", exact: true }).hover();
  await expect(preview).toHaveAttribute("data-entry", "torusKnot");
  await expect(preview).toHaveAttribute("data-ready", "true");
  expect(await first!.evaluate((node) => node.isConnected)).toBe(true);
  await library.getByRole("radio", { name: "GLB models", exact: true }).click();
  await expect(library.locator(".spatial-object")).toHaveCount(16);
  await library.getByRole("button", { name: "Rock A", exact: true }).hover();
  await expect(preview).toHaveAttribute("data-entry", "rockA");
  await expect(preview).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  const commits = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("[data-react-renders]")].map((node) => [
        node.className,
        node.getAttribute("data-react-renders"),
      ]),
    );
  const beforeOrbit = await commits();
  expect(beforeOrbit.length).toBeGreaterThan(0);
  const framesBefore = Number(await preview.getAttribute("data-preview-frames"));
  await expect
    .poll(async () => Number(await preview.getAttribute("data-preview-frames")))
    .toBeGreaterThan(framesBefore);
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  expect(await first!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await commits()).toEqual(beforeOrbit);
  await page.screenshot({ path: "artifacts/spatial-library/models-popover.png" });
  const frames = await preview.getAttribute("data-preview-frames");
  await library.getByRole("button", { name: "Rock A", exact: true }).click();
  await expect(library).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length))
    .toBe(1);
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.spatial),
  ).toMatchObject({ source: "glb", useModelMaterials: true });
  await page.evaluate(() => window.musart!.undo());
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  await page.evaluate(() => window.musart!.redo());
  expect(await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length)).toBe(
    1,
  );
  await page.waitForTimeout(150);
  expect(await first!.evaluate((node) => node.isConnected)).toBe(false);
  expect(Number(frames)).toBeGreaterThan(0);
  await page.locator(".toolbar").getByRole("button", { name: "3D", exact: true }).click();
  await library.getByRole("button", { name: "Rock A", exact: true }).hover();
  await expect(preview).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await library.getByRole("searchbox").fill("nothing-matches");
  await expect(library.locator(".spatial-object")).toHaveCount(0);
  await expect(preview).toHaveCount(0);
  await page.mouse.click(950, 750);
  await expect(library).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
});

for (const workspace of ["classic", "studio"] as const) {
  test(`${workspace} chooses either text source and places it with one undo at the canvas pointer`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.addInitScript(() => {
      localStorage.setItem("musart.language", "en");
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    });
    await page.goto(`/editor?automation=1&workspace=${workspace}`);
    await page.waitForFunction(() => Boolean(window.musart));
    await page.evaluate(
      (project) => window.musart!.load(project),
      createProject({ pages: [createPage({ width: 800, height: 600 })] }),
    );
    await expect(page.locator(".editor-gpu-scene canvas")).toHaveAttribute(
      "data-renderer-ready",
      "true",
      { timeout: 30000 },
    );
    const before = await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
    const toolbar =
      workspace === "studio" ? page.locator(".studio-quick-add") : page.locator(".toolbar");
    await toolbar.getByRole("button", { name: "Text", exact: true }).click();
    const chooser = page.locator(".text-tool-popover");
    await expect(
      chooser.getByRole("button", {
        name: workspace === "studio" ? "Text 3D" : "Text 2D",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
    await chooser.getByRole("button", { name: "Text 3D", exact: true }).click();
    expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
      before,
    );
    const board = (await page.locator(".canvas-artboard-editor").boundingBox())!;
    await page.mouse.click(board.x + board.width * 0.2, board.y + board.height * 0.3);
    await expect
      .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length))
      .toBe(1);
    const layer = await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!);
    expect(layer.kind).toBe("text");
    expect(layer.spatial?.source).toBe("extrude");
    expect(layer.x).not.toBe((800 - layer.width) / 2);
    await expect(page.locator(".editor-canvas")).toHaveAttribute("data-canvas-tool", "pointer");
    await expect(chooser).toHaveCount(0);
    await page.evaluate(() => window.musart!.undo());
    expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
      before,
    );
    expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
    await toolbar.getByRole("button", { name: "Text", exact: true }).click();
    await chooser.getByRole("button", { name: "Text 2D", exact: true }).click();
    await page.mouse.click(board.x + board.width * 0.35, board.y + board.height * 0.4);
    await expect
      .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length))
      .toBe(1);
    expect(
      await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.spatial),
    ).toBeUndefined();
    await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
  });
}
