import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";
import type {
  SelectionRequest,
  SelectionResponse,
} from "../../apps/web/src/services/selection/selection";
/** Real UI/worker mask pipeline with deterministic ML outputs; does not download or benchmark SAM. */
test("automatic matting and locked-layer click/rectangle refinement share a reversible pixel preview", async ({
  page,
  context,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    const NativeWorker = window.Worker;
    class ModelWorker {
      onmessage: ((event: MessageEvent<SelectionResponse>) => void) | null = null;
      onerror = null;
      onmessageerror = null;
      private timers = new Set<ReturnType<typeof setTimeout>>();
      postMessage(request: SelectionRequest) {
        if (request.type === "prompt")
          document.documentElement.dataset.objectPrompt = JSON.stringify(request.prompt);
        const timer = setTimeout(() => {
          this.timers.delete(timer);
          if (request.type === "prepare") {
            this.onmessage?.({
              data: { id: request.id, result: null },
            } as MessageEvent<SelectionResponse>);
            return;
          }
          if (request.type !== "prompt" && request.type !== "scan" && request.type !== "background")
            throw Error("Unexpected model request");
          const data = new Uint8ClampedArray(96 * 64 * 4),
            prompt = request.type === "prompt" ? request.prompt : { points: [] },
            excludes = prompt.points.some((point) => point.label === 0);
          if (prompt.points.some((point) => point.x > 80)) {
            this.onmessage?.({
              data: { id: request.id, error: "Native decoder failure" },
            } as MessageEvent<SelectionResponse>);
            return;
          }
          for (let y = 0; y < 64; y++)
            for (let x = 0; x < 96; x++) {
              const selected = prompt.box
                ? x >= prompt.box.x &&
                  x <= prompt.box.right &&
                  y >= prompt.box.y &&
                  y <= prompt.box.bottom
                : excludes
                  ? x >= 32 && x < 64
                  : x < 64;
              const index = (y * 96 + x) * 4;
              data[index] = data[index + 1] = data[index + 2] = 255;
              data[index + 3] = selected ? 255 : 0;
            }
          this.onmessage?.({
            data: {
              id: request.id,
              result: {
                width: 96,
                height: 64,
                data,
                ...(request.type === "scan"
                  ? {
                      candidates: [
                        { x: 16, y: 32, score: 0.95 },
                        { x: 48, y: 32, score: 0.9 },
                      ],
                    }
                  : {}),
              },
            },
          } as MessageEvent<SelectionResponse>);
        }, 40);
        this.timers.add(timer);
      }
      terminate() {
        for (const timer of this.timers) clearTimeout(timer);
        this.timers.clear();
      }
    }
    window.Worker = new Proxy(NativeWorker, {
      construct(Target, args: ConstructorParameters<typeof Worker>) {
        return String(args[0]).includes("selection.worker")
          ? new ModelWorker()
          : new Target(...args);
      },
    });
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><path fill="#e03040" d="M0 0h32v64H0z"/><path fill="#30c080" d="M32 0h32v64H32z"/><path fill="#3050e0" d="M64 0h32v64H64z"/></svg>';
  const project = createProject({
    pages: [
      createPage({
        width: 256,
        height: 192,
        background: "#00000000",
        layers: [
          createLayer("image", {
            id: "other-image",
            assetId: "source",
            x: 228,
            y: 0,
            width: 24,
            height: 24,
          }),
          createLayer("image", {
            id: "object-image",
            assetId: "source",
            x: 32,
            y: 32,
            width: 192,
            height: 128,
          }),
        ],
      }),
    ],
    assets: {
      source: {
        id: "source",
        name: "Regions",
        mime: "image/svg+xml",
        width: 96,
        height: 64,
        dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
      },
    },
  });
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["object-image"]);
  }, project);
  await page.waitForFunction(() => {
    const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
    return (
      data?.rendererReady === "true" &&
      data.projectId === window.musart!.session().projectId &&
      Number(data.canonicalRevision) === window.musart!.session().revision
    );
  });
  await page.getByRole("button", { name: "Remove background", exact: true }).click();
  const surface = page.getByTestId("object-selection-surface"),
    outline = page.getByTestId("pixel-selection-outline");
  await expect(surface.locator(".object-selection-hit")).toBeVisible();
  const bounds = (await surface.locator(".object-selection-hit").boundingBox())!,
    left = { x: bounds.x + bounds.width / 6, y: bounds.y + bounds.height / 2 },
    middle = { x: bounds.x + bounds.width / 2, y: left.y };
  await expect(surface.locator(".object-selection-hit")).toHaveCount(1);
  const before = await page.evaluate(() => window.musart!.snapshot());
  await surface.click({ position: { x: 10, y: 10 } });
  expect((await page.evaluate(() => window.musart!.snapshot())).selection).toEqual([
    "object-image",
  ]);
  await page.mouse.click(left.x, left.y);
  await expect(outline).toHaveAttribute("data-selection-pixels", "4096");
  await expect(surface.locator(".object-point-positive")).toHaveCount(1);
  const counters = () =>
    page
      .locator(".musart-app, .inspector, .canvas-area, .editor-canvas, .editor-gpu-scene")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-react-renders")));
  const counts = await counters();
  await page.mouse.click(left.x, left.y, { button: "right" });
  await expect(outline).toHaveAttribute("data-selection-pixels", "2048");
  await expect(surface.locator(".object-point-negative")).toHaveCount(1);
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(await counters()).toEqual(counts);
  expect((await page.evaluate(() => window.musart!.snapshot())).project).toEqual(before.project);
  await page.getByRole("button", { name: "Remove last hint", exact: true }).click();
  await expect(outline).toHaveAttribute("data-selection-pixels", "4096");
  await page.mouse.move(left.x, left.y - 24);
  await page.mouse.down();
  await page.mouse.move(middle.x, middle.y + 24, { steps: 5 });
  await expect(surface.locator(".object-selection-box")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(outline).not.toBeVisible();
  expect((await page.evaluate(() => window.musart!.snapshot())).canUndo).toBe(false);
  await page.mouse.move(left.x, left.y - 24);
  await page.mouse.down();
  await page.mouse.move(middle.x, middle.y + 24, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Keep area", exact: true })).toBeEnabled();
  await expect(surface.locator(".object-selection-box")).toBeVisible();
  expect(Number(await outline.getAttribute("data-selection-pixels"))).toBeGreaterThan(0);
  expect((await page.evaluate(() => window.musart!.snapshot())).canUndo).toBe(false);
  await page
    .locator(".object-selection-options")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page
    .locator(".object-selection-options")
    .getByRole("button", { name: "Remove background", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Apply mask", exact: true })).toBeEnabled();
  expect((await page.evaluate(() => window.musart!.snapshot())).canUndo).toBe(false);
  await page.mouse.click(left.x, left.y, { button: "right" });
  await expect(outline).toHaveAttribute("data-selection-pixels", "2048");
  await page.mouse.click(bounds.x + bounds.width * 0.9, left.y);
  await expect(page.getByRole("button", { name: "Copy error", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep area", exact: true })).toBeDisabled();
  await page.locator(".object-selection-error summary").click();
  await expect(page.locator(".object-selection-error pre")).toHaveText("Native decoder failure");
  expect((await page.evaluate(() => window.musart!.snapshot())).canUndo).toBe(false);
  await page.getByRole("button", { name: "Remove last hint", exact: true }).click();
  await expect(page.getByRole("button", { name: "Keep area", exact: true })).toBeEnabled();
  await page.screenshot({ path: "artifacts/object-selection/preview.png" });
  await page.getByRole("button", { name: "Keep area", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().revision))
    .toBe(before.revision + 1);
  const masked = await page.evaluate(() => window.musart!.snapshot());
  expect(
    masked.project.pages[0]!.layers.find((layer) => layer.id === "object-image")!.mask,
  ).toMatchObject({
    mode: "luminance",
    enabled: true,
  });
  const url = await page.evaluate(() => window.musart!.render({ format: "png" })),
    inspector = await context.newPage();
  try {
    const alpha = await inspector.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      return [64, 128, 192].map((x) => ctx.getImageData(x, 96, 1, 1).data[3]);
    }, url);
    expect(alpha).toEqual([0, 255, 0]);
  } finally {
    await inspector.close();
    await page.bringToFront();
  }
  await page.evaluate(() => window.musart!.undo());
  expect((await page.evaluate(() => window.musart!.snapshot())).project).toEqual(before.project);
  expect((await page.evaluate(() => window.musart!.snapshot())).canUndo).toBe(false);
  await page.evaluate(() => window.musart!.redo());
  expect((await page.evaluate(() => window.musart!.snapshot())).project).toEqual(masked.project);
  const nested = {
    ...project,
    id: "nested-selection",
    pages: [
      {
        ...project.pages[0]!,
        layers: [
          createLayer("group", {
            id: "parent",
            x: 20,
            y: 20,
            width: 216,
            height: 152,
            rotation: 12,
            scaleX: 0.9,
          }),
          {
            ...project.pages[0]!.layers.find((layer) => layer.id === "object-image")!,
            parentId: "parent",
            x: 0,
            y: 0,
            rotation: -6,
          },
        ],
      },
    ],
  };
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["object-image"]);
  }, nested);
  await expect(surface.locator(".object-selection-hit")).toBeVisible();
  const transformed = await surface
    .locator('g[data-layer-id="object-image"]')
    .evaluate((element) => {
      const matrix = (element as SVGGElement).getScreenCTM()!;
      const point = new DOMPoint(32, 64).matrixTransform(matrix);
      return { x: point.x, y: point.y };
    });
  await page.mouse.click(transformed.x, transformed.y);
  await expect(outline).toHaveAttribute("data-selection-pixels", "4096");
  const prompt = await page.evaluate(
    () =>
      JSON.parse(document.documentElement.dataset.objectPrompt!) as {
        points: { x: number; y: number }[];
      },
  );
  expect(prompt.points[0]!.x).toBeCloseTo(16, 3);
  expect(prompt.points[0]!.y).toBeCloseTo(32, 3);
  expect((await page.evaluate(() => window.musart!.snapshot())).canUndo).toBe(false);
  await page.getByRole("button", { name: "Magic wand", exact: true }).click();
  await expect(outline).toBeVisible();
  await expect(surface).not.toBeVisible();
  await page.keyboard.press("Control+d");
  await expect(outline).not.toBeVisible();
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
  });
  expect(failures).toEqual([]);
});
