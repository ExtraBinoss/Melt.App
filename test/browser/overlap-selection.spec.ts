import { expect, test, type Page } from "@playwright/test";
import { createLayerGeometryIndex, transformPoint } from "@musart/core";
import { overlapSelectionFixture } from "./support/overlap-selection-fixture";
import { installReadbackProbe } from "./support/readback-probe";

async function at(page: Page, point: { x: number; y: number }) {
  const bounds = (await page.getByTestId("artboard").boundingBox())!;
  return {
    x: bounds.x + (bounds.width * point.x) / 640,
    y: bounds.y + (bounds.height * point.y) / 480,
  };
}
const selection = (page: Page) => page.evaluate(() => window.musart!.session().selection);
async function click(page: Page, point: { x: number; y: number }) {
  const client = await at(page, point);
  await page.mouse.click(client.x, client.y);
}
async function openCandidates(page: Page, point: { x: number; y: number }) {
  const client = await at(page, point);
  await page.mouse.click(client.x, client.y, { button: "right" });
  await page.getByRole("menuitem", { name: "Select layer", exact: true }).hover();
  await expect(page.locator('[data-select-layer-id="covered"]')).toBeVisible();
}
async function styles(page: Page) {
  return page.locator("body").evaluate((node) => {
    const computed = getComputedStyle(node);
    return {
      inline: node.getAttribute("style"),
      overflow: computed.overflow,
      pointerEvents: computed.pointerEvents,
      font: computed.fontFamily,
    };
  });
}

for (const mode of ["classic", "studio"] as const)
  test(`${mode}: native source-aware selection, overlap cycling, candidate focus and stable dragging`, async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installReadbackProbe(page);
    await page.addInitScript(() => {
      localStorage.setItem("musart.language", "en");
      localStorage.setItem("musart.editor-tutorial.v1", "done");
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    });
    await page.goto(`/editor?automation=1&workspace=${mode}`);
    await page.waitForFunction(() => Boolean(window.musart));
    const source = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 180;
      canvas.height = 140;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#df6848";
      context.fillRect(90, 0, 90, 140);
      return canvas.toDataURL("image/png");
    });
    const project = overlapSelectionFixture(source),
      pageModel = project.pages[0]!;
    await page.evaluate((value) => window.musart!.load(value), project);
    await expect(page.locator("[data-workspace-mode]").first()).toHaveAttribute(
      "data-workspace-mode",
      mode,
    );
    await expect(
      page.locator('.editor-gpu-scene canvas[data-presentation-ready="true"]'),
    ).toBeVisible();
    const before = await page.evaluate(() => window.musart!.snapshot());
    const index = createLayerGeometryIndex(pageModel);
    const hole = transformPoint(index.worldMatrix("source-ink"), { x: 25, y: 70 });
    const ink = transformPoint(index.worldMatrix("source-ink"), { x: 140, y: 70 });
    // Poll actual native clicks until the asynchronous immutable-source decoder is ready.
    await expect
      .poll(async () => {
        await click(page, hole);
        return selection(page);
      })
      .toEqual(["underlay"]);
    await page.evaluate(() => window.musart!.select([]));
    await click(page, ink);
    expect(await selection(page)).toEqual(["source-ink"]);
    await page.evaluate(() => window.musart!.select([]));
    await click(page, { x: 440, y: 120 });
    expect(await selection(page)).toEqual(["underlay"]);
    await page.evaluate(() => window.musart!.select([]));
    await click(page, { x: 375, y: 120 });
    expect(await selection(page)).toEqual(["donut"]);
    await page.evaluate(() => window.musart!.select([]));
    await click(page, { x: 440, y: 325 });
    expect(await selection(page)).toEqual(["underlay"]);

    const overlap = { x: 180, y: 350 };
    await page.evaluate(() => window.musart!.select([]));
    await click(page, overlap);
    expect(await selection(page)).toEqual(["cover"]);
    await page.keyboard.down("Control");
    await page.keyboard.down("Shift");
    // Capture native input to the first useful selection DOM and a later paint opportunity.
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLElement>(".editor-canvas")!;
      canvas.addEventListener(
        "pointerdown",
        () => {
          const start = performance.now();
          const check = () => {
            if (!document.querySelector('.canvas-selection[data-layer-id="covered"]')) {
              if (performance.now() - start < 5000) requestAnimationFrame(check);
              return;
            }
            const useful = performance.now() - start;
            requestAnimationFrame(() => {
              canvas.dataset.overlapLatency = JSON.stringify({
                useful,
                presentationOpportunity: performance.now() - start,
              });
            });
          };
          requestAnimationFrame(check);
        },
        { once: true, capture: true },
      );
    });
    await click(page, overlap);
    expect(await selection(page)).toEqual(["covered"]);
    await page.keyboard.up("Shift");
    await page.keyboard.up("Control");
    await expect(page.locator(".editor-canvas")).toHaveAttribute(
      "data-overlap-latency",
      /presentationOpportunity/,
    );
    const latency = JSON.parse(
      (await page.locator(".editor-canvas").getAttribute("data-overlap-latency"))!,
    );
    await info.attach("native-overlap-latency", {
      body: JSON.stringify({
        mode,
        browser: browser.version(),
        ...latency,
        note: "Native capture to useful DOM and subsequent RAF; not physical presentation or INP.",
      }),
      contentType: "application/json",
    });

    // Ordinary modifiers still toggle, including a source hit under an affine ancestor.
    for (const modifier of ["Control", "Meta"]) {
      await page.keyboard.down(modifier);
      await click(page, ink);
      expect(await selection(page)).toEqual(["covered", "source-ink"]);
      await click(page, ink);
      expect(await selection(page)).toEqual(["covered"]);
      await page.keyboard.up(modifier);
    }
    expect((await page.evaluate(() => window.musart!.snapshot())).project).toEqual(before.project);
    expect((await page.evaluate(() => window.musart!.session())).revision).toBe(before.revision);

    const body = await styles(page);
    await openCandidates(page, overlap);
    const covered = page.locator('[data-select-layer-id="covered"]');
    await covered.hover();
    await expect(page.locator('.canvas-timeline-hover[data-layer-id="covered"]')).toBeVisible();
    await expect(page.locator(".canvas-timeline-hover-label")).toHaveText("Covered rectangle");
    expect(await styles(page)).toEqual(body);
    await covered.click({ button: "right" });
    expect(await selection(page)).toEqual(["cover"]);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("editor-canvas")).toBeFocused();
    const client = await at(page, overlap);
    await page.mouse.click(client.x, client.y, { button: "right" });
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await expect(covered).toBeFocused();
    await page.keyboard.press("Enter");
    expect(await selection(page)).toEqual(["covered"]);
    await expect(page.getByTestId("editor-canvas")).toBeFocused();
    expect(await styles(page)).toEqual(body);

    // An already selected lower layer stays the drag target through opaque overlap.
    const destination = await at(page, { x: overlap.x + 20, y: overlap.y });
    await page.mouse.move(client.x, client.y);
    await page.mouse.down();
    await page.mouse.move(destination.x, destination.y, { steps: 6 });
    await page.mouse.up();
    const layerX = () =>
      page.evaluate(
        () =>
          window.musart!.snapshot().project.pages[0]!.layers.find(({ id }) => id === "covered")!.x,
      );
    expect(await layerX()).toBeCloseTo(120, 0);
    expect(
      await page.evaluate(
        () =>
          window.musart!.snapshot().project.pages[0]!.layers.find(({ id }) => id === "cover")!.x,
      ),
    ).toBe(100);
    await page.evaluate(() => window.musart!.undo());
    expect(await layerX()).toBe(100);
    await page.evaluate(() => window.musart!.redo());
    expect(await layerX()).toBeCloseTo(120, 0);
    await page.evaluate(() => window.musart!.undo());
    await page.mouse.move(client.x, client.y);
    await page.mouse.down();
    await page.mouse.move(destination.x, destination.y, { steps: 6 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(await layerX()).toBe(100);
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    expect(errors).toEqual([]);
  });
