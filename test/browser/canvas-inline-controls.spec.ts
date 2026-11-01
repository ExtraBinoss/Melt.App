import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject, type Project } from "@musart/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { zoomViewport } from "./support/viewport";
async function start(page: Page) {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await mkdir("artifacts/vector-inline", { recursive: true });
}
async function ready(page: Page) {
  await page.waitForFunction(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas');
    return (
      c?.dataset.rendererReady === "true" && c.dataset.sceneRevision === c.dataset.renderedRevision
    );
  });
  await expect(page.getByTestId("artboard")).toHaveAttribute("data-view-moving", "false");
}

test("the real Melt mascot keeps transform handles until double click, then exposes contrasting screen-sized nodes", async ({
  page,
}) => {
  test.setTimeout(90000);
  await start(page);
  const { project } = JSON.parse(
    await readFile("apps/web/public/templates/motion/morphing-type/morphing-type.json", "utf8"),
  ) as { project: Project };
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["melt-mascot-body"]);
  }, project);
  await ready(page);
  const frame = page.locator('.canvas-selection[data-layer-id="melt-mascot-body"]');
  await expect(frame.locator(".canvas-handle")).toHaveCount(9);
  await expect(page.locator(".vector-canvas-entry button")).toBeVisible();
  const box = (await frame.boundingBox())!;
  const entry = (await page.locator(".vector-canvas-entry button").boundingBox())!,
    grip = (await frame.locator('[data-handle="rotate"]').boundingBox())!;
  expect(entry.height).toBeLessThan(28);
  expect(entry.width).toBeLessThan(130);
  expect(entry.y + entry.height).toBeLessThan(grip.y);
  expect(Math.abs(entry.x + entry.width / 2 - (box.x + box.width / 2))).toBeLessThan(2);
  expect(grip.y - entry.y - entry.height).toBeLessThan(24);
  await page.mouse.dblclick(box.x + box.width * 0.5, box.y + box.height * 0.75);
  const editor = page.locator(".vector-editor-inline"),
    anchors = editor.locator(".vector-anchor");
  await expect(editor).toBeVisible();
  await expect(frame).toHaveCount(0);
  await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
  expect(await anchors.count()).toBeGreaterThan(4);
  const color = await editor
    .locator(".vector-edit-outline:not(.vector-outline-halo)")
    .evaluate((node) => getComputedStyle(node).stroke);
  expect(color).toBe("rgb(0, 0, 0)");
  const original = (await anchors.first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await zoomViewport(page, 0.2);
  const distant = (await anchors.first().boundingBox())!;
  expect(distant.width).toBeCloseTo(original.width, 1);
  expect(distant.height).toBeCloseTo(original.height, 1);
  const baseline = await page.evaluate(() => ({
    revision: window.musart!.snapshot().revision,
    vector: window
      .musart!.snapshot()
      .project.pages[0]!.layers.find((layer) => layer.id === "melt-mascot-body")!.vector,
    render: Number(
      document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas')!.dataset
        .renderCount,
    ),
    commits: [
      ".musart-app",
      ".inspector",
      ".canvas-area",
      ".editor-canvas",
      ".editor-gpu-scene",
    ].map((selector) => document.querySelector<HTMLElement>(selector)?.dataset.reactRenders),
  }));
  const point = (await anchors.first().boundingBox())!;
  await page.mouse.move(point.x + point.width / 2, point.y + point.height / 2);
  await page.mouse.down();
  await page.mouse.move(point.x + point.width / 2 + 6, point.y + point.height / 2 + 4, {
    steps: 4,
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number(
          document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas')!.dataset
            .renderCount,
        ),
      ),
    )
    .toBeGreaterThan(baseline.render);
  expect(
    await page.evaluate(() =>
      [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
        (selector) => document.querySelector<HTMLElement>(selector)?.dataset.reactRenders,
      ),
    ),
  ).toEqual(baseline.commits);
  await page.mouse.up();
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(baseline.revision + 1);
  await page.evaluate(() => window.musart!.undo());
  expect(
    await page.evaluate(
      () =>
        window
          .musart!.snapshot()
          .project.pages[0]!.layers.find((layer) => layer.id === "melt-mascot-body")!.vector,
    ),
  ).toEqual(baseline.vector);
  await page.screenshot({ path: "artifacts/vector-inline/mascot-at-20-percent.png" });
  await page.evaluate(() => {
    const next = structuredClone(window.musart!.snapshot().project);
    next.id = "mascot-replacement";
    window.musart!.load(next);
    window.musart!.select(["melt-mascot-body"]);
  });
  await expect(editor).toHaveCount(0);
  await expect(frame.locator(".canvas-handle")).toHaveCount(9);
  await page.evaluate(() => window.musart!.select(["melt-wordmark"]));
  await expect(page.locator(".vector-canvas-entry")).toHaveCount(0);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});

test("native rotation leaves dimensions upright; artboard modes sit below the board and wipe between values", async ({
  page,
}) => {
  await start(page);
  const project = createProject({
    id: "inline-controls",
    pages: [
      createPage({
        width: 640,
        height: 400,
        layers: [
          createLayer("rectangle", {
            id: "rect",
            x: 160,
            y: 120,
            width: 320,
            height: 160,
            fill: "#8b5cf6",
          }),
        ],
      }),
    ],
  });
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["rect"]);
  }, project);
  await ready(page);
  const frame = page.locator('.canvas-selection[data-layer-id="rect"]'),
    label = frame.locator(".canvas-selection-size");
  const box = (await frame.boundingBox())!,
    rotate = (await frame.locator('[data-handle="rotate"]').boundingBox())!;
  await page.mouse.move(rotate.x + rotate.width / 2, rotate.y + rotate.height / 2);
  await page.mouse.down();
  await page.keyboard.down("Shift");
  await page.mouse.move(box.x + box.width - 12, box.y + 20, { steps: 4 });
  const rotationGuide = page.locator(".canvas-rotation-guide");
  await expect(rotationGuide).toBeVisible();
  const constrained = Number(await rotationGuide.getAttribute("data-angle"));
  expect(constrained % 15).toBe(0);
  await expect(page.locator(".canvas-rotation-angle text")).toHaveText(`${constrained}°`);
  await page.keyboard.up("Shift");
  await expect(rotationGuide).toHaveCount(0);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 24, { steps: 8 });
  const upright = () =>
    label.evaluate((node) => {
      const parent = new DOMMatrix(getComputedStyle(node.parentElement!).transform),
        local = new DOMMatrix(getComputedStyle(node).transform),
        matrix = parent.multiply(local);
      const bounds = node.getBoundingClientRect(),
        body = node.parentElement!.getBoundingClientRect();
      return {
        b: matrix.b,
        c: matrix.c,
        a: matrix.a,
        d: matrix.d,
        width: bounds.width,
        height: bounds.height,
        below: bounds.top >= body.bottom,
        text: node.textContent,
      };
    });
  const during = await upright();
  expect(during.b).toBeCloseTo(0, 5);
  expect(during.c).toBeCloseTo(0, 5);
  expect(during.a).toBeGreaterThan(0);
  expect(during.d).toBeGreaterThan(0);
  expect(during.below).toBe(true);
  expect(during.text).toBe("320 × 160");
  await page.mouse.up();
  await expect(rotationGuide).toHaveCount(0);
  expect(
    Math.abs(
      await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.rotation),
    ),
  ).toBeCloseTo(180, 0);
  for (const rotation of [37, 90, 270]) {
    await page.evaluate(
      (rotation) =>
        window.musart!.execute({
          type: "updateLayers",
          ids: ["rect"],
          patch: { rotation, scaleX: 1.3, scaleY: 0.8 },
        }),
      rotation,
    );
    const pose = await upright();
    expect(pose.b).toBeCloseTo(0, 5);
    expect(pose.c).toBeCloseTo(0, 5);
    expect(pose.a).toBeGreaterThan(0);
    expect(pose.d).toBeGreaterThan(0);
    expect(pose.below).toBe(true);
  }
  const board = (await page.getByTestId("artboard").boundingBox())!,
    footer = page.locator('.artboard-mode-footer[data-active="true"]'),
    footerBox = (await footer.boundingBox())!;
  expect(footerBox.y).toBeGreaterThan(board.y + board.height);
  await page.screenshot({ path: "artifacts/vector-inline/upright-dimensions.png" });
  await page.evaluate(() => window.musart!.select([]));
  await footer.getByRole("radio", { name: "Motion", exact: true }).click();
  await expect(footer.getByRole("radio", { name: "Motion", exact: true })).toBeChecked();
  await expect(page.getByTestId("artboard")).toHaveAttribute("data-view-moving", "false");
  // Record a native switch on the stable shared control, independent of ancestor CSS transforms.
  await footer.evaluate((element) => {
    const root = element.querySelector<HTMLElement>(".segmented-tabs")!,
      indicator = root.querySelector<HTMLElement>("[data-segmented-indicator]")!;
    const evidence = { frames: [] as { at: number; x: number }[], done: false };
    (window as Window & { __wipe?: typeof evidence }).__wipe = evidence;
    root.addEventListener(
      "pointerdown",
      () => {
        const start = performance.now();
        const frame = () => {
          const r = root.getBoundingClientRect(),
            i = indicator.getBoundingClientRect();
          evidence.frames.push({ at: performance.now() - start, x: (i.left - r.left) / r.width });
          if (performance.now() - start < 650) requestAnimationFrame(frame);
          else evidence.done = true;
        };
        requestAnimationFrame(frame);
      },
      { once: true },
    );
  });
  await footer.getByRole("radio", { name: "Static", exact: true }).click();
  await page.waitForFunction(
    () => (window as Window & { __wipe?: { done: boolean } }).__wipe?.done,
  );
  const wipe = await page.evaluate(
    () => (window as Window & { __wipe?: { frames: { at: number; x: number }[] } }).__wipe!,
  );
  const first = wipe.frames[0]!.x,
    last = wipe.frames.at(-1)!.x;
  expect(first - last).toBeGreaterThan(0.2);
  expect(wipe.frames.some((frame) => frame.x > last + 0.03 && frame.x < first - 0.03)).toBe(true);
  await writeFile("artifacts/vector-inline/mode-wipe.json", JSON.stringify(wipe, null, 2));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await footer.getByRole("radio", { name: "Motion", exact: true }).click();
  await expect(footer.getByRole("radio", { name: "Motion", exact: true })).toBeChecked();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))),
      ),
  );
  const alignment = await footer.evaluate((element) => {
    const target = element
        .querySelector<HTMLElement>('[data-state="checked"]')!
        .getBoundingClientRect(),
      indicator = element
        .querySelector<HTMLElement>("[data-segmented-indicator]")!
        .getBoundingClientRect();
    return Math.abs(target.x - indicator.x);
  });
  expect(alignment).toBeLessThan(1);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});

test("library mode filters share the persistent wipe and native keyboard choices", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/dashboard");
  const filter = page.getByRole("radiogroup", { name: "Content mode", exact: true });
  await filter.getByRole("radio", { name: "Motion", exact: true }).click();
  await expect(filter.getByRole("radio", { name: "Motion", exact: true })).toBeChecked();
  await filter
    .locator("[data-segmented-indicator]")
    .evaluate((node) => node.setAttribute("data-native-retained", "true"));
  await filter.getByRole("radio", { name: "Static", exact: true }).click();
  await expect(filter.getByRole("radio", { name: "Static", exact: true })).toBeChecked();
  await expect(filter.locator("[data-segmented-indicator]")).toHaveAttribute(
    "data-native-retained",
    "true",
  );
  await page.keyboard.down("ArrowRight");
  await expect(filter.getByRole("radio", { name: "Motion", exact: true })).toBeFocused();
  await expect(filter.getByRole("radio", { name: "Motion", exact: true })).toBeChecked();
  await page.keyboard.up("ArrowRight");
  await page
    .getByRole("navigation", { name: "Studio navigation", exact: true })
    .getByRole("button", { name: "Projects", exact: true })
    .click();
  await expect(filter).toHaveAttribute("data-animation", "wipe");
  await filter.getByRole("radio", { name: "All", exact: true }).click();
  await expect(filter.getByRole("radio", { name: "All", exact: true })).toBeChecked();
});
