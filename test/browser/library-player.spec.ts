import { expect, test } from "@playwright/test";
import { installReadbackProbe } from "./support/readback-probe";

test("library cards place progress at the caption divider and dialogs reuse the export player", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.goto("/dashboard");
  const card = page.getByRole("button", { name: "Preview Bloom Windows", exact: true });
  await card.hover();
  // Keep intent owned by this card if the user's native desktop pointer leaves the test window.
  await card.focus();
  const strip = page.locator(".template-card-entry .motion-preview-progress");
  await expect(strip).toBeVisible();
  const divider = await strip.evaluate((element) => {
    const bar = element.getBoundingClientRect();
    const artwork = element.parentElement!;
    return {
      parent: artwork.className,
      offset: bar.bottom - artwork.getBoundingClientRect().bottom,
    };
  });
  expect(divider.parent).toBe("library-card-artwork");
  expect(Math.abs(divider.offset)).toBeLessThan(1);
  await expect(card.locator(".motion-template-preview")).toHaveAttribute(
    "data-preview-status",
    "playing",
  );
  await page
    .getByRole("article", { name: "Bloom Windows", exact: true })
    .screenshot({ path: "artifacts/library-player-card.png" });
  await card.click();
  const preview = page.locator(".library-item-preview");
  const player = preview.locator(".media-player-overlay");
  await expect(player.getByRole("slider")).toBeEnabled();
  await player.getByRole("button", { name: "Pause preview", exact: true }).click();
  await expect(player.getByRole("button", { name: "Play preview", exact: true })).toBeVisible();
  const input = player.getByRole("textbox");
  await input.fill("0:06.0");
  await input.press("Enter");
  await expect(preview.locator(".motion-template-preview-canvas")).toHaveAttribute(
    "data-preview-time",
    "6",
  );
  await preview.screenshot({ path: "artifacts/library-player-dialog.png" });
  const placement = await player.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const preview = element.closest(".library-item-preview")!.getBoundingClientRect();
    return {
      insideBottom: bounds.bottom < preview.bottom && bounds.top > preview.top + preview.height / 2,
      blur: getComputedStyle(element).backdropFilter,
    };
  });
  expect(placement).toEqual({ insideBottom: true, blur: "blur(12px)" });
  for (const [time, value] of [
    ["0:12.0", "12"],
    ["0:00.0", "0"],
  ]) {
    await input.fill(time!);
    await input.press("Enter");
    await expect(player.getByRole("slider")).toHaveAttribute("aria-valuenow", value!);
  }
  await player.getByRole("button", { name: "Play preview", exact: true }).click();
  await expect
    .poll(async () => Number(await player.getByRole("slider").getAttribute("aria-valuenow")))
    .toBeGreaterThan(0);
  const reads = await page.evaluate(() => window.__musartVideoReadbacks);
  expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
});
