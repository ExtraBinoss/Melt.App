import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import {
  selectionIndexFixture,
  profileIndexInput,
  installIndexEnvironment,
  indexEnvironment,
  indexCanvasPoint,
  armIndexPresentation,
  readIndexPresentation,
} from "./support/selection-index-witness";
const sizes = (process.env.MUSART_SPATIAL_SIZES ?? "36").split(",").map(Number);
for (const count of sizes)
  test(`shared selection and hover on ${count} items in static/Animations/Keyframes`, async ({
    page,
    browserName,
    browser,
  }, testInfo) => {
    test.setTimeout(90000);
    expect([36, 500, 1000, 10000]).toContain(count);
    await installReadbackProbe(page);
    await installIndexEnvironment(page);
    await page.addInitScript(() => {
      localStorage.setItem("musart.language", "en");
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    });
    const fixture = selectionIndexFixture(count),
      samples: unknown[] = [];
    await page.goto("/editor?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    const loaded = await page.evaluate((project) => {
      const start = performance.now();
      window.musart!.load(project);
      return performance.now() - start;
    }, fixture.project);
    const ready = async () => {
      await page.waitForFunction(() => {
        const d = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
        return d?.rendererReady === "true" && d.sceneRevision === d.renderedRevision;
      });
      await expect(page.getByTestId("artboard")).toHaveAttribute("data-view-moving", "false");
    };
    await ready();
    const baseline = await page.evaluate(() => ({
      revision: window.musart!.session().revision,
      canUndo: window.musart!.session().canUndo,
    }));
    const choose = async (id: string) =>
      expect(await page.evaluate(() => window.musart!.session().selection)).toEqual([id]);
    for (const mode of ["static", "Animations", "Keyframes"]) {
      if (mode === "Animations") {
        await page.evaluate(
          (ids) =>
            window.musart!.execute({
              type: "setCompositionMode",
              mode: "motion",
              confirmed: true,
              plan: {
                compositionId: "indexed-board",
                revision: window.musart!.session().revision,
                layerIds: [...ids].sort(),
                duration: { value: 2, rate: 1 },
                frameRate: { numerator: 30, denominator: 1 },
                requiresConfirmation: true,
              },
            }),
          fixture.project.pages[0]!.layers.map((layer) => layer.id),
        );
        const target = fixture.targets[2]!;
        await page.evaluate(
          ({ id, x }) =>
            window.musart!.transaction([
              {
                type: "upsertMotionKeyframe",
                target: { kind: "layer", layerId: id, property: "x" },
                time: { value: 0, rate: 1 },
                value: x,
              },
              {
                type: "upsertMotionKeyframe",
                target: { kind: "layer", layerId: id, property: "x" },
                time: { value: 1, rate: 1 },
                value: x + 24,
              },
            ]),
          target,
        );
        await ready();
        const time = page.getByRole("spinbutton", { name: "Current time", exact: true });
        await time.fill("500");
        await time.press("Enter");
        await ready();
        await expect(page.getByRole("button", { name: "Animations", exact: true })).toBeVisible();
      }
      if (mode === "Keyframes") await page.getByRole("button", { name: mode, exact: true }).click();
      await page.evaluate(() => window.musart!.select([]));
      for (const target of fixture.targets.slice(0, 2)) {
        const point = await indexCanvasPoint(page, target);
        await armIndexPresentation(
          page,
          `.canvas-selection[data-layer-id="${target.id}"]`,
          "pointerdown",
          ".editor-canvas",
        );
        await page.mouse.click(point.x, point.y);
        const measurement = await readIndexPresentation(page);
        await choose(target.id);
        samples.push({ mode, surface: "canvas-click", id: target.id, ...measurement });
      }
      if (mode !== "static") {
        const target = { ...fixture.targets[2]!, x: fixture.targets[2]!.x + 12 };
        const point = await indexCanvasPoint(page, target);
        await armIndexPresentation(
          page,
          `.canvas-selection[data-layer-id="${target.id}"]`,
          "pointerdown",
          ".editor-canvas",
        );
        const measurement = await profileIndexInput(
          page,
          `${process.env.MUSART_SPATIAL_VARIANT ?? "candidate"}-${count}-${mode}`,
          async () => {
            await page.mouse.click(point.x, point.y);
            return readIndexPresentation(page);
          },
        );
        samples.push({
          mode,
          surface: "posed-canvas-click",
          id: target.id,
          ...measurement,
        });
        await choose(target.id);
      }
      await page.evaluate(() => window.musart!.select([]));
      const row = page.locator(".layer-row[data-layer-id]").first();
      const rowId = (await row.getAttribute("data-layer-id"))!;
      await page.mouse.move(1, 1);
      await armIndexPresentation(
        page,
        `.canvas-timeline-hover[data-layer-id="${rowId}"]`,
        "pointerover",
        ".layer-row",
      );
      await row.hover();
      samples.push({
        mode,
        surface: "layer-hover",
        id: rowId,
        ...(await readIndexPresentation(page)),
      });
      expect(await page.evaluate(() => window.musart!.session().selection)).toEqual([]);
      if (mode !== "static") {
        const timelineRow = page.locator(".motion-timeline [data-motion-hover-layer]").first();
        const timelineId = (await timelineRow.getAttribute("data-motion-hover-layer"))!;
        await page.mouse.move(1, 1);
        await armIndexPresentation(
          page,
          `.canvas-timeline-hover[data-layer-id="${timelineId}"]`,
          "pointerover",
          ".motion-timeline",
        );
        await timelineRow.locator(".motion-row-label").hover();
        samples.push({
          mode,
          surface: "timeline-hover",
          id: timelineId,
          ...(await readIndexPresentation(page)),
        });
      }
      if (process.env.MUSART_EXPECT_CANVAS_HOVER !== "0") {
        const target = fixture.targets[0]!,
          point = await indexCanvasPoint(page, target);
        await page.mouse.move(1, 1);
        await armIndexPresentation(
          page,
          `.canvas-timeline-hover[data-layer-id="${target.id}"]`,
          "pointermove",
          ".editor-canvas",
        );
        await page.mouse.move(point.x, point.y);
        samples.push({
          mode,
          surface: "canvas-hover",
          id: target.id,
          ...(await readIndexPresentation(page)),
        });
      }
      // A right-drag box uses the same geometry on all three authoring surfaces.
      await page.evaluate(() => window.musart!.select([]));
      const a = fixture.targets[0]!,
        b = fixture.targets[1]!;
      const from = await indexCanvasPoint(page, {
        ...a,
        x: a.x - 12,
        y: a.y - 12,
        width: 0,
        height: 0,
      });
      const to = await indexCanvasPoint(page, {
        ...b,
        x: b.x + b.width + 2,
        y: b.y + b.height + 2,
        width: 0,
        height: 0,
      });
      await page.mouse.move(from.x, from.y);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(to.x, to.y, { steps: 8 });
      await page.mouse.up({ button: "right" });
      const selected = await page.evaluate(() => window.musart!.session().selection);
      const start = Number(a.id.slice("indexed-".length));
      expect(selected).toEqual([start, start + 1, start + 2].map((index) => `indexed-${index}`));
    }
    const state = await page.evaluate(() => ({
      revision: window.musart!.session().revision,
      reads: window.__musartVideoReadbacks,
    }));
    expect(state.revision).toBe(baseline.revision + 2); // Entering Motion + one keyframe transaction; selection/hover are ephemeral.
    expect(state.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    const report = {
      variant: process.env.MUSART_SPATIAL_VARIANT ?? "candidate",
      browserName,
      browserVersion: browser.version(),
      environment: await indexEnvironment(page),
      count,
      loadedMs: loaded,
      samples,
      reads: state.reads,
      boundary:
        "Native dispatch to observed outline and two RAF opportunities; not physical presentation latency. No snapshot in measured frames.",
    };
    await mkdir("artifacts/spatial-index", { recursive: true });
    await writeFile(
      `artifacts/spatial-index/native-${process.env.MUSART_SPATIAL_VARIANT ?? "candidate"}-${count}.json`,
      JSON.stringify(report, null, 2),
    );
    await testInfo.attach("selection-index", {
      body: JSON.stringify(report),
      contentType: "application/json",
    });
  });
