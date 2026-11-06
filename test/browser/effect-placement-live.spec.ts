import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";
import type {} from "../../apps/web/src/services/automation/automation";
import { measureControl } from "./support/effect-control-input";

for (const owner of ["layer", "composition"] as const) {
  test(`${owner} position pad paints X/Y live without document or root React commits`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.addInitScript(() => {
      localStorage.setItem("musart.language", "en");
      localStorage.setItem("musart.editor-tutorial.v1", "done");
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    });
    await page.goto("/editor?automation=1");
    await page.waitForFunction(() => !!window.musart);
    const effect = createEffect("grain", {
      id: "position-effect",
      amount: 0.8,
      settings: { domainEnabled: true, domainX: 0.5, domainY: 0.5, domainRadius: 0.25 },
    });
    const project = createProject({
      pages: [
        createPage({
          id: "position-page",
          width: 400,
          height: 300,
          ...(owner === "composition" ? { effects: [effect] } : {}),
          layers: [
            createLayer("rectangle", {
              id: "position-layer",
              x: 20,
              y: 20,
              width: 360,
              height: 260,
              fill: "#7857ae",
              effects: owner === "layer" ? [effect] : [],
            }),
          ],
        }),
      ],
    });
    await page.evaluate(
      ({ project, owner }) => {
        window.musart!.load(project);
        window.musart!.select(owner === "layer" ? ["position-layer"] : []);
      },
      { project, owner },
    );
    await expect(
      page.locator('.editor-gpu-scene canvas[data-presentation-ready="true"]'),
    ).toBeVisible();
    const open = async () => {
      await page.evaluate(async (owner) => {
        window.musart!.select(owner === "layer" ? ["position-layer"] : []);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }, owner);
      const active = page.locator(
        owner === "layer"
          ? '.layer-attachment-popover[data-state="open"]'
          : '[data-composition-effect-controls="position-effect"][data-state="open"]',
      );
      if (await active.locator('[data-effect-presets="position-effect"]').isVisible()) return;
      if (owner === "composition") {
        const group = page.locator('[data-composition-effects="position-page"]');
        if ((await group.getAttribute("aria-expanded")) === "false") {
          await group.focus();
          await group.press("ArrowRight");
        }
        await page
          .locator('[data-composition-effect-id="position-effect"] .attachment-name')
          .click();
      } else await page.locator('[data-attachment-effect-id="position-effect"]').click();
      await expect(active.locator('[data-effect-presets="position-effect"]')).toBeVisible();
    };
    await open();
    const panel = page.locator(
      owner === "layer"
        ? '.layer-attachment-popover[data-state="open"]'
        : '[data-composition-effect-controls="position-effect"][data-state="open"]',
    );
    await panel.getByRole("button", { name: "Position & area", exact: true }).click();
    const pad = panel.getByRole("button", { name: "Position", exact: true });
    const x = panel.getByRole("textbox", { name: "Position X", exact: true }),
      y = panel.getByRole("textbox", { name: "Position Y", exact: true });
    await expect(x).toHaveValue("50");
    await expect(y).toHaveValue("50");
    const bounds = (await pad.boundingBox())!;
    const counters = () =>
      page.evaluate(() =>
        [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
          (selector) => document.querySelector<HTMLElement>(selector)?.dataset.reactRenders,
        ),
      );
    const before = await page.evaluate(() => window.musart!.snapshot()),
      counts = await counters();
    const canvas = page.locator(".editor-gpu-scene canvas"),
      baseline = await canvas.screenshot();
    await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.3);
    const latency = await measureControl(page, `${owner}:position-pad`, "pointerdown", async () => {
      await page.mouse.down();
      await expect.poll(async () => Number(await x.inputValue())).toBeCloseTo(20, 0);
      await expect.poll(async () => Number(await y.inputValue())).toBeCloseTo(30, 0);
    });
    const measurementPath = test.info().outputPath("position-input-presentation.json");
    await writeFile(
      measurementPath,
      JSON.stringify({
        ...latency,
        browser: page.context().browser()?.version(),
        server: "Vite development on 6102; next RAF measurement",
      }),
    );
    await test.info().attach("position-input-presentation", {
      path: measurementPath,
      contentType: "application/json",
    });
    await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.8, {
      steps: 4,
    });
    await expect.poll(async () => Number(await x.inputValue())).toBeCloseTo(70, 0);
    await expect.poll(async () => Number(await y.inputValue())).toBeCloseTo(80, 0);
    expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before.project);
    expect(await counters()).toEqual(counts);
    await expect.poll(async () => Buffer.compare(await canvas.screenshot(), baseline)).not.toBe(0);
    await page.mouse.up();
    await expect
      .poll(() => page.evaluate(() => window.musart!.snapshot().revision))
      .toBe(before.revision + 1);
    await x.fill("33");
    await x.press("Enter");
    const readEffect = () =>
      page.evaluate((owner) => {
        const composition = window.musart!.snapshot().project.pages[0]!;
        return owner === "layer" ? composition.layers[0]!.effects[0]! : composition.effects![0]!;
      }, owner);
    await expect.poll(async () => (await readEffect()).settings?.domainX).toBe(0.33);
    await page.evaluate(() => {
      window.musart!.undo();
      window.musart!.undo();
    });
    expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before.project);
    // Layer attachments retire on undo; composition controls retain their owner.
    // The canonical undo assertion remains valid after the layer controls close.
    if (owner === "layer") return;
    await expect(x).toHaveValue("50");
    await expect(y).toHaveValue("50");
    expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before.project);
    const restored = (await pad.boundingBox())!;
    await page.mouse.move(restored.x + restored.width * 0.2, restored.y + restored.height * 0.2);
    await page.mouse.down();
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before.project);
  });
}
