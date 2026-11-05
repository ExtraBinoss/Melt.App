import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Project } from "@musart/core";

test.setTimeout(90000);

async function openStudio(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.goto("/editor?automation=1&workspace=studio");
  await page.waitForFunction(() => !!window.musart);
  const { project } = JSON.parse(
    await readFile("apps/web/public/templates/designed/studio-starter/studio-starter.json", "utf8"),
  ) as { project: Project };
  const title = project.pages[0]!.layers.find((layer) => layer.id === "studio-title")!;
  title.fontFamily = "Inter Variable";
  project.pages[0]!.layers.push({
    ...title,
    id: "flat-title",
    name: "Flat title",
    text: "Flat",
    spatial: undefined,
  });
  await page.evaluate((p) => {
    window.musart!.load(p);
    window.musart!.select([]);
  }, project);
  // Observe the toolbar transition after this fixture's native scene is ready,
  // separately from cold GPU source compilation.
  await page.waitForFunction(
    () => {
      const data = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
      return (
        data?.projectId === window.musart!.snapshot().project.id &&
        data.presentationReady === "true" &&
        data.rendererReady === "true" &&
        data.renderedRevision === data.sceneRevision
      );
    },
    undefined,
    { timeout: 40000 },
  );
}

/** Sample actual browser frames, including layout transforms and field-local filters. */
async function selectFrames(page: Page, id: string) {
  return page.evaluate(async (layerId) => {
    window.musart!.select([layerId]);
    const frames: {
      width: number;
      height: number;
      opacity: number;
      font: string;
      text: string;
      surface: string;
      overflow: string;
    }[] = [];
    for (let i = 0; i < 28; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const bar = document.querySelector<HTMLElement>(".studio-object-bar");
      if (!bar) continue;
      const bounds = bar.getBoundingClientRect();
      frames.push({
        width: bounds.width,
        height: bounds.height,
        opacity: Number(getComputedStyle(bar).opacity),
        surface: getComputedStyle(bar).filter,
        overflow: getComputedStyle(bar).overflow,
        font: getComputedStyle(bar.querySelector(".studio-object-font")!).filter,
        text: getComputedStyle(bar.querySelector(".studio-object-text")!).filter,
      });
    }
    return frames;
  }, id);
}

test("Studio object fields morph measured layout, retain unchanged controls and cancel departing drafts", async ({
  page,
}) => {
  await openStudio(page);
  const entering = await selectFrames(page, "studio-title");
  expect(
    entering.some((frame) => frame.opacity > 0 && frame.opacity < 0.99),
    JSON.stringify(entering),
  ).toBe(true);
  const bar = page.locator(".studio-object-bar");
  const font = await bar.locator(".studio-object-font").elementHandle();
  const before = (await bar.boundingBox())!;
  const frames = await selectFrames(page, "flat-title");
  const after = (await bar.boundingBox())!;
  expect(Math.abs(before.width - after.width)).toBeGreaterThan(30);
  expect(
    frames.some((frame) => frame.width > after.width + 2 && frame.width < before.width - 2),
  ).toBe(true);
  expect(frames.every((frame) => frame.font === "blur(0px)" && frame.surface === "blur(0px)")).toBe(
    true,
  );
  expect(frames.some((frame) => frame.text !== "blur(0px)")).toBe(true);
  expect(frames.every((frame) => ["clip", "hidden"].includes(frame.overflow))).toBe(true);
  expect(
    await font!.evaluate((node) => node === document.querySelector(".studio-object-font")),
  ).toBe(true);
  await expect(bar.getByRole("slider", { name: "Depth", exact: true })).toHaveCount(0);

  const text = bar.getByRole("textbox", { name: "Text content", exact: true });
  await text.fill("Discard this draft");
  const documentBefore = await page.evaluate(() =>
    JSON.stringify(window.musart!.snapshot().project),
  );
  const leaving = await page.evaluate(async () => {
    window.musart!.select([]);
    const samples: { inert: boolean; transform: string; opacity: number }[] = [];
    for (let i = 0; i < 12; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const surface = document.querySelector<HTMLElement>(".studio-object-bar");
      if (!surface) break;
      const style = getComputedStyle(surface);
      samples.push({
        inert: surface.inert,
        transform: style.transform,
        opacity: Number(style.opacity),
      });
    }
    return samples;
  });
  expect(leaving.length).toBeGreaterThan(0);
  expect(leaving.every((sample) => sample.inert && sample.transform === "none")).toBe(true);
  await expect(bar).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
    documentBefore,
  );
  await selectFrames(page, "flat-title");
  await expect(page.getByRole("textbox", { name: "Text content", exact: true })).toHaveValue(
    "Flat",
  );
  await page.getByRole("textbox", { name: "Text content", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Text content", exact: true })).toBeFocused();
});

test("Studio contextual controls honor reduced motion and keep portaled controls within their owner", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStudio(page);
  const frames = await selectFrames(page, "studio-title");
  expect(
    frames.every((frame) => frame.opacity === 1 && ["none", "blur(0px)"].includes(frame.text)),
  ).toBe(true);
  const bar = page.locator(".studio-object-bar");
  await bar.getByRole("combobox", { name: "Font", exact: true }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.evaluate(() => window.musart!.select(["flat-title"]));
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(bar.getByRole("textbox", { name: "Text content", exact: true })).toHaveValue("Flat");
  await page.evaluate(() => window.musart!.select([]));
  await expect(bar).toHaveCount(0);
});

async function radius(control: Locator) {
  return control.evaluate((node) => Number.parseFloat(getComputedStyle(node).borderTopLeftRadius));
}

async function switchWorkspace(page: Page, mode: "Classic" | "Studio") {
  await page.getByRole("button", { name: "Project actions", exact: true }).click();
  await page.getByRole("combobox", { name: "Workspace", exact: true }).click();
  await page.getByRole("option", { name: mode, exact: true }).click();
  await expect(page.locator(".workspace-mode-root")).toHaveAttribute(
    "data-workspace-theme",
    mode.toLowerCase(),
  );
  await page.getByRole("button", { name: "Project actions", exact: true }).click();
}

test("Workspace corner tokens reach native text/font fields and their portaled catalogs without page style mutations", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStudio(page);
  await selectFrames(page, "studio-title");
  const bodyStyle = await page.locator("body").getAttribute("style");
  const bar = page.locator(".studio-object-bar");
  expect(await radius(bar)).toBe(18);
  expect(await radius(bar.getByRole("textbox", { name: "Text content", exact: true }))).toBe(12);
  expect(await radius(bar.getByRole("combobox", { name: "Font", exact: true }))).toBe(12);
  expect(await radius(bar.locator('[data-slot="slider-track"]').first())).toBe(12);
  expect(await radius(bar.getByRole("button", { name: "Advanced", exact: true }))).toBe(12);
  await bar.getByRole("combobox", { name: "Font", exact: true }).click();
  const studioCatalog = page.locator('[data-slot="popover-content"]:has([role="listbox"])');
  await expect(studioCatalog).toHaveAttribute("data-workspace-theme", "studio");
  expect(await radius(studioCatalog)).toBe(18);
  expect(await studioCatalog.evaluate((node) => node.closest(".workspace-mode-root"))).toBeNull();
  await page.keyboard.press("Escape");

  await switchWorkspace(page, "Classic");
  const inspector = page.locator("#inspector");
  expect(await radius(inspector.getByRole("textbox", { name: "Text content", exact: true }))).toBe(
    6,
  );
  const classicFont = inspector.getByRole("combobox", { name: "Font", exact: true });
  expect(await radius(classicFont)).toBe(6);
  await classicFont.click();
  const classicCatalog = page.locator('[data-slot="popover-content"]:has([role="listbox"])');
  await expect(classicCatalog).toHaveAttribute("data-workspace-theme", "classic");
  expect(await radius(classicCatalog)).toBe(10);
  await page.keyboard.press("Escape");
  await switchWorkspace(page, "Studio");
  expect(await radius(bar)).toBe(18);
  expect(await page.locator("body").getAttribute("style")).toBe(bodyStyle);
});

test("Classic contextual toolbar retains its measured shell and grows with native 2D/3D choices and owner changes", async ({
  page,
}) => {
  await openStudio(page);
  await switchWorkspace(page, "Classic");
  await page.evaluate(() => {
    const project = structuredClone(window.musart!.snapshot().project);
    const title = project.pages[0]!.layers.find((layer) => layer.id === "studio-title")!;
    project.pages[0]!.layers.push({ ...title, id: "other-title", name: "Other title", x: 40 });
    window.musart!.load(project);
    window.musart!.select(["studio-title"]);
  });
  const bar = page.locator(".canvas-object-toolbar-anchor > .canvas-object-toolbar");
  await expect(bar).toBeVisible();
  await bar.getByRole("radio", { name: "2D", exact: true }).click();
  await expect(bar.getByRole("radio", { name: "2D", exact: true })).toBeFocused();
  await expect.poll(() => bar.evaluate((node) => getComputedStyle(node).transform)).toBe("none");
  const shell = await bar.elementHandle();
  const before = (await bar.boundingBox())!;
  const growing = page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      document
        .querySelector('[data-spatial-toolbar] [data-segmented-value="3d"]')!
        .addEventListener("pointerdown", () => resolve(), { once: true }),
    );
    const widths: number[] = [];
    for (let i = 0; i < 32; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      widths.push(document.querySelector(".canvas-object-toolbar")!.getBoundingClientRect().width);
    }
    return widths;
  });
  await bar.getByRole("radio", { name: "3D", exact: true }).click();
  const widths = await growing;
  const after = (await bar.boundingBox())!;
  expect(after.width - before.width).toBeGreaterThan(30);
  expect(widths.some((width) => width > before.width + 2 && width < after.width - 2)).toBe(true);
  await expect(bar.getByRole("button", { name: "Move", exact: true })).toBeVisible();
  const leavingOwner = await bar.getByRole("radio", { name: "3D", exact: true }).elementHandle();
  const switching = await page.evaluate(async () => {
    window.musart!.select(["other-title"]);
    const frames: { width: number; opacity: number; filter: string }[] = [];
    for (let i = 0; i < 28; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const surface = document.querySelector<HTMLElement>(".canvas-object-toolbar")!;
      frames.push({
        width: surface.getBoundingClientRect().width,
        opacity: Number(getComputedStyle(surface).opacity),
        filter: getComputedStyle(surface).filter,
      });
    }
    return frames;
  });
  const selected = (await bar.boundingBox())!;
  expect(
    switching.some((frame) => frame.width > selected.width + 2 && frame.width < after.width - 2),
  ).toBe(true);
  expect(switching.every((frame) => frame.opacity === 1 && frame.filter === "blur(0px)")).toBe(
    true,
  );
  expect(
    await shell!.evaluate((node) => node === document.querySelector(".canvas-object-toolbar")),
  ).toBe(true);
  expect(await leavingOwner!.evaluate((node) => node.isConnected)).toBe(false);
  await expect(bar.getByRole("radio", { name: "2D", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(bar.getByRole("button", { name: "Move", exact: true })).toHaveCount(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => window.musart!.select([]));
  await expect(bar).toHaveCount(0);
  await page.evaluate(() => window.musart!.select(["studio-title"]));
  await expect(bar).toBeVisible();
  await bar.getByRole("radio", { name: "3D", exact: true }).click();
  await expect(bar.getByRole("button", { name: "Move", exact: true })).toBeVisible();
  expect(await bar.evaluate((node) => getComputedStyle(node).transform)).toBe("none");
  expect(await bar.evaluate((node) => getComputedStyle(node).filter)).toBe("blur(0px)");
});
