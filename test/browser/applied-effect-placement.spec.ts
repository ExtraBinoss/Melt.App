import { expect, test } from "@playwright/test";
import { createEffect, createLayer, createPage, createProject } from "@musart/core";

test("applied effect placement keeps its loading geometry for short and long control lists", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  for (const type of ["contrast", "crt"] as const) {
    await page.evaluate(
      (project) => window.musart!.load(project),
      createProject({
        pages: [
          createPage({
            width: 320,
            height: 240,
            layers: [
              createLayer("rectangle", {
                width: 200,
                height: 120,
                effects: [createEffect(type)],
              }),
            ],
          }),
        ],
      }),
    );
    const trigger = page.locator('button[data-attachment-target="effect"]').first();
    await expect(trigger).toBeVisible();
    const anchor = (await trigger
      .locator('xpath=ancestor::*[contains(@class,"layer-row")][1]')
      .boundingBox())!;
    await page.evaluate(() => {
      const records: { x: number; y: number; width: number; height: number; ready: boolean }[] = [];
      const state = { records, done: false };
      Object.assign(window, { __effectPlacement: state });
      window.addEventListener(
        "pointerdown",
        () => {
          const started = performance.now();
          const sample = () => {
            const panel = document.querySelector<HTMLElement>(
              '.layer-attachment-popover[data-state="open"]',
            );
            const wrapper = panel?.closest<HTMLElement>("[data-radix-popper-content-wrapper]");
            if (wrapper) {
              const rect = wrapper.getBoundingClientRect();
              if (rect.width && rect.height && rect.x >= 0 && rect.y >= 0 && rect.y < innerHeight)
                records.push({
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                  ready: Boolean(panel?.querySelector("[data-attachment-ready]")),
                });
            }
            if (performance.now() - started < 1000) requestAnimationFrame(sample);
            else state.done = true;
          };
          requestAnimationFrame(sample);
        },
        { once: true, capture: true },
      );
    });
    await trigger.click();
    const panel = page.locator('.layer-attachment-popover[data-state="open"]');
    await expect(panel.locator("[data-attachment-ready]")).toBeVisible();
    await page.waitForFunction(
      () => (window as Window & { __effectPlacement?: { done: boolean } }).__effectPlacement?.done,
    );
    const records = await page.evaluate(
      () =>
        (
          window as Window & {
            __effectPlacement?: {
              records: { x: number; y: number; width: number; height: number; ready: boolean }[];
            };
          }
        ).__effectPlacement!.records,
    );
    expect(records.length).toBeGreaterThan(1);
    expect(records.some((entry) => entry.ready)).toBe(true);
    for (const field of ["x", "y", "width", "height"] as const) {
      const values = records.map((entry) => entry[field]);
      expect(Math.max(...values) - Math.min(...values), `${type}: ${field}`).toBeLessThanOrEqual(1);
    }
    const last = records.at(-1)!;
    expect(last.x + last.width).toBeLessThanOrEqual(anchor.x + 1);
    expect(last.y + last.height).toBeLessThanOrEqual(1001);
    await info.attach(`${type}-placement`, {
      contentType: "application/json",
      body: JSON.stringify(records),
    });
    const input = panel.locator("input:visible").last();
    await input.scrollIntoViewIfNeeded();
    const inputBox = (await input.boundingBox())!,
      viewport = (await panel.locator(".layer-attachment-viewport").boundingBox())!;
    expect(inputBox.y).toBeGreaterThanOrEqual(viewport.y - 1);
    expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(viewport.y + viewport.height + 1);
    const bottomPadding = await panel.locator(".layer-attachment-viewport").evaluate((viewport) => {
      viewport.scrollTop = viewport.scrollHeight;
      const content = viewport.querySelector(".layer-effect-details")!;
      return viewport.getBoundingClientRect().bottom - content.getBoundingClientRect().bottom;
    });
    expect(bottomPadding, `${type}: trailing padding`).toBeGreaterThanOrEqual(13);
    await page.keyboard.press("Escape");
    await expect(page.locator(".layer-attachment-popover")).toHaveCount(0);
  }
});
