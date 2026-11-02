import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { startEditorTrace } from "./support/editor-action-probe";

// Playwright's full DOM trace snapshots block presentation between native key packets.
// Opt-in CDP profiling below preserves diagnostic traces without that measurement artifact.
test.use({ trace: "off" });

test.beforeEach(async ({ page }) => {
  await page.routeWebSocket("**", () => {});
});

interface HistorySample {
  direction: "undo" | "redo";
  trusted: boolean;
  generatedAt: number;
  dispatchAt: number;
  expectedRevision: number;
  observedRevision?: number;
  canonicalAt?: number;
  secondRafAt?: number;
}
declare global {
  interface Window {
    __historyBurst?: { samples: HistorySample[]; stop(): void };
  }
}

test("cold history and native undo/redo bursts present the exact restored artwork across 200 mixed layers", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const layers = Array.from({ length: 200 }, (_, index) => {
    const common = {
      id: `history-item-${index}`,
      x: (index % 20) * 32,
      y: Math.floor(index / 20) * 32,
      width: 24,
      height: 24,
      fill: "#2563eb",
    };
    if (index < 10) return createLayer("text", { ...common, text: `T${index}`, fontSize: 18 });
    if (index < 20)
      return createLayer("vector", {
        ...common,
        vector: { viewBox: "0 0 24 24", path: "M0 0H24V24H0Z" },
      });
    return createLayer("rectangle", common);
  });
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      id: "native-history-burst",
      pages: [createPage({ id: "history-board", width: 640, height: 320, layers })],
    }),
  );
  await page.evaluate(() => {
    window.musart!.select(["history-item-0"]);
    for (let step = 1; step <= 8; step++)
      window.musart!.transaction([
        { type: "updateLayers", ids: ["history-item-0"], patch: { x: step * 2 } },
        { type: "updateLayers", ids: ["history-item-199"], patch: { opacity: step / 8 } },
      ]);
  });
  await page.bringToFront();
  await page.getByTestId("editor-canvas").focus();
  await page.waitForFunction(() => {
    const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
    return (
      data?.rendererReady === "true" &&
      Number(data.canonicalRevision) === window.musart!.session().revision
    );
  });
  const revision = await page.evaluate(() => window.musart!.session().revision);
  await page.evaluate(() => {
    const samples: HistorySample[] = [],
      frames = new Set<number>();
    const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")!;
    const checks = new Set<() => void>();
    const draws = new MutationObserver(() => {
      for (const check of checks) check();
    });
    draws.observe(canvas, { attributes: true, attributeFilter: ["data-canonical-revision"] });
    const request = (callback: FrameRequestCallback) => {
      const frame = requestAnimationFrame((at) => {
        frames.delete(frame);
        callback(at);
      });
      frames.add(frame);
    };
    const capture = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      const sample: HistorySample = {
        direction: event.shiftKey ? "redo" : "undo",
        trusted: event.isTrusted,
        generatedAt: event.timeStamp,
        dispatchAt: performance.now(),
        expectedRevision: window.musart!.session().revision + 1,
      };
      samples.push(sample);
      const check = () => {
        const data = canvas.dataset;
        const observed = Number(data.canonicalRevision);
        if (
          data?.pageId !== "history-board" ||
          data.presentationReady !== "true" ||
          !Number.isFinite(observed) ||
          observed < sample.expectedRevision
        )
          return;
        checks.delete(check);
        sample.observedRevision = observed;
        sample.canonicalAt = Number(data.canonicalPresentedAt);
        request(() =>
          request(() => {
            sample.secondRafAt = performance.now();
          }),
        );
      };
      checks.add(check);
      queueMicrotask(check);
    };
    window.addEventListener("keydown", capture, true);
    window.__historyBurst = {
      samples,
      stop() {
        draws.disconnect();
        checks.clear();
        window.removeEventListener("keydown", capture, true);
        for (const frame of frames) cancelAnimationFrame(frame);
      },
    };
  });
  const values = () =>
    page.evaluate(() => {
      const snapshot = window.musart!.snapshot(),
        board = snapshot.project.pages[0]!;
      return {
        x: board.layers[0]!.x,
        opacity: board.layers[199]!.opacity,
        revision: snapshot.revision,
        canUndo: snapshot.canUndo,
        canRedo: snapshot.canRedo,
      };
    });
  const stopTrace = await startEditorTrace(
    page,
    "artifacts/undo-redo-responsiveness/native-history",
  );
  try {
    // First cold undo is retained separately; subsequent commands arrive without presentation waits.
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForFunction(() => window.__historyBurst?.samples[0]?.secondRafAt !== undefined);
    expect(await values()).toMatchObject({ x: 14, opacity: 7 / 8 });
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await page.waitForFunction(() => window.__historyBurst?.samples[1]?.secondRafAt !== undefined);
    for (let index = 0; index < 8; index++) await page.keyboard.press("ControlOrMeta+z");
    await page.waitForFunction(() => window.__historyBurst?.samples[9]?.secondRafAt !== undefined);
    expect(await values()).toMatchObject({ x: 0, opacity: 1, canUndo: false, canRedo: true });
    for (let index = 0; index < 8; index++) await page.keyboard.press("ControlOrMeta+Shift+z");
    await page.waitForFunction(() => window.__historyBurst?.samples[17]?.secondRafAt !== undefined);
    expect(await values()).toMatchObject({
      x: 16,
      opacity: 1,
      revision: revision + 18,
      canUndo: true,
      canRedo: false,
    });
    const samples = await page.evaluate(() => window.__historyBurst!.samples);
    expect(samples).toHaveLength(18);
    expect(samples.every((sample) => sample.trusted)).toBe(true);
    expect(samples.map((sample) => sample.expectedRevision)).toEqual(
      Array.from({ length: 18 }, (_, index) => revision + index + 1),
    );
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
      videoFrame: 0,
    });
    await mkdir("artifacts/undo-redo-responsiveness", { recursive: true });
    const environment = await page.evaluate(async () => {
      const adapter = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
      const info = adapter?.info;
      return {
        userAgent: navigator.userAgent,
        viewport: [innerWidth, innerHeight],
        dpr: devicePixelRatio,
        backend: document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
          .backend,
        adapter: info
          ? {
              vendor: info.vendor,
              architecture: info.architecture,
              device: info.device,
              description: info.description,
              isFallbackAdapter: info.isFallbackAdapter,
            }
          : null,
        reads: window.__musartVideoReadbacks,
      };
    });
    await writeFile(
      "artifacts/undo-redo-responsiveness/report.json",
      JSON.stringify(
        {
          browser: browser.version(),
          environment,
          layers: 200,
          text: 10,
          svg: 10,
          samples,
          boundary:
            "Native generated/dispatch timestamp to actual canonical renderer acknowledgment and two later RAF opportunities, including useful matching frames displayed while newer history requests queue. Superseded revisions may share a later acknowledgment; exact final values and every applied revision are checked outside timed RAFs.",
        },
        null,
        2,
      ),
    );
    // These remain presentation proxies, measured independently of automation transport.
    for (const sample of samples) {
      expect(sample.canonicalAt! - sample.dispatchAt).toBeLessThan(100);
      expect(sample.secondRafAt! - sample.generatedAt).toBeLessThan(150);
    }
  } finally {
    await stopTrace();
    await page.evaluate(() => {
      window.__historyBurst?.stop();
      delete window.__historyBurst;
    });
  }
});
