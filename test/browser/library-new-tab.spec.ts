import { expect, test } from "@playwright/test";
import { createPage, createProject } from "@musart/core";
test("native middle clicks open the dashboard and a durable project dialog without changing the source tab", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await context.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => !!window.musart);
  const project = createProject({
    id: crypto.randomUUID(),
    name: "Middle click project",
    pages: [createPage({ width: 320, height: 240 })],
  });
  await page.evaluate(async (project) => {
    window.musart!.load(project);
    await window.musart!.save();
  }, project);
  const before = await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
  const mascot = page.getByRole("button", { name: "Project menu", exact: true });
  const newDashboard = context.waitForEvent("page");
  await mascot.click({ button: "middle" });
  const dash = await newDashboard;
  await expect(dash).toHaveURL(/\/dashboard$/);
  await expect(dash.locator(".project-dashboard")).toBeVisible({ timeout: 30000 });
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
  await expect(page.locator(".project-dashboard")).toHaveCount(0);
  await dash.locator(".library-navigation-item").filter({ hasText: "Projects" }).click();
  const card = dash.locator(".project-card").filter({ hasText: project.name });
  const newPreview = context.waitForEvent("page");
  await card.locator(".project-preview-open").click({ button: "middle" });
  const preview = await newPreview;
  await expect(preview).toHaveURL(new RegExp(`preview=project&item=${project.id}`));
  await expect(preview.getByRole("dialog", { name: project.name, exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(dash.locator(".library-item-dialog")).toHaveCount(0);
  await preview.reload();
  const dialog = preview.getByRole("dialog", { name: project.name, exact: true });
  await expect(dialog).toBeVisible({ timeout: 30000 });
  await dialog.getByRole("button", { name: "Open in Melt", exact: true }).click();
  await expect(preview).toHaveURL(new RegExp(`/editor\\?project=${project.id}`));
  await expect(preview.locator(".editor-gpu-scene canvas")).toHaveAttribute(
    "data-project-id",
    project.id,
    { timeout: 30000 },
  );
  await preview.close();
  await card.locator(".project-preview-open").click();
  await expect(dash.getByRole("dialog", { name: project.name, exact: true })).toBeVisible();
  await dash.close();
  await page.bringToFront();
  expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(before);
});
test("modified template activation opens its dialog in a new tab, while Space still inspects locally", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  await context.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/dashboard");
  const trigger = page.getByRole("button", { name: "Preview Colorfield", exact: true });
  await expect(trigger).toBeVisible({ timeout: 30000 });
  const created = context.waitForEvent("page");
  await trigger.click({ modifiers: ["Control"] });
  const child = await created;
  await expect(child.getByRole("dialog", { name: "Colorfield", exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.locator(".library-item-dialog")).toHaveCount(0);
  await child.close();
  await trigger.focus();
  await trigger.press("Space");
  await expect(page.getByRole("dialog", { name: "Colorfield", exact: true })).toBeVisible();
});
