import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { objectSelectionFixture } from "./support/object-selection-fixture";

test("background removal blinks, becomes thinking dots, and settles into a green completion check", async ({
  page,
}) => {
  await objectSelectionFixture(page, 10000);
  await page.getByRole("button", { name: "Remove background", exact: true }).click();
  const panel = page.locator('.tool-settings[data-tool="segment"]');
  const mascot = panel.locator('.melt-mascot[data-brand-state="working"]');
  await expect(mascot).toBeVisible();
  const observed = await mascot.evaluate(
    (svg) =>
      new Promise<{ blink: boolean; dots: boolean; returned: boolean }>((resolve) => {
        let blink = false,
          dots = false,
          returned = false;
        const start = performance.now();
        const sample = () => {
          const body = svg.querySelector('[data-mascot-part="body"]');
          const eyes = [
            ...(body?.parentElement?.querySelector("g")?.querySelectorAll("path") ?? []),
          ].filter(
            (eye) => eye.style.display !== "none" && Number(eye.getAttribute("opacity")) > 0.99,
          );
          if (eyes.length === 2) {
            if (dots) returned = true;
            blink ||= eyes.every((eye) => {
              const matrix = new DOMMatrix(eye.getAttribute("transform")!);
              return matrix.d < 0.3 && matrix.a > 0.4;
            });
          }
          if (body && eyes.length === 0) dots = true;
          if (performance.now() - start < 6500) requestAnimationFrame(sample);
          else resolve({ blink, dots, returned });
        };
        requestAnimationFrame(sample);
      }),
  );
  expect(observed).toEqual({ blink: true, dots: true, returned: true });
  await expect(mascot).toHaveAttribute("data-brand-state", "working");
  const completion = panel.locator(".background-completion");
  await expect(completion).toHaveText("Background removed");
  const line = (await completion.boundingBox())!;
  const check = (await completion.locator(".background-completion-mark").boundingBox())!;
  expect(Math.abs(check.y + check.height / 2 - line.y - line.height / 2)).toBeLessThan(1);
  await expect(completion.getByRole("img")).toHaveCount(0);
  await expect(panel.locator('.ui-throbber[data-active="true"]')).toHaveCount(0);
  const color = await completion.evaluate((node) => getComputedStyle(node).color);
  const channels = color.match(/\d+/g)!.map(Number);
  expect(channels[1]).toBeGreaterThan(channels[0]!);
  expect(channels[1]).toBeGreaterThan(channels[2]!);
  await mkdir("artifacts/object-selection-status", { recursive: true });
  await panel.screenshot({ path: "artifacts/object-selection-status/completed.png" });
  await expect
    .poll(() =>
      completion.evaluate((node) =>
        node
          .getAnimations({ subtree: true })
          .every((animation) => animation.playState === "finished"),
      ),
    )
    .toBe(true);
  await expect(completion).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await completion.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
  await expect(completion).toHaveText("Background removed");
});

test("reduced motion keeps a still face and cancellation never reports success", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await objectSelectionFixture(page, 10000);
  const before = await page.evaluate(() => window.musart!.snapshot().project);
  await page.getByRole("button", { name: "Remove background", exact: true }).click();
  const panel = page.locator('.tool-settings[data-tool="segment"]');
  const body = panel.locator('[data-mascot-part="body"]');
  await expect(body).toHaveAttribute("d", /.+/);
  const shape = await body.getAttribute("d");
  await page.waitForTimeout(250);
  expect(await body.getAttribute("d")).toBe(shape);
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".background-completion")).toHaveCount(0);
  expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before);
});
