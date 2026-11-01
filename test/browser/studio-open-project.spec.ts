import { expect, test } from "@playwright/test";
import { installReadbackProbe } from "./support/readback-probe";

test("Open in Melt yields background video conversion until the canonical canvas is visible", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
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
});
