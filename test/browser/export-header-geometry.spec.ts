import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import type { ExportJobs } from "../../apps/web/src/services/export/jobs";

declare global {
  interface Window {
    __exportGeometryJobs?: ExportJobs;
    __exportGeometryControl?: { progress(fraction: number): void; resolve(): void };
  }
}

test("the compact Export button stays inside header padding through real job progress and failure", async ({
  page,
  browser,
}, testInfo) => {
  await page.routeWebSocket("**", () => {});
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    const original = WeakMap.prototype.set;
    // Observe the real engine-scoped store; only its export task is controlled.
    // Restore immediately, before any measured layout or progress update.
    Object.defineProperty(WeakMap.prototype, "set", {
      configurable: true,
      writable: true,
      value: function (key: unknown, value: unknown) {
        const result = Reflect.apply(original, this, [key, value]),
          candidate = value as Partial<ExportJobs> | null,
          owner = key as { getSnapshot?: unknown } | null;
        if (
          candidate &&
          typeof candidate.start === "function" &&
          typeof candidate.stop === "function" &&
          typeof candidate.read === "function" &&
          typeof candidate.cancel === "function" &&
          candidate.measurements &&
          typeof owner?.getSnapshot === "function"
        ) {
          window.__exportGeometryJobs = candidate as ExportJobs;
          WeakMap.prototype.set = original;
        }
        return result;
      },
    });
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart && window.__exportGeometryJobs));
  const button = page.locator(".inspector-header .export-trigger");
  const measure = (state: string, target = button) =>
    target.evaluate((element, state) => {
      const header = element.closest(".inspector-header")!,
        sibling = header.firstElementChild!,
        bounds = element.getBoundingClientRect(),
        parent = header.getBoundingClientRect(),
        previous = sibling.getBoundingClientRect(),
        icon = getComputedStyle(element.querySelector("svg")!),
        style = getComputedStyle(element),
        headerStyle = getComputedStyle(header);
      return {
        state,
        width: bounds.width,
        height: bounds.height,
        viewport: [innerWidth, innerHeight],
        panelWidth: parent.width,
        headerHeight: parent.height,
        rightPadding: parent.right - bounds.right,
        topPadding: bounds.top - parent.top,
        direct: element.parentElement === header,
        variant: element.getAttribute("data-variant"),
        bottomPadding: parent.bottom - bounds.bottom - parseFloat(headerStyle.borderBottomWidth),
        gap: bounds.left - previous.right,
        position: style.position,
        insets: [style.top, style.right, style.bottom, style.left],
        iconWidth: parseFloat(icon.width),
        iconHeight: parseFloat(icon.height),
      };
    }, state);
  const samples = [await measure("idle")];
  const resizeSamples = [];
  const heights = [1000, 970, 650, 620, 900];
  for (const height of heights) {
    await page.setViewportSize({ width: 1600, height });
    resizeSamples.push(await measure("before-workspace"));
  }
  try {
    await page.evaluate(() => {
      window.__exportGeometryJobs!.start(
        {
          kind: "image",
          name: "Geometry regression",
          projectId: window.musart!.session().projectId,
        },
        async ({ progress }) => {
          await new Promise<void>((resolve) => {
            window.__exportGeometryControl = { progress, resolve };
          });
        },
      );
    });
    for (const percent of [0, 9, 99]) {
      await page.evaluate(
        (percent) => window.__exportGeometryControl!.progress(percent / 100),
        percent,
      );
      await expect(button.locator(".export-trigger-percent")).toHaveText(`${percent} %`);
      await expect(button.locator(".export-trigger-name")).toBeVisible();
      samples.push(await measure(String(percent)));
      for (const height of heights) {
        await page.setViewportSize({ width: 1600, height });
        resizeSamples.push(await measure(`pending-${percent}`));
      }
    }
    await page.evaluate(() => window.__exportGeometryControl!.resolve());
    await page.waitForFunction(() => window.__exportGeometryJobs!.read()?.status === "complete");
    await expect(button.locator(".export-trigger-percent")).toBeHidden();
    await expect(button.locator(".export-trigger-name")).toBeVisible();
    samples.push(await measure("100"));
    await page.evaluate(() => {
      window.__exportGeometryJobs!.start(
        { kind: "image", name: "Expected failure", projectId: window.musart!.session().projectId },
        async () => {
          throw Error("Expected geometry fixture failure");
        },
      );
    });
    await page.waitForFunction(() => window.__exportGeometryJobs!.read()?.status === "failed");
    samples.push(await measure("failed"));
    await button.click();
    await page.locator(".export-workspace").waitFor();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    samples.push(await measure("after-workspace"));
    for (const height of heights) {
      await page.setViewportSize({ width: 1600, height });
      resizeSamples.push(await measure("after-workspace"));
    }
    const divider = (await page.locator(".sidebar-resize").boundingBox())!;
    await page.mouse.move(divider.x + divider.width / 2, divider.y + divider.height / 2);
    await page.mouse.down();
    await page.mouse.move(1280, divider.y + divider.height / 2, { steps: 4 });
    await page.mouse.up();
    for (const height of heights) {
      await page.setViewportSize({ width: 1600, height });
      resizeSamples.push(await measure("narrow-panel"));
    }
    const fresh = await browser.newContext({ viewport: { width: 1600, height: 620 } });
    try {
      await fresh.addInitScript(() => {
        localStorage.setItem("musart.editor-tutorial.v1", "done");
        localStorage.setItem("musart.language", "en");
        localStorage.setItem(
          "musart.onboarding.v1",
          JSON.stringify({ version: 1, completed: true }),
        );
      });
      const freshPage = await fresh.newPage();
      await freshPage.routeWebSocket("**", () => {});
      await freshPage.goto("/editor?automation=1");
      const freshButton = freshPage.locator(".inspector-header .export-trigger");
      await expect(freshButton).toBeVisible();
      resizeSamples.push(await measure("fresh-context", freshButton));
    } finally {
      await fresh.close();
    }
    await testInfo.attach("export-header-geometry", {
      body: JSON.stringify({ samples, resizeSamples }, null, 2),
      contentType: "application/json",
    });
    for (const sample of [...samples, ...resizeSamples]) {
      expect(sample.height).toBe(32);
      expect(sample.direct).toBe(true);
      expect(sample.variant).toBe("default");
      expect(sample.topPadding).toBe(12);
      expect(sample.rightPadding).toBe(12);
      expect(Math.abs(sample.rightPadding - sample.bottomPadding)).toBeLessThanOrEqual(0.5);
      expect(sample.gap).toBe(8);
      expect(sample.position).toBe("relative");
      expect([sample.iconWidth, sample.iconHeight]).toEqual([14, 14]);
    }
    for (const sample of resizeSamples) {
      expect(sample.width).toBe(
        sample.state.startsWith("pending-") ? samples[1]!.width : samples[0]!.width,
      );
      expect(sample.headerHeight).toBe(57);
      if (sample.state === "narrow-panel") expect(sample.panelWidth).toBeGreaterThanOrEqual(310);
      if (sample.state === "narrow-panel") expect(sample.panelWidth).toBeLessThanOrEqual(330);
    }
    expect(samples[0]!.width).toBeLessThan(90);
    expect(samples[1]!.width).toBeGreaterThan(samples[0]!.width);
    expect(samples[1]!.width).toBe(samples[2]!.width);
    expect(samples[2]!.width).toBe(samples[3]!.width);
    expect(samples[4]!.width).toBe(samples[0]!.width);
    expect(samples[5]!.width).toBe(samples[0]!.width);
    expect(samples[6]!.width).toBe(samples[0]!.width);
    await expect(button).toHaveAccessibleName("Export");
  } finally {
    await page.evaluate(async () => {
      window.__exportGeometryControl?.resolve();
      await window.__exportGeometryJobs?.stop();
      delete window.__exportGeometryControl;
      delete window.__exportGeometryJobs;
    });
  }
});

test("mobile Export uses matching right and bottom spacing", async ({ page }) => {
  await page.routeWebSocket("**", () => {});
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.getByRole("button", { name: "Properties", exact: true }).click();
  const spacing = await page
    .locator(".mobile-sheet .inspector-header .export-trigger")
    .evaluate((button) => {
      const header = button.closest(".inspector-header")!,
        bounds = button.getBoundingClientRect(),
        parent = header.getBoundingClientRect(),
        style = getComputedStyle(header);
      return {
        top: bounds.top - parent.top,
        gap: bounds.left - header.firstElementChild!.getBoundingClientRect().right,
        direct: button.parentElement === header,
        right: parent.right - bounds.right,
        bottom: parent.bottom - bounds.bottom - parseFloat(style.borderBottomWidth),
        start: parseFloat(style.paddingLeft),
        height: bounds.height,
      };
    });
  expect(spacing).toEqual({
    top: 12,
    gap: 12,
    direct: true,
    right: 12,
    bottom: 12,
    start: 20,
    height: 32,
  });
});

test("French Export stays inside every visible panel edge at narrow sidebar widths", async ({
  page,
  context,
  baseURL,
}, info) => {
  await context.addCookies([{ name: "musart.language", value: "fr", url: baseURL! }]);
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/editor?automation=1");
  const button = page
    .locator(".inspector-header")
    .getByRole("button", { name: "Exporter", exact: true });
  await expect(button).toBeVisible();
  const measure = () =>
    button.evaluate((node) => {
      const box = node.getBoundingClientRect();
      let edge = innerWidth;
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent),
          bounds = parent.getBoundingClientRect();
        if (/hidden|clip|auto|scroll/.test(style.overflowX))
          edge = Math.min(edge, bounds.left + parent.clientLeft + parent.clientWidth);
      }
      return {
        visibleGap: edge - box.right,
        headerOverflow: node.closest(".inspector-header")!.getBoundingClientRect().right - edge,
        direct: node.parentElement?.classList.contains("inspector-header"),
      };
    });
  const before = await measure();
  expect(before.direct).toBe(true);
  expect(Math.abs(before.visibleGap - 12)).toBeLessThan(1);
  const divider = (await page.locator(".sidebar-resize").boundingBox())!;
  await page.mouse.move(divider.x + divider.width / 2, divider.y + divider.height / 2);
  await page.mouse.down();
  await page.mouse.move(1000, divider.y + divider.height / 2, { steps: 4 });
  await page.mouse.up();
  const after = await measure();
  expect(Math.abs(after.visibleGap - 12)).toBeLessThan(1);
  const layer = createLayer("rectangle", {
    name: "A deliberately long layer name for the narrow properties panel",
    width: 240,
    height: 160,
  });
  const project = createProject({ pages: [createPage({ layers: [layer] })] });
  await page.evaluate(
    ({ project, layerId }) => {
      window.musart!.load(project);
      window.musart!.select([layerId]);
    },
    { project, layerId: layer.id },
  );
  for (const width of [1920, 1280, 1024, 900, 801]) {
    await page.setViewportSize({ width, height: 620 });
    await expect.poll(async () => (await measure()).visibleGap).toBeCloseTo(12, 0);
    expect(Math.abs((await measure()).headerOverflow)).toBeLessThan(1);
    const handle = (await page.locator(".sidebar-resize").boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(width - 260, handle.y + handle.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await measure()).visibleGap).toBeCloseTo(12, 0);
    expect(Math.abs((await measure()).headerOverflow)).toBeLessThan(1);
  }
  await page
    .locator(".inspector-header")
    .screenshot({ path: info.outputPath("exporter-padding-fr.png") });
  await info.attach("visible-boundary", {
    body: JSON.stringify({ before, after }),
    contentType: "application/json",
  });
});
