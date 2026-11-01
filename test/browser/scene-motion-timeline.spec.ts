import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import {
  createLayer,
  createPage,
  createProject,
  createSpatialLayer,
  createSpatialScene,
  EditorEngine,
} from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";
import { counters, frames } from "./support/motion-canvas";

const output = "artifacts/motion/scene-timeline";
function fixture(id = "scene-owner") {
  const scene = createSpatialScene();
  scene.reflections = { mode: "environment", quality: "draft" };
  scene.lights = [{ ...scene.lights[0]!, id: `${id}-light` }];
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          id,
          width: 240,
          height: 160,
          spatial: scene,
          layers: [
            createLayer("rectangle", {
              id: "box",
              name: "Box",
              width: 80,
              height: 80,
              x: 80,
              y: 40,
              spatial: createSpatialLayer("box"),
            }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({ type: "setMotionDuration", duration: { value: 12, rate: 1 } });
  for (const value of [1, 3])
    engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "environment", compositionId: id, property: "intensity" },
      time: { value, rate: 1 },
      value,
    });
  for (const value of [1, 3])
    engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: "box", property: "x" },
      time: { value, rate: 1 },
      value: 80 + value,
    });
  return engine.getSnapshot().project;
}
async function prepare(page: Page, id?: string) {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/?automation=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select([]);
  }, fixture(id));
  await readyTimeline(page);
}
async function readyTimeline(page: Page) {
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible({
    timeout: 20000,
  });
  const scope = await page.evaluate(() => {
    const snapshot = window.musart!.snapshot();
    return JSON.stringify([snapshot.project.id, snapshot.pageId]);
  });
  const dock = page.locator(".motion-timeline-dock");
  await expect(dock).toHaveAttribute("data-motion-scope", scope);
  if ((await dock.getAttribute("data-motion-pinned")) !== "true") {
    if ((await dock.getAttribute("data-motion-expanded")) !== "true")
      await page.getByRole("button", { name: "Timeline", exact: true }).click();
    const pin = page.getByRole("button", { name: "Pin timeline", exact: true });
    await expect(pin).toBeVisible();
    await pin.click();
  }
  await expect(dock).toHaveAttribute("data-motion-pinned", "true");
}

const owner = (page: Page, kind: string) =>
  page.locator(`.motion-timeline .motion-row[data-motion-scene-owner="${kind}"]:not(.is-property)`);
async function addOrbit(page: Page) {
  await owner(page, "camera").getByRole("button", { name: "Add motion", exact: true }).click();
  const picker = page.locator(".motion-animation-popover");
  await expect(picker.locator(".animation-preset-card")).toHaveCount(2);
  await picker.getByRole("button", { name: "Camera orbit", exact: true }).click();
  await expect(page.locator(".motion-animation-block[data-animation-id]")).toHaveCount(1);
}
async function visibleBlockPoint(block: Locator) {
  return block.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const viewport = node.closest(".motion-timeline-scroll")!.getBoundingClientRect();
    const gutter = node
      .closest(".motion-row")!
      .querySelector(".motion-row-label")!
      .getBoundingClientRect();
    const left = Math.max(rect.left + 8, gutter.right + 8, viewport.left + 8);
    const right = Math.min(rect.right - 8, viewport.right - 8);
    if (right <= left) throw Error("Animation has no visible temporal body");
    const x = left + Math.min(80, (right - left) / 2),
      y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y)?.closest(".motion-animation-block") === node;
    return { x, y, hit, left, right, gutterRight: gutter.right, blockLeft: rect.left };
  });
}
async function point(page: Page, propertyId: string, seconds: number) {
  const row = page.locator(
    `.motion-row[data-labels-only][data-motion-property-id=${JSON.stringify(propertyId)}]`,
  );
  await row.scrollIntoViewIfNeeded();
  await row.evaluate((node, seconds) => {
    const viewport = node.closest<HTMLElement>(".motion-timeline-scroll")!;
    const gutter = node.querySelector(".motion-row-label")!.getBoundingClientRect().width;
    const scale = Number(
      document.querySelector('[aria-label="Timeline zoom"]')!.getAttribute("aria-valuenow"),
    );
    viewport.scrollLeft = Math.max(
      0,
      seconds * scale - Math.min(400, (viewport.clientWidth - gutter) / 2),
    );
  }, seconds);
  await frames(page);
  return row.evaluate((node, seconds) => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      'canvas[data-timeline-canvas="true"]',
    )!;
    const canvasBox = canvas.getBoundingClientRect(),
      row = node.getBoundingClientRect();
    const viewport = node.closest<HTMLElement>(".motion-timeline-scroll")!;
    const viewportBox = viewport.getBoundingClientRect(),
      gutterRight = node.querySelector(".motion-row-label")!.getBoundingClientRect().right;
    const scale = Number(
      document.querySelector('[aria-label="Timeline zoom"]')!.getAttribute("aria-valuenow"),
    );
    const x = canvasBox.x + seconds * scale - viewport.scrollLeft,
      y = row.y + row.height / 2;
    const hit = document.elementFromPoint(x, y);
    const diagnostic = {
      x,
      y,
      scale,
      gutterRight,
      viewportRight: viewportBox.right,
      scrollLeft: viewport.scrollLeft,
      paintedLeft: canvas.dataset.timelineLeft,
      hit: hit?.className,
    };
    if (x <= gutterRight || x >= viewportBox.right)
      throw Error(
        `Requested time is outside visible temporal viewport: ${JSON.stringify(diagnostic)}`,
      );
    return diagnostic;
  }, seconds);
}
async function evidence(page: Page, name: string, extra: unknown) {
  await mkdir(output, { recursive: true });
  await page.locator(".motion-timeline").screenshot({ path: `${output}/${name}.png` });
  await writeFile(
    `${output}/${name}.json`,
    JSON.stringify(
      {
        extra,
        snapshot: await page.evaluate(() => window.musart!.snapshot()),
        readbacks: await page.evaluate(() => window.__musartVideoReadbacks),
      },
      null,
      2,
    ),
  );
}

test("scene rows share action gestures, derived easing and ordinary mixed-key selection without synthetic layers", async ({
  page,
}) => {
  test.setTimeout(60000);
  await prepare(page);
  await expect(owner(page, "camera")).toContainText("Camera");
  await expect(owner(page, "environment")).toContainText("Environment");
  await expect(owner(page, "light")).toContainText("Directional 1");
  await addOrbit(page);
  const before = await page.evaluate(() => window.musart!.snapshot());
  const block = page.locator(".motion-animation-block[data-animation-id]");
  const start = await visibleBlockPoint(block);
  expect(start.hit).toBe(true);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  const commits = await counters(page);
  await page.mouse.move(start.x + 36, start.y, { steps: 4 });
  await frames(page);
  const preview = {
    revision: await page.evaluate(() => window.musart!.snapshot().revision),
    commits: await counters(page),
  };
  await page.mouse.up();
  const moved = await page.evaluate(() => window.musart!.snapshot());
  await evidence(page, "action-move", {
    start,
    beforeRevision: before.revision,
    preview,
    commits,
    movedRevision: moved.revision,
  });
  expect(preview.revision).toBe(before.revision);
  expect(preview.commits).toEqual(commits);
  expect(moved.revision).toBe(before.revision + 1);
  expect(moved.project.pages[0]!.motion!.sceneAnimations![0]!.owner).toEqual({
    kind: "camera",
    compositionId: "scene-owner",
  });
  expect(moved.project.pages[0]!.layers).toHaveLength(1);
  expect(moved.project.pages[0]!.motion!.tracks.every((track) => !track.animations?.length)).toBe(
    true,
  );
  await page.evaluate(() => window.musart!.undo());
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before.project);
  const cancelPoint = await visibleBlockPoint(block);
  expect(cancelPoint.hit).toBe(true);
  await page.mouse.move(cancelPoint.x, cancelPoint.y);
  await page.mouse.down();
  const cancelRevision = await page.evaluate(() => window.musart!.snapshot().revision);
  await page.mouse.move(cancelPoint.x + 30, cancelPoint.y, { steps: 3 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(cancelRevision);
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before.project);
  await block.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Edit animation", exact: true }).click();
  await expect(
    page.locator('.inspector [data-scene-animations="camera"] .animation-detail-channel'),
  ).toBeVisible();
  await expect(
    page.locator(".inspector").getByRole("button", { name: "Camera", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Keyframes", exact: true }).click();
  const info = await page.evaluate(() => {
    const motion = window.musart!.snapshot().project.pages[0]!.motion!;
    return {
      actionId: motion.sceneAnimations![0]!.id,
      scene: motion.sceneProperties![0]!,
      layer: motion.tracks[0]!.properties[0]!,
    };
  });
  const cameraRow = page.locator(
    '.motion-row[data-labels-only][data-motion-scene-owner="camera"].is-property',
  );
  await expect(cameraRow).toContainText("Camera orbit");
  const derivedId = await cameraRow.getAttribute("data-motion-property-id");
  const middle = await point(page, derivedId!, 4);
  const cameraHeader = (await owner(page, "camera").boundingBox())!;
  await page.mouse.click(middle.x, cameraHeader.y + cameraHeader.height / 2);
  const temporalCanvas = page.locator('canvas[data-timeline-canvas="true"]');
  await expect(temporalCanvas).toHaveAttribute("data-timeline-selected-keys", "0");
  await page.mouse.click(middle.x, middle.y);
  await expect(temporalCanvas).toHaveAttribute("data-timeline-selected-keys", "1");
  const derivedBefore = await page.evaluate(
    () => window.musart!.snapshot().project.pages[0]!.motion!.sceneAnimations![0],
  );
  await evidence(page, "derived-before", {
    selectedKeys: await temporalCanvas.getAttribute("data-timeline-selected-keys"),
    animation: derivedBefore,
    middle,
  });
  await page.mouse.move(middle.x, middle.y);
  await expect(page.locator(".motion-canvas-active-overlay .motion-key")).toBeVisible();
  await page.mouse.down();
  await page.mouse.move(middle.x + 24, middle.y, { steps: 3 });
  await page.mouse.up();
  await evidence(page, "derived-after", {
    selectedKeys: await temporalCanvas.getAttribute("data-timeline-selected-keys"),
    animation: await page.evaluate(
      () => window.musart!.snapshot().project.pages[0]!.motion!.sceneAnimations![0],
    ),
  });
  expect(
    await page.evaluate(
      () =>
        window.musart!.snapshot().project.pages[0]!.motion!.sceneAnimations![0]!.preset.channels[0]!
          .points[1]!.at,
    ),
  ).toBeGreaterThan(0.5);
  await page.evaluate(() => window.musart!.undo());
  const curve = await point(page, derivedId!, 2);
  await page.mouse.move(curve.x, curve.y);
  const easing = page.locator(".motion-canvas-active-overlay .motion-easing-segment");
  await expect(easing).toBeVisible();
  await easing.click();
  await expect(page.getByRole("dialog", { name: "Easing", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const layer = await point(page, info.layer.id, 1);
  await page.mouse.click(layer.x, layer.y);
  await page.keyboard.down("Shift");
  const direct = await point(page, info.scene.id, 1);
  await page.mouse.click(direct.x, direct.y);
  await page.keyboard.up("Shift");
  const selectedRevision = await page.evaluate(() => window.musart!.snapshot().revision);
  await page.mouse.move(direct.x, direct.y);
  await page.mouse.down();
  await page.mouse.move(direct.x + 24, direct.y, { steps: 3 });
  await page.mouse.up();
  const mixed = await page.evaluate(() => window.musart!.snapshot());
  const mixedFocus = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    className: document.activeElement?.className,
    insideTimeline: !!document.activeElement?.closest(".motion-timeline"),
  }));
  await evidence(page, "mixed-keys", { selectedRevision, mixedFocus });
  expect(mixedFocus.insideTimeline).toBe(true);
  expect(mixed.revision).toBe(selectedRevision + 1);
  expect(mixed.project.pages[0]!.motion!.sceneProperties![0]!.keyframes[0]!.time).toEqual(
    mixed.project.pages[0]!.motion!.tracks[0]!.properties[0]!.keyframes[0]!.time,
  );
  expect(mixed.project.pages[0]!.motion!.sceneProperties![0]!.keyframes[0]!.time.value).not.toBe(1);
  await page.keyboard.press("Delete");
  expect(
    await page.evaluate(
      () =>
        window.musart!.snapshot().project.pages[0]!.motion!.sceneProperties![0]!.keyframes.length,
    ),
  ).toBe(1);
  await page.evaluate(() => window.musart!.undo());
  expect(
    await page.evaluate(
      () =>
        window.musart!.snapshot().project.pages[0]!.motion!.sceneProperties![0]!.keyframes.length,
    ),
  ).toBe(2);
  await page.getByRole("button", { name: "Animations", exact: true }).click();
  await owner(page, "light").getByRole("button", { name: "Add motion", exact: true }).click();
  await page
    .locator(".motion-animation-popover")
    .getByRole("button", { name: "Light pulse", exact: true })
    .click();
  const lightBlock = page.locator(
    '.motion-row[data-motion-scene-owner="light"] .motion-animation-block',
  );
  await expect(
    page.locator('[data-slot="popover-content"] [data-scene-animations="light"]'),
  ).toHaveCount(0);
  await lightBlock.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Edit animation", exact: true }).click();
  await expect(
    page.locator(
      '[data-slot="popover-content"] [data-scene-animations="light"] .animation-detail-channel',
    ),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    canvas: 0,
    webgl: 0,
    videoFrame: 0,
  });
  await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
});

test("scene Save preset and My presets bind a recipe to a different real owner", async ({
  page,
}) => {
  test.setTimeout(60000);
  await prepare(page);
  await addOrbit(page);
  await page.locator(".motion-animation-block[data-animation-id]").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Save as preset", exact: true }).click();
  const save = page
    .locator('[data-slot="popover-content"]')
    .filter({ has: page.getByRole("textbox", { name: "Preset name", exact: true }) });
  await save.getByRole("textbox", { name: "Preset name", exact: true }).fill("Reusable camera");
  await save.getByRole("button", { name: "Save as preset", exact: true }).click();
  await expect(save).toBeHidden();
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select([]);
  }, fixture("new-scene-owner"));
  await readyTimeline(page);
  await owner(page, "camera").getByRole("button", { name: "Add motion", exact: true }).click();
  const picker = page.locator(".motion-animation-popover");
  await picker.getByRole("radio", { name: "My presets", exact: true }).click();
  await picker.getByRole("button", { name: "Reusable camera", exact: true }).click();
  const snapshot = await page.evaluate(() => window.musart!.snapshot());
  await evidence(page, "saved-owner", {});
  const action = snapshot.project.pages[0]!.motion!.sceneAnimations![0]!;
  expect(action.owner).toEqual({ kind: "camera", compositionId: "new-scene-owner" });
  expect(JSON.stringify(action.preset)).not.toMatch(/scene-owner|lightId|layerId|compositionId/);
  expect(snapshot.project.pages[0]!.layers).toHaveLength(1);
  expect(snapshot.selection).toEqual([]);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    canvas: 0,
    webgl: 0,
    videoFrame: 0,
  });
});
