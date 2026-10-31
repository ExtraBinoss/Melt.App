import { expect, test } from "@playwright/test";
import { createProject, createPage, createLayer } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
declare global {
  interface Window {
    __vectorLatency?: { input: number; event: number; gpu?: number; presentation?: number };
  }
}
import { installReadbackProbe } from "./support/readback-probe";
test("native SVG nodes preview imperatively, commit once, cancel cleanly and retain curve/stroke edits through undo", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["vector"]);
    },
    createProject({
      id: "svg-editing-native",
      pages: [
        createPage({
          id: "svg-page",
          width: 400,
          height: 300,
          layers: [
            createLayer("vector", {
              id: "vector",
              name: "Editable SVG",
              x: 50,
              y: 50,
              width: 220,
              height: 180,
              fill: "#8B5CF6",
              stroke: "#181818",
              strokeWidth: 2,
              vector: { viewBox: "0 0 200 160", path: "M20 20L180 20L180 140L20 140Z" },
            }),
          ],
        }),
      ],
    }),
  );
  await page.waitForFunction(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas');
    return (
      c?.dataset.projectId === "svg-editing-native" &&
      c.dataset.rendererReady === "true" &&
      c.dataset.sceneRevision === c.dataset.renderedRevision
    );
  });
  const original = await page.evaluate(
    () => window.musart!.snapshot().project.pages[0]!.layers[0]!.vector,
  );
  await page
    .locator(".vector-canvas-entry")
    .getByRole("button", { name: "Edit points", exact: true })
    .click();
  const editor = page.locator(".vector-editor-inline");
  await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
  await expect(editor).toBeVisible();
  const root = editor.locator(".vector-editor-stage svg");
  await expect(root.locator(".vector-anchor")).toHaveCount(4);
  const baseline = await page.evaluate(() => ({
    revision: window.musart!.snapshot().revision,
    commits: [
      ".musart-app",
      ".inspector",
      ".canvas-area",
      ".editor-canvas",
      ".editor-gpu-scene",
    ].map((s) => document.querySelector<HTMLElement>(s)?.dataset.reactRenders),
    render: Number(
      document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas')!.dataset
        .renderCount,
    ),
  }));
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas')!;
    const capture = (event: PointerEvent) => {
      if (!(event.buttons & 1)) return;
      window.removeEventListener("pointermove", capture, true);
      const evidence = { input: performance.now(), event: event.timeStamp } as NonNullable<
        Window["__vectorLatency"]
      >;
      window.__vectorLatency = evidence;
      const before = Number(canvas.dataset.renderCount);
      const observer = new MutationObserver(() => {
        if (Number(canvas.dataset.renderCount) <= before) return;
        observer.disconnect();
        evidence.gpu = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            evidence.presentation = performance.now();
          }),
        );
      });
      observer.observe(canvas, {
        attributes: true,
        attributeFilter: ["data-render-count", "data-rendered-revision"],
      });
    };
    window.addEventListener("pointermove", capture, true);
  });
  const point = root.locator(".vector-anchor").nth(1),
    box = (await point.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 50, box.y + box.height / 2 + 35, { steps: 5 });
  await expect
    .poll(() =>
      page.evaluate(() =>
        Number(
          document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas')!.dataset
            .renderCount,
        ),
      ),
    )
    .toBeGreaterThan(baseline.render);
  await page.waitForFunction(() => window.__vectorLatency?.presentation !== undefined);
  const latency = await page.evaluate(() => window.__vectorLatency!);
  const during = await page.evaluate(() => ({
    revision: window.musart!.snapshot().revision,
    commits: [
      ".musart-app",
      ".inspector",
      ".canvas-area",
      ".editor-canvas",
      ".editor-gpu-scene",
    ].map((s) => document.querySelector<HTMLElement>(s)?.dataset.reactRenders),
  }));
  expect(during.revision).toBe(baseline.revision);
  expect(during.commits).toEqual(baseline.commits);
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().revision))
    .toBe(baseline.revision + 1);
  const changed = await page.evaluate(
    () => window.musart!.snapshot().project.pages[0]!.layers[0]!.vector,
  );
  expect(changed).not.toEqual(original);
  const cancelPoint = (await root.locator(".vector-anchor").nth(1).boundingBox())!;
  await page.mouse.move(
    cancelPoint.x + cancelPoint.width / 2,
    cancelPoint.y + cancelPoint.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(cancelPoint.x - 25, cancelPoint.y + 20);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(editor).toBeVisible();
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(baseline.revision + 1);
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.vector),
  ).toEqual(changed);
  const staleBox = (await root.locator(".vector-anchor").nth(1).boundingBox())!;
  const beforeStale = await page.evaluate(() => window.musart!.snapshot().revision);
  await page.mouse.move(staleBox.x + staleBox.width / 2, staleBox.y + staleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(staleBox.x - 25, staleBox.y + 20);
  await page.evaluate(() =>
    window.musart!.execute({ type: "updateLayers", ids: ["vector"], patch: { fill: "#7C3AED" } }),
  );
  await page.mouse.up();
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(beforeStale + 1);
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.vector),
  ).toEqual(changed);
  await page.evaluate(() => window.musart!.undo());
  await editor.getByRole("radio", { name: "Symmetric", exact: true }).click();
  await editor.getByRole("button", { name: "Edit SVG points", exact: true }).click();
  await expect(root.locator(".vector-control-handle")).toHaveCount(2);
  await page
    .locator(".vector-canvas-settings")
    .getByRole("button", { name: "Split next segment", exact: true })
    .click();
  await expect(root.locator(".vector-anchor")).toHaveCount(5);
  await page
    .locator(".vector-canvas-settings")
    .getByRole("combobox", { name: "Line ends", exact: true })
    .click();
  await page.getByRole("option", { name: "Square", exact: true }).click();
  expect(
    await page.evaluate(
      () => window.musart!.snapshot().project.pages[0]!.layers[0]!.vector!.parts![0]!.linecap,
    ),
  ).toBe("square");
  await mkdir("artifacts/vector-editor", { recursive: true });
  await page.screenshot({ path: "artifacts/vector-editor/points-and-handles.png" });
  await page.keyboard.press("Escape");
  await editor.getByRole("button", { name: "Done", exact: true }).click();
  await expect(editor).toBeHidden();
  await page.evaluate(() => {
    window.musart!.undo();
    window.musart!.undo();
    window.musart!.undo();
    window.musart!.undo();
  });
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.vector),
  ).toEqual(original);
  await page
    .locator(".vector-canvas-entry")
    .getByRole("button", { name: "Edit points", exact: true })
    .click();
  await expect(editor).toBeVisible();
  const beforeSelect = await page.evaluate(() => window.musart!.snapshot().revision);
  await root.locator(".vector-anchor").nth(1).click();
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(beforeSelect);
  await editor.getByRole("button", { name: "Edit SVG points", exact: true }).click();
  const rounding = page
    .locator(".vector-canvas-settings")
    .getByRole("textbox", { name: "Round corner", exact: true });
  await rounding.fill("16");
  await rounding.press("Enter");
  expect(
    await page.evaluate(
      () =>
        window.musart!.snapshot().project.pages[0]!.layers[0]!.vector!.parts![0]!.nodeEditing
          ?.rounding[0]?.radius,
    ),
  ).toBe(16);
  if (await page.locator(".vector-canvas-settings").isVisible())
    await page.keyboard.press("Escape");
  await editor.getByRole("button", { name: "Done", exact: true }).click();
  await expect(editor).toBeHidden();
  await page
    .locator(".vector-canvas-entry")
    .getByRole("button", { name: "Edit points", exact: true })
    .click();
  await expect(editor).toBeVisible();
  await root.locator(".vector-anchor").nth(1).click();
  if (!(await page.locator(".vector-canvas-settings").isVisible()))
    await editor.getByRole("button", { name: "Edit SVG points", exact: true }).click();
  await expect(rounding).toHaveValue("16");
  await rounding.fill("6");
  await rounding.press("Enter");
  expect(
    await page.evaluate(
      () =>
        window.musart!.snapshot().project.pages[0]!.layers[0]!.vector!.parts![0]!.nodeEditing
          ?.rounding[0]?.radius,
    ),
  ).toBe(6);
  await page.evaluate(() => window.musart!.undo());
  await expect(rounding).toHaveValue("16");
  if (await page.locator(".vector-canvas-settings").isVisible())
    await page.keyboard.press("Escape");
  await editor.getByRole("button", { name: "Done", exact: true }).click();
  await page.evaluate(() => window.musart!.save());
  const beforeReloadReads = await page.evaluate(() => window.__musartVideoReadbacks);
  expect(beforeReloadReads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
  await page.reload();
  await page.waitForFunction(() => window.musart?.snapshot().project.id === "svg-editing-native");
  expect(
    await page.evaluate(
      () =>
        window.musart!.snapshot().project.pages[0]!.layers[0]!.vector!.parts![0]!.nodeEditing
          ?.rounding[0]?.radius,
    ),
  ).toBe(16);
  const reads = await page.evaluate(() => window.__musartVideoReadbacks);
  expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
  await writeFile(
    "artifacts/vector-editor/gesture.json",
    JSON.stringify(
      {
        baseline,
        during,
        reads,
        beforeReloadReads,
        latency,
        gpuAckMs: latency.gpu! - latency.input,
        presentationOpportunityMs: latency.presentation! - latency.input,
      },
      null,
      2,
    ),
  );
});
