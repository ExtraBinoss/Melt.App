import { expect, test, type Page } from "@playwright/test";

interface ModeSample {
  mode: "solid" | "gradient";
  generatedAt: number;
  capturedAt: number;
  uiReadyAt: number;
  drawReadyAt: number;
  presentationOpportunityAt: number;
}
declare global {
  interface Window {
    __paintModeSample?: ModeSample;
  }
}

/** Actual native activation clocks: canonical state, usable controls, then a new draw. */
async function armMode(page: Page, mode: ModeSample["mode"]) {
  await page.evaluate((mode) => {
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")!,
      before = Number(canvas.dataset.sceneRevision);
    delete window.__paintModeSample;
    window.addEventListener(
      "pointerdown",
      (event) => {
        const sample: ModeSample = {
          mode,
          generatedAt: event.timeStamp,
          capturedAt: performance.now(),
          uiReadyAt: 0,
          drawReadyAt: 0,
          presentationOpportunityAt: 0,
        };
        const deadline = performance.now() + 8000;
        const check = () => {
          const radio = document.querySelector<HTMLElement>(`[data-segmented-value="${mode}"]`),
            field = document.querySelector<HTMLInputElement>("[data-gradient-hex]"),
            solid = document.querySelector<HTMLInputElement>(".color-value input"),
            visible = mode === "gradient" ? field : solid,
            canonical = radio?.getAttribute("data-state") === "checked";
          if (
            canonical &&
            radio?.getAttribute("data-state") === "checked" &&
            visible?.checkVisibility()
          )
            sample.uiReadyAt ||= performance.now();
          if (
            canonical &&
            Number(canvas.dataset.sceneRevision) > before &&
            canvas.dataset.sceneRevision === canvas.dataset.renderedRevision
          )
            sample.drawReadyAt ||= performance.now();
          if (sample.uiReadyAt && sample.drawReadyAt) {
            requestAnimationFrame(() => {
              sample.presentationOpportunityAt = performance.now();
              window.__paintModeSample = sample;
            });
          } else if (performance.now() < deadline) requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      },
      { capture: true, once: true },
    );
  }, mode);
}

test("Angel Solid/Gradient activations report input-to-controls and new-draw latency", async ({
  page,
}, info) => {
  await page.addInitScript(() => localStorage.setItem("musart.language", "en"));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(async () => {
    const manifest = await fetch("/templates/motion/angel-windows.json").then((response) =>
      response.json(),
    );
    window.musart!.load(manifest.project);
  });
  await page.waitForFunction(() => {
    const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
    return data?.rendererReady === "true" && data.sceneRevision === data.renderedRevision;
  });
  await page.evaluate(() => window.musart!.flushThumbnails());
  const baseline = await page.evaluate(() => window.musart!.snapshot().revision),
    samples: ModeSample[] = [];
  let retained: ReturnType<Page["locator"]> | undefined;
  for (let index = 0; index < 6; index++) {
    const mode = index % 2 === 0 ? "gradient" : "solid",
      button = page.getByRole("radio", {
        name: mode === "gradient" ? "Gradient" : "Solid",
        exact: true,
      });
    await button.scrollIntoViewIfNeeded();
    const box = (await button.boundingBox())!;
    await armMode(page, mode);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => Boolean(window.__paintModeSample));
    samples.push((await page.evaluate(() => window.__paintModeSample))!);
    const snapshot = await page.evaluate(() => window.musart!.snapshot());
    expect(snapshot.revision).toBe(baseline + index + 1);
    expect(Boolean(snapshot.project.pages[0]!.backgroundGradient)).toBe(mode === "gradient");
    if (index === 0) {
      retained = page.locator("[data-gradient-hex]").first();
      await retained.evaluate((node) => node.setAttribute("data-mode-witness", "retained"));
    }
    if (mode === "gradient")
      await expect(retained!).toHaveAttribute("data-mode-witness", "retained");
  }
  await page.evaluate(() => window.musart!.undo());
  expect(
    await page.evaluate(() =>
      Boolean(window.musart!.snapshot().project.pages[0]!.backgroundGradient),
    ),
  ).toBe(true);
  console.log(
    "COLOR_MODE_LATENCY",
    JSON.stringify(
      samples.map((sample) => ({
        mode: sample.mode,
        controlsMs: sample.uiReadyAt - sample.capturedAt,
        newDrawMs: sample.drawReadyAt - sample.capturedAt,
        presentationMs: sample.presentationOpportunityAt - sample.capturedAt,
      })),
    ),
  );
  await info.attach("native-mode-latency", {
    contentType: "application/json",
    body: JSON.stringify(
      {
        browser: page.context().browser()!.version(),
        samples: samples.map((sample) => ({
          ...sample,
          generatedToCaptureMs: sample.capturedAt - sample.generatedAt,
          captureToControlsMs: sample.uiReadyAt - sample.capturedAt,
          captureToDrawMs: sample.drawReadyAt - sample.capturedAt,
          captureToPresentationOpportunityMs: sample.presentationOpportunityAt - sample.capturedAt,
        })),
        limitation:
          "RAF/new-draw-marker opportunities do not establish physical display latency or INP.",
      },
      null,
      2,
    ),
  });
});
