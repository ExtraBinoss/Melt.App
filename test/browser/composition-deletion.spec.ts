import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
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
      c?.dataset.rendererReady === "true" && c.dataset.renderedRevision === c.dataset.sceneRevision
    );
  });
  await expect(page.getByTestId("artboard")).toHaveAttribute("data-view-moving", "false");
  await expect(page.locator(".editor-gpu-scene > .canvas-loading")).toHaveCSS(
    "visibility",
    "hidden",
  );
}
async function remove(page: Page, id: string) {
  await page
    .locator(`.artboard-heading[data-artboard-id="${id}"]`)
    .getByRole("button", { name: `Artboard options: Board ${id}`, exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
}

test("deleting active or inactive compositions keeps surviving artwork still, warm GPU pixels and one retained scene", async ({
  page,
}) => {
  test.setTimeout(60000);
  await start(page);
  const project = createProject({
    id: "deletion-native",
    pages: Array.from({ length: 4 }, (_, i) =>
      createPage({
        id: `p${i}`,
        name: `Board p${i}`,
        width: 240,
        height: 240,
        layers: [
          createLayer("rectangle", {
            id: `item${i}`,
            x: 20,
            y: 20,
            width: 200,
            height: 200,
            fill: ["#ff0000", "#00a000", "#0000ff", "#8b5cf6"][i]!,
          }),
        ],
      }),
    ),
  });
  await page.evaluate((project) => window.musart!.load(project), project);
  await ready(page);
  for (const id of ["p1", "p2", "p3"]) {
    await page.locator(`.artboard-heading[data-artboard-id="${id}"] .artboard-name`).click();
    await ready(page);
  }
  await page
    .locator(".editor-gpu-scene canvas")
    .evaluate((node) => node.setAttribute("data-deletion-witness", "retained"));
  for (const id of ["p0", "p1", "p2"])
    await page
      .locator(`.canvas-artboard-backdrop[data-artboard-id="${id}"]`)
      .evaluate((node) => node.setAttribute("data-deletion-witness", "retained"));
  const beforePasses = await page
    .locator(".editor-gpu-scene canvas")
    .evaluate((node) => JSON.parse((node as HTMLElement).dataset.gpuStats!).passes as number);
  for (const [id, next] of [
    ["p3", "p2"],
    ["p2", "p0"],
  ]) {
    await page.evaluate((id) => {
      const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")!,
        origin = window.musart!.snapshot().revision,
        initial = Array.from(document.querySelectorAll<HTMLElement>(".canvas-artboard-backdrop"))
          .filter((node) => node.dataset.artboardId !== id)
          .map((node) => {
            const r = node.getBoundingClientRect();
            return {
              id: node.dataset.artboardId!,
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
            };
          });
      const evidence = {
        frames: [] as {
          at: number;
          revision: number;
          removed: boolean;
          loader: string;
          zoom: number;
          deltas: number[];
        }[],
        done: false,
        input: 0,
        presented: 0,
        mutations: [] as string[],
      };
      (window as Window & { __deletion?: typeof evidence }).__deletion = evidence;
      const observer = new MutationObserver(() =>
        evidence.mutations.push(
          getComputedStyle(document.querySelector(".editor-gpu-scene > .canvas-loading")!)
            .visibility,
        ),
      );
      observer.observe(canvas, {
        attributes: true,
        attributeFilter: ["data-presentation-ready", "data-page-id"],
      });
      const input = (event: PointerEvent) => {
        if ((event.target as Element).closest('[role="menuitem"]'))
          evidence.input = event.timeStamp;
      };
      window.addEventListener("pointerup", input, true);
      const start = performance.now();
      let committed = 0;
      const frame = () => {
        const revision = window.musart!.snapshot().revision,
          removed = !document.querySelector(`.canvas-artboard-backdrop[data-artboard-id="${id}"]`),
          loader = getComputedStyle(
            document.querySelector(".editor-gpu-scene > .canvas-loading")!,
          ).visibility,
          zoom = Number(
            document.querySelector<HTMLElement>('[data-testid="artboard"]')!.dataset.zoom,
          );
        const deltas = initial.map((before) => {
          const r = document
            .querySelector(`.canvas-artboard-backdrop[data-artboard-id="${before.id}"]`)!
            .getBoundingClientRect();
          return Math.max(
            Math.abs(r.x - before.x),
            Math.abs(r.y - before.y),
            Math.abs(r.width - before.width),
            Math.abs(r.height - before.height),
          );
        });
        if (revision > origin && removed && !committed) committed = performance.now();
        if (
          Number(canvas.dataset.canonicalRevision) > origin &&
          canvas.dataset.rendererReady === "true"
        )
          evidence.presented = Number(canvas.dataset.canonicalPresentedAt);
        if (revision > origin)
          evidence.frames.push({
            at: performance.now() - start,
            revision,
            removed,
            loader,
            zoom,
            deltas,
          });
        if (
          (!committed || performance.now() - committed < 500) &&
          performance.now() - start < 10000
        )
          requestAnimationFrame(frame);
        else {
          evidence.done = true;
          observer.disconnect();
          window.removeEventListener("pointerup", input, true);
        }
      };
      requestAnimationFrame(frame);
    }, id!);
    await remove(page, id!);
    await ready(page);
    expect(await page.evaluate(() => window.musart!.snapshot().pageId)).toBe(next);
    await page.waitForFunction(
      () => (window as Window & { __deletion?: { done: boolean } }).__deletion?.done,
    );
    const evidence = await page.evaluate(
      () =>
        (
          window as Window & {
            __deletion?: {
              frames: { removed: boolean; loader: string; zoom: number; deltas: number[] }[];
              mutations: string[];
            };
          }
        ).__deletion!,
    );
    const rendered = evidence.frames.filter((frame) => frame.removed);
    expect(rendered.length).toBeGreaterThan(2);
    for (const frame of rendered) {
      expect(frame.loader).toBe("hidden");
      expect(frame.zoom).toBe(1);
      expect(Math.max(...frame.deltas)).toBeLessThan(1);
    }
    expect(evidence.mutations.every((value) => value === "hidden")).toBe(true);
    await mkdir("artifacts/composition-deletion", { recursive: true });
    await writeFile(`artifacts/composition-deletion/${id}.json`, JSON.stringify(evidence, null, 2));
  }
  await expect(page.locator(".editor-gpu-scene canvas")).toHaveAttribute(
    "data-deletion-witness",
    "retained",
  );
  for (const id of ["p0", "p1"])
    await expect(
      page.locator(`.canvas-artboard-backdrop[data-artboard-id="${id}"]`),
    ).toHaveAttribute("data-deletion-witness", "retained");
  const output = await page.locator(".editor-gpu-scene canvas").evaluate((node) => ({
    passes: JSON.parse((node as HTMLElement).dataset.gpuStats!).passes,
    instances: (node as HTMLElement).dataset.rendererInstances,
  }));
  expect(output.passes).toBe(beforePasses);
  expect(output.instances).toBe("1");
  await page.evaluate(() => {
    window.musart!.select(["item0"]);
  });
  await remove(page, "p1");
  await ready(page);
  expect(await page.evaluate(() => window.musart!.snapshot().selection)).toEqual(["item0"]);
  expect(await page.evaluate(() => window.musart!.snapshot().pageId)).toBe("p0");
  await page.keyboard.press("Control+z");
  expect(await page.evaluate(() => window.musart!.snapshot().project.pages.length)).toBe(2);
  await page.keyboard.press("Control+Shift+z");
  expect(await page.evaluate(() => window.musart!.snapshot().project.pages.length)).toBe(1);
  await page.screenshot({ path: "artifacts/composition-deletion/final.png" });
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});

test("native panning reaches beyond the old gutter while keeping a useful patch of the artboard visible at every corner", async ({
  page,
}) => {
  await start(page);
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      id: "pan-room-native",
      pages: [createPage({ width: 600, height: 400, background: "#8b5cf6" })],
    }),
  );
  await ready(page);
  await page.locator(".editor-canvas").hover();
  for (const [dx, dy] of [
    [-5000, -5000],
    [5000, 5000],
    [-5000, 5000],
    [5000, -5000],
  ]) {
    await page.mouse.wheel(dx!, dy!);
    await expect
      .poll(async () =>
        Math.abs(Number(await page.getByTestId("artboard").getAttribute("data-pan-x"))),
      )
      .toBeGreaterThan(500);
    const overlap = await page.getByTestId("artboard").evaluate((board) => {
      const a = board.getBoundingClientRect(),
        v = board.closest(".editor-canvas")!.getBoundingClientRect();
      return {
        x: Math.min(a.right, v.right) - Math.max(a.left, v.left),
        y: Math.min(a.bottom, v.bottom) - Math.max(a.top, v.top),
      };
    });
    expect(overlap.x).toBeGreaterThanOrEqual(95.5);
    expect(overlap.y).toBeGreaterThanOrEqual(95.5);
  }
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
});
