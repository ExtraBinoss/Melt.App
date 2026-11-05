import { expect, test } from "@playwright/test";
import { objectSelectionFixture } from "./support/object-selection-fixture";
test("cancelling the compact background action prevents late commits without preparing SAM", async ({
  page,
}) => {
  await objectSelectionFixture(page, 1200);
  const before = await page.evaluate(() => window.musart!.snapshot());
  await page.getByRole("button", { name: "Remove background", exact: true }).click();
  const panel = page.locator('.tool-settings[data-tool="segment"]');
  await expect(panel.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await expect(panel.locator(".background-target-thumbnail")).toBeVisible();
  await expect(panel).toContainText("MB");
  await expect(panel).toContainText("50 %");
  await page.evaluate(() => window.musart!.select([]));
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(panel).not.toBeVisible();
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before.project);
  expect(
    await page.evaluate(() => JSON.parse(document.documentElement.dataset.modelRequests!)),
  ).toEqual(["background"]);
});
