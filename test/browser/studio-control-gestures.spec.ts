import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

async function mountControls(page: Page) {
  await page.route("**/controls-witness", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }),
  );
  await page.goto("/controls-witness");
  await page.evaluate(async () => {
    const path = "/@react-refresh";
    const runtime = (await import(/* @vite-ignore */ path)).default;
    runtime.injectIntoGlobalHook(window);
    Object.assign(window, {
      $RefreshReg$: () => {},
      $RefreshSig$: () => (type: unknown) => type,
      __vite_plugin_react_preamble_installed__: true,
    });
  });
  await page.evaluate(
    async (path) => {
      await (await import(/* @vite-ignore */ path)).mount();
    },
    `/@fs${resolve("test/browser/support/studio-control-gestures.tsx")}`,
  );
}

test("Studio Shift drag keeps the full range outside its track, preserves the slider surface and commits once", async ({
  page,
}) => {
  await mountControls(page);
  const slider = page.getByRole("slider", { name: "Test value" });
  await expect(slider).toBeVisible();
  const track = page.locator('[data-slot="slider-track"]');
  await expect(track).toHaveCSS("height", "36px");
  await expect(track).toHaveCSS("border-top-left-radius", "12px");
  await track.hover();
  const hint = page.locator('[data-slot="tooltip-content"].control-hint');
  await expect(hint).toBeVisible();
  await expect(hint.locator("kbd").first()).toHaveText("⇧");
  const hintWidth = (await hint.boundingBox())!.width;
  expect(hintWidth).toBeLessThanOrEqual(280);
  const unused = await hint.evaluate((node) => {
    const visible = [...node.children].filter((child) => child.getBoundingClientRect().width > 2);
    return (
      node.getBoundingClientRect().width -
      visible.reduce((sum, child) => sum + child.getBoundingClientRect().width, 0)
    );
  });
  expect(unused).toBeLessThan(32);
  const thumb = (await slider.boundingBox())!;
  await page.mouse.move(thumb.x + thumb.width / 2, thumb.y + thumb.height / 2);
  await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(600, thumb.y + thumb.height / 2, { steps: 12 });
  await expect(slider).toHaveAttribute("aria-valuenow", "100");
  await page.mouse.move(200, thumb.y + thumb.height / 2, { steps: 12 });
  await expect(slider).toHaveAttribute("aria-valuenow", "0");
  await page.mouse.move(250, thumb.y + thumb.height / 2, { steps: 8 });
  const next = Number(await slider.getAttribute("aria-valuenow"));
  expect(next).toBeGreaterThan(0);
  expect(next % 5).toBe(0);
  await page.mouse.up();
  await page.keyboard.up("Shift");
  const events = await page.evaluate(
    () =>
      (window as unknown as { __controls: { commits: number[]; previews: number[] } }).__controls,
  );
  expect(events.commits).toEqual([next]);
  expect(events.previews.length).toBeGreaterThan(5);
  const scrub = page.getByRole("button", { name: "Adjust Intensity" });
  await expect(scrub).not.toHaveAttribute("title");
  await scrub.hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("gradient direction survives repeated type switches and swatches inherit Studio radii", async ({
  page,
}) => {
  await mountControls(page);
  const pad = page.locator(".studio-background-fields > .studio-direction-pad");
  for (const kind of ["Radial", "Linear", "Radial", "Linear"]) {
    await page
      .locator(".studio-background-types")
      .getByRole("button", { name: kind, exact: true })
      .click();
    const box = (await pad.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(110);
    expect(box.height).toBeLessThanOrEqual(110);
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.2, { steps: 8 });
    const thumb = pad.locator(".studio-direction-position");
    await expect
      .poll(async () => parseFloat(await thumb.evaluate((node) => (node as HTMLElement).style.top)))
      .toBeLessThan(25);
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.5, { steps: 8 });
    await expect
      .poll(async () =>
        parseFloat(await thumb.evaluate((node) => (node as HTMLElement).style.left)),
      )
      .toBeGreaterThan(85);
    await page.mouse.up();
  }
  await expect(page.locator(".color-swatch").first()).toHaveCSS("border-top-left-radius", "8px");
});

test("scrubbing a Studio label has no dotted underline and keeps its field geometry", async ({
  page,
}) => {
  await mountControls(page);
  const scrub = page.getByRole("button", { name: "Adjust Intensity" });
  const field = page.locator(".number-field").filter({ has: scrub });
  const before = (await field.boundingBox())!;
  const box = (await scrub.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, { steps: 5 });
  await expect(field).toHaveAttribute("data-snapped", "");
  await expect(scrub).not.toHaveCSS("border-bottom-style", "dashed");
  await expect(scrub).not.toHaveCSS("border-bottom-style", "dotted");
  const after = (await field.boundingBox())!;
  expect(after.height).toBe(before.height);
  expect(after.y).toBe(before.y);
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(field).not.toHaveAttribute("data-snapped");
});

test("native double-click resets a large slider once, replays its shimmer and honors reduced motion", async ({
  page,
}) => {
  await mountControls(page);
  const slider = page.getByRole("slider", { name: "Test value" });
  const root = page.locator(".studio-slider").first();
  const feedback = root.locator(".studio-slider-reset-feedback");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow", "11");
  const box = (await root.boundingBox())!;
  const point = { x: box.x + box.width * 0.8, y: box.y + box.height / 2 };
  await page.mouse.dblclick(point.x, point.y, { delay: 100 });
  await expect(slider).toHaveAttribute("aria-valuenow", "10");
  await expect(feedback).toHaveAttribute("data-resetting", "");
  expect(
    await feedback.evaluate((node) =>
      node
        .getAnimations({ subtree: true })
        .some(
          (animation) =>
            "animationName" in animation && animation.animationName === "studio-reset-shimmer",
        ),
    ),
  ).toBe(true);
  await feedback.evaluate((node) => {
    const animation = node
      .getAnimations({ subtree: true })
      .find(
        (animation) =>
          "animationName" in animation && animation.animationName === "studio-reset-shimmer",
      );
    animation?.pause();
    if (animation) animation.currentTime = 260;
  });
  await root.screenshot({ path: "artifacts/studio/reset-shimmer.png" });
  await expect(feedback).not.toHaveAttribute("data-resetting");
  await page.mouse.dblclick(point.x, point.y, { delay: 100 });
  await expect(feedback).toHaveAttribute("data-resetting", "");
  await expect(feedback).not.toHaveAttribute("data-resetting");
  const events = () =>
    page.evaluate(
      () => (window as unknown as { __controls: { commits: number[] } }).__controls.commits,
    );
  expect(await events()).toEqual([11, 10]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await page.mouse.dblclick(point.x, point.y, { delay: 100 });
  await expect(slider).toHaveAttribute("aria-valuenow", "10");
  expect(await feedback.evaluate((node) => getComputedStyle(node, "::after").animationName)).toBe(
    "none",
  );
  await expect(feedback).not.toHaveAttribute("data-resetting");
  expect(await events()).toEqual([11, 10, 11, 10]);
});
