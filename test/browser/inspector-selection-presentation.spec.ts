import { expect, test } from "@playwright/test";
import {
  createLayerGeometryIndex,
  createProject,
  transformPoint,
  type Composition,
} from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { createTechnoArtboard } from "../../apps/web/src/services/projects/templates/afterhours-techno/build";

function targets(composition: Composition) {
  const geometry = createLayerGeometryIndex(composition);
  const picks = new Map<
    string,
    { id: string; kind: string; x: number; y: number; localX: number }
  >();
  // Cold text comes first: its Inspector controls must not be warmed before the click.
  const layers = [...composition.layers].sort((a, b) =>
    a.kind === "text" ? -1 : b.kind === "text" ? 1 : 0,
  );
  for (const layer of layers) {
    if (picks.has(layer.kind) || geometry.isLocked(layer.id)) continue;
    for (const x of [0.5, 0.25, 0.75]) {
      const point = transformPoint(geometry.worldMatrix(layer.id), {
        x: layer.width * x,
        y: layer.height / 2,
      });
      if (
        ![-3, 0, 3].every((dx) =>
          [-3, 0, 3].every(
            (dy) => geometry.hitTest({ x: point.x + dx, y: point.y + dy })?.id === layer.id,
          ),
        )
      )
        continue;
      picks.set(layer.kind, { id: layer.id, kind: layer.kind, localX: layer.x, ...point });
      break;
    }
  }
  return [...picks.values()];
}

test("native selection publishes Inspector values after the outline without background starvation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  let sequence = 0;
  const composition = createTechnoArtboard(() => `inspector-presentation-${++sequence}`);
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({ pages: [composition] }),
  );
  await page.waitForFunction(() => {
    const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
    return data?.rendererReady === "true" && data.sceneRevision === data.renderedRevision;
  });
  const picks = targets(composition);
  expect(picks.length).toBeGreaterThanOrEqual(2);
  const profiler = process.env.MUSART_SELECTION_PROFILE
    ? await page.context().newCDPSession(page)
    : undefined;
  if (profiler) {
    await profiler.send("Profiler.enable");
    await profiler.send("Profiler.setSamplingInterval", { interval: 1000 });
    await profiler.send("Profiler.start");
  }
  const samples = [];
  for (const target of [...picks, picks[0]!]) {
    const point = await page
      .locator(`.canvas-artboard-backdrop[data-artboard-id="${composition.id}"]`)
      .evaluate((element, target) => {
        const box = element.getBoundingClientRect();
        return {
          x: box.x + (target.x * box.width) / (element as HTMLElement).offsetWidth,
          y: box.y + (target.y * box.height) / (element as HTMLElement).offsetHeight,
        };
      }, target);
    await page.mouse.move(point.x, point.y);
    await page.evaluate((target) => {
      const probe = { ready: false, result: null as unknown };
      Object.assign(window, { __inspectorSelectionProbe: probe });
      window.addEventListener(
        "pointerdown",
        (event) => {
          const start = event.timeStamp;
          let frame = 0,
            outlineFrame = 0,
            inspectorFrame = 0,
            outlineMs = 0,
            inspectorMs = 0;
          const check = () => {
            frame++;
            if (
              !outlineFrame &&
              document.querySelector(`.canvas-selection[data-layer-id="${CSS.escape(target.id)}"]`)
            ) {
              outlineFrame = frame;
              outlineMs = performance.now() - start;
            }
            const inspector = document.querySelector<HTMLElement>(".inspector");
            const x = inspector?.querySelector<HTMLInputElement>('input[aria-label="X"]');
            if (
              !inspectorFrame &&
              inspector?.dataset.selectedLayerId === target.id &&
              x &&
              Math.abs(Number(x.value) - target.localX) < 0.001
            ) {
              inspectorFrame = frame;
              inspectorMs = performance.now() - start;
            }
            if (outlineFrame && inspectorFrame)
              requestAnimationFrame(() => {
                probe.result = {
                  outlineFrame,
                  inspectorFrame,
                  outlineMs,
                  inspectorMs,
                  presentationMs: performance.now() - start,
                };
              });
            else if (frame < 120) requestAnimationFrame(check);
            else probe.result = { error: "Selection did not present", target };
          };
          requestAnimationFrame(check);
        },
        { capture: true, once: true },
      );
      probe.ready = true;
    }, target);
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() =>
      Boolean(
        (
          window as unknown as {
            __inspectorSelectionProbe: { result: unknown };
          }
        ).__inspectorSelectionProbe.result,
      ),
    );
    samples.push({
      target,
      ...(await page.evaluate(
        () =>
          (
            window as unknown as {
              __inspectorSelectionProbe: {
                result: {
                  outlineFrame: number;
                  inspectorFrame: number;
                  outlineMs: number;
                  inspectorMs: number;
                  presentationMs: number;
                  error?: string;
                };
              };
            }
          ).__inspectorSelectionProbe.result,
      )),
    });
  }
  const environment = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    return {
      userAgent: navigator.userAgent,
      dpr: devicePixelRatio,
      adapter: adapter
        ? {
            vendor: adapter.info.vendor,
            architecture: adapter.info.architecture,
            description: adapter.info.description,
          }
        : null,
    };
  });
  await mkdir("artifacts/inspector-selection", { recursive: true });
  if (profiler) {
    const { profile } = await profiler.send("Profiler.stop");
    await writeFile("artifacts/inspector-selection/diagnostic.cpuprofile", JSON.stringify(profile));
    await profiler.detach();
  }
  await writeFile(
    `artifacts/inspector-selection/${process.env.MUSART_SELECTION_COHORT ?? "latest"}.json`,
    JSON.stringify(
      {
        browser: page.context().browser()!.version(),
        environment,
        samples,
      },
      null,
      2,
    ),
  );
  for (const sample of samples) {
    expect(sample.error).toBeUndefined();
    expect(
      sample.inspectorFrame - sample.outlineFrame,
      `${sample.target.kind}: Inspector must publish by the second opportunity after the outline`,
    ).toBeLessThanOrEqual(2);
  }
});
