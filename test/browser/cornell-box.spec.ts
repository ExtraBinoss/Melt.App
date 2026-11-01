import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { installReadbackProbe } from "./support/readback-probe";
let bundle: string, geometryWorker: string;
test.beforeAll(async () => {
  await mkdir("artifacts/cornell/native", { recursive: true });
  for (const [source, output] of [
    ["test/browser/support/cornell-witness.ts", "cornell-witness.js"],
    ["packages/render/src/spatial/geometry.worker.ts", "geometry-worker.js"],
  ])
    execFileSync(
      "bun",
      [
        "build",
        source!,
        "--target=browser",
        "--external=*?url",
        `--outfile=artifacts/cornell/${output}`,
      ],
      { stdio: "pipe" },
    );
  bundle = await readFile("artifacts/cornell/cornell-witness.js", "utf8");
  geometryWorker = await readFile("artifacts/cornell/geometry-worker.js", "utf8");
});
for (const { webgl, fullRate } of [
  { webgl: false, fullRate: false },
  { webgl: true, fullRate: false },
  { webgl: false, fullRate: true },
])
  test(`Cornell Box ${fullRate ? "full-rate" : "bounded"} native camera orbit loop and Motion export (${webgl ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(fullRate ? 300000 : 120000);
    const frameRate = { numerator: fullRate ? 60 : 4, denominator: 1 };
    const expectedFrames = fullRate ? 480 : 32;
    const folder = `artifacts/cornell/native/${fullRate ? "full-rate" : "bounded"}-${webgl ? "webgl" : "webgpu"}`;
    await mkdir(folder, { recursive: true });
    const manifest = JSON.parse(
      await readFile("apps/web/public/templates/motion/cornell-box/cornell-box.json", "utf8"),
    );
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installReadbackProbe(page);
    await page.route("**/cornell-renderer.html", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><script type="importmap">{"imports":{"harfbuzzjs/hb.wasm?url":"/cornell-font-url.js"}}</script>',
      }),
    );
    await page.route("**/cornell-font-url.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: 'export default "/cornell-font.wasm";',
      }),
    );
    await page.route("**/assets/profiles/CRPC6-perceptual-rgb8.bin?url", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: 'export default "/cornell-proof.bin";',
      }),
    );
    await page.route("**/cornell-witness.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await page.route("**/geometry.worker.ts", (route) =>
      route.fulfill({ contentType: "text/javascript", body: geometryWorker }),
    );
    await page.goto("/cornell-renderer.html");
    const result = await page.evaluate(
      async (input) => {
        const url = "/cornell-witness.js";
        const module = (await import(
          /* @vite-ignore */ url
        )) as typeof import("./support/cornell-witness");
        return module.renderCornell(input.project, input.webgl, input.frameRate);
      },
      { project: manifest.project, webgl, frameRate },
    );
    expect(result.unchanged).toBe(true);
    expect(result.stats.backend).toBe(webgl ? "webgl" : "webgpu");
    expect(result.stats.spatial).toMatchObject({ sources: 9, meshes: 9 });
    expect(result.samples.map((sample) => sample.yaw).slice(0, 3)).toEqual([5, -5, 5]);
    expect(
      result.samples.every((sample) => sample.stationaryObjects && sample.stationaryLights),
    ).toBe(true);
    expect(result.samples[0]!.captures).toBeGreaterThan(0);
    expect(result.samples.slice(1).every((sample) => sample.captures === 0)).toBe(true);
    expect(result.stats.cacheBytes).toBeLessThanOrEqual(result.stats.maxBytes);
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
      videoFrame: 0,
    });
    expect(errors).toEqual([]);
    for (const [index, image] of result.images.entries())
      await writeFile(`${folder}/frame-${index}.png`, Buffer.from(image.split(",")[1]!, "base64"));
    let info;
    if (result.video) {
      expect(result.frameCount).toBe(expectedFrames);
      await writeFile(
        `${folder}/cornell-box.mp4`,
        Buffer.from(result.video.split(",")[1]!, "base64"),
      );
      info = JSON.parse(
        execFileSync(
          "ffprobe",
          [
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,nb_frames,r_frame_rate,duration",
            "-of",
            "json",
            `${folder}/cornell-box.mp4`,
          ],
          { encoding: "utf8" },
        ),
      );
      expect(info.streams[0]).toMatchObject({
        width: 360,
        height: 360,
        r_frame_rate: `${frameRate.numerator}/1`,
        nb_frames: String(expectedFrames),
      });
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-threads",
        "1",
        "-filter_threads",
        "1",
        "-i",
        `${folder}/cornell-box.mp4`,
        "-vf",
        `select=eq(n\\,0)+eq(n\\,1)+eq(n\\,${expectedFrames / 2})+eq(n\\,${expectedFrames - 2})+eq(n\\,${expectedFrames - 1})`,
        "-fps_mode",
        "vfr",
        "-y",
        `${folder}/decoded-%d.png`,
      ]);
    }
    const witness = JSON.parse(
      execFileSync(
        "python3",
        [
          "-c",
          [
            "from PIL import Image,ImageChops,ImageStat",
            "import json,sys",
            "p=sys.argv[1]",
            "im=[Image.open(f'{p}/frame-{i}.png').convert('RGB') for i in range(5)]",
            "d=lambda a,b:sum(ImageStat.Stat(ImageChops.difference(a,b)).mean)/3",
            "out={'seam':d(im[0],im[2]),'motion':d(im[0],im[1]),'nearSeam':d(im[0],im[3])}",
            "if sys.argv[2]=='1':",
            " e=[Image.open(f'{p}/decoded-{i}.png').convert('RGB') for i in range(1,6)]",
            " out.update({'encodedSeam':d(e[0],e[-1]),'encodedMotion':d(e[0],e[2]),'encodedStartError':d(e[0],im[0]),'encodedEndError':d(e[-1],im[4])})",
            "print(json.dumps(out))",
          ].join("\n"),
          folder,
          result.video ? "1" : "0",
        ],
        { encoding: "utf8" },
      ),
    );
    await writeFile(`${folder}/witness.json`, JSON.stringify(witness, null, 2));
    await writeFile(
      `${folder}/report.json`,
      JSON.stringify(
        { witness, samples: result.samples, stats: result.stats, video: info?.streams[0] },
        null,
        2,
      ),
    );
    expect(witness.seam).toBeLessThan(0.1);
    expect(witness.motion).toBeGreaterThan(1);
    expect(witness.nearSeam).toBeLessThan(0.2);
    if (result.video) {
      // H.264 uses a first I-frame and a predicted final frame; the 4:2:0
      // quantization errors differ even when the lossless source endpoints match.
      // Bound both decoded endpoint fidelity and the seam on the 0–255 scale.
      expect(witness.encodedStartError).toBeLessThan(4);
      expect(witness.encodedEndError).toBeLessThan(4);
      expect(witness.encodedSeam).toBeLessThan(3);
      expect(witness.encodedMotion).toBeGreaterThan(1);
    }
  });

test.describe.serial("Cornell gallery installation and durable camera action", () => {
  let context: BrowserContext | undefined;
  let page: Page;
  let installed: ReturnType<NonNullable<Window["musart"]>["snapshot"]>;
  const timings: {
    installToCanvasAttachedMs?: number;
    attachedToNativeFrameMs?: number;
    installToNativeFrameMs?: number;
    reloadToKernelMs?: number;
    kernelToCanvasAttachedMs?: number;
    reloadedAttachedToNativeFrameMs?: number;
    kernelToNativeFrameMs?: number;
  } = {};
  const events: { time: number; kind: string; detail: string }[] = [];
  const pendingRequests = new Map<import("@playwright/test").Request, number>();
  const record = (kind: string, detail: string) => {
    events.push({ time: Date.now(), kind, detail });
    if (events.length > 250) events.shift();
  };
  test.beforeAll(async ({ browser }) => {
    const { baseURL, viewport } = test.info().project.use;
    context = await browser.newContext({ baseURL, viewport });
    page = await context.newPage();
    const relevant = (url: string) => /font|worker|cornell|text-shaper|geometry-build/i.test(url);
    page.on("console", (message) => record(`console:${message.type()}`, message.text()));
    page.on("pageerror", (error) => record("pageerror", error.message));
    page.on("request", (request) => {
      if (relevant(request.url())) pendingRequests.set(request, Date.now());
    });
    page.on("requestfinished", (request) => {
      const start = pendingRequests.get(request);
      if (start === undefined) return;
      record("requestfinished", `${Date.now() - start} ms ${request.url()}`);
      pendingRequests.delete(request);
    });
    page.on("requestfailed", (request) => {
      record("requestfailed", `${request.url()}: ${request.failure()?.errorText}`);
      pendingRequests.delete(request);
    });
    page.on("worker", (worker) => {
      record("worker-created", worker.url());
      worker.on("close", () => record("worker-closed", worker.url()));
    });
    await page.addInitScript(() => {
      localStorage.setItem("musart.language", "en");
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    });
  });
  test.afterAll(async () => {
    await context?.close();
  });
  const capture = async (phase: string) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = page.evaluate(async (projectId) => {
      const live = window.musart?.snapshot();
      const actualProjectId =
        projectId ?? live?.project.id ?? new URL(location.href).searchParams.get("project");
      const persisted = await new Promise<unknown>((resolve, reject) => {
        if (!actualProjectId) {
          resolve(null);
          return;
        }
        const opening = indexedDB.open("musart-studio");
        opening.onerror = () => reject(opening.error);
        opening.onupgradeneeded = () => {
          opening.transaction?.abort();
          reject(Error("Expected an existing project database"));
        };
        opening.onsuccess = () => {
          const database = opening.result;
          const transaction = database.transaction("projects", "readonly");
          const request = transaction.objectStore("projects").get(actualProjectId);
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => reject(request.error);
          transaction.oncomplete = () => database.close();
          transaction.onabort = () => database.close();
        };
      });
      return {
        url: location.href,
        live,
        persisted,
        canvas: Object.fromEntries(
          Object.entries(
            document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset ?? {},
          ),
        ),
        fonts: {
          status: document.fonts.status,
          faces: [...document.fonts].map((font) => ({
            family: font.family,
            status: font.status,
          })),
        },
        resources: performance
          .getEntriesByType("resource")
          .filter((entry) => /font|worker|text-shaper|geometry-build/i.test(entry.name))
          .slice(-60)
          .map((entry) => ({ name: entry.name, start: entry.startTime, duration: entry.duration })),
      };
    }, installed?.project.id);
    const state = await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(Error(`Cornell ${phase} diagnostic capture exceeded 2 seconds`)),
          2000,
        );
      }),
    ]).finally(() => {
      clearTimeout(timer);
    });
    const evidence = {
      phase,
      capturedAt: new Date().toISOString(),
      state,
      events,
      timings,
      activeWorkers: page.workers().map((worker) => worker.url()),
      pendingRequests: [...pendingRequests].map(([request, start]) => ({
        url: request.url(),
        elapsed: Date.now() - start,
      })),
    };
    await writeFile(
      `artifacts/cornell/native/gallery-${phase}.json`,
      JSON.stringify(evidence, null, 2),
    );
    return state;
  };
  const finalEvidence = async (phase: string) => {
    try {
      await capture(phase);
    } catch (error) {
      // Diagnostics must never replace the original renderer/assertion failure.
      record("evidence-error", String(error));
      await writeFile(
        `artifacts/cornell/native/gallery-${phase}-unavailable.json`,
        JSON.stringify({ capturedAt: new Date().toISOString(), timings, events }, null, 2),
      ).catch((failure: unknown) => {
        record("evidence-write-error", String(failure));
      });
    }
  };
  test("Cornell Box gallery preview installs all nine editable objects and a real camera action", async () => {
    test.setTimeout(90000);
    await page.goto("/dashboard?automation=1&profile3d=1");
    await page.getByRole("button", { name: "Preview Cornell Box", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Cornell Box", exact: true });
    const preview = dialog.locator(".motion-template-preview");
    await expect(preview).toHaveAttribute("data-preview-status", "playing", { timeout: 30000 });
    await expect
      .poll(async () =>
        Number(
          await preview
            .locator(".motion-template-preview-canvas")
            .getAttribute("data-preview-time"),
        ),
      )
      .toBeGreaterThan(0.1);
    await page.screenshot({ path: "artifacts/cornell/native/gallery-dialog.png" });
    const installStarted = Date.now();
    await dialog.getByRole("button", { name: "Open in Melt", exact: true }).click();
    const canvas = page.locator(".editor-gpu-scene canvas");
    let pendingEvidence: Promise<unknown> | undefined;
    const timer = setTimeout(() => {
      pendingEvidence = capture("install-pending").catch((error: unknown) => {
        record("evidence-error", String(error));
      });
    }, 20000);
    try {
      await canvas.waitFor({ state: "attached", timeout: 30000 });
      const attached = Date.now();
      timings.installToCanvasAttachedMs = attached - installStarted;
      await expect(canvas).toHaveAttribute("data-renderer-ready", "true", { timeout: 30000 });
      timings.attachedToNativeFrameMs = Date.now() - attached;
      timings.installToNativeFrameMs = Date.now() - installStarted;
      await expect(page.locator('.layer-row[data-layer-id="cornell-melt"]')).toBeVisible();
      await expect(canvas).not.toHaveAttribute("data-project-id", "template-cornell-box");
      installed = await page.evaluate(() => window.musart!.snapshot());
      const installedPage = installed.project.pages[0]!;
      expect(installedPage.motion!.sceneAnimations).toMatchObject([
        {
          owner: { kind: "camera", compositionId: installedPage.id },
          preset: { id: "scene-camera-orbit" },
        },
      ]);
      await capture("installed");
    } finally {
      clearTimeout(timer);
      await pendingEvidence;
      await finalEvidence("install-final");
    }
  });
  test("Cornell Box gallery reopens the actually installed project with its persisted camera action", async () => {
    test.setTimeout(90000);
    const canvas = page.locator(".editor-gpu-scene canvas");
    await page.evaluate(() => {
      const url = new URL(location.href);
      url.searchParams.set("automation", "1");
      url.searchParams.set("profile3d", "1");
      history.replaceState(history.state, "", url);
    });
    const reloadStarted = Date.now();
    await page.reload();
    let pendingEvidence: Promise<unknown> | undefined;
    const timer = setTimeout(() => {
      pendingEvidence = capture("reload-pending").catch((error: unknown) => {
        record("evidence-error", String(error));
      });
    }, 20000);
    try {
      // Kernel hydration/persisted-project recovery has its own readiness boundary.
      await expect
        .poll(() => page.evaluate(() => window.musart?.snapshot().project.id), { timeout: 30000 })
        .toBe(installed.project.id);
      const kernelReady = Date.now();
      timings.reloadToKernelMs = kernelReady - reloadStarted;
      const state = await capture("kernel-ready");
      const livePage = state.live!.project.pages[0]!;
      expect(livePage.motion!.sceneAnimations).toMatchObject([
        {
          owner: { kind: "camera", compositionId: livePage.id },
          preset: { id: "scene-camera-orbit" },
        },
      ]);
      const stored = state.persisted as { project: typeof installed.project };
      expect(stored.project.pages[0]!.motion!.sceneAnimations).toEqual(
        livePage.motion!.sceneAnimations,
      );
      // Cold editor modules can still be loading after the kernel recovers the project.
      await canvas.waitFor({ state: "attached", timeout: 30000 });
      const attached = Date.now();
      timings.kernelToCanvasAttachedMs = attached - kernelReady;
      // Preserve the existing native-render budget, measured from an actual native canvas.
      await expect(canvas).toHaveAttribute("data-renderer-ready", "true", { timeout: 30000 });
      timings.reloadedAttachedToNativeFrameMs = Date.now() - attached;
      timings.kernelToNativeFrameMs = Date.now() - kernelReady;
      await expect(canvas).not.toHaveAttribute("data-render-error");
      await expect(page.locator('.layer-row[data-layer-id="cornell-back"]')).toBeVisible();
      await capture("reloaded");
    } finally {
      clearTimeout(timer);
      await pendingEvidence;
      await finalEvidence("reload-final");
    }
  });
});
