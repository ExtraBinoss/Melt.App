import { expect, test } from "@playwright/test";

test("landing prepares the library on navigation intent and dashboard leaves editor code unloaded", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  await page.goto("/");
  await expect(page.locator(".landing-template-stage > img").first()).toHaveJSProperty(
    "complete",
    true,
  );
  await page.waitForTimeout(3000);
  expect(requests.filter((path) => /\/(Studio|App|EditorCanvas)-.*\.js$/.test(path))).toEqual([]);
  await page.getByRole("button", { name: "Try Melt", exact: true }).hover();
  await expect.poll(() => requests.some((path) => /\/Studio-.*\.js$/.test(path))).toBe(true);
  await page.getByRole("button", { name: "Try Melt", exact: true }).click();
  await expect(page.locator(".project-dashboard")).toBeVisible();
  await page.waitForTimeout(3500);
  expect(requests.filter((path) => /\/(App|EditorCanvas)-.*\.js$/.test(path))).toEqual([]);
  expect(requests.filter((path) => path.endsWith(".mp4"))).toEqual([]);
});

test.describe("touch library", () => {
  test.use({ viewport: { width: 412, height: 823 }, hasTouch: true, isMobile: true });
  test("the footer mounts its genuine language picker near the viewport and remains usable on touch", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator(".site-languages [role=combobox]")).toHaveCount(0);
    await page.locator(".site-footer").scrollIntoViewIfNeeded();
    const language = page.getByRole("combobox", { name: "Language", exact: true });
    await expect(language).toBeVisible();
    await language.tap();
    await page.getByRole("option", { name: "Français", exact: true }).tap();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("combobox", { name: "Langue", exact: true })).toContainText(
      "Français",
    );
  });
  test("visible Second Skin plays its encoded card, while opening installs the full original", async ({
    page,
  }) => {
    test.setTimeout(60000);
    page.on("console", (message) => {
      if (["error", "warn"].includes(message.type()))
        console.log("[native preview]", message.text());
    });
    page.on("pageerror", (error) => console.log("[native page error]", error.message));
    const requests: string[] = [];
    page.on("request", (request) => requests.push(new URL(request.url()).pathname));
    await page.goto("/dashboard?automation=1");
    const card = page.locator(".template-card-entry").filter({ hasText: "Second Skin" });
    const preview = card.locator(".motion-template-preview");
    await expect(preview).toHaveAttribute("data-preview-status", "playing", { timeout: 30000 });
    await expect
      .poll(async () =>
        Number(
          await preview
            .locator(".motion-template-preview-canvas")
            .getAttribute("data-preview-time"),
        ),
      )
      .toBeGreaterThan(0);
    expect(requests).toContain("/templates/motion/second-skin/second-skin.card.mp4");
    expect(requests).not.toContain("/templates/motion/second-skin/second-skin.preview.json");
    expect(requests.some((path) => /\/three\.(webgpu|core)-/.test(path))).toBe(false);
    expect(requests).not.toContain("/templates/motion/second-skin/media/second-skin-dancer.mp4");
    expect(requests.filter((path) => /\/(App|EditorCanvas)-.*\.js$/.test(path))).toEqual([]);
    await page.screenshot({ path: "artifacts/lighthouse/second-skin-touch-preview.png" });
    const video = preview.locator("video");
    expect(
      await video.evaluate((node: HTMLVideoElement) => ({
        width: node.videoWidth,
        height: node.videoHeight,
        duration: node.duration,
      })),
    ).toEqual({ width: 270, height: 480, duration: 10 });
    await card.locator(".project-preview-open").click();
    const dialog = page.locator(".library-item-dialog");
    await expect(dialog.locator(".motion-template-preview")).toHaveAttribute(
      "data-preview-status",
      "playing",
      { timeout: 30000 },
    );
    await expect(dialog.locator(".motion-template-preview-canvas > canvas")).toBeVisible();
    expect(requests).toContain("/templates/motion/second-skin/second-skin.preview.json");
    expect(requests).toContain("/templates/motion/second-skin/media/second-skin-preview.mp4");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await card.locator(".library-item-open").click();
    await expect(page.locator(".project-dashboard")).toHaveCount(0);
    await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible({
      timeout: 30000,
    });
    expect(requests).toContain("/templates/motion/second-skin/media/second-skin-dancer.mp4");
    await page.waitForFunction(() => Boolean(window.musart));
    const original = await page.evaluate(() =>
      Object.values(window.musart!.snapshot().project.assets).find(
        (asset) => asset.kind === "video",
      ),
    );
    expect(original).toMatchObject({ width: 720, height: 1280, byteLength: 4369382 });
    const savedId = await page.evaluate(() => window.musart!.snapshot().project.id);
    await page.evaluate(() => window.musart!.flushThumbnails());
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      const reads: string[] = [];
      Object.defineProperty(window, "__libraryPayloadReads", { value: reads });
      for (const method of ["get", "getAll", "openCursor"] as const) {
        const original = IDBObjectStore.prototype[method];
        Object.defineProperty(IDBObjectStore.prototype, method, {
          configurable: true,
          value: function (this: IDBObjectStore, ...args: unknown[]) {
            if (["assets", "mediaOriginals", "journal", "journalAssets"].includes(this.name))
              reads.push(this.name);
            return Reflect.apply(original, this, args);
          },
        });
      }
    });
    requests.length = 0;
    await page.goto("/dashboard?automation=1");
    await page.getByRole("button", { name: "Projects", exact: true }).click();
    const savedCard = page.locator(".project-card-entry").filter({ hasText: "Second Skin" });
    await expect(savedCard).toBeVisible();
    expect(
      await page.evaluate(
        () => (window as unknown as { __libraryPayloadReads: string[] }).__libraryPayloadReads,
      ),
    ).toEqual([]);
    expect(await page.evaluate(() => Boolean(window.musart))).toBe(false);
    expect(requests.filter((path) => /\/(App|EditorCanvas)-.*\.js$/.test(path))).toEqual([]);
    await savedCard.locator(".library-item-open").click();
    await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible({
      timeout: 30000,
    });
    await expect
      .poll(() => page.evaluate(() => window.musart?.snapshot().project.id))
      .toBe(savedId);
  });
});

test.describe("server rendered dashboard", () => {
  test.use({
    javaScriptEnabled: false,
    viewport: { width: 412, height: 823 },
    isMobile: true,
    hasTouch: true,
  });
  test("the real template cards and heading are visible before any client code runs", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "What project would you like to create?", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Preview Second Skin", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".template-card-entry")).not.toHaveCount(0);
    await expect(page.locator(".template-card-entry").first()).toHaveCSS("opacity", "1");
    await expect(page.locator(".project-dashboard")).toHaveCSS("padding", "0px");
    await expect(page.locator(".project-dashboard")).toHaveCSS("border-radius", "0px");
    await expect(page.locator(".canvas-artboard canvas")).toHaveCount(0);
  });
});
