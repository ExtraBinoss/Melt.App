import { expect, test } from "@playwright/test";

test("a normally opened template keeps Export aligned with the visible inspector through native resizing", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/editor?template=terminal-signal");
  await expect(page).toHaveURL(/\/editor\?.*project=/);
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  const button = page.locator(".inspector-header [data-inspector-export-trigger]");
  const measurements = [];
  async function capture(name: string) {
    await expect(button).toBeVisible();
    await expect
      .poll(() =>
        button.evaluate((element) => {
          const button = element.getBoundingClientRect();
          const field = document.querySelector(".color-section .section-title")!;
          return Math.abs(button.right - field.getBoundingClientRect().right);
        }),
      )
      .toBeLessThan(0.5);
    const sample = await button.evaluate((element) => {
      const button = element.getBoundingClientRect();
      const header = element.closest(".inspector-header")!.getBoundingClientRect();
      let visibleRight = visualViewport
        ? visualViewport.offsetLeft + visualViewport.width
        : innerWidth;
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (/hidden|clip|auto|scroll/.test(getComputedStyle(parent).overflowX)) {
          const bounds = parent.getBoundingClientRect();
          visibleRight = Math.min(
            visibleRight,
            bounds.left + parent.clientLeft + parent.clientWidth,
          );
        }
      }
      return {
        viewport: [innerWidth, innerHeight],
        panelWidth: header.width,
        visibleGap: visibleRight - button.right,
        headerHeight: header.height,
        headerBorder: parseFloat(
          getComputedStyle(element.closest(".inspector-header")!).borderBottomWidth,
        ),
        sameViewport:
          element.closest(".inspector") ===
          document.querySelector(".color-section")!.closest(".inspector"),
        buttonHeight: button.height,
      };
    });
    expect(sample.visibleGap).toBeCloseTo(18, 0);
    expect(sample.sameViewport).toBe(true);
    expect(sample.headerHeight).toBeCloseTo(48 + sample.headerBorder, 2);
    expect(sample.buttonHeight).toBe(32);
    measurements.push({ name, ...sample });
    const screenshot = info.outputPath(`${name}.png`);
    await page.screenshot({ path: screenshot });
    await info.attach(name, { path: screenshot, contentType: "image/png" });
  }
  await capture("template-opened-full-editor");
  for (const width of [1000, 1600]) {
    await page.setViewportSize({ width, height: 720 });
    const divider = (await page.locator(".sidebar-resize").boundingBox())!;
    await page.mouse.move(divider.x + divider.width / 2, divider.y + divider.height / 2);
    await page.mouse.down();
    await page.mouse.move(width - 260, divider.y + divider.height / 2, { steps: 5 });
    await page.mouse.up();
    await capture(`narrow-inspector-${width}`);
    await page.locator(".sidebar-resize").focus();
    await page.keyboard.press("ArrowLeft");
    await capture(`keyboard-resized-inspector-${width}`);
  }
  await info.attach("visible-inspector-alignment", {
    body: JSON.stringify(measurements, null, 2),
    contentType: "application/json",
  });
});
