import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
declare global {
  interface Window {
    __depthGpuSubmissions: number[];
  }
}
const witness = `/@fs${resolve("test/browser/support/depth-anything-witness.ts")}`;
test("Depth Anything V3: real worker inference, native GPU output, fallback and exact video seeks", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.addInitScript(() => {
    window.__depthGpuSubmissions = [];
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args: ConstructorParameters<typeof NativeWorker>) {
        super(...args);
        this.addEventListener("message", (event) => {
          if (Number.isFinite(event.data?.__depthGpuSubmissions))
            window.__depthGpuSubmissions.push(event.data.__depthGpuSubmissions);
        });
      }
    };
  });
  await page.route("**/depth.worker.ts*", async (route) => {
    const response = await route.fetch();
    const instrumentation = `const nativeSubmit = GPUQueue.prototype.submit; let submissions = 0;
GPUQueue.prototype.submit = function(commands) { submissions++; return nativeSubmit.call(this, commands); };
const nativePost = globalThis.postMessage.bind(globalThis);
globalThis.postMessage = (value, ...args) => nativePost(value && (value.result || value.error) ? { ...value, __depthGpuSubmissions: submissions } : value, ...args);
`;
    await route.fulfill({ response, body: instrumentation + (await response.text()) });
  });
  await page.route("**/__depth-check", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><button id="probe">Input probe</button><output id="response"></output>',
    }),
  );
  await page.goto("/__depth-check");
  await page.evaluate(() => {
    document.querySelector("button")!.onclick = () => {
      const start = performance.now();
      document.querySelector("output")!.textContent = "received";
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          document.querySelector("output")!.dataset.latency = String(performance.now() - start);
        }),
      );
    };
  });
  const work = page.evaluate(async (path) => {
    const mod = await import(path);
    return mod.runDepthWitness(false, true);
  }, witness);
  await page.locator("button").click();
  await expect(page.locator("output")).toHaveText("received");
  await expect(page.locator("output")).toHaveAttribute("data-latency");
  const gpu = await work;
  expect(gpu.zero).toBe(gpu.baseline);
  expect(gpu.parallax).not.toBe(gpu.baseline);
  expect(gpu.map).not.toBe(gpu.parallax);
  expect(gpu.stats.backend).toBe("webgpu");
  expect(gpu.stats.readbacks).toBe(0);
  expect(await page.evaluate(() => Math.max(0, ...window.__depthGpuSubmissions))).toBeGreaterThan(
    0,
  );
  const gl = await page.evaluate(async (path) => {
    const mod = await import(path);
    return mod.runDepthWitness(true);
  }, witness);
  expect(gl.zero).toBe(gl.baseline);
  expect(gl.parallax).not.toBe(gl.baseline);
  expect(gl.stats.backend).toBe("webgl");
  const videos = await page.evaluate(async (path) => {
    const mod = await import(path);
    return mod.runDepthVideoWitness();
  }, witness);
  await mkdir("artifacts/depth-anything", { recursive: true });
  await writeFile("artifacts/depth-anything/video-debug.json", JSON.stringify(videos));
  for (const video of videos) {
    expect(video.images[0]).toBe(video.images[2]);
    expect(video.images[0]).not.toBe(video.images[1]);
    expect(video.stats.readbacks).toBe(0);
  }
  await mkdir("artifacts/depth-anything", { recursive: true });
  await writeFile(
    "artifacts/depth-anything/browser.json",
    JSON.stringify({
      gpu,
      gl,
      videos,
      inferenceGpuSubmissions: await page.evaluate(() => window.__depthGpuSubmissions),
      inputPresentationMs: await page.locator("output").getAttribute("data-latency"),
    }),
  );
});
test("depth jobs open immediately with a decoded video preview and the live SVG loading mascot", async ({
  page,
}) => {
  await page.route("**/__depth-ui", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;</script>',
    }),
  );
  await page.goto("/__depth-ui");
  await page.evaluate(
    async (path) => {
      const mod = await import(path);
      await mod.mountDepthUI();
    },
    `/@fs${resolve("test/browser/support/depth-anything-ui.tsx")}`,
  );
  const body = await page.locator("body").getAttribute("style");
  await page.getByRole("button", { name: "Add depth effect", exact: true }).click();
  const card = page.locator('[data-tool="depth-anything"]');
  await expect(card).toBeVisible();
  await expect(card.getByText("Preparing depth", { exact: true })).toBeVisible();
  await expect(card.locator("img.background-target-thumbnail")).toBeVisible();
  expect(
    await card
      .locator("img.background-target-thumbnail")
      .evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0),
  ).toBe(true);
  const svg = card.locator('svg[data-brand-state="loading"]');
  await expect(svg).toBeVisible();
  await expect(svg).toHaveAttribute("data-brand-active", "true");
  expect(await card.locator(".ui-throbber-mark img").count()).toBe(0);
  const motion = await svg.evaluate(async (node) => {
    const shapes = new Set<string>(),
      steady = new Set<string>(),
      backgroundEyes = new Set<number>();
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const sample = () => {
        const now = performance.now() - start;
        const value = node.innerHTML;
        shapes.add(value);
        const background = document.querySelector("#background-working svg");
        if (background)
          backgroundEyes.add(
            [...background.querySelectorAll("g[clip-path] path")].filter(
              (eye) =>
                eye.getAttribute("opacity") !== "0" && (eye as SVGElement).style.display !== "none",
            ).length,
          );
        if (now > 2000) steady.add(value);
        if (now >= 4000) resolve();
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    return { shapes: shapes.size, steady: steady.size, backgroundEyes: [...backgroundEyes] };
  });
  expect(motion.shapes).toBeGreaterThan(20);
  expect(motion.steady).toBeGreaterThan(20);
  expect(motion.backgroundEyes).toContain(0);
  expect(motion.backgroundEyes).toContain(2);
  const actions = card.locator(".background-action-heading .background-action-buttons");
  await expect(
    actions.getByRole("button", { name: "About depth preparation", exact: true }),
  ).toBeVisible();
  await expect(actions.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await expect(card.locator('.ui-throbber[data-variant="shimmer"]')).toHaveAttribute(
    "data-active",
    "true",
  );
  expect(await page.locator("body").getAttribute("style")).toBe(body);
  expect(await page.locator("body").getAttribute("data-scroll-locked")).toBeNull();
  await card.screenshot({ path: "artifacts/depth-anything/job-card.png" });
  await card.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(card).toHaveCount(0);
});
test("50 prepared depth effects stay inside the GPU cache budget", async ({ page }) => {
  await page.route("**/__depth-load", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html>" }),
  );
  await page.goto("/__depth-load");
  const stats = await page.evaluate(async (path) => {
    const mod = await import(path);
    return mod.runDepthLoadWitness();
  }, witness);
  expect(stats.effectPasses).toBe(50);
  expect(stats.uploads).toBe(1); // Identical immutable pixels share one upload.
  expect(stats.readbacks).toBe(0);
  expect(stats.cacheBytes).toBeLessThanOrEqual(stats.maxBytes);
  await writeFile("artifacts/depth-anything/load.json", JSON.stringify(stats));
});
