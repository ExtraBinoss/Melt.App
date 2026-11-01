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
  test("visible Second Skin plays its encoded card, while opening installs the full original", async ({
    page,
  }) => {
    test.setTimeout(60000);
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
    const original = await page.evaluate(() =>
      Object.values(window.musart!.snapshot().project.assets).find(
        (asset) => asset.kind === "video",
      ),
    );
    expect(original).toMatchObject({ width: 720, height: 1280, byteLength: 4369382 });
  });
});
