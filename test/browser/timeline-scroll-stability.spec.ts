import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
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

test("right timeline fade reaches the content edge with reserved and overlay scrollbar geometry", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.theme", "light");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await prepare(page, fixture(12));
  await page.evaluate(() => window.musart!.select(["card"]));
  await page.getByRole("slider", { name: "Zoom de la timeline", exact: true }).focus();
  await page.keyboard.press("End");
  const viewport = page.locator(".motion-timeline-scroll"),
    shadow = page.locator(".motion-scroll-shadow");
  const readEdge = () =>
    viewport.evaluate((node) => {
      const end = node.parentElement!.querySelector<HTMLElement>(".scroll-shadow-inline-end")!;
      return {
        gap:
          node.getBoundingClientRect().left +
          node.clientLeft +
          node.clientWidth -
          end.getBoundingClientRect().right,
        gutter: node.offsetWidth - node.clientWidth,
      };
    });
  await expect(shadow).toHaveAttribute("data-overflow-right", "");
  await expect.poll(async () => Math.abs((await readEdge()).gap)).toBeLessThan(0.5);
  expect((await readEdge()).gutter).toBeGreaterThan(0);
  // No reserved gutter, as with overlay scrollbars: authored pixels reach the outer edge.
  await viewport.evaluate((node) => {
    node.style.scrollbarGutter = "auto";
    node.style.scrollbarWidth = "none";
  });
  await expect.poll(async () => (await readEdge()).gutter).toBe(0);
  await expect.poll(async () => Math.abs((await readEdge()).gap)).toBeLessThan(0.5);
  await expect(shadow.locator(":scope > .scroll-shadow-inline-end")).toHaveCSS(
    "pointer-events",
    "none",
  );
  await mkdir("artifacts/scroll-shadow-edge", { recursive: true });
  await shadow.screenshot({ path: "artifacts/scroll-shadow-edge/after-overlay.png" });
  const bounds = (await viewport.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width - 20, bounds.y + 80);
  await page.mouse.wheel(600, 0);
  await expect.poll(() => viewport.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await viewport.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  await expect(shadow).not.toHaveAttribute("data-overflow-right");
});
