import { expect, test } from "@playwright/test";
import { createProject, createPage, createLayer, createEffect, EditorEngine } from "@musart/core";

test("effect diamonds stay beside unitless fields, key tips show values, and layer pixels crossfade", async ({
  page,
}) => {
  test.setTimeout(60000);
  page.setDefaultTimeout(12000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          width: 320,
          height: 240,
          layers: [
            createLayer("ellipse", {
              id: "item",
              x: 24,
              y: 24,
              width: 150,
              height: 150,
              fill: "#ff3311",
              effects: [createEffect("thermal", { id: "fx" })],
            }),
          ],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  for (const [value, time] of [
    [24, 0],
    [42, 2],
  ])
    engine.execute({
      type: "upsertMotionKeyframe",
      target: { kind: "layer", layerId: "item", property: "x" },
      time: { value: time!, rate: 1 },
      value: value!,
    });
  const project = engine.getSnapshot().project;
  const keyId = project.pages[0]!.motion!.tracks[0]!.properties[0]!.keyframes[1]!.id;
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["item"]);
  }, project);
  await page.getByRole("button", { name: "Keyframes", exact: true }).click();
  await page.getByRole("button", { name: "Pin timeline", exact: true }).click();
  await expect(page.locator(".motion-timeline-dock")).toHaveAttribute("data-motion-pinned", "true");
  await page.locator('[data-attachment-effect-id="fx"]').click();
  const gamma = page.getByRole("textbox", { name: "Gamma", exact: true });
  await gamma.scrollIntoViewIfNeeded();
  const row = gamma.locator('xpath=ancestor::*[contains(@class,"effect-parameter-row")][1]');
  const diamond = row.locator("[data-motion-diamond]");
  await expect(diamond).toBeVisible();
  const bounds = await row.evaluate((node) => {
    const box = (selector: string) => {
      const r = node.querySelector(selector)!.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, height: r.height };
    };
    return {
      input: box("input"),
      field: box(".number-field"),
      diamond: box("[data-motion-diamond]"),
      units: node.querySelectorAll(".number-unit").length,
    };
  });
  expect(bounds.units).toBe(0);
  expect(Math.abs(bounds.field.right - bounds.input.right)).toBeLessThanOrEqual(2);
  expect(bounds.diamond.x).toBeGreaterThan(bounds.field.right);
  expect(Math.abs(bounds.diamond.y - bounds.field.y)).toBeLessThanOrEqual(2);
  await diamond.click();
  expect(
    await page.evaluate(() =>
      window
        .musart!.snapshot()
        .project.pages[0]!.motion!.tracks.flatMap((track) => track.properties)
        .some(
          (property) =>
            property.target.kind === "effectSetting" &&
            property.target.property === "gamma" &&
            property.keyframes.length === 1,
        ),
    ),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/layer-polish/effect-fields.png" });
  await page.keyboard.press("Escape");
  const propertyId = project.pages[0]!.motion!.tracks[0]!.properties[0]!.id;
  const labelRow = page.locator(`[data-motion-property-id="${propertyId}"]`);
  await labelRow.scrollIntoViewIfNeeded();
  const point = await labelRow.evaluate((node, duration) => {
    const root = document.querySelector("[data-timeline-canvas-root]")!.getBoundingClientRect();
    const end = document.querySelector<HTMLElement>(".motion-end-marker")!;
    const scroll = document.querySelector(".motion-timeline-scroll")!;
    const row = node.getBoundingClientRect();
    return {
      x: root.left + (2 * parseFloat(end.style.left)) / duration - scroll.scrollLeft,
      y: row.y + row.height / 2,
    };
  }, project.pages[0]!.motion!.duration.value / project.pages[0]!.motion!.duration.rate);
  await page.mouse.move(point.x, point.y);
  const key = page.locator(`[data-key-id="${keyId}"]`);
  await key.hover();
  const value = page.locator(`[data-slot="tooltip-content"] [data-motion-key-value="${keyId}"]`);
  await expect(value).toHaveText("Value: 42");
  const lines = await value.evaluate((node) => {
    const value = node.getBoundingClientRect(),
      time = node
        .parentElement!.querySelector("[data-motion-key-tooltip]")!
        .getBoundingClientRect();
    return { valueY: value.y, timeBottom: time.bottom };
  });
  expect(lines.valueY).toBeGreaterThanOrEqual(lines.timeBottom);
  await page.screenshot({ path: "artifacts/layer-polish/key-value.png" });
  const thumbnail = page
    .locator('.layer-thumbnail[data-thumbnail-layer-id="item"][data-thumbnail-variant="layer"]')
    .first();
  await expect(thumbnail.locator('img[data-thumbnail-loaded="true"]')).toBeVisible();
  const result = await page.evaluate(async () => {
    const node = document.querySelector(
      '.layer-thumbnail[data-thumbnail-layer-id="item"][data-thumbnail-variant="layer"]',
    )!;
    const pending = new Promise<{ oldOpacity: number; nextOpacity: number }[]>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          observer.disconnect();
          reject(Error("No thumbnail crossfade"));
        }, 10000);
        let running = false;
        const samples: { oldOpacity: number; nextOpacity: number }[] = [];
        const observer = new MutationObserver(() => {
          if (running || !node.querySelector('[data-thumbnail-exit="true"]')) return;
          running = true;
          const start = performance.now();
          const tick = () => {
            const old = node.querySelector("[data-thumbnail-previous]"),
              next = node.querySelector("img:not([data-thumbnail-previous])");
            if (old && next)
              samples.push({
                oldOpacity: Number(getComputedStyle(old).opacity),
                nextOpacity: Number(getComputedStyle(next).opacity),
              });
            if (performance.now() - start < 200) requestAnimationFrame(tick);
            else {
              clearTimeout(timeout);
              observer.disconnect();
              resolve(samples);
            }
          };
          requestAnimationFrame(tick);
        });
        observer.observe(node, { subtree: true, attributes: true, childList: true });
      },
    );
    window.musart!.execute({ type: "updateLayers", ids: ["item"], patch: { fill: "#1199ff" } });
    return pending;
  });
  expect(
    result.some(
      (sample) =>
        sample.oldOpacity > 0 &&
        sample.oldOpacity < 1 &&
        sample.nextOpacity > 0 &&
        sample.nextOpacity < 1,
    ),
  ).toBe(true);
  await expect(thumbnail.locator("[data-thumbnail-previous]")).toHaveCount(0);
});
