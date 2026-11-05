import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import type { Project } from "../../packages/core/src/index";
import { installReadbackProbe } from "./support/readback-probe";

async function settled(page: Page) {
  await page.waitForFunction(
    () => {
      const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
      if (
        !data ||
        data.presentationReady !== "true" ||
        data.rendererReady !== "true" ||
        data.renderedRevision !== data.sceneRevision
      )
        return false;
      const stats = JSON.parse(data.gpuStats ?? "{}");
      return (
        stats.pending === 0 &&
        stats.active === 0 &&
        stats.submitted === Number(data.sceneRevision) &&
        stats.displayFrames === Number(data.renderFrames)
      );
    },
    undefined,
    { timeout: 60000 },
  );
}
async function arm(page: Page, selector: string, event: "pointerenter" | "pointerdown") {
  await page.evaluate(
    ({ selector, event }) => {
      const element = document.querySelector<HTMLElement>(selector)!;
      const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")!;
      delete canvas.dataset.measuredLatency;
      const start = () => {
        const revision = canvas.dataset.renderedRevision,
          at = performance.now();
        const observer = new MutationObserver(() => {
          if (
            canvas.dataset.renderedRevision !== revision &&
            canvas.dataset.presentationReady === "true"
          ) {
            canvas.dataset.measuredLatency = String(performance.now() - at);
            observer.disconnect();
            clearTimeout(timer);
          }
        });
        const timer = setTimeout(() => observer.disconnect(), 15000);
        observer.observe(canvas, {
          attributes: true,
          attributeFilter: ["data-rendered-revision", "data-presentation-ready"],
        });
      };
      element.addEventListener(event, start, { capture: true, once: true });
    },
    { selector, event },
  );
}
async function latency(page: Page) {
  const canvas = page.locator(".editor-gpu-scene canvas");
  await expect(canvas).toHaveAttribute("data-measured-latency", /.+/, { timeout: 15000 });
  return Number(await canvas.getAttribute("data-measured-latency"));
}
async function diagnostic(page: Page) {
  return page.locator(".editor-gpu-scene canvas").evaluate((node) => ({
    stats: JSON.parse((node as HTMLCanvasElement).dataset.gpuStats ?? "{}") as Record<
      string,
      number
    >,
    backend: (node as HTMLCanvasElement).dataset.backend,
    renders: Number((node as HTMLCanvasElement).dataset.renderCount),
    frames: Number((node as HTMLCanvasElement).dataset.renderFrames),
  }));
}
const counters = (page: Page) =>
  page
    .locator(".musart-app,.canvas-area,.editor-canvas,.editor-gpu-scene")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-react-renders")));
function summary(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    samples,
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
}

test("Studio measures native slider/recipe presentation, bounded GPU state and idle without editor commits", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180000);
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.goto("/editor?automation=1&workspace=studio");
  await page.waitForFunction(() => !!window.musart, undefined, { timeout: 60000 });
  const { project } = JSON.parse(
    await readFile("apps/web/public/templates/designed/studio-starter/studio-starter.json", "utf8"),
  ) as { project: Project };
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["studio-title"]);
  }, project);
  await settled(page);
  await page.locator(".studio-material .studio-dock-heading").click();
  const range =
    '.studio-material-content .studio-slider:has([role="slider"][aria-label="Roughness"])';
  const slider = page.locator(`${range} [data-slot="slider-track"]`);
  await expect(slider).toBeVisible();
  const sliders: number[] = [];
  for (let index = 0; index < 7; index++) {
    const commits = await page.evaluate(() => window.musart!.session().revision),
      renders = await counters(page);
    await arm(page, range, "pointerdown");
    const box = (await slider.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 4 });
    sliders.push(await latency(page));
    expect(await counters(page)).toEqual(renders);
    expect(await page.evaluate(() => window.musart!.session().revision)).toBe(commits);
    await page.mouse.up();
    await settled(page);
    expect(await page.evaluate(() => window.musart!.session().revision)).toBe(commits + 1);
    await page.evaluate(() => window.musart!.undo());
    await settled(page);
  }
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Background", exact: true }).click();
  const ids = [
    "atmosphere-aurora-mist",
    "atmosphere-dream-haze",
    "atmosphere-deep-cosmos",
    "atmosphere-aurora-mist",
    "atmosphere-dream-haze",
    "atmosphere-deep-cosmos",
    "atmosphere-aurora-mist",
  ];
  const gradients: number[] = [];
  const before = await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
  for (const id of ids) {
    const selector = `[data-background-preset="${id}"]`,
      preset = page.locator(selector);
    await preset.scrollIntoViewIfNeeded();
    await page.mouse.move(500, 100);
    await settled(page);
    const renders = await counters(page);
    await arm(page, selector, "pointerenter");
    await preset.hover();
    gradients.push(await latency(page));
    await settled(page);
    expect(await counters(page)).toEqual(renders);
    expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
      before,
    );
    await page.mouse.move(500, 100);
    await settled(page);
  }
  await page.keyboard.press("Escape");
  await settled(page);
  const warm = await diagnostic(page);
  await page.waitForTimeout(1100);
  const idle = await diagnostic(page);
  expect(idle.renders).toBe(warm.renders);
  expect(idle.frames).toBe(warm.frames);
  const reads = await page.evaluate(() => window.__musartVideoReadbacks);
  expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  const result = {
    url: testInfo.project.use.baseURL,
    viewport: testInfo.project.use.viewport,
    browser: browser.version(),
    cpu: cpus()[0]?.model,
    platform: process.platform,
    backend: idle.backend,
    slider: summary(sliders),
    gradient: summary(gradients),
    warm,
    idle,
    reads,
    editorCommitsDuringPreview: 0,
    notes:
      "Native dispatch to acknowledged GPU preview frame; not physical-display latency. CPU/memory constrained serial runner. Development overhead applies unless URL points to a recorded production build.",
  };
  await writeFile(
    "artifacts/studio/presentation-performance.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
});
