import { expect, test, type Page } from "@playwright/test";

const guide = (page: Page) => page.getByRole("region", { name: "Melt tutorial" });
async function start(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    const sample = { trusted: false, delivered: 0 };
    Object.defineProperty(window, "__tutorialDrag", { value: sample });
    window.addEventListener(
      "dragenter",
      (event) => {
        sample.trusted = event.isTrusted;
      },
      true,
    );
    document.addEventListener("dragenter", () => {
      sample.delivered++;
    });
  });
  await page.goto("/editor?automation=1");
  await page.getByRole("button", { name: "Yes, start tutorial" }).click({ timeout: 30000 });
  await expect(guide(page).getByRole("heading", { name: "Your canvas" })).toBeVisible({
    timeout: 30000,
  });
}
async function next(page: Page, title: string) {
  await guide(page).getByRole("button", { name: "Next", exact: true }).click();
  await expect(guide(page).getByRole("heading", { name: title, exact: true })).toBeVisible();
}
async function locked(page: Page, title: string, selector: string) {
  const revision = await page.evaluate(() => window.musart!.snapshot().revision);
  for (const button of ["left", "right"] as const) await page.mouse.click(4, 400, { button });
  await guide(page).getByRole("heading", { name: title, exact: true }).click();
  for (const key of ["Escape", "Delete", "Control+z", "Control+k"]) await page.keyboard.press(key);
  await page.mouse.wheel(0, 600);
  await expect(page.locator(selector).first()).toBeVisible();
  await expect(guide(page).getByRole("heading", { name: title, exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(revision);
  await expect(page.getByRole("dialog", { name: "Search Melt" })).toHaveCount(0);
  await expect
    .poll(async () => {
      const mascot = await guide(page).locator(".tutorial-mascot").boundingBox();
      const viewport = page.viewportSize()!;
      return (
        !!mascot &&
        mascot.x >= 0 &&
        mascot.y >= 0 &&
        mascot.x + mascot.width <= viewport.width &&
        mascot.y + mascot.height <= viewport.height
      );
    })
    .toBe(true);
}
async function resume(page: Page, title: string, surface: string) {
  await guide(page).getByRole("button", { name: "Exit tutorial" }).click();
  await expect(page.getByRole("heading", { name: "Leave the tutorial?" })).toBeVisible();
  await expect(guide(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Keep going" }).click();
  await expect(guide(page).getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.locator(surface).first()).toBeVisible();
}

test("guide geometry follows small and large viewport changes without a dead zone", async ({
  page,
}) => {
  await start(page);
  await next(page, "Your tools");
  await next(page, "Properties");
  for (const size of [
    { width: 1600, height: 1000 },
    { width: 1608, height: 1008 },
    { width: 1280, height: 800 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(async () => {
        const target = (await page.locator(".inspector-tabs").boundingBox())!;
        const card = (await guide(page).boundingBox())!;
        return Math.max(
          Math.abs(target.x - card.x - card.width - 72),
          Math.abs(target.y + target.height / 2 - card.y - card.height / 2),
        );
      })
      .toBeLessThan(1);
  }
  const native = await page.context().newCDPSession(page);
  try {
    const data = {
      items: [{ mimeType: "text/plain", data: "Outside tutorial", title: "", baseURL: "" }],
      dragOperationsMask: 1,
    };
    for (const type of ["dragEnter", "dragOver", "drop"] as const)
      await native.send("Input.dispatchDragEvent", { type, x: 4, y: 400, data });
    expect(await page.evaluate(() => Reflect.get(window, "__tutorialDrag"))).toEqual({
      trusted: true,
      delivered: 0,
    });
  } finally {
    await native.detach();
  }
});

test("guided effects reject outside clicks, sibling actions and shortcuts; exit/resume restores Dither", async ({
  page,
}) => {
  await start(page);
  for (const title of ["Your tools", "Properties", "Layers"]) await next(page, title);
  const forest = page.getByRole("treeitem").filter({ hasText: /^Forest/ });
  await forest.click();
  await expect(guide(page).getByRole("heading", { name: "Layers", exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.musart!.snapshot().selection)).toHaveLength(0);
  await next(page, "Open the effect menu");
  await next(page, "Add an effect");
  await locked(page, "Add an effect", '[data-effect-menu-category="effect"]');
  await page.locator('[data-effect-menu-category="adjustment"]').click();
  await expect(
    guide(page).getByRole("heading", { name: "Add an effect", exact: true }),
  ).toBeVisible();
  await page.locator('[data-effect-menu-category="effect"]').click();
  await locked(page, "Try Dither", '[data-effect-catalog-item="dither"]');
  const dither = (await page.locator('[data-effect-catalog-item="dither"]').boundingBox())!;
  const other = (await page.locator('[data-effect-catalog-item="bit-dither"]').boundingBox())!;
  await page.mouse.move(dither.x + dither.width / 2, dither.y + dither.height / 2);
  await page.mouse.down();
  await page.mouse.move(other.x + other.width / 2, other.y + other.height / 2);
  await page.mouse.up();
  await expect(guide(page).getByRole("heading", { name: "Try Dither" })).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        window.musart!.snapshot().project.pages[0]!.layers.find((layer) => layer.name === "Lake")!
          .effects.length,
    ),
  ).toBe(0);
  await resume(page, "Try Dither", '[data-effect-catalog-item="dither"]');
  await expect(page.locator(".effect-catalog input")).toHaveValue("dither");
  // Simulate the owner closing independently; the acquired surface recovers too.
  await page.evaluate(() =>
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );
  await expect(page.locator('[data-effect-catalog-item="dither"]')).toBeVisible();
  await expect(page.locator(".effect-catalog input")).toHaveValue("dither");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator('[data-effect-catalog-item="dither"]')).toBeVisible();
  await expect(guide(page).getByRole("button", { name: "Next", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(guide(page).getByRole("heading", { name: "Back to your canvas" })).toBeVisible();
});

test("animation and export stay open until the lesson action or explicit guide navigation", async ({
  page,
}) => {
  await start(page);
  for (const title of [
    "Your tools",
    "Properties",
    "Layers",
    "Open the effect menu",
    "Add an effect",
    "Try Dither",
    "Back to your canvas",
    "Static and Motion",
    "Make it move",
    "Right-click your image",
    "Add a transition",
  ])
    await next(page, title);
  await locked(page, "Add a transition", '[data-tutorial="add-transition"]');
  await next(page, "Add a pop");
  await locked(page, "Add a pop", '[data-preset-id="scale-pop"]');
  await resume(page, "Add a pop", '[data-preset-id="scale-pop"]');
  await page.locator('[data-preset-id="scale-pop"]').click();
  await expect(guide(page).getByRole("heading", { name: "Pin the timeline" })).toBeVisible();
  for (const title of ["Your timeline", "Play", "Export", "The export window"])
    await next(page, title);
  await locked(page, "The export window", ".export-dialog");
  await page.locator('.export-dialog [data-slot="dialog-close"]').click();
  await expect(page.locator(".export-dialog")).toBeVisible();
  await next(page, "Save your video");
  await locked(page, "Save your video", ".export-submit");
  await guide(page).getByRole("button", { name: "Previous" }).click();
  await locked(page, "Motion video", '.export-dialog [data-segmented-value="motion"]');
  await page.locator('.export-dialog [data-segmented-value="motion"]').click();
  await expect(page.locator(".export-dialog")).toBeVisible();
  // Reviewing an already active output waits for explicit guide navigation.
  await next(page, "Save your video");
  await guide(page).getByRole("button", { name: "Exit tutorial" }).click();
  await page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Leave the tutorial?" }) })
    .getByRole("button", { name: "Exit tutorial" })
    .click();
  await expect(guide(page)).toHaveCount(0);
  // Every native lock is removed after exit, including dialog dismissal.
  if (await page.locator(".export-dialog").count())
    await page.locator('.export-dialog [data-slot="dialog-close"]').click();
  await expect(page.locator(".export-dialog")).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
});
