import { expect, test, type Page } from "@playwright/test";

async function expectSpotlight(page: Page, selector: string) {
  await expect
    .poll(async () => {
      const highlight = await page.locator(".tutorial-highlight").boundingBox();
      const target = await page.locator(selector).boundingBox();
      if (!highlight || !target) return 999;
      return Math.max(
        Math.abs(highlight.x - target.x + 4),
        Math.abs(highlight.y - target.y + 4),
        Math.abs(highlight.width - target.width - 8),
        Math.abs(highlight.height - target.height - 8),
      );
    })
    .toBeLessThan(3);
  const target = await page.locator(selector).boundingBox();
  const guide = await page.getByRole("region", { name: "Melt tutorial" }).boundingBox();
  expect(
    target &&
      guide &&
      target.x < guide.x + guide.width &&
      target.x + target.width > guide.x &&
      target.y < guide.y + guide.height &&
      target.y + target.height > guide.y,
  ).toBe(false);
}

test("guided editor practice, automatic tasks, exit and editor-only replay", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("musart.language", "en"));
  await page.goto("/editor");
  await expect(
    page.getByRole("heading", { name: "Do you want to start a quick tutorial?" }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Yes, start tutorial" }).click();
  const guide = page.getByRole("region", { name: "Melt tutorial" });
  await expect(guide.getByRole("heading", { name: "Your canvas" })).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".tutorial-highlight")).toBeVisible();
  await expect(guide.locator("svg.melt-mascot")).toHaveCount(1);
  await expect(guide.locator("img")).toHaveCount(0);
  await expect
    .poll(async () => {
      const box = await guide.boundingBox();
      const viewport = page.viewportSize()!;
      return box
        ? Math.max(
            Math.abs(box.x + box.width / 2 - viewport.width / 2),
            Math.abs(box.y + box.height / 2 - viewport.height / 2),
          )
        : 999;
    })
    .toBeLessThan(3);
  expect(
    await page.locator(".tutorial-highlight").evaluate((node) => getComputedStyle(node).boxShadow),
  ).toContain("0.72");
  await guide.getByRole("button", { name: "Exit tutorial" }).click();
  await expect(guide).toHaveCount(0);
  await page.getByRole("button", { name: "Keep going" }).click();
  await expect(guide).toBeVisible();
  await expect
    .poll(async () => {
      const previous = await guide.getByRole("button", { name: "Previous" }).boundingBox();
      const text = await guide.locator('p[aria-hidden="true"]').boundingBox();
      return previous && text ? Math.abs(previous.x - text.x) : 999;
    })
    .toBeLessThan(1);
  for (const title of ["Your tools", "Properties", "Layers"]) {
    await guide.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide.getByRole("heading", { name: title, exact: true })).toBeVisible();
    if (title === "Your tools") {
      await expect(guide.locator('[data-slot="kbd"]').first()).toHaveText("Ctrl");
      await expect(guide.locator('[data-slot="kbd"]').last()).toHaveText("Wheel");
    }
  }
  await guide.getByRole("button", { name: "Previous" }).click();
  await expect(guide.getByRole("heading", { name: "Properties", exact: true })).toBeVisible();
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  await expect(guide.getByRole("heading", { name: "Layers", exact: true })).toBeVisible();
  let beforeMotionWidth = 0;
  for (const title of [
    "Open the effect menu",
    "Add an effect",
    "Try Dither",
    "Make it move",
    "Pin the timeline",
    "Add a pop",
    "Play",
    "Export",
    "Save your video",
  ]) {
    if (title === "Make it move") {
      beforeMotionWidth = (await page.getByTestId("artboard").boundingBox())!.width;
      await page.locator('[data-effect-catalog-item="dither"]').click();
    } else if (title === "Play") await page.locator('[data-preset-id="scale-pop"]').click();
    else if (title === "Add an effect")
      await page.locator('.layer-create-actions button[aria-haspopup="menu"]').click();
    else if (title === "Try Dither")
      await page.locator('[data-effect-menu-category="effect"]').click();
    else await guide.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide.getByRole("heading", { name: title, exact: true })).toBeVisible();
    if (title === "Try Dither")
      await expect(page.locator('.effect-catalog[data-effect-category="effect"]')).toBeVisible();
    if (title === "Try Dither") {
      await expect(
        page.locator('.effect-catalog[data-effect-category="effect"] input'),
      ).toHaveValue("dither");
      await expect(page.locator('[data-effect-catalog-item="dither"]')).toBeVisible();
      await expectSpotlight(page, '[data-effect-catalog-item="dither"]');
      await page.screenshot({ path: "artifacts/tutorial/dither-guide.png" });
    }
    if (title === "Add a pop") await expect(page.locator(".animation-picker")).toBeVisible();
    if (title === "Make it move") {
      await expect
        .poll(async () => (await page.getByTestId("artboard").boundingBox())!.width)
        .toBeGreaterThan(beforeMotionWidth * 1.2);
      await expectSpotlight(page, '.motion-mode [data-segmented-value="motion"]');
    }
  }
  await expect(page.locator(".motion-export-preview-surface")).toBeVisible();
  await expect
    .poll(async () => {
      const highlight = await page.locator(".tutorial-highlight").boundingBox();
      const target = await page.locator(".export-submit").boundingBox();
      if (!highlight || !target) return 999;
      return Math.max(Math.abs(highlight.x - target.x + 4), Math.abs(highlight.y - target.y + 4));
    })
    .toBeLessThan(3);
  await page.screenshot({ path: "artifacts/tutorial/export-guide.png" });
  const downloading = page.waitForEvent("download");
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.(mp4|webm)$/);
  await download.saveAs("artifacts/tutorial/practice-video.mp4");
  await expect(guide.getByRole("heading", { name: "You're ready" })).toBeVisible({
    timeout: 30000,
  });
  await guide.getByRole("button", { name: "Exit tutorial" }).click();
  await expect(page.getByRole("heading", { name: "Leave the tutorial?" })).toBeVisible();
  await expect(guide).toHaveCount(0);
  await page.getByRole("button", { name: "Keep going" }).click();
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "Exit tutorial" }).click();
  await page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Leave the tutorial?" }) })
    .getByRole("button", { name: "Exit tutorial" })
    .click();
  await expect(guide).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("musart.editor-tutorial.v1"))).toBe("done");
  await page.locator('.export-dialog [data-slot="dialog-close"]').click();
  await expect(page.locator(".export-dialog")).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("Editor settings");
  await page.getByRole("option").filter({ hasText: "Editor settings" }).click();
  await page.getByRole("button", { name: "Replay onboarding" }).click();
  await expect(
    page.getByRole("heading", { name: "Do you want to start a quick tutorial?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "No, thanks" }).click();
  await expect(guide).toHaveCount(0);
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Replay onboarding" })).toHaveCount(0);
});

test("Next opens the effect library after its parent menu dismisses", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("musart.language", "en"));
  await page.goto("/editor");
  await page.getByRole("button", { name: "Yes, start tutorial" }).click({ timeout: 30000 });
  const guide = page.getByRole("region", { name: "Melt tutorial" });
  await expect(guide.getByRole("heading", { name: "Your canvas" })).toBeVisible({ timeout: 30000 });
  for (const title of [
    "Your tools",
    "Properties",
    "Layers",
    "Open the effect menu",
    "Add an effect",
    "Try Dither",
  ]) {
    await guide.getByRole("button", { name: "Next", exact: true }).click();
    await expect(guide.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  await expect(page.locator('.effect-catalog[data-effect-category="effect"] input')).toHaveValue(
    "dither",
  );
  await expect(page.locator('[data-effect-catalog-item="dither"]')).toBeVisible();
  await expectSpotlight(page, '[data-effect-catalog-item="dither"]');
  await guide.getByRole("button", { name: "Next", exact: true }).click();
  await expect(guide.getByRole("heading", { name: "Make it move" })).toBeVisible();
});

test("a burst of Next clicks runs each tutorial action once through Motion and Pop", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("musart.language", "en"));
  await page.goto("/editor?automation=1");
  await page.getByRole("button", { name: "Yes, start tutorial" }).click({ timeout: 30000 });
  const guide = page.getByRole("region", { name: "Melt tutorial" });
  await expect(guide.getByRole("heading", { name: "Your canvas" })).toBeVisible({ timeout: 30000 });
  await guide
    .getByRole("button", { name: "Next", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      for (let i = 0; i < 10; i++) button.click();
    });
  await expect(guide.getByRole("heading", { name: "Play", exact: true })).toBeVisible({
    timeout: 20000,
  });
  await expect(guide.getByRole("alert")).toHaveCount(0);
  await expect(page.locator('[data-motion-pinned="true"]')).toBeVisible();
  await expect(guide.locator('svg[data-mascot-shape="pointer"]')).toHaveCount(1);
  await expect(page.locator(".tutorial-pointer")).toHaveCount(0);
  const result = await page.evaluate(() => {
    const snapshot = window.musart!.snapshot();
    const page = snapshot.project.pages[0]!;
    const layer = page.layers.find((layer) => layer.name === "Lake")!;
    return {
      mode: page.motion?.mode,
      dither: layer.effects.filter((effect) => effect.type === "dither").length,
      pop: page.motion?.tracks
        .find((track) => track.layerId === layer.id)
        ?.animations?.filter((animation) => animation.preset.id === "scale-pop").length,
    };
  });
  expect(result).toEqual({ mode: "motion", dither: 1, pop: 1 });
});
