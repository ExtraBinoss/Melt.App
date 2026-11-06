import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
  SpatialGeometry,
  transformSpatial,
  type Project,
} from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

const ready = (page: Page) =>
  page.waitForFunction(() => {
    const c = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
    return (
      c?.dataset.presentationReady === "true" &&
      c.dataset.sceneRevision === c.dataset.renderedRevision
    );
  });

test("Studio properties, Motion switches, right pan and spatial snapping retain ownership and undo", async ({
  page,
}, info) => {
  test.setTimeout(150000);
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.goto("/editor?automation=1&workspace=studio&profile3d=1");
  await page.waitForFunction(() => !!window.musart);
  const { project } = JSON.parse(
    await readFile("apps/web/public/templates/designed/studio-starter/studio-starter.json", "utf8"),
  ) as { project: Project };
  await page.evaluate((p) => {
    window.musart!.load(p);
    window.musart!.select(["studio-title"]);
  }, project);
  await ready(page);
  const before = await page.evaluate(() => ({
    document: JSON.stringify(window.musart!.snapshot().project),
    selection: window.musart!.snapshot().selection,
  }));
  const canvas = page.locator(".editor-gpu-scene canvas");
  const artboard = page.getByTestId("artboard");
  const startPan = await artboard.getAttribute("data-pan-x");
  const bounds = (await page.getByTestId("editor-canvas").boundingBox())!;
  const x = bounds.x + bounds.width * 0.25,
    y = bounds.y + bounds.height * 0.4;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(x + 90, y + 40, { steps: 5 });
  await page.mouse.up({ button: "right" });
  await expect(artboard).not.toHaveAttribute("data-pan-x", startPan!);
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
    before.document,
  );
  expect(await page.evaluate(() => window.musart!.snapshot().selection)).toEqual(before.selection);
  await expect(page.locator(".canvas-marquee")).toBeHidden();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.getByRole("button", { name: "Recenter view", exact: true }).click();
  await expect(artboard).toHaveAttribute("data-pan-x", "0");
  await ready(page);
  await page.mouse.click(x, y, { button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.evaluate(() => window.musart!.select(["studio-title"]));

  const bodyStyle = await page.locator("body").getAttribute("style");
  await page.getByRole("button", { name: "Compositions", exact: true }).click();
  const properties = page.getByRole("button", { name: "Advanced controls", exact: true });
  await properties.click();
  const editor = page.locator(".studio-advanced-body .inspector");
  await expect(editor).toBeVisible();
  const retained = await editor.elementHandle();
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await expect(properties).toBeFocused();
  await properties.click();
  expect(
    await retained!.evaluate(
      (node) => node === document.querySelector(".studio-advanced-body .inspector"),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  expect(await page.locator("body").getAttribute("style")).toBe(bodyStyle);
  await page.keyboard.press("Escape");
  await page.locator(".canvas-timeline-toggle").click();
  await expect(page.locator(".motion-timeline-dock")).not.toHaveAttribute("data-motion-animating");
  const panel = await page.locator(".motion-timeline").elementHandle();
  await page.getByRole("button", { name: "Compositions", exact: true }).click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole("radio", { name: "Static", exact: true }).click();
    await expect(page.locator(".motion-timeline-dock")).toHaveAttribute("inert");
    await page.getByRole("radio", { name: "Motion", exact: true }).click();
    expect(
      await panel!.evaluate((node) => node === document.querySelector(".motion-timeline")),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Keyframes", exact: true }).click();
    await expect(page.getByRole("button", { name: "Keyframes", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Animations", exact: true }).click();
  }

  const spatial = createSpatialScene();
  spatial.camera.yaw = 0;
  spatial.camera.pitch = 0;
  const cube = createLayer("rectangle", {
    id: "snap-cube",
    x: 760,
    y: 340,
    width: 400,
    height: 400,
    spatial: { ...createSpatialLayer("box"), x: 0.8 },
  });
  const reference = createLayer("rectangle", {
    id: "snap-reference",
    x: 760,
    y: 340,
    width: 400,
    height: 400,
    spatial: { ...createSpatialLayer("box"), y: -2 },
  });
  const fixture = createProject({
    pages: [createPage({ width: 1920, height: 1080, layers: [cube, reference], spatial })],
  });
  await page.evaluate((p) => {
    window.musart!.load(p);
    window.musart!.select(["snap-cube"]);
  }, fixture);
  await ready(page);
  await expect(canvas).toHaveAttribute("data-spatial-center");
  const c = JSON.parse((await canvas.getAttribute("data-spatial-center"))!) as {
    x: number;
    y: number;
  };
  const rect = (await canvas.boundingBox())!;
  const center = { x: rect.x + c.x * rect.width, y: rect.y + c.y * rect.height };
  let handle: { x: number; y: number } | undefined;
  for (const dx of [32, 42, 52, 62, 72]) {
    await page.mouse.move(center.x + dx, center.y);
    const axis = JSON.parse((await canvas.getAttribute("data-spatial-gizmo")) || "{}").axis;
    if (axis === "X") {
      handle = { x: center.x + dx, y: center.y };
      break;
    }
  }
  expect(handle, "native X handle must be pickable").toBeDefined();
  const initial = await page.evaluate(() => ({
    document: JSON.stringify(window.musart!.snapshot().project),
    revision: window.musart!.session().revision,
  }));
  const roots = [".musart-app", ".editor-canvas", ".editor-gpu-scene"];
  const counters = await page.evaluate(
    (roots) => roots.map((s) => document.querySelector<HTMLElement>(s)?.dataset.reactRenders),
    roots,
  );
  await page.mouse.move(handle!.x, handle!.y);
  await page.mouse.down();
  const guides = page.locator("[data-spatial-snap-guides]");
  let engaged = false;
  for (let step = 1; step <= 90; step++) {
    await page.mouse.move(handle!.x - step * 3, handle!.y);
    if (Number(await guides.getAttribute("data-snap-count")) > 0) {
      engaged = true;
      break;
    }
  }
  expect(engaged, "native translation must engage an object alignment guide").toBe(true);
  const alignment = guides.locator("line").first();
  // This target is below the subject; a page-origin cue would have equal Y endpoints.
  expect(
    Number(await alignment.getAttribute("y2")) - Number(await alignment.getAttribute("y1")),
  ).toBeGreaterThan(30);
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
    initial.document,
  );
  expect(
    await page.evaluate(
      (roots) => roots.map((s) => document.querySelector<HTMLElement>(s)?.dataset.reactRenders),
      roots,
    ),
  ).toEqual(counters);
  await page.keyboard.down("Alt");
  await expect(guides).toHaveAttribute("data-snap-count", "0");
  await page.keyboard.up("Alt");
  await expect(guides).not.toHaveAttribute("data-snap-count", "0");
  await page.screenshot({ path: "artifacts/studio-improvements/spatial-snap.png" });
  await page.mouse.up();
  await ready(page);
  await expect(guides).toHaveAttribute("data-snap-count", "0");
  expect(await page.evaluate(() => window.musart!.session().revision)).toBe(initial.revision + 1);
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.spatial!.x),
  ).not.toBe(0.8);
  await page.evaluate(() => window.musart!.undo());
  await ready(page);
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
    initial.document,
  );
  await page.mouse.move(handle!.x, handle!.y);
  await page.mouse.down();
  await page.mouse.move(handle!.x - 60, handle!.y, { steps: 4 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await ready(page);
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
    initial.document,
  );
  await expect(guides).toHaveAttribute("data-snap-count", "0");
  expect(await page.evaluate(() => window.musart!.session().canUndo)).toBe(false);
  const freeScene = createSpatialScene();
  freeScene.camera.yaw = 35;
  freeScene.camera.pitch = 20;
  const free = createProject({
    pages: [createPage({ width: 1920, height: 1080, layers: [cube], spatial: freeScene })],
  });
  await page.evaluate((p) => {
    window.musart!.load(p);
    window.musart!.select(["snap-cube"]);
  }, free);
  await ready(page);
  const freeBefore = await page.evaluate(() => window.musart!.snapshot().project);
  const projected = JSON.parse((await canvas.getAttribute("data-spatial-center"))!) as {
    x: number;
    y: number;
  };
  const freeRect = (await canvas.boundingBox())!;
  const at = {
    x: freeRect.x + projected.x * freeRect.width,
    y: freeRect.y + projected.y * freeRect.height,
  };
  await page.mouse.move(at.x, at.y);
  await expect
    .poll(async () => JSON.parse((await canvas.getAttribute("data-spatial-gizmo")) || "{}").axis)
    .toBe("XYZ");
  await page.mouse.down();
  let freeEngaged = false;
  for (let step = 1; step <= 40; step++) {
    await page.mouse.move(at.x - step * 3, at.y - step);
    if (Number(await guides.getAttribute("data-snap-count")) > 0) {
      freeEngaged = true;
      break;
    }
  }
  expect(freeEngaged, "free translation must engage snapping inside its drag plane").toBe(true);
  await page.screenshot({ path: "artifacts/studio-improvements/free-plane-snap.png" });
  await page.mouse.up();
  await ready(page);
  const freeAfter = await page.evaluate(() => window.musart!.snapshot().project);
  const a = new SpatialGeometry(freeBefore.pages[0]!),
    b = new SpatialGeometry(freeAfter.pages[0]!);
  const from = transformSpatial(a.worldMatrix("snap-cube"), [0, 0, 0]),
    to = transformSpatial(b.worldMatrix("snap-cube"), [0, 0, 0]);
  const yaw = (freeScene.camera.yaw * Math.PI) / 180,
    pitch = (freeScene.camera.pitch * Math.PI) / 180;
  const eye = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const delta = to.slice(0, 3).map((v, i) => v - from[i]!);
  expect(Math.hypot(...delta)).toBeGreaterThan(0.001);
  expect(Math.abs(delta.reduce((sum, v, i) => sum + v * eye[i]!, 0))).toBeLessThan(0.00001);
  await page.evaluate(() => window.musart!.undo());
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(freeBefore);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
  await info.attach("environment", {
    body: JSON.stringify(
      await page.evaluate(() => ({
        ua: navigator.userAgent,
        backend: document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")!.dataset
          .backend,
      })),
    ),
    contentType: "application/json",
  });
});
