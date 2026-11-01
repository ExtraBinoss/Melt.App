import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import {
  photoMenuFixture,
  armHover,
  hoverSample,
  hoverCategory,
} from "./support/effect-menu-hover";

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.evaluate(() => window.__effectMenuDomReads?.restore());
});

test("photo add-menu hover keeps one positioned surface, category drafts and native focus", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const plus = await photoMenuFixture(page);
  const initial = await page.evaluate(() => window.musart!.session());
  const body = await page.evaluate(() => ({
    pointer: document.body.style.pointerEvents,
    overflow: document.body.style.overflow,
  }));
  await armHover(page, "plus", '[data-effect-menu-category="effect"]');
  await plus.click();
  const samples = [await hoverSample(page), await hoverCategory(page, "effect")];
  const menu = page.locator('[data-slot="dropdown-menu-sub-content"][data-state="open"]');
  await expect(menu).toBeVisible();
  const owner = await menu.elementHandle();
  const search = menu.getByRole("searchbox");
  await search.fill("flou");
  await expect(menu.getByRole("menuitem")).toHaveCount(1);
  for (const category of ["adjustment", "effect", "adjustment", "effect"] as const) {
    samples.push(await hoverCategory(page, category));
    expect(
      await owner!.evaluate(
        (node) =>
          node ===
          document.querySelector('[data-slot="dropdown-menu-sub-content"][data-state="open"]'),
      ),
    ).toBe(true);
    await expect(menu.getByRole("searchbox")).toHaveValue(category === "effect" ? "flou" : "");
    const trigger = page.getByRole("menuitem", {
      name: category === "effect" ? "Ajouter un effet" : "Ajouter un réglage",
      exact: true,
    });
    await expect(trigger).toHaveAttribute("data-highlighted");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(menu).toHaveAttribute("aria-labelledby", (await trigger.getAttribute("id"))!);
  }
  expect((await page.evaluate(() => window.musart!.session())).revision).toBe(initial.revision);
  expect(
    await page.evaluate(() => ({
      reads: window.__effectMenuDomReads?.reads,
      supported: window.__effectMenuDomReads?.supported,
    })),
  ).toEqual({ reads: 0, supported: true });
  for (const sample of samples) {
    expect(Object.values(sample.commits)).toEqual([0, 0, 0, 0, 0]);
    if (sample.label !== "plus") {
      expect(sample.hoverPresentationOpportunityMs).toBeDefined();
      expect(sample.hoverPresentationOpportunityMs!).toBeLessThan(100);
    }
  }
  expect(
    await page.evaluate(() => ({
      pointer: document.body.style.pointerEvents,
      overflow: document.body.style.overflow,
    })),
  ).toEqual(body);
  await mkdir("artifacts/effect-hover", { recursive: true });
  await menu.screenshot({ path: "artifacts/effect-hover/catalog.png" });
  await page.screenshot({ path: "artifacts/effect-hover/scene-menu.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(plus).toBeFocused();
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
  await writeFile(
    "artifacts/effect-hover/native-hover.json",
    JSON.stringify({ browser: browser.version(), samples, errors }, null, 2),
  );
  expect(errors).toEqual([]);
});

test("photo add-menu keeps keyboard navigation, non-primary rejection and one native selection/undo", async ({
  page,
}) => {
  test.setTimeout(60000);
  const plus = await photoMenuFixture(page);
  await plus.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Ajouter un effet", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Ajouter un réglage", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const menu = page.locator('[data-slot="dropdown-menu-sub-content"][data-state="open"]');
  await expect(menu.locator('[data-effect-category="adjustment"]')).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("menuitem", { name: "Ajouter un réglage", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("menuitem", { name: "Ajouter un effet", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(menu.locator('[data-effect-category="effect"]')).toBeVisible();
  await menu.getByRole("searchbox").fill("flou");
  const item = menu.getByRole("menuitem", { name: "Flou", exact: true });
  await item.click({ button: "middle" });
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.effects),
  ).toEqual([]);
  await item.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      window.musart!.snapshot().project.pages[0]!.layers[0]!.effects.map((effect) => effect.type),
    ),
  ).toEqual(["blur"]);
  await page.keyboard.press("Control+z");
  expect(await page.evaluate(() => window.musart!.session().canUndo)).toBe(false);
  expect(
    await page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.effects),
  ).toEqual([]);
});

test("cold photo selection enables add actions on the selection feedback frame", async ({
  page,
}) => {
  const plus = await photoMenuFixture(page, false);
  await expect(plus).toBeDisabled();
  const row = page.locator('.layer-row[data-layer-id="photo-layer"]');
  await armHover(
    page,
    "selection",
    ".layers-footer .layer-create-actions button:not(:disabled)",
    undefined,
    1,
  );
  await row.getByText("Image", { exact: true }).click();
  const sample = await hoverSample(page);
  await expect(plus).toBeEnabled();
  await expect(row).toHaveAttribute("aria-selected", "true");
  expect(sample.inputToPresentationOpportunityMs).toBeLessThan(150);
  await plus.click();
  await expect(page.getByRole("menuitem", { name: "Ajouter un effet", exact: true })).toBeVisible();
  await mkdir("artifacts/effect-hover", { recursive: true });
  await writeFile("artifacts/effect-hover/selection.json", JSON.stringify(sample, null, 2));
});

test("hover submenu spans its portaled content, cancels a brief exit and dismisses outside", async ({
  page,
}) => {
  const plus = await photoMenuFixture(page);
  await plus.click();
  await hoverCategory(page, "effect");
  const menu = page.locator('[data-slot="dropdown-menu-sub-content"][data-state="open"]');
  const search = menu.getByRole("searchbox");
  await search.hover();
  const box = (await search.boundingBox())!;
  await page.mouse.move(600, 80);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // The canceled exit must not fire after reentry; the outside dismissal below still must.
  await page.waitForTimeout(260);
  await expect(menu).toBeVisible();
  await menu.getByRole("combobox").click();
  const family = page.getByRole("option", { name: "Toutes les catégories", exact: true });
  await family.hover();
  await page.waitForTimeout(260);
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await menu.getByRole("searchbox").hover();
  await page.mouse.move(600, 80);
  await expect(menu).toBeHidden();
  await expect(page.getByRole("menuitem", { name: "Ajouter un effet", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(plus).toBeFocused();
});

test("rapid category travel and keyboard focus keep exactly one visual highlight", async ({
  page,
}) => {
  const plus = await photoMenuFixture(page);
  await plus.click();
  await hoverCategory(page, "effect");
  const rows = page.locator("[data-effect-menu-category]");
  const boxes = await rows.evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }),
  );
  const record = await page.evaluateHandle(() => {
    const counts: number[] = [];
    const catalogs: number[] = [];
    let frame = 0;
    function sample() {
      counts.push(
        [...document.querySelectorAll("[data-effect-menu-category]")].filter(
          (node) => getComputedStyle(node).backgroundColor !== "rgba(0, 0, 0, 0)",
        ).length,
      );
      catalogs.push(
        [...document.querySelectorAll(".effect-catalog")].filter(
          (node) => node.getBoundingClientRect().height > 0,
        ).length,
      );
      frame = requestAnimationFrame(sample);
    }
    sample();
    return { counts, catalogs, stop: () => cancelAnimationFrame(frame) };
  });
  try {
    for (let i = 0; i < 10; i++) {
      const point = boxes[i % 2 === 0 ? 1 : 0]!;
      await page.mouse.move(point.x, point.y);
    }
    await expect(rows.filter({ hasText: "Ajouter un effet" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(
      page.getByRole("menuitem", { name: "Ajouter un effet", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(
      page.getByRole("menuitem", { name: "Ajouter un réglage", exact: true }),
    ).toBeFocused();
    const counts = await record.evaluate((record) => {
      record.stop();
      return record.counts;
    });
    expect(counts.length).toBeGreaterThan(1);
    expect(Math.max(...counts)).toBe(1);
    expect(await record.evaluate((record) => Math.max(...record.catalogs))).toBe(1);
  } finally {
    await record.evaluate((record) => record.stop());
    await record.dispose();
  }
});
