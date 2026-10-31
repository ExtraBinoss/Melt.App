import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";

test("infinite canvas zoom stays continuous across two compositions without a queued catch-up", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => !!window.musart);
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["melt-layer"]);
    },
    createProject({
      pages: [
        createPage({
          id: "melt",
          name: "Melt",
          width: 640,
          height: 480,
          layers: [
            createLayer("rectangle", {
              id: "melt-layer",
              x: 40,
              y: 40,
              width: 560,
              height: 400,
              fill: "#8b5cf6",
            }),
          ],
        }),
        createPage({
          id: "other",
          name: "Composition 2",
          width: 640,
          height: 480,
          layers: [
            createLayer("ellipse", { x: 50, y: 50, width: 300, height: 300, fill: "#ffaa55" }),
          ],
        }),
      ],
    }),
  );
  const board = page.getByTestId("artboard");
  await expect(
    page.locator('canvas[data-page-id="melt"][data-renderer-ready="true"]'),
  ).toBeVisible();
  await expect(board).toHaveAttribute("data-view-moving", "false");
  const rect = (await board.boundingBox())!,
    point = { x: rect.x + rect.width * 0.6, y: rect.y + rect.height * 0.5 };
  await page.mouse.move(point.x, point.y);
  await page.evaluate(() => {
    const data: {
      frames: { zoom: number; at: number }[];
      inputs: number;
      trusted: boolean;
      running: boolean;
    } = { frames: [], inputs: 0, trusted: true, running: true };
    const canvas = document.querySelector(".editor-canvas")!;
    const capture = (e: Event) => {
      data.inputs++;
      data.trusted &&= e.isTrusted;
    };
    const frame = (at: number) => {
      data.frames.push({
        at,
        zoom: new DOMMatrixReadOnly(
          getComputedStyle(document.querySelector('[data-testid="artboard"]')!).transform,
        ).a,
      });
      if (data.running) requestAnimationFrame(frame);
    };
    canvas.addEventListener("wheel", capture, { capture: true, passive: true });
    requestAnimationFrame(frame);
    Object.assign(window, {
      wheelContinuity: data,
      stopWheelContinuity: () => {
        data.running = false;
        canvas.removeEventListener("wheel", capture, true);
      },
    });
  });
  const session = await page.context().newCDPSession(page);
  try {
    await page.keyboard.down("Control");
    const start = performance.now(),
      pending = [];
    for (let i = 0; i < 24; i++) {
      const wait = start + (i * 1000) / 60 - performance.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      pending.push(
        session.send("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          ...point,
          modifiers: 2,
          deltaX: 0,
          deltaY: i < 12 ? -80 : 80,
        }),
      );
    }
    await Promise.all(pending);
    await page.keyboard.up("Control");
    await expect(board).toHaveAttribute("data-view-moving", "false");
    const result = await page.evaluate(() => {
      const w = window as unknown as {
        stopWheelContinuity(): void;
        wheelContinuity: {
          frames: { zoom: number; at: number }[];
          inputs: number;
          trusted: boolean;
        };
      };
      w.stopWheelContinuity();
      return w.wheelContinuity;
    });
    await mkdir("artifacts/canvas-zoom", { recursive: true });
    await writeFile("artifacts/canvas-zoom/continuity.json", JSON.stringify(result, null, 2));
    expect(result.inputs).toBeGreaterThan(10);
    expect(result.trusted).toBe(true);
    const changes = result.frames
      .slice(1)
      .map((frame, index) =>
        Math.max(frame.zoom / result.frames[index]!.zoom, result.frames[index]!.zoom / frame.zoom),
      );
    expect(Math.max(...changes)).toBeLessThan(1.19);
    expect(new Set(result.frames.map((frame) => frame.zoom)).size).toBeGreaterThan(10);
    const final = await board.getAttribute("data-zoom");
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(await board.getAttribute("data-zoom")).toBe(final);
  } finally {
    await session.detach();
  }
});
