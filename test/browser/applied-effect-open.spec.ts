import { expect, test } from "@playwright/test";

test("Terminal Signal opens its applied CRT controls during playback with live editing and clean dismissal", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(async () => {
    const manifest = await fetch("/templates/motion/terminal-signal/terminal-signal.json").then(
      (r) => r.json(),
    );
    window.musart!.load(manifest.project);
  });
  await page.locator('.editor-gpu-scene canvas[data-renderer-ready="true"]').waitFor();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const trigger = page.locator('button[data-attachment-target="effect"]').first();
  const id = await trigger.getAttribute("data-attachment-effect-id");
  await trigger.click();
  const panel = page.locator('.layer-attachment-popover[data-state="open"]');
  await expect(panel).toBeVisible();
  await expect(panel).toBeFocused();
  await expect(panel.locator("[data-attachment-ready]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  const field = panel.getByRole("textbox", { name: "Opacity", exact: true });
  await field.fill("42");
  await field.press("Tab");
  const opacity = () =>
    page.evaluate(
      (id) =>
        window
          .musart!.snapshot()
          .project.pages[0]!.layers.flatMap((layer) => layer.effects)
          .find((effect) => effect.id === id)?.opacity ?? 1,
      id,
    );
  await expect.poll(opacity).toBe(0.42);
  await page.evaluate(() => window.musart!.undo());
  await expect.poll(opacity).toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".layer-attachment-popover")).toHaveCount(0);
  await trigger.click();
  await expect(panel.locator("[data-attachment-ready]")).toBeVisible();
  await expect(panel.getByRole("textbox", { name: "Opacity", exact: true })).toHaveValue("100");
  await page.keyboard.press("Escape");
  await expect(page.locator(".layer-attachment-popover")).toHaveCount(0);
  expect(errors).toEqual([]);
});
