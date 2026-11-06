import { expect, test, type Page } from "@playwright/test";
import { createEffect } from "@musart/core";
import { designerUxFixture } from "./support/designer-ux-fixture";
import type {} from "../../apps/web/src/services/automation/automation";

async function openEffect(page: Page, layerId: string, effectId: string) {
  await page.evaluate(async (id) => {
    window.musart!.select([id]);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }, layerId);
  const existing = page.locator('.layer-attachment-popover[data-state="open"]');
  if (await existing.locator(`[data-effect-presets="${effectId}"]`).isVisible()) return existing;
  await page.locator(`[data-attachment-effect-id="${effectId}"]`).click();
  const panel = page.locator('.layer-attachment-popover[data-state="open"]');
  await expect(panel.locator(`[data-effect-presets="${effectId}"]`)).toBeVisible();
  return panel;
}

test("native preset save, restore, factory reset and treatment reuse survive reload with independent undo", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => window.musart!.load(project), designerUxFixture());
  await page.locator('.editor-gpu-scene canvas[data-renderer-ready="true"]').waitFor();
  let panel = await openEffect(page, "poster-panel", "poster-grain");
  const read = () => page.evaluate(() => window.musart!.snapshot());
  const effect = async () =>
    (await read()).project.pages[0]!.layers.find((layer) => layer.id === "poster-panel")!
      .effects[0]!;
  const header = panel.locator(".effect-presets");
  await expect(panel.locator(".lucide-plus")).toHaveCount(1);
  expect(
    await header.evaluate((node) => {
      const field = node.closest(".effect-controls")!;
      return field.firstElementChild === node;
    }),
  ).toBe(true);
  await panel.getByRole("button", { name: "Save as preset", exact: true }).click();
  await panel.getByRole("textbox", { name: "Preset name", exact: true }).fill("Warm paper");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await effect()).preset?.name).toBe("Warm paper");
  const reference = (await effect()).preset!;
  const opacity = panel.getByRole("textbox", { name: "Opacity", exact: true });
  await opacity.fill("42");
  await opacity.press("Tab");
  const selector = panel.getByRole("combobox", { name: "Saved preset", exact: true });
  await expect(selector).toContainText("Modified");
  await expect(selector.locator(".lucide-circle-dot")).toBeVisible();
  await page.waitForFunction(() => {
    const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
    return data?.presentationReady === "true" && data.renderedRevision === data.sceneRevision;
  });
  const beforeHover = await read();
  const counters = () =>
    page.evaluate(() =>
      [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
        (key) => document.querySelector<HTMLElement>(key)?.dataset.reactRenders,
      ),
    );
  const count = await counters();
  const canvas = page.locator(".editor-gpu-scene canvas");
  const baseline = await canvas.screenshot();
  await selector.click();
  await page.getByRole("option", { name: "Warm paper", exact: true }).hover();
  await expect.poll(async () => Buffer.compare(await canvas.screenshot(), baseline)).not.toBe(0);
  expect((await read()).project).toEqual(beforeHover.project);
  expect((await read()).revision).toBe(beforeHover.revision);
  expect(await counters()).toEqual(count);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect.poll(async () => Buffer.compare(await canvas.screenshot(), baseline)).toBe(0);
  await panel.getByRole("button", { name: "Preset actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Restore saved preset", exact: true }).click();
  await expect.poll(async () => (await effect()).opacity ?? 1).toBe(1);
  expect((await effect()).preset).toEqual(reference);
  await expect(selector).not.toContainText("Modified");
  await panel.locator("[data-effect-reset]").click();
  await expect.poll(async () => (await effect()).preset).toBeUndefined();
  await page.evaluate(() => window.musart!.undo());
  expect((await effect()).preset).toEqual(reference);
  panel = await openEffect(page, "poster-panel", "poster-grain");
  await panel.getByRole("button", { name: "Preset actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Save effect stack", exact: true }).click();
  await panel.getByRole("textbox", { name: "Treatment name", exact: true }).fill("Poster texture");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.getByRole("textbox", { name: "Treatment name", exact: true })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await page.evaluate(
    (effect) =>
      window.musart!.execute({
        type: "updateLayers",
        ids: ["poster-cover"],
        patch: { effects: [effect] },
      }),
    createEffect("grain", { id: "second-grain", amount: 0.7 }),
  );
  panel = await openEffect(page, "poster-cover", "second-grain");
  await panel.getByRole("combobox", { name: "Saved preset", exact: true }).click();
  await page.getByRole("option", { name: "Warm paper", exact: true }).click();
  const second = () =>
    page.evaluate(
      () =>
        window
          .musart!.snapshot()
          .project.pages[0]!.layers.find((layer) => layer.id === "poster-cover")!.effects[0]!,
    );
  await expect.poll(async () => (await second()).amount).toBe(0.12);
  expect((await effect()).id).toBe("poster-grain");
  expect((await second()).id).toBe("second-grain");
  await page.evaluate(() => window.musart!.undo());
  expect((await second()).amount).toBe(0.7);
  await page.evaluate(() => window.musart!.redo());
  expect((await second()).preset).toEqual(reference);
  const retained = (await read()).project;
  await page.reload();
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => window.musart!.load(project), retained);
  panel = await openEffect(page, "poster-cover", "second-grain");
  await expect(panel.getByRole("combobox", { name: "Saved preset", exact: true })).toContainText(
    "Warm paper",
  );
  await expect(panel.getByText("Preset unavailable", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.musart!.select(["poster-cover"]));
  const plus = page.locator(".layers-footer .layer-create-actions button").first();
  await plus.click();
  await page.getByRole("menuitem", { name: "Add effect", exact: true }).hover();
  const catalog = page.locator('[data-slot="dropdown-menu-sub-content"][data-state="open"]');
  const catalogHeight = await catalog
    .locator(".effect-catalog")
    .evaluate((node) => (node as HTMLElement).offsetHeight);
  const treatmentSwitch = catalog.getByRole("button", { name: "My treatments", exact: true });
  await treatmentSwitch.click({ trial: true });
  const switchY = (await treatmentSwitch.boundingBox())!.y;
  await treatmentSwitch.click();
  await expect
    .poll(async () =>
      Math.abs(
        (await catalog
          .locator(".effect-catalog")
          .evaluate((node) => (node as HTMLElement).offsetHeight)) - catalogHeight,
      ),
    )
    .toBeLessThan(1);
  await expect
    .poll(async () => Math.abs((await treatmentSwitch.boundingBox())!.y - switchY))
    .toBeLessThan(1);
  const row = catalog.locator(".treatment-row").filter({ hasText: "Poster texture" });
  await expect(row).toBeVisible();
  const before = await second();
  const revision = (await read()).revision;
  await row.getByRole("button", { name: "Append", exact: true }).click();
  await expect.poll(async () => (await read()).revision).toBe(revision + 1);
  const stack = () =>
    page.evaluate(
      () =>
        window
          .musart!.snapshot()
          .project.pages[0]!.layers.find((layer) => layer.id === "poster-cover")!.effects,
    );
  expect((await stack()).map((effect) => effect.amount)).toEqual([before.amount, 0.12]);
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.musart!.undo());
  expect(await stack()).toEqual([before]);
  expect(
    await page.evaluate(() => ({
      pointer: document.body.style.pointerEvents,
      overflow: document.body.style.overflow,
    })),
  ).toEqual({ pointer: "", overflow: "" });
  expect(errors).toEqual([]);
});

test("hover loads a saved preset's image input across projects without persisting temporary assets", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => !!window.musart);
  const map = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, 32, 32);
    gradient.addColorStop(0, "#000000");
    gradient.addColorStop(1, "#ffffff");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
    return canvas.toDataURL("image/png");
  });
  const source = designerUxFixture();
  source.id = "image-preset-source";
  source.assets["preset-map"] = {
    id: "preset-map",
    name: "Warp",
    width: 32,
    height: 32,
    mime: "image/png",
    dataUrl: map,
  };
  source.pages[0]!.layers.find((layer) => layer.id === "poster-art")!.effects = [
    createEffect("displace", { id: "source-displace", amount: 0.8, inputs: { map: "preset-map" } }),
  ];
  await page.evaluate((project) => window.musart!.load(project), source);
  let panel = await openEffect(page, "poster-art", "source-displace");
  await panel.getByRole("button", { name: "Save as preset", exact: true }).click();
  await panel.getByRole("textbox", { name: "Preset name", exact: true }).fill("Image warp");
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.getByRole("combobox", { name: "Saved preset", exact: true })).toContainText(
    "Image warp",
  );
  const destination = designerUxFixture();
  destination.id = "image-preset-destination";
  destination.pages[0]!.layers.find((layer) => layer.id === "poster-art")!.effects = [
    createEffect("displace", { id: "destination-displace", amount: 0 }),
  ];
  await page.evaluate((project) => window.musart!.load(project), destination);
  panel = await openEffect(page, "poster-art", "destination-displace");
  await page.waitForFunction((id) => {
    const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
    return (
      data?.projectId === id &&
      data.presentationReady === "true" &&
      data.renderedRevision === data.sceneRevision
    );
  }, destination.id);
  const canvas = page.locator(".editor-gpu-scene canvas"),
    baseline = await canvas.screenshot();
  const before = await page.evaluate(() => window.musart!.snapshot());
  await panel.getByRole("combobox", { name: "Saved preset", exact: true }).click();
  await page.getByRole("option", { name: "Image warp", exact: true }).hover();
  await expect.poll(async () => Buffer.compare(await canvas.screenshot(), baseline)).not.toBe(0);
  expect(await page.evaluate(() => window.musart!.snapshot())).toEqual(before);
  expect(Object.keys(before.project.assets)).not.toContain("preset-map");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect.poll(async () => Buffer.compare(await canvas.screenshot(), baseline)).toBe(0);
});
