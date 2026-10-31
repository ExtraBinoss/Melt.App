import { expect, test } from "@playwright/test";
async function language(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
}
test("new user projects publish the same incremented name saved in IndexedDB", async ({ page }) => {
  await language(page);
  await page.goto("/dashboard?automation=1");
  for (let index = 0; index < 2; index++) {
    if (index) await page.getByRole("button", { name: "Project menu", exact: true }).click();
    await page
      .getByRole("button", { name: index ? "New project" : "Custom canvas", exact: true })
      .click();
    const form = page.locator(".new-project-form");
    await form.getByRole("textbox", { name: "Name", exact: true }).fill("Native naming");
    await form.locator('button[type="submit"]').click();
    await page.waitForFunction(() => Boolean(window.musart));
    const expected = index ? "Native naming 1" : "Native naming";
    await expect
      .poll(() => page.evaluate(() => window.musart!.snapshot().project.name))
      .toBe(expected);
    await expect(page.locator(".editor-gpu-scene canvas")).toHaveAttribute(
      "data-renderer-ready",
      "true",
    );
  }
  const id = await page.evaluate(() => window.musart!.snapshot().project.id);
  await page.goto(`/editor?project=${encodeURIComponent(id)}&automation=1`);
  await page.waitForFunction(() => Boolean(window.musart));
  expect(await page.evaluate(() => window.musart!.snapshot().project.name)).toBe("Native naming 1");
});
