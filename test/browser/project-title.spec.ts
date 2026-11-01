import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
test("editor tab title follows project load, rename, undo and redo without leaking into dashboard", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => !!window.musart);
  const project = createProject({
    name: "Étude & lumière",
    pages: [
      createPage({
        width: 96,
        height: 64,
        layers: [createLayer("rectangle", { width: 40, height: 30 })],
      }),
    ],
  });
  await page.evaluate((project) => window.musart!.load(project), project);
  await expect(page).toHaveTitle("Étude & lumière - Melt");
  await expect(page.locator(".project-pill-title")).toHaveText("Étude & lumière");
  await page.evaluate(() =>
    window.musart!.execute({ type: "renameProject", name: "Encre <papier>" }),
  );
  await expect(page).toHaveTitle("Encre <papier> - Melt");
  await page.evaluate(() => window.musart!.undo());
  await expect(page).toHaveTitle("Étude & lumière - Melt");
  await page.evaluate(() => window.musart!.redo());
  await expect(page).toHaveTitle("Encre <papier> - Melt");
  await page.locator('a[href="/dashboard"]').click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page).toHaveTitle("Dashboard · Melt");
});
