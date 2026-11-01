import { expect, test } from "@playwright/test";
import { createProject, createPage, createLayer, EditorEngine } from "@musart/core";

test("gentle ruler and playback approaches keep the peek still; inward movement opens the dock", async ({
  page,
}) => {
  page.setDefaultTimeout(12000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          width: 320,
          height: 240,
          layers: [createLayer("rectangle", { width: 100, height: 100, fill: "#8757ff" })],
        }),
      ],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => window.musart!.load(project), engine.getSnapshot().project);
  const dock = page.locator(".motion-timeline-dock");
  await expect(dock).toHaveAttribute("data-motion-presence", "peek");
  await expect(dock).not.toHaveAttribute("data-motion-animating");
  const ruler = (await page.locator(".motion-ruler").boundingBox())!;
  const play = page.getByRole("button", { name: "Play", exact: true });
  const before = (await play.boundingBox())!;
  const revision = await page.evaluate(() => window.musart!.snapshot().revision);
  await page.mouse.move(ruler.x + 100, ruler.y - 100);
  await page.mouse.move(ruler.x + 100, ruler.y + 5, { steps: 12 });
  await page.waitForTimeout(250);
  await expect(dock).toHaveAttribute("data-motion-expanded", "false");
  await page.mouse.move(ruler.x + 220, ruler.y + 5, { steps: 16 });
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2, { steps: 30 });
  await page.waitForTimeout(250);
  await expect(dock).toHaveAttribute("data-motion-expanded", "false");
  expect((await play.boundingBox())!.y).toBeCloseTo(before.y, 2);
  await page.mouse.down();
  await page.waitForTimeout(160);
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.waitForTimeout(250);
  await expect(dock).toHaveAttribute("data-motion-expanded", "false");
  expect(
    (await page.getByRole("button", { name: "Pause", exact: true }).boundingBox())!.y,
  ).toBeCloseTo(before.y, 2);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.screenshot({ path: "artifacts/dock-intent/peek-play.png" });
  await page.mouse.move(ruler.x + 120, ruler.y + 24);
  await expect(dock).toHaveAttribute("data-motion-expanded", "true");
  await expect(dock).not.toHaveAttribute("data-motion-animating");
  await page.screenshot({ path: "artifacts/dock-intent/intent-open.png" });
  await page.mouse.move(ruler.x + 120, ruler.y - 400);
  await expect(dock).toHaveAttribute("data-motion-expanded", "false");
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(revision);
});
