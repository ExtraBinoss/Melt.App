import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

test("Open in Melt yields background video conversion until the canonical canvas is visible", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    const opening: Array<Record<string, unknown>> = [];
    Object.assign(window, { __openingEvidence: opening });
    let pointer = { x: 0, y: 0, time: 0 };
    document.addEventListener(
      "pointerdown",
      (event) => {
        pointer = { x: event.clientX, y: event.clientY, time: event.timeStamp };
      },
      true,
    );
    const surfaces = new WeakSet<Element>();
    new MutationObserver(() => {
      const surface = document.querySelector<HTMLElement>(".project-opening-surface");
      if (!surface || surfaces.has(surface)) return;
      surfaces.add(surface);
      const source = { ...pointer };
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          opening.push({
            source,
            x: Number(surface.dataset.originX),
            y: Number(surface.dataset.originY),
            clip: getComputedStyle(surface).clipPath,
            inputToSecondRafMs: performance.now() - source.time,
            throbber: Boolean(surface.querySelector('.ui-throbber[data-visible="true"]')),
          }),
        ),
      );
    }).observe(document, { childList: true, subtree: true });
    const capture = { firstFrame: 0, proxies: [] as number[] };
    Object.assign(window, { __studioOpening: capture });
    window.Worker = new Proxy(window.Worker, {
      construct(target, args: ConstructorParameters<typeof Worker>) {
        if (String(args[0]).includes("proxy.worker")) capture.proxies.push(performance.now());
        return Reflect.construct(target, args);
      },
    });
    const observer = new MutationObserver(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas");
      if (canvas?.dataset.presentationReady === "true" && !capture.firstFrame) {
        capture.firstFrame = performance.now();
        observer.disconnect();
      }
    });
    observer.observe(document, {
      subtree: true,
      attributes: true,
      childList: true,
      attributeFilter: ["data-presentation-ready"],
    });
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Preview Bloom Windows", exact: true }).click();
  await page.getByRole("button", { name: "Open in Melt", exact: true }).click();
  const canvas = page.locator(".editor-gpu-scene canvas");
  await expect(canvas).toHaveAttribute("data-presentation-ready", "true", { timeout: 30000 });
  await expect(canvas).toHaveAttribute("data-page-id", "bloom-windows-composition");
  await expect(page.getByRole("region", { name: "Properties", exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const capture = (
          window as unknown as { __studioOpening: { firstFrame: number; proxies: number[] } }
        ).__studioOpening;
        return capture.proxies.length;
      }),
    )
    .toBeGreaterThan(0);
  const result = await page.evaluate(() => ({
    ...(window as unknown as { __studioOpening: { firstFrame: number; proxies: number[] } })
      .__studioOpening,
    reads: window.__musartVideoReadbacks,
  }));
  expect(result.firstFrame).toBeGreaterThan(0);
  expect(result.proxies.every((time) => time >= result.firstFrame)).toBe(true);
  expect(result.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  await expect(page.locator(".project-opening-surface")).toHaveCount(0);
  const evidence = await page.evaluate(
    () =>
      (
        window as unknown as {
          __openingEvidence: Array<{
            source: { x: number; y: number };
            x: number;
            y: number;
            throbber: boolean;
            clip: string;
          }>;
        }
      ).__openingEvidence,
  );
  expect(evidence).toHaveLength(1);
  expect(evidence[0]!.x).toBe(evidence[0]!.source.x);
  expect(evidence[0]!.y).toBe(evidence[0]!.source.y);
  expect(evidence[0]!.throbber).toBe(true);
  expect(evidence[0]!.clip).toContain("circle(");
  await page.goto("/dashboard");
  const recent = page.locator(".library-recent-project").first();
  await expect(recent).toBeVisible();
  await recent.click();
  await expect(
    page.locator('.editor-gpu-scene canvas[data-page-id="bloom-windows-composition"]'),
  ).toHaveAttribute("data-presentation-ready", "true");
  await expect(page.locator(".project-opening-surface")).toHaveCount(0);
  const recentEvidence = await page.evaluate(
    () => (window as unknown as { __openingEvidence: unknown[] }).__openingEvidence,
  );
  expect(recentEvidence).toHaveLength(1);
  await mkdir("artifacts/opening", { recursive: true });
  await writeFile(
    "artifacts/opening/native.json",
    JSON.stringify({ ...result, evidence, recentEvidence }, null, 2),
  );
});

test("recent-project loading is visible in the initial server document before hydration", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator('.library-sidebar-status .ui-throbber[data-visible="true"]'),
    ).toBeVisible();
    await expect(page.locator(".library-sidebar-status .ui-throbber img")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("opening circle expands in the browser and cancellation releases it", async ({ page }) => {
  await page.goto("/dashboard");
  await page.evaluate(async () => {
    const path = "/src/components/projects/opening/controller.tsx";
    const { beginProjectOpening } = await import(path);
    beginProjectOpening(() => {});
  });
  await expect
    .poll(
      () =>
        page.locator(".project-opening-surface").evaluate((surface) => {
          const clip = getComputedStyle(surface).clipPath;
          return Number(clip.match(/circle\(([\d.]+)/)?.[1] ?? 0);
        }),
      { timeout: 3000 },
    )
    .toBeGreaterThan(100);
  await page.keyboard.press("Escape");
  await expect(page.locator(".project-opening-surface")).toHaveCount(0);
});
