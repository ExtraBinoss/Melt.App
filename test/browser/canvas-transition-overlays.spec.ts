import { expect, test, type Page } from "@playwright/test";
import { createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
async function start(page: Page) {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
}
async function ready(page: Page) {
  await page.waitForFunction(() => {
    const c = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
    return (
      c?.dataset.rendererReady === "true" && c.dataset.sceneRevision === c.dataset.renderedRevision
    );
  });
  await expect(page.getByTestId("artboard")).toHaveAttribute("data-view-moving", "false");
}
async function recordSwitch(page: Page, id: string, removeId?: string) {
  await page.evaluate((id) => {
    const box = document
        .querySelector('.canvas-artboard-backdrop[data-artboard-id="still"]')!
        .getBoundingClientRect(),
      initial = { x: box.x, y: box.y, width: box.width, height: box.height },
      start = performance.now();
    let entered = 0;
    const evidence = {
      done: false,
      inputTimestamp: 0,
      nextFrameTimestamp: 0,
      secondFrameTimestamp: 0,
      maxFrameGap: 0,
      initial,
      frames: [] as {
        deltas: number[];
        bodyY: number | null;
        exiting: number;
        zoom: number;
        canvasHeight: number;
      }[],
    };
    (window as Window & { __dockSwitch?: typeof evidence }).__dockSwitch = evidence;
    window.addEventListener(
      "pointerdown",
      (event) => {
        evidence.inputTimestamp = event.timeStamp;
      },
      { capture: true, once: true },
    );
    let previousFrame = 0;
    const frame = (time: number) => {
      if (evidence.inputTimestamp) {
        if (!evidence.nextFrameTimestamp) evidence.nextFrameTimestamp = performance.now();
        else if (!evidence.secondFrameTimestamp) evidence.secondFrameTimestamp = performance.now();
        if (previousFrame)
          evidence.maxFrameGap = Math.max(evidence.maxFrameGap, time - previousFrame);
      }
      previousFrame = time;
      if (window.musart!.snapshot().pageId === id) {
        if (!entered) entered = performance.now();
        const rect = document
            .querySelector('.canvas-artboard-backdrop[data-artboard-id="still"]')!
            .getBoundingClientRect(),
          surface = document.querySelector<HTMLElement>(
            '.motion-timeline-dock:not([data-motion-exiting="true"]) .motion-timeline-surface',
          ),
          canvas = document.querySelector<HTMLElement>(".editor-canvas")!;
        evidence.frames.push({
          deltas: [
            Math.abs(rect.x - initial.x),
            Math.abs(rect.y - initial.y),
            Math.abs(rect.width - initial.width),
            Math.abs(rect.height - initial.height),
          ],
          bodyY: surface ? new DOMMatrix(getComputedStyle(surface).transform).m42 : null,
          exiting: document.querySelectorAll(
            '.motion-timeline-dock[data-motion-exiting="true"][inert]',
          ).length,
          zoom: Number(
            document.querySelector<HTMLElement>('[data-testid="artboard"]')!.dataset.zoom,
          ),
          canvasHeight: canvas.clientHeight,
        });
      }
      if ((!entered || performance.now() - entered < 850) && performance.now() - start < 10000)
        requestAnimationFrame(frame);
      else evidence.done = true;
    };
    requestAnimationFrame(frame);
  }, id);
  if (removeId) {
    await page
      .locator(`.artboard-heading[data-artboard-id="${removeId}"]`)
      .getByRole("button", { name: "Artboard options: Motion board", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  } else await page.locator(`.artboard-heading[data-artboard-id="${id}"] .artboard-name`).click();
  await page.waitForFunction(
    () => (window as Window & { __dockSwitch?: { done: boolean } }).__dockSwitch?.done,
  );
  await ready(page);
  return page.evaluate(
    () =>
      (
        window as Window & {
          __dockSwitch?: {
            initial: object;
            frames: {
              deltas: number[];
              bodyY: number | null;
              exiting: number;
              zoom: number;
              canvasHeight: number;
            }[];
          };
        }
      ).__dockSwitch!,
  );
}

test("switching Static and Motion animates the timeline without jumping or stretching the canvas, including restored pins", async ({
  page,
}) => {
  test.setTimeout(60000);
  await start(page);
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      id: "dock-presence-native",
      pages: [
        createPage({ id: "still", name: "Static board", width: 400, height: 280 }),
        createPage({
          id: "moving",
          name: "Motion board",
          width: 400,
          height: 280,
          motion: {
            version: 1,
            initialized: true,
            mode: "motion",
            duration: { value: 5, rate: 1 },
            frameRate: { numerator: 30, denominator: 1 },
            tracks: [],
          },
        }),
      ],
    }),
  );
  await ready(page);
  const revision = await page.evaluate(() => window.musart!.snapshot().revision);
  const peek = await recordSwitch(page, "moving");
  expect(peek.frames.length).toBeGreaterThan(3);
  expect(
    new Set(
      peek.frames.map((frame) => (frame.bodyY === null ? null : Math.round(frame.bodyY * 100))),
    ).size,
  ).toBeGreaterThan(3);
  await page.getByRole("button", { name: "Pin timeline", exact: true }).click();
  await expect(
    page.locator('.motion-timeline-dock:not([data-motion-exiting="true"])'),
  ).toHaveAttribute("data-motion-pinned", "true");
  await expect(
    page.locator('.motion-timeline-dock:not([data-motion-exiting="true"])'),
  ).not.toHaveAttribute("data-motion-animating");
  await page.evaluate(() => {
    (window as Window & { __retainedTimeline?: Element | null }).__retainedTimeline =
      document.querySelector(".motion-timeline");
  });
  const hidden = await recordSwitch(page, "still");
  expect(hidden.frames.some((frame) => frame.exiting > 0)).toBe(true);
  await expect(page.getByRole("region", { name: "Timeline", exact: true })).toHaveCount(0);
  const pinned = await recordSwitch(page, "moving");
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __retainedTimeline?: Element | null }).__retainedTimeline ===
        document.querySelector(".motion-timeline"),
    ),
  ).toBe(true);
  await expect(
    page.locator('.motion-timeline-dock:not([data-motion-exiting="true"])'),
  ).toHaveAttribute("data-motion-pinned", "true");
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(revision);
  const deleted = await recordSwitch(page, "still", "moving");
  for (const evidence of [peek, hidden, pinned, deleted])
    for (const frame of evidence.frames) {
      expect(Math.max(...frame.deltas)).toBeLessThan(1);
      expect(frame.zoom).toBe(1);
    }
  expect(new Set(pinned.frames.map((frame) => Math.round(frame.bodyY ?? -1))).size).toBeGreaterThan(
    3,
  );
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(revision + 1);
  await mkdir("artifacts/composition-deletion", { recursive: true });
  await writeFile(
    "artifacts/composition-deletion/dock-switch.json",
    JSON.stringify({ peek, hidden, pinned, deleted }, null, 2),
  );
  await page.screenshot({ path: "artifacts/composition-deletion/dock-switch.png" });
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});

test("the live selection rectangle paints continuously across the artboard heading bar", async ({
  page,
}) => {
  await start(page);
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      id: "marquee-overlay-native",
      pages: [createPage({ id: "overlay", name: "Overlay board", width: 1920, height: 1080 })],
    }),
  );
  await ready(page);
  const inspection = await page.context().newPage();
  await page.bringToFront();
  const heading = (await page
      .locator('.artboard-heading[data-artboard-id="overlay"]')
      .boundingBox())!,
    board = (await page.getByTestId("artboard").boundingBox())!,
    sample = { x: Math.round(board.x + 250), y: Math.round(heading.y + heading.height / 2) },
    clip = { x: sample.x - 1, y: sample.y - 1, width: 3, height: 3 };
  const before = await page.screenshot({ clip });
  await page.mouse.move(board.x + 160, heading.y - 55);
  await page.mouse.down();
  await page.mouse.move(board.x + 360, board.y + 100, { steps: 8 });
  const marquee = page.locator(".canvas-marquee");
  await expect(marquee).toBeVisible();
  expect(await marquee.evaluate((node) => Boolean(node.closest('[data-testid="artboard"]')))).toBe(
    false,
  );
  const after = await page.screenshot({ clip });
  const difference = await inspection.evaluate(
    async ([before, after]) => {
      const decode = async (base64: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return context.getImageData(1, 1, 1, 1).data;
      };
      const a = await decode(before!),
        b = await decode(after!);
      return [0, 1, 2].reduce((sum, i) => sum + Math.abs(a[i]! - b[i]!), 0);
    },
    [before.toString("base64"), after.toString("base64")],
  );
  await inspection.close();
  await page.bringToFront();
  expect(difference).toBeGreaterThan(8);
  await mkdir("artifacts/composition-deletion", { recursive: true });
  await page.screenshot({ path: "artifacts/composition-deletion/marquee-over-heading.png" });
  await page.mouse.up();
  await expect(marquee).toBeHidden();
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});
