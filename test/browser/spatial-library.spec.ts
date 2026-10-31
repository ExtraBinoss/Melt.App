import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { createPage, createProject } from "../../packages/core/src/index";
test("native library previews share one canvas, orbit without document edits and insert a CC0 model with one undo", async ({
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
  const box = (await preview.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 15, { steps: 8 });
  await page.mouse.up();
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  expect(await first!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await commits()).toEqual(beforeOrbit);
  await page.screenshot({ path: "artifacts/spatial-library/models-popover.png" });
  const frames = await preview.getAttribute("data-preview-frames");
  await library.getByRole("button", { name: "Add", exact: true }).click();
  await expect(library).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers.length))
    .toBe(1);
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.spatial),
  ).toMatchObject({ source: "glb", useModelMaterials: false });
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
  await expect(preview).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await preview.click();
  await page.mouse.click(950, 750);
  await expect(library).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
});
