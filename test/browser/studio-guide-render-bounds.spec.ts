import { expect, test } from "@playwright/test";

test("Studio guide dimming stays viewport bounded through format changes and canvas movement", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
  });
  await page.goto("/editor?automation=1&workspace=studio");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(async () => {
    const data = await (
      await fetch("/templates/designed/studio-starter/studio-starter.json")
    ).json();
    window.musart!.load(data.project);
  });
  await expect(page.locator(".editor-gpu-scene canvas")).toHaveAttribute(
    "data-presentation-ready",
    "true",
  );
  await page.getByRole("button", { name: "Capture guides", exact: true }).click();
  const panel = page.locator(".studio-capture-popover"),
    guide = page.locator("[data-studio-capture]"),
    matte = page.locator("[data-studio-capture-matte]");
  const toggle = panel.getByRole("switch", { name: "Show guides", exact: true });
  await toggle.click();
  async function check() {
    await expect(matte).toBeVisible();
    await expect(guide).toHaveCSS("box-shadow", "none");
    await expect(matte).toHaveCSS("filter", "none");
    const geometry = await page.evaluate(() => {
      const view = document
        .querySelector<HTMLElement>(".studio-capture-overlay")!
        .getBoundingClientRect();
      const hole = document
        .querySelector<HTMLElement>("[data-studio-capture]")!
        .getBoundingClientRect();
      const bands = [
        ...document.querySelectorAll<HTMLElement>("[data-studio-capture-matte] > i"),
      ].map((element) => element.getBoundingClientRect());
      const width = Math.max(0, Math.min(view.right, hole.right) - Math.max(view.left, hole.left));
      const height = Math.max(0, Math.min(view.bottom, hole.bottom) - Math.max(view.top, hole.top));
      return {
        count: bands.length,
        expected: view.width * view.height - width * height,
        area: bands.reduce((sum, band) => sum + band.width * band.height, 0),
        tolerance: 2 * (view.width + view.height),
        bounded: bands.every(
          (band) =>
            band.left >= view.left - 1 &&
            band.top >= view.top - 1 &&
            band.right <= view.right + 1 &&
            band.bottom <= view.bottom + 1,
        ),
      };
    });
    expect(geometry.count).toBe(4);
    expect(geometry.bounded).toBe(true);
    expect(Math.abs(geometry.area - geometry.expected)).toBeLessThan(geometry.tolerance);
  }
  await check();
  await panel.locator("[data-preset-id=tiktok-video]").click();
  await check();
  await page.mouse.move(1300, 600);
  await page.mouse.wheel(450, 200);
  await check();
  await toggle.click();
  await expect(matte).toBeHidden();
  await expect(guide).toBeHidden();
});
