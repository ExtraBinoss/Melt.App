import { expect, test } from "@playwright/test";
import { fixture, prepare } from "./support/motion-canvas";

test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test("timeline modes keep native scrollbar geometry stable and peek hides vertical scrolling", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepare(page, fixture(12));
  const dock = page.locator(".motion-timeline-dock"),
    viewport = page.locator(".motion-timeline-scroll");
  const before = await page.evaluate(() => window.musart!.snapshot().project);
  const widths: number[] = [];
  for (const height of [200, 316]) {
    await page
      .locator(".motion-timeline")
      .evaluate(
        (node, height) => node.style.setProperty("height", `${height}px`, "important"),
        height,
      );
    for (const name of ["Animations", "Keyframes", "Animations", "Keyframes"]) {
      await page.getByRole("button", { name, exact: true }).click();
      const samples = await viewport.evaluate(async (node) => {
        const samples = [];
        for (let i = 0; i < 12; i++) {
          await new Promise(requestAnimationFrame);
          samples.push({
            width: node.clientWidth,
            height: node.clientHeight,
            overflow: node.scrollHeight > node.clientHeight,
          });
        }
        return samples;
      });
      widths.push(...samples.map((sample) => sample.width));
      expect(new Set(samples.map((sample) => `${sample.height}:${sample.overflow}`)).size).toBe(1);
    }
  }
  expect(new Set(widths).size).toBe(1);
  await page.getByRole("button", { name: "Désépingler la timeline", exact: true }).click();
  await page.mouse.move(20, 20);
  await expect(dock).toHaveAttribute("data-motion-body-hidden", "true");
  await expect(viewport).toHaveCSS("overflow-y", "hidden");
  expect(await viewport.evaluate((node) => node.clientWidth)).toBe(widths[0]);
  await page.getByRole("button", { name: "Épingler la timeline", exact: true }).click();
  await expect(dock).toHaveAttribute("data-motion-body-hidden", "false");
  await expect(viewport).toHaveCSS("overflow-y", "auto");
  await viewport.evaluate((node) => {
    node.scrollTop = 100;
  });
  expect(await viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before);
});
