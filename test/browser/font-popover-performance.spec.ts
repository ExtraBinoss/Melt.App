import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { installReadbackProbe } from "./support/readback-probe";

interface Opening {
  generated: number;
  dispatch: number;
  useful?: number;
  presented?: number;
  rows?: number;
}
interface BrowserEventTiming extends PerformanceEventTiming {
  interactionId: number;
}
declare global {
  interface Window {
    __fontPopoverProfile: {
      opens: Opening[];
      events: { start: number; duration: number; name: string; interaction: number }[];
    };
  }
}

test("native font-popover opening records useful frames and browser event timing without editor commits", async ({
  page,
  browser,
}) => {
  const folder = process.env.MUSART_FONT_OUTPUT ?? "artifacts/font-popover/current";
  await mkdir(folder, { recursive: true });
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    localStorage.setItem("musart.language", "en");
    const state: Window["__fontPopoverProfile"] = { opens: [], events: [] };
    window.__fontPopoverProfile = state;
    new PerformanceObserver((list) => {
      for (const item of list.getEntries()) {
        const event = item as BrowserEventTiming;
        if (event.interactionId)
          state.events.push({
            start: event.startTime,
            duration: event.duration,
            name: event.name,
            interaction: event.interactionId,
          });
      }
    }).observe({
      type: "event",
      buffered: true,
      durationThreshold: 16,
    } as PerformanceObserverInit & { durationThreshold: number });
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (
          !(event.target instanceof Element) ||
          !event.target.closest('[role="combobox"][aria-label="Font"]')
        )
          return;
        const sample: Opening = { generated: event.timeStamp, dispatch: performance.now() };
        state.opens.push(sample);
        function frame() {
          const list = document.querySelector('[role="listbox"][aria-label="Fonts"]');
          const area = list?.getBoundingClientRect();
          const rows = area
            ? [...list!.querySelectorAll('[role="option"]')].filter((row) => {
                const rect = row.getBoundingClientRect();
                return rect.height > 0 && rect.bottom > area.top && rect.top < area.bottom;
              }).length
            : 0;
          if (!rows) return requestAnimationFrame(frame);
          sample.useful = performance.now();
          sample.rows = rows;
          requestAnimationFrame(() => {
            sample.presented = performance.now();
          });
        }
        requestAnimationFrame(frame);
      },
      true,
    );
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["font-popover"]);
    },
    createProject({
      pages: [
        createPage({
          layers: [
            createLayer("text", {
              id: "font-popover",
              text: "MELT",
              fontFamily: "Inter Variable",
              fontWeight: 800,
            }),
          ],
        }),
      ],
    }),
  );
  const trigger = page.getByRole("combobox", { name: "Font", exact: true });
  await trigger.waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")?.dataset
        .rendererReady === "true",
  );
  const snapshot = await page.evaluate(() => window.musart!.snapshot());
  const counters = () =>
    page.evaluate(() =>
      [".musart-app", ".inspector", ".canvas-area", ".editor-canvas", ".editor-gpu-scene"].map(
        (selector) => document.querySelector<HTMLElement>(selector)?.dataset.reactRenders,
      ),
    );
  const before = await counters();
  for (let index = 0; index < 4; index++) {
    await trigger.click();
    await page.waitForFunction(
      (index) => Boolean(window.__fontPopoverProfile.opens[index]?.presented),
      index,
    );
    await expect(page.getByRole("combobox", { name: "Search fonts", exact: true })).toBeFocused();
    // Keep the same completed metadata/sample workload for warm openings. A quick
    // close must not hide the optional work that was moved after the first paint.
    await expect(page.getByRole("option").first()).toHaveAttribute(
      "aria-setsize",
      /^(19\d\d|[2-9]\d{3})$/,
    );
    await expect(
      page.getByRole("option", { name: "Inter", exact: true }).locator("[data-font-preview-state]"),
    ).toHaveAttribute("data-font-preview-state", "ready");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox", { name: "Fonts", exact: true })).toHaveCount(0);
  }
  const samples = await page.evaluate(() => window.__fontPopoverProfile);
  const environment = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    return {
      userAgent: navigator.userAgent,
      dpr: devicePixelRatio,
      adapter: adapter
        ? {
            vendor: adapter.info.vendor,
            architecture: adapter.info.architecture,
            fallback: adapter.info.isFallbackAdapter,
          }
        : null,
    };
  });
  expect(samples.opens.every((sample) => sample.rows! >= 4)).toBe(true);
  expect(await counters()).toEqual(before);
  expect(await page.evaluate(() => window.musart!.snapshot())).toEqual(snapshot);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.start");
  await trigger.click();
  await expect(page.getByRole("listbox", { name: "Fonts", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const { profile } = await cdp.send("Profiler.stop");
  await cdp.detach();
  await writeFile(join(folder, "opening.cpuprofile"), JSON.stringify(profile));
  await writeFile(
    join(folder, "opening.json"),
    JSON.stringify(
      {
        source: process.env.MUSART_FONT_SHA,
        browser: browser.version(),
        viewport: page.viewportSize(),
        environment,
        samples,
      },
      null,
      2,
    ),
  );
});
