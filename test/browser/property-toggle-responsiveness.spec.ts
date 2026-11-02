import { expect, test, type Page } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { startEditorTrace } from "./support/editor-action-probe";

interface PropertySample {
  action: string;
  canonical: boolean;
  trusted: boolean;
  generatedAt: number;
  dispatchAt: number;
  expectedRevision: number;
  appliedRevision?: number;
  observedRevision?: number;
  presentedAt?: number;
  secondRafAt?: number;
}
declare global {
  interface Window {
    __propertyBurst?: { samples: PropertySample[]; stop(): void };
  }
}
const surfaces = [
  ".musart-app",
  ".inspector",
  ".canvas-area",
  ".editor-canvas",
  ".editor-gpu-scene",
];
async function settled(page: Page) {
  await page.waitForFunction(() => {
    const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
    return (
      data?.rendererReady === "true" &&
      Number(data.canonicalRevision) === window.musart!.session().revision
    );
  });
  await page.waitForFunction(() =>
    window.__propertyBurst?.samples.every((sample) => sample.secondRafAt),
  );
}
async function counters(page: Page) {
  return page.evaluate(
    (selectors) =>
      Object.fromEntries(
        selectors.map((selector) => [
          selector,
          Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders),
        ]),
      ),
    surfaces,
  );
}

test("native outline, hard-shadow, opacity and visibility bursts retain every command across 200 mixed layers", async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await page.routeWebSocket("**", () => {});
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const layers = Array.from({ length: 199 }, (_, index) => {
    const common = {
      id: `property-background-${index}`,
      x: (index % 20) * 32,
      y: Math.floor(index / 20) * 32,
      width: 24,
      height: 24,
      fill: "#2563eb",
    };
    if (index < 9) return createLayer("text", { ...common, text: `T${index}`, fontSize: 18 });
    if (index < 19)
      return createLayer("vector", {
        ...common,
        vector: { viewBox: "0 0 24 24", path: "M0 0H24V24H0Z" },
      });
    return createLayer("rectangle", common);
  });
  const shadow = createEffect("shadow", {
    amount: 0.4,
    settings: { radius: 0, offsetX: 24, offsetY: 30, shadowColor: "#ff0000" },
  });
  const subject = createLayer("text", {
    id: "property-subject",
    name: "Property subject",
    x: 150,
    y: 120,
    width: 300,
    height: 100,
    text: "Outline",
    fontSize: 64,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 4,
    effects: [shadow],
  });
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["property-subject"]);
    },
    createProject({
      id: "native-property-burst",
      pages: [
        createPage({
          id: "property-board",
          width: 640,
          height: 320,
          layers: [...layers, subject],
        }),
      ],
    }),
  );
  await page.bringToFront();
  await page.waitForFunction(() => {
    const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
    return (
      data?.rendererReady === "true" &&
      Number(data.canonicalRevision) === window.musart!.session().revision
    );
  });
  await page.evaluate(() => window.musart!.flushThumbnails());
  const initial = await page.evaluate(() => window.musart!.snapshot());
  await page.evaluate(() => {
    const samples: PropertySample[] = [],
      frames = new Set<number>();
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")!;
    const checks = new Set<() => void>();
    // Observe the actual draw marker; RAF polling would add a third frame before the proxy.
    const draws = new MutationObserver(() => {
      for (const check of checks) check();
    });
    draws.observe(canvas, {
      attributes: true,
      attributeFilter: ["data-rendered-revision", "data-canonical-revision"],
    });
    const request = (callback: FrameRequestCallback) => {
      const frame = requestAnimationFrame((at) => {
        frames.delete(frame);
        callback(at);
      });
      frames.add(frame);
    };
    let active: PropertySample | undefined;
    const stopCommits = window.musart!.subscribeCommits((revision) => {
      if (active?.canonical && active.appliedRevision === undefined)
        active.appliedRevision = revision;
    });
    const capture = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const scrub = target.closest(".text-decoration-width .number-scrub");
      let action = "",
        canonical = true;
      if (event.type === "pointermove" && scrub && (event as PointerEvent).buttons === 1) {
        action = "outline-preview";
        canonical = false;
      } else if (event.type === "pointerup" && scrub) action = "outline-commit";
      else if (event.type === "dblclick" && scrub) action = "outline-reset";
      else if (event.type === "click" && target.closest(".text-decoration-controls [role=switch]"))
        action = "shadow-toggle";
      else if (
        event.type === "click" &&
        target.closest(".text-decoration-controls [data-effect-reset]")
      )
        action = "shadow-reset";
      else if (
        event.type === "click" &&
        target.closest("[data-layer-id=property-subject] .layer-actions button:last-child")
      )
        action = "visibility-toggle";
      else if (
        event.type === "keyup" &&
        target.closest(".layer-compositing") &&
        ["ArrowDown", "ArrowUp"].includes((event as KeyboardEvent).key)
      )
        action = "opacity-commit";
      if (!action) return;
      // A double-click generates pointer-up packets too; only moved scrubs commit.
      if (action === "outline-commit" && !scrub?.parentElement?.hasAttribute("data-dragging"))
        return;
      const sample: PropertySample = {
        action,
        canonical,
        trusted: event.isTrusted,
        generatedAt: event.timeStamp,
        dispatchAt: performance.now(),
        expectedRevision: canonical
          ? window.musart!.session().revision + 1
          : Number(canvas.dataset.sceneRevision) + 1,
      };
      samples.push(sample);
      active = sample;
      queueMicrotask(() => {
        const check = () => {
          const data = canvas.dataset,
            observed = Number(canonical ? data.canonicalRevision : data.renderedRevision);
          if (
            data.presentationReady !== "true" ||
            !Number.isFinite(observed) ||
            observed < sample.expectedRevision
          )
            return;
          checks.delete(check);
          sample.observedRevision = observed;
          sample.presentedAt = canonical ? Number(data.canonicalPresentedAt) : performance.now();
          request(() =>
            request(() => {
              sample.secondRafAt = performance.now();
            }),
          );
        };
        checks.add(check);
        check();
      });
    };
    const events = ["pointermove", "pointerup", "dblclick", "click", "keyup"];
    for (const event of events) {
      window.addEventListener(event, capture, true);
    }
    window.__propertyBurst = {
      samples,
      stop() {
        draws.disconnect();
        checks.clear();
        stopCommits();
        for (const event of events) {
          window.removeEventListener(event, capture, true);
        }
        for (const frame of frames) cancelAnimationFrame(frame);
      },
    };
  });
  const stopTrace = await startEditorTrace(
    page,
    "artifacts/property-toggle-responsiveness/profile",
  );
  try {
    const outline = page.getByLabel("Outline width", { exact: true }),
      scrub = page.locator(".text-decoration-width .number-scrub");
    await outline.scrollIntoViewIfNeeded();
    const width = await page.locator(".text-decoration-width").boundingBox(),
      section = await page.locator(".text-decoration-controls").boundingBox();
    expect(width!.width).toBeGreaterThan(section!.width * 0.8);
    const before = await counters(page),
      handle = (await scrub.boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 60, handle.y + handle.height / 2, {
      steps: 12,
    });
    await page.waitForFunction(() =>
      window
        .__propertyBurst!.samples.filter((sample) => !sample.canonical)
        .every((sample) => sample.secondRafAt),
    );
    expect(await counters(page)).toEqual(before);
    expect((await page.evaluate(() => window.musart!.snapshot())).revision).toBe(initial.revision);
    await page.mouse.up();
    await settled(page);
    expect(await outline.inputValue()).toBe("16");
    await scrub.dblclick();
    await settled(page);
    expect(await outline.inputValue()).toBe("0");
    const toggle = page.getByRole("switch", { name: "Hard shadow", exact: true });
    await toggle.scrollIntoViewIfNeeded();
    const shadowBox = (await toggle.boundingBox())!;
    for (let index = 0; index < 8; index++)
      await page.mouse.click(shadowBox.x + shadowBox.width / 2, shadowBox.y + shadowBox.height / 2);
    await settled(page);
    await page.locator(".text-decoration-controls [data-effect-reset]").click();
    await settled(page);
    const opacity = page.locator(".layer-compositing").getByLabel("Opacity", { exact: true });
    await opacity.focus();
    for (let index = 0; index < 6; index++) await page.keyboard.press("ArrowDown");
    for (let index = 0; index < 6; index++) await page.keyboard.press("ArrowUp");
    await settled(page);
    const visibility = page.locator(
      "[data-layer-id=property-subject] .layer-actions button:last-child",
    );
    await visibility.scrollIntoViewIfNeeded();
    const eye = (await visibility.boundingBox())!;
    for (let index = 0; index < 10; index++)
      await page.mouse.click(eye.x + eye.width / 2, eye.y + eye.height / 2);
    await settled(page);
    const final = await page.evaluate(() => window.musart!.snapshot()),
      current = final.project.pages[0]!.layers.find((layer) => layer.id === "property-subject")!;
    expect(current).toMatchObject({
      visible: true,
      opacity: 1,
      strokeWidth: 0,
      effects: [
        {
          id: shadow.id,
          enabled: true,
          amount: 1,
          settings: { radius: 0, offsetX: 8, offsetY: 8, shadowColor: "#000000" },
        },
      ],
    });
    const samples = await page.evaluate(() => window.__propertyBurst!.samples),
      commits = samples.filter((sample) => sample.canonical);
    expect(commits).toHaveLength(33);
    expect(samples.filter((sample) => !sample.canonical).length).toBeGreaterThanOrEqual(10);
    expect(final.revision).toBe(initial.revision + 33);
    expect(commits.map((sample) => sample.appliedRevision)).toEqual(
      Array.from({ length: 33 }, (_, index) => initial.revision + index + 1),
    );
    expect(samples.every((sample) => sample.trusted)).toBe(true);
    for (let index = 0; index < 33; index++) await page.evaluate(() => window.musart!.undo());
    await settled(page);
    const restored = await page.evaluate(() => window.musart!.snapshot());
    expect(restored.project).toEqual(initial.project);
    expect(restored.canUndo).toBe(false);
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
    });
    const environment = await page.evaluate(async () => {
      const adapter = await navigator.gpu?.requestAdapter();
      return {
        userAgent: navigator.userAgent,
        viewport: [innerWidth, innerHeight],
        dpr: devicePixelRatio,
        backend: document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
          .backend,
        adapter: adapter
          ? {
              vendor: adapter.info.vendor,
              architecture: adapter.info.architecture,
              device: adapter.info.device,
              description: adapter.info.description,
              isFallbackAdapter: adapter.info.isFallbackAdapter,
            }
          : null,
      };
    });
    await mkdir("artifacts/property-toggle-responsiveness", { recursive: true });
    await writeFile(
      "artifacts/property-toggle-responsiveness/report.json",
      JSON.stringify(
        {
          browser: browser.version(),
          environment,
          layers: 200,
          text: 10,
          svg: 10,
          samples,
          boundary:
            "Trusted generated/dispatch timestamps to an actually displayed canonical or preview renderer revision, then two RAF opportunities registered directly after that draw marker. A useful matching frame counts while a newer request is queued; rendererReady only identifies an idle latest frame. Superseded inputs can share a later rendered revision.",
        },
        null,
        2,
      ),
    );
    for (const sample of samples) {
      expect(sample.presentedAt! - sample.dispatchAt).toBeLessThan(100);
      expect(sample.secondRafAt! - sample.generatedAt).toBeLessThan(150);
    }
  } finally {
    await stopTrace();
    await page.mouse.up();
    await page.evaluate(() => {
      window.__propertyBurst?.stop();
      delete window.__propertyBurst;
    });
  }
});
