import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createEffect, type Project } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

interface InputSample {
  capture: number;
  timestamp: number;
  revision: number;
  present?: number;
}
interface InputProbe {
  samples: InputSample[];
  previews: number[][];
  stop(): void;
}
declare global {
  interface Window {
    __studioNavigationProbe?: InputProbe;
  }
}
const ready = (page: Page) =>
  page.waitForFunction(() => {
    const c = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
    return (
      c?.dataset.presentationReady === "true" &&
      c.dataset.sceneRevision === c.dataset.renderedRevision
    );
  });

test("Studio Starter plus ink bleed presents native wheel/orbit drafts, keeps one undo and returns to idle", async ({
  page,
}, info) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.goto("/editor?automation=1&workspace=studio");
  await page.waitForFunction(() => !!window.musart);
  const { project } = JSON.parse(
    await readFile("apps/web/public/templates/designed/studio-starter/studio-starter.json", "utf8"),
  ) as { project: Project };
  project.pages[0]!.layers[0]!.effects = [createEffect("ink-bleed")];
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select([]);
  }, project);
  await ready(page);
  const before = await page.evaluate(() => ({
    session: window.musart!.session(),
    camera: window.musart!.snapshot().project.pages[0]!.spatial!.camera,
  }));
  const roots = [".musart-app", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"];
  const originalCounts = await page.evaluate(
    (roots) =>
      roots.map((root) => Number(document.querySelector<HTMLElement>(root)?.dataset.reactRenders)),
    roots,
  );
  await page.evaluate(
    ({ roots, revision }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")!;
      const samples: InputSample[] = [],
        previews: number[][] = [],
        pending = new Set<number>();
      const wheel = (event: WheelEvent) =>
        samples.push({
          capture: performance.now(),
          timestamp: event.timeStamp,
          revision: Number(canvas.dataset.renderedRevision),
        });
      const observer = new MutationObserver(() => {
        if (window.musart!.session().revision === revision)
          previews.push(
            roots.map((root) =>
              Number(document.querySelector<HTMLElement>(root)?.dataset.reactRenders),
            ),
          );
        const completed = Number(canvas.dataset.renderedRevision);
        const eligible = samples.filter(
          (sample) => sample.present === undefined && completed > sample.revision,
        );
        if (!eligible.length) return;
        const first = requestAnimationFrame(() => {
          pending.delete(first);
          const second = requestAnimationFrame(() => {
            pending.delete(second);
            for (const sample of eligible) sample.present ??= performance.now();
          });
          pending.add(second);
        });
        pending.add(first);
      });
      observer.observe(canvas, { attributes: true, attributeFilter: ["data-rendered-revision"] });
      document.addEventListener("wheel", wheel, true);
      window.__studioNavigationProbe = {
        samples,
        previews,
        stop: () => {
          observer.disconnect();
          document.removeEventListener("wheel", wheel, true);
          for (const id of pending) cancelAnimationFrame(id);
        },
      };
    },
    { roots, revision: before.session.revision },
  );
  const box = (await page.getByTestId("editor-canvas").boundingBox())!;
  const x = box.x + box.width * 0.45,
    y = box.y + box.height * 0.6;
  const client = await page.context().newCDPSession(page);
  await page.mouse.move(x, y);
  try {
    await Promise.all(
      Array.from({ length: 8 }, () =>
        client.send("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x,
          y,
          deltaX: 0,
          deltaY: -18,
          timestamp: Date.now() / 1000,
        }),
      ),
    );
    await expect
      .poll(() => page.evaluate(() => window.musart!.session().revision))
      .toBe(before.session.revision + 1);
    await ready(page);
    const wheelCamera = await page.evaluate(
      () => window.musart!.snapshot().project.pages[0]!.spatial!.camera,
    );
    expect(wheelCamera.distance).toBeLessThan(before.camera.distance);
    // Native packets may span several displayed poses. The per-pose lookahead
    // bound is covered by the deterministic burst regression, not the whole gesture.
    expect(wheelCamera.distance).toBeGreaterThanOrEqual(0.2);
    const samples = await page.evaluate(() => window.__studioNavigationProbe!.samples);
    expect(samples.length).toBeGreaterThan(0);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__studioNavigationProbe!.samples.every((s) => s.present !== undefined),
        ),
      )
      .toBe(true);
    const previews = await page.evaluate(() => window.__studioNavigationProbe!.previews);
    expect(previews.length).toBeGreaterThan(0);
    for (const counts of previews) expect(counts).toEqual(originalCounts);
    await page.evaluate(() => window.musart!.undo());
    await ready(page);
    expect(
      await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.spatial!.camera),
    ).toEqual(before.camera);
    expect(await page.evaluate(() => window.musart!.session().canUndo)).toBe(false);
    const orbitRevision = await page.evaluate(() => window.musart!.session().revision);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 75, y - 15, { steps: 6 });
    await page.mouse.up();
    await expect
      .poll(() => page.evaluate(() => window.musart!.session().revision))
      .toBe(orbitRevision + 1);
    await ready(page);
    const orbited = await page.evaluate(
      () => window.musart!.snapshot().project.pages[0]!.spatial!.camera,
    );
    expect(orbited.yaw).not.toBe(before.camera.yaw);
    await page.evaluate(() => window.musart!.undo());
    await ready(page);
    expect(
      await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.spatial!.camera),
    ).toEqual(before.camera);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(1600);
    const canvas = page.locator(".editor-gpu-scene canvas");
    const idle = await canvas.getAttribute("data-render-frames");
    await page.waitForTimeout(200);
    expect(await canvas.getAttribute("data-render-frames")).toBe(idle);
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
      videoFrame: 0,
    });
    const report = await page.evaluate(() => ({
      samples: window.__studioNavigationProbe!.samples,
      backend: document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")!.dataset
        .backend,
      userAgent: navigator.userAgent,
    }));
    await info.attach("native-navigation", {
      body: JSON.stringify(report),
      contentType: "application/json",
    });
  } finally {
    await page.mouse.up();
    await page.evaluate(() => {
      window.__studioNavigationProbe?.stop();
    });
    await client.detach();
  }
});
