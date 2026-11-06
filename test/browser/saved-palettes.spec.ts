import { expect, test, type Locator, type Page } from "@playwright/test";
import { createLayer, createPage, createProject, createSpatialLayer } from "@musart/core";
const roots = [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"];

async function open(page: Page, studio = false) {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto(`/editor?automation=1${studio ? "&workspace=studio" : ""}`);
  await page.waitForFunction(() => !!window.musart);
  await page.evaluate(
    ({ project }) => {
      window.musart!.load(project);
      window.musart!.select(["palette-owner"]);
    },
    {
      project: createProject({
        pages: [
          createPage({
            id: "palette-page",
            width: 400,
            height: 300,
            background: "#e26d3f",
            layers: [
              createLayer(studio ? "text" : "rectangle", {
                id: "palette-owner",
                name: "Palette owner",
                text: "MELT",
                fontFamily: "Inter",
                x: 50,
                y: 50,
                width: 200,
                height: 150,
                fill: "#e26d3f",
                ...(studio ? { spatial: createSpatialLayer("extrude") } : {}),
              }),
            ],
          }),
        ],
      }),
    },
  );
  await expect(
    page.locator('.editor-gpu-scene canvas[data-presentation-ready="true"]'),
  ).toBeVisible();
}
async function menu(page: Page, popover: Locator, name: string) {
  await popover.getByRole("button", { name: "Palette actions", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}

test("compact palettes preserve named saves, native menus, locked variations and one-undo previews", async ({
  page,
}) => {
  test.setTimeout(90000);
  await open(page);
  const shortcut = page.locator(".inspector .color-control .palette-shortcut").first();
  const body = await page.locator("body").getAttribute("style");
  await shortcut.click();
  const popover = page.locator("[data-palette-popover]");
  await expect(popover).toBeVisible();
  await expect(
    popover.getByRole("combobox", { name: "Saved palettes", exact: true }),
  ).toContainText("All");
  await expect(popover.getByRole("region", { name: "Document", exact: true })).toBeVisible();
  await expect(popover.locator(".palette-document-divider")).toHaveAttribute("role", "separator");
  await popover.getByRole("button", { name: "About palettes", exact: true }).hover();
  const help = page.getByRole("tooltip").filter({ hasText: "Choose a saved palette" });
  await expect(help).toBeVisible();
  await expect(help).toHaveAttribute("data-side", "top");
  expect((await popover.boundingBox())!.width).toBeLessThanOrEqual(280);
  expect((await popover.boundingBox())!.height).toBeLessThan(150);
  await expect(popover.getByRole("textbox")).toHaveCount(0);
  await expect(popover.locator("p")).toHaveCount(0);
  await expect(popover.getByRole("button", { name: "New palette", exact: true })).toBeVisible();
  expect(await page.locator("body").getAttribute("style")).toBe(body);
  await popover.getByRole("button", { name: "New palette", exact: true }).click();
  let editor = popover.locator(".palette-editor");
  await expect(editor.getByRole("textbox", { name: "Palette name", exact: true })).toHaveValue("");
  await expect(editor.getByRole("textbox", { name: "Palette name", exact: true })).toHaveAttribute(
    "placeholder",
    /.+/,
  );
  await editor.getByRole("textbox", { name: "Palette name", exact: true }).fill("Company");
  await editor.getByRole("button", { name: "Add current color", exact: true }).click();
  const hex = editor.getByRole("textbox", { name: "Color value", exact: true });
  await hex.fill("#5130A8teste");
  await expect(hex).toHaveAttribute("aria-invalid", "true");
  await expect(editor.getByRole("alert")).toBeVisible();
  await expect(editor.getByRole("button", { name: "Update palette", exact: true })).toBeDisabled();
  await hex.fill("#264653");
  await editor.getByRole("button", { name: "Edit 2 · #264653", exact: true }).click();
  const picker = page.locator(".palette-color-popover");
  await expect(picker).toBeVisible();
  await expect(picker.locator(".color-channels")).toBeVisible();
  const popupHex = picker.locator(".color-value input");
  await popupHex.fill("#264653oops");
  await expect(popupHex).toHaveAttribute("aria-invalid", "true");
  await expect(picker.getByRole("alert")).toBeVisible();
  await popupHex.fill("#264653");
  await popupHex.press("Enter");
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  const lock = editor.getByRole("switch", { name: "Lock 2", exact: true });
  await expect(lock).toHaveAttribute("data-slot", "switch");
  await lock.click();
  await editor.getByRole("button", { name: "Update palette", exact: true }).click();
  await expect(popover.locator(".palette-browser")).toHaveAttribute("data-palette-mode", "pick");
  await expect(
    popover.getByRole("combobox", { name: "Saved palettes", exact: true }),
  ).toContainText("Company");
  await expect(popover.getByRole("textbox")).toHaveCount(0);
  expect((await popover.boundingBox())!.height).toBeLessThan(240);
  await popover
    .locator(".palette-library-list")
    .getByRole("button", { name: "1 #e26d3f", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Link as document color", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.colors?.length))
    .toBe(1);
  await popover.locator(".palette-detected .palette-swatch").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Link as document color", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project.colors?.length))
    .toBe(2);
  const linkedIds = await page.evaluate(() =>
    window.musart!.snapshot().project.colors!.map(({ id }) => id),
  );
  expect(linkedIds[1]).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/);
  expect(linkedIds[1]).not.toBe(linkedIds[0]);
  // Palette variation follows explicit saved-swatch identities, never equal literals.
  await popover
    .locator(".palette-library-list")
    .getByRole("button", { name: "1 #e26d3f", exact: true })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Link as document color", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.colorLinks?.fill),
    )
    .toBe(linkedIds[0]);
  expect(await page.locator("body").getAttribute("style")).toBe(body);
  const before = await page.evaluate(() => window.musart!.snapshot());
  await menu(page, popover, "Edit palette");
  editor = popover.locator(".palette-editor");
  const counters = () =>
    page.evaluate(
      (selectors) =>
        selectors.map(
          (selector) => document.querySelector<HTMLElement>(selector)?.dataset.reactRenders,
        ),
      roots,
    );
  const counts = await counters(),
    canvas = page.locator(".editor-gpu-scene canvas"),
    canonical = await canvas.screenshot();
  await editor.getByRole("button", { name: "Generate harmonious variation", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Edit 2 · #264653", exact: true })).toBeVisible();
  expect(await editor.locator(".palette-swatch").first().getAttribute("aria-label")).not.toBe(
    "1 #e26d3f",
  );
  const first = await editor.locator(".palette-swatch").first().getAttribute("aria-label");
  await editor.getByRole("button", { name: "Generate harmonious variation", exact: true }).click();
  const second = await editor.locator(".palette-swatch").first().getAttribute("aria-label");
  expect(second).not.toBe(first);
  await editor.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(editor.locator(".palette-swatch").first()).toHaveAttribute("aria-label", first!);
  await page.keyboard.press("Control+z");
  await expect(editor.locator(".palette-swatch").first()).toHaveAttribute(
    "aria-label",
    "Edit 1 · #e26d3f",
  );
  await page.keyboard.press("Control+Shift+z");
  await expect(editor.locator(".palette-swatch").first()).toHaveAttribute("aria-label", first!);
  await editor.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(editor.locator(".palette-swatch").first()).toHaveAttribute("aria-label", second!);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(before.revision);
  expect(await counters()).toEqual(counts);
  await expect.poll(async () => Buffer.compare(await canvas.screenshot(), canonical)).not.toBe(0);
  await editor.getByRole("button", { name: "Cancel", exact: true }).last().click();
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before.project);
  await expect.poll(async () => Buffer.compare(await canvas.screenshot(), canonical)).toBe(0);
  await editor.getByRole("button", { name: "Generate harmonious variation", exact: true }).click();
  await editor.getByRole("button", { name: "Apply", exact: true }).click();
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(before.revision + 1);
  await expect(editor.getByRole("textbox", { name: "Palette name", exact: true })).toHaveValue(
    "Company variation",
  );
  await editor.getByRole("button", { name: "Back", exact: true }).focus();
  await page.keyboard.press("Control+z");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project))
    .toEqual(before.project);
  await page.keyboard.press("Control+Shift+z");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().revision))
    .toBe(before.revision + 3);
  await editor.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before.project);
  await editor.getByRole("button", { name: "Back", exact: true }).click();
  await expect(popover.locator(".palette-browser")).toHaveAttribute("data-palette-mode", "pick");
  await popover.getByRole("combobox", { name: "Saved palettes", exact: true }).click();
  await page.getByRole("option", { name: "Company", exact: true }).click();
  await menu(page, popover, "Duplicate");
  await expect(
    popover.getByRole("combobox", { name: "Saved palettes", exact: true }),
  ).toContainText("Company 2");
  await page.screenshot({ path: "artifacts/designer-ux/compact-palettes.png" });
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(shortcut).toBeFocused();
  await page.reload();
  await page.waitForFunction(() => !!window.musart);
  await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["palette-owner"]);
  }, before.project);
  await page.locator(".inspector .color-control .palette-shortcut").first().click();
  await page.getByRole("combobox", { name: "Saved palettes", exact: true }).click();
  await expect(page.getByRole("option", { name: "Company", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Company 2", exact: true })).toBeVisible();
});

test("Studio color and palette triggers stay on one row and open a compact native popover", async ({
  page,
}) => {
  test.setTimeout(60000);
  await open(page, true);
  const bar = page.locator(".studio-object-bar"),
    paint = bar.locator(".studio-object-paint");
  await expect(paint).toBeVisible();
  await expect
    .poll(async () =>
      Math.abs(
        (await paint.locator("button").nth(0).boundingBox())!.y -
          (await paint.locator("button").nth(1).boundingBox())!.y,
      ),
    )
    .toBeLessThan(1);
  const group = (await paint.boundingBox())!;
  expect(group.height).toBe(36);
  expect(group.width).toBe(76);
  const body = await page.locator("body").getAttribute("style");
  const shortcut = paint.getByRole("button", { name: "Palettes", exact: true });
  await shortcut.click();
  const popover = page.locator("[data-palette-popover]");
  await expect(popover).toBeVisible();
  expect((await popover.boundingBox())!.height).toBeLessThan(150);
  const bounds = (await popover.boundingBox())!;
  expect(bounds.y + bounds.height).toBeLessThan(group.y);
  await expect(popover.getByRole("textbox")).toHaveCount(0);
  await page.screenshot({ path: "artifacts/designer-ux/studio-palette-controls.png" });
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
  await expect(shortcut).toBeFocused();
  expect(await page.locator("body").getAttribute("style")).toBe(body);
});

test("document palette detects original image colors without sampling compositor pixels", async ({
  page,
}) => {
  test.setTimeout(60000);
  await open(page);
  const source = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 32;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ff4400";
    context.fillRect(0, 0, 32, 32);
    context.fillStyle = "#264653";
    context.fillRect(32, 0, 32, 32);
    return canvas.toDataURL("image/png");
  });
  const project = createProject({
    assets: {
      "source-image": {
        id: "source-image",
        name: "Two inks",
        width: 64,
        height: 32,
        mime: "image/png",
        dataUrl: source,
      },
    },
    pages: [
      createPage({
        id: "image-palette-page",
        width: 400,
        height: 300,
        background: "transparent",
        layers: [
          createLayer("image", {
            id: "palette-owner",
            assetId: "source-image",
            x: 0,
            y: 0,
            width: 400,
            height: 300,
            fill: "#00ff00",
          }),
        ],
      }),
    ],
  });
  await page.evaluate((value) => {
    window.musart!.load(value);
    window.musart!.select([]);
  }, project);
  await page.locator(".inspector .color-control .palette-shortcut").first().click();
  const popover = page.locator("[data-palette-popover]");
  await expect(
    popover.getByRole("combobox", { name: "Saved palettes", exact: true }),
  ).toContainText("All");
  await expect(popover.getByRole("button", { name: /#ff4400/ })).toBeVisible();
  await expect(popover.getByRole("button", { name: /#264653/ })).toBeVisible();
  await expect(popover.getByRole("button", { name: /#00ff00/ })).toHaveCount(0);
  await expect(popover.getByRole("alert")).toHaveCount(0);
});

test("All lists saved palettes lazily in a bounded scroll area above document colors", async ({
  page,
}) => {
  test.setTimeout(60000);
  await open(page);
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("musart-palettes", 2);
      request.onupgradeneeded = () => {
        for (const name of ["palettes", "metadata", "retired"])
          request.result.createObjectStore(name, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["palettes", "metadata"], "readwrite");
      for (let index = 0; index < 60; index++) {
        const id = `palette-${String(index).padStart(2, "0")}`;
        const summary = { id, name: `Saved ${index}`, revision: `revision-${index}` };
        transaction.objectStore("metadata").put(summary);
        transaction.objectStore("palettes").put({
          ...summary,
          colors: [{ id: `color-${index}`, name: "Ink", value: "#264653" }],
        });
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    const observed = window as unknown as { palettePayloadReads: string[] };
    observed.palettePayloadReads = [];
    const original = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (key) {
      if (this.name === "palettes")
        observed.palettePayloadReads.push(typeof key === "string" ? key : "<non-string>");
      return original.call(this, key);
    };
  });
  await page.locator(".inspector .color-control .palette-shortcut").first().click();
  const popover = page.locator("[data-palette-popover]");
  const selector = popover.getByRole("combobox", { name: "Saved palettes", exact: true });
  const list = popover.locator(".palette-library-list");
  const documentColors = popover.getByRole("region", { name: "Document", exact: true });
  await expect(selector).toContainText("All");
  await expect(list.locator(".palette-library-row")).toHaveCount(50);
  await expect(
    list.getByRole("button", { name: "Ink #264653", exact: true }).first(),
  ).toBeVisible();
  const reads = () =>
    page.evaluate(
      () => (window as unknown as { palettePayloadReads: string[] }).palettePayloadReads,
    );
  expect((await reads()).length).toBeLessThanOrEqual(4);
  const bounds = (await list.boundingBox())!;
  expect(bounds.height).toBeLessThanOrEqual(180);
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect(documentColors).toBeVisible();
  expect((await documentColors.boundingBox())!.y).toBeGreaterThan(bounds.y + bounds.height);
  expect((await popover.boundingBox())!.height).toBeLessThanOrEqual(420);
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(list.getByRole("button", { name: "Saved 49", exact: true })).toBeEnabled();
  expect((await reads()).length).toBeLessThanOrEqual(8);
  await selector.click();
  await expect(page.getByRole("option", { name: "Document", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Saved 4", exact: true }).click();
  await expect(list.locator(".palette-library-row")).toHaveCount(1);
  await expect(list.getByRole("button", { name: "Saved 4", exact: true })).toBeVisible();
  await expect(documentColors).toBeVisible();
  await selector.click();
  await page.getByRole("option", { name: "All", exact: true }).click();
  await popover.getByRole("button", { name: "Next palettes", exact: true }).click();
  await expect(list.locator(".palette-library-row")).toHaveCount(10);
  await expect(list.getByRole("button", { name: "Saved 50", exact: true })).toBeVisible();
});

test("unlinked palette generations preview their addressed color and apply with one undo", async ({
  page,
}) => {
  test.setTimeout(60000);
  await open(page);
  const before = await page.evaluate(() => window.musart!.snapshot());
  await page.locator(".inspector .color-control .palette-shortcut").first().click();
  const popover = page.locator("[data-palette-popover]");
  await popover.getByRole("button", { name: "New palette", exact: true }).click();
  const editor = popover.locator(".palette-editor"),
    canvas = page.locator(".editor-gpu-scene canvas"),
    baseline = await canvas.screenshot();
  await editor.getByRole("button", { name: "Generate harmonious variation", exact: true }).click();
  await expect.poll(async () => Buffer.compare(await canvas.screenshot(), baseline)).not.toBe(0);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(before.revision);
  await editor.getByRole("button", { name: "Apply", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().revision))
    .toBe(before.revision + 1);
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.fill),
  ).not.toBe("#e26d3f");
  await editor.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project))
    .toEqual(before.project);
});

test("Studio palette links and generations replace gradient paint with solid ink and undo restores it", async ({
  page,
}) => {
  test.setTimeout(90000);
  await open(page, true);
  await page.evaluate(() => {
    const layer = window.musart!.snapshot().project.pages[0]!.layers[0]!;
    window.musart!.execute({
      type: "updateLayers",
      ids: [layer.id],
      patch: {
        spatial: { ...layer.spatial!, useModelMaterials: true },
        fillGradient: {
          kind: "linear",
          angle: 0,
          stops: [
            { offset: 0, color: "#ff0000" },
            { offset: 1, color: "#0000ff" },
          ],
        },
      },
    });
  });
  const before = await page.evaluate(() => window.musart!.snapshot());
  const shortcut = page.locator(".studio-object-paint .palette-shortcut");
  await shortcut.click();
  const popover = page.locator("[data-palette-popover]");
  await popover
    .locator(".palette-detected")
    .getByRole("button", { name: /#ff0000/ })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Link as document color", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const snapshot = window.musart!.snapshot(),
          layer = snapshot.project.pages[0]!.layers[0]!;
        return {
          gradient: !!layer.fillGradient,
          model: layer.spatial!.useModelMaterials,
          fill: layer.fill,
          linked: layer.colorLinks?.fill === snapshot.project.colors?.[0]?.id,
          revision: snapshot.revision,
        };
      }),
    )
    .toEqual({
      gradient: false,
      model: false,
      fill: "#ff0000",
      linked: true,
      revision: before.revision + 1,
    });
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project))
    .toEqual(before.project);
  await shortcut.click();
  await popover.getByRole("button", { name: "New palette", exact: true }).click();
  const editor = popover.locator(".palette-editor"),
    canvas = page.locator(".editor-gpu-scene canvas");
  const baseline = await canvas.screenshot();
  const revision = await page.evaluate(() => window.musart!.snapshot().revision);
  await editor.getByRole("button", { name: "Generate harmonious variation", exact: true }).click();
  await expect.poll(async () => Buffer.compare(await canvas.screenshot(), baseline)).not.toBe(0);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(revision);
  await editor.getByRole("button", { name: "Apply", exact: true }).click();
  const changed = await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!);
  expect(changed.fillGradient).toBeUndefined();
  expect(changed.spatial!.useModelMaterials).toBe(false);
  await editor.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.musart!.snapshot().project))
    .toEqual(before.project);
});
