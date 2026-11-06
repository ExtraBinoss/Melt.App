import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Project } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

test("Studio visual tools stay compact, use shared previews and edit the canonical scene and background", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.theme", "dark");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await installReadbackProbe(page);
  const errors: string[] = [],
    atlas: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.url().includes("/effects/catalog.webp")) atlas.push(r.url());
  });
  await page.goto("/editor?automation=1&workspace=studio&profile3d=1");
  await page.waitForFunction(() => !!window.musart);
  const { project } = JSON.parse(
    await readFile("apps/web/public/templates/designed/studio-starter/studio-starter.json", "utf8"),
  ) as { project: Project };
  await page.evaluate((p) => {
    window.musart!.load(p);
    window.musart!.select([]);
  }, project);
  const canvas = page.locator(".editor-gpu-scene canvas");
  await expect(canvas).toHaveAttribute("data-page-id", "studio-starter-composition");
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
        .presentationReady === "true",
  );
  expect(atlas).toHaveLength(0);
  const bodyStyle = await page.locator("body").getAttribute("style");
  const material = page.getByRole("button", { name: "Material", exact: true });
  await expect(material).toBeDisabled();
  await page.locator(".studio-material .studio-sphere-trigger-wrap").hover();
  await expect(page.getByRole("tooltip")).toContainText("3D");
  await expect(page.getByRole("tooltip")).toHaveAttribute("data-side", "top");
  await page.mouse.move(500, 100);
  const backdrop = (await canvas.boundingBox())!;
  const viewport = (await page.getByTestId("editor-canvas").boundingBox())!;
  expect(backdrop).toEqual(viewport);
  await page.evaluate(() => window.musart!.select(["studio-title"]));
  await expect(material).toBeEnabled();
  await material.click();
  expect(await page.locator("body").getAttribute("style")).toBe(bodyStyle);
  const library = page.locator(".studio-material-content .studio-sphere-library");
  const properties = page.locator(".studio-material-content .studio-sphere-properties");
  await expect(library.locator(".studio-catalog-swatch")).toHaveCount(134);
  await expect(properties.getByRole("slider", { name: "Roughness" })).toBeVisible();
  const lb = (await library.boundingBox())!,
    pb = (await properties.boundingBox())!;
  expect(pb.x).toBeGreaterThanOrEqual(lb.x + lb.width);
  await page.screenshot({ path: "artifacts/studio/studio-material-layout.png" });
  await page.keyboard.press("Escape");
  await expect(material).toBeFocused();
  await page.getByRole("button", { name: "Scene", exact: true }).click();
  expect(await page.locator("body").getAttribute("style")).toBe(bodyStyle);
  const scene = page.locator(".studio-environment-content");
  const pad = scene.getByRole("button", { name: "Direction", exact: true });
  await expect(scene.getByRole("slider", { name: "Distance", exact: true })).toBeVisible();
  await expect(scene.getByRole("slider", { name: "Focal angle", exact: true })).toBeVisible();
  const before = await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
  const revision = await page.evaluate(() => window.musart!.session().revision);
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4, { steps: 10 });
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  await page.mouse.up();
  expect(await page.evaluate(() => window.musart!.session().revision)).toBe(revision + 1);
  await page.evaluate(() => window.musart!.undo());
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  await page.screenshot({ path: "artifacts/studio/studio-scene-layout.png" });
  await page.keyboard.press("Escape");
  const effects = page.locator('[data-studio-effect-category="effect"]');
  await effects.hover();
  await expect(page.getByRole("tooltip")).toHaveAttribute("data-side", "bottom");
  await effects.click();
  expect(await page.locator("body").getAttribute("style")).toBe(bodyStyle);
  await expect(
    page.locator(".studio-effects-popover [data-effect-thumbnail]").first(),
  ).toBeVisible();
  await expect.poll(() => atlas.length).toBe(1);
  await page.screenshot({ path: "artifacts/studio/studio-effect-layout.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Background", exact: true }).click();
  await page
    .locator(".studio-background-modes")
    .getByRole("button", { name: "Gradient", exact: true })
    .click();
  await page
    .locator(".studio-background-types")
    .getByRole("button", { name: "Radial", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Gradient position", exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/studio/studio-background-layout.png" });
  await page.keyboard.press("Escape");
  expect(await page.locator("body").getAttribute("style")).toBe(bodyStyle);
  const actions = page.locator(".studio-actions > button");
  const sizes = await actions.evaluateAll((nodes) =>
    nodes.map((n) => [n.getBoundingClientRect().width, n.getBoundingClientRect().height]),
  );
  expect(sizes).toEqual([
    [48, 48],
    [48, 48],
    [48, 48],
    [48, 48],
  ]);
  await page.screenshot({ path: "artifacts/studio/studio-dark-overview.png" });
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
  expect(errors).toEqual([]);
});
