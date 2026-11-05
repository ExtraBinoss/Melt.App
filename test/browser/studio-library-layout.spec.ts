import { expect, test } from "@playwright/test";
import { createPage, createProject } from "../../packages/core/src/index";
import { writeFile } from "node:fs/promises";

test("Studio catalogs share compact scrolling and show native offline model stills before hover", async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  const modelRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/spatial\/models\/studio-.*\.glb/.test(request.url())) modelRequests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.goto("/editor?automation=1&workspace=studio");
  await page.waitForFunction(() => !!window.musart, undefined, { timeout: 60000 });
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({ pages: [createPage({ width: 1920, height: 1080, layers: [] })] }),
  );
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const library = page.locator(".spatial-library");
  await library.getByRole("radio", { name: "Packs", exact: true }).click();
  await library.getByRole("button", { name: /Download ·/ }).click();
  const tiles = library.locator("[data-pack-model]");
  await expect(tiles.first()).toBeVisible({ timeout: 60000 });
  await page.mouse.move(600, 400);
  const poster = library.locator("[data-pack-poster]").first();
  await expect(poster).toBeVisible({ timeout: 45000 });
  await expect(poster).toHaveCSS("background-image", /blob:/);
  await expect(library.locator(".spatial-library-live canvas")).toHaveCount(0);
  const outer = (await library.boundingBox())!,
    viewport = (await library.locator(".studio-library-scroll").boundingBox())!;
  expect(Math.abs(outer.x + outer.width - viewport.x - viewport.width)).toBeLessThanOrEqual(2);
  expect(await tiles.count()).toBeLessThan(60);
  await expect(library.getByText("Available offline", { exact: true })).toHaveCount(0);
  await expect(library.getByText("Kenney creative library", { exact: true })).toHaveCount(0);
  await expect(library.locator(".studio-library-scroll-shadow")).toHaveAttribute(
    "data-overflow-bottom",
    "",
  );
  await page.screenshot({ path: "artifacts/studio/library-pack-layout.png" });
  const first = await tiles.first().getAttribute("data-pack-model");
  await library.locator(".studio-library-scroll").evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect.poll(() => tiles.first().getAttribute("data-pack-model")).not.toBe(first);
  expect(await tiles.count()).toBeLessThan(60);
  await expect(library.locator("[data-pack-poster][hidden]")).toHaveCount(0);
  expect(modelRequests).toEqual([]);
  await expect(library.locator(".spatial-library-live canvas")).toHaveCount(0);
  await page.context().setOffline(true);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await library.getByRole("radio", { name: "Packs", exact: true }).click();
  await expect(library.locator("[data-pack-poster]").first()).toBeVisible();
  await expect(library.locator("[data-pack-poster][hidden]")).toHaveCount(0);
  expect(modelRequests).toEqual([]);
  await page.context().setOffline(false);
  expect(errors).toEqual([]);
});

test("Studio extrudes an actual stroked catalog icon without blocking insertion", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.goto("/editor?automation=1&workspace=studio");
  await page.waitForFunction(() => !!window.musart, undefined, { timeout: 60000 });
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({ pages: [createPage({ width: 1920, height: 1080, layers: [] })] }),
  );
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const library = page.locator(".spatial-library");
  await library.getByRole("radio", { name: "SVG", exact: true }).click();
  const vector = library.locator(".studio-vector-library");
  await expect(vector.getByRole("button", { name: /^Use / }).first()).toBeVisible();
  await expect(vector.locator(".scroll-shadow")).toHaveAttribute("data-scroll-shadow-fade", "mask");
  const outer = (await library.boundingBox())!,
    viewport = (await vector.getByRole("region").boundingBox())!;
  expect(Math.abs(outer.x + outer.width - viewport.x - viewport.width)).toBeLessThanOrEqual(2);
  await vector.getByRole("button", { name: "Icons", exact: true }).click();
  await vector.getByRole("button", { name: /^Use / }).first().click();
  await expect(library).toHaveCount(0);
  expect(
    await page.evaluate(
      () => window.musart!.snapshot().project.pages[0]!.layers[0]!.spatial?.source,
    ),
  ).toBe("extrude");
  await expect(page.locator(".editor-gpu-scene canvas")).toHaveAttribute(
    "data-presentation-ready",
    "true",
    { timeout: 45000 },
  );
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
    return (
      canvas?.dataset.rendererReady === "true" &&
      canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
    );
  });
  await page.screenshot({ path: "artifacts/studio/library-native-insertion.png" });
  const encoded = await page.evaluate(() => window.musart!.render());
  await writeFile(
    "artifacts/studio/library-svg-export.png",
    Buffer.from(encoded.split(",")[1]!, "base64"),
  );
  await page.evaluate(() => window.musart!.undo());
  expect(await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers)).toEqual([]);
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.spatial),
  ).toBeUndefined();
});
