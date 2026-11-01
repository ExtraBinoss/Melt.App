import { expect, test } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type * as Core from "../../packages/core/src/index";
import type * as Render from "../../packages/render/src/index";
import { installReadbackProbe } from "./support/readback-probe";

for (const webgl of [false, true])
  test(`Angel.exe exact seeks, window coverage and bounded 50-image workload (${webgl ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(150000);
    const folder = `artifacts/angel-windows/${webgl ? "webgl" : "webgpu"}`;
    await mkdir(folder, { recursive: true });
    await installReadbackProbe(page);
    await page.route("**/__angel-windows", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body></body></html>",
      }),
    );
    await page.goto("/__angel-windows");
    const manifest = JSON.parse(
      await readFile("apps/web/public/templates/motion/angel-windows/angel-windows.json", "utf8"),
    );
    const result = await page.evaluate(
      async (input) => {
        const core = (await import(input.core)) as typeof Core;
        const render = (await import(input.render)) as typeof Render;
        const program = core.compileMotion(input.project, {
          compositionId: input.project.pages[0]!.id,
        });
        const session = render.createRenderSession({
          forceWebGL: input.webgl,
          maxBytes: 128 * 1024 * 1024,
        });
        const captures: string[] = [],
          frameMs: number[] = [];
        const draw = async (seconds: number, capture: boolean) => {
          const frame = core.evaluateMotion(program, {
            value: Math.round(seconds * 30000),
            rate: 30000,
          });
          const start = performance.now();
          const image = await session.withCanvasFrame(
            core.applyMotionFrame(program, frame),
            input.project.assets,
            (canvas) => (capture ? canvas.toDataURL("image/png") : ""),
            { scale: 0.375, motionFrame: frame },
          );
          if (!capture) frameMs.push(performance.now() - start);
          return image;
        };
        let stats;
        try {
          for (const time of [0, 2, 4, 6, 8, 10, 12, 4]) captures.push(await draw(time, true));
          for (let frame = 0; frame < 60; frame++) await draw(4 + frame / 30, false);
          stats = session.stats();
        } finally {
          await session.dispose();
        }
        let disposedRejects = false;
        try {
          await draw(4, false);
        } catch {
          disposedRejects = true;
        }
        const assets = {
          photo: {
            id: "photo",
            name: "Shared gradient",
            mime: "image/svg+xml",
            width: 64,
            height: 64,
            dataUrl: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs><linearGradient id="g"><stop stop-color="#ff5500"/><stop offset="1" stop-color="#1199ff"/></linearGradient></defs><rect x="4" y="8" width="56" height="48" fill="url(#g)"/></svg>')}`,
          },
        };
        const effect = core.createEffect("window-trails", {
          id: "fx",
          time: 2,
          settings: {
            count: 8,
            width: 32,
            height: 32,
            titleHeight: 4,
            radiusX: 0.2,
            radiusY: 0.1,
            treatment: "invert",
          },
        });
        const layer = core.createLayer("image", {
          id: "source",
          assetId: "photo",
          x: 0,
          y: 0,
          width: 64,
          height: 64,
        });
        const sample = core.createPage({
          width: 64,
          height: 64,
          background: "transparent",
          layers: [layer],
        });
        const effects = render.createRenderSession({
          forceWebGL: input.webgl,
          maxBytes: 64 * 1024 * 1024,
        });
        let identity, treatment, load;
        try {
          const capture = (fx: Core.Effect[]) =>
            effects.withCanvasFrame(
              { ...sample, layers: [{ ...layer, effects: fx }] },
              assets,
              (canvas) => canvas.toDataURL("image/png"),
            );
          const baseline = await capture([]),
            zero = await capture([{ ...effect, amount: 0 }]);
          identity = { baseline, zero };
          treatment = await capture([effect]);
          const layers = Array.from({ length: 50 }, (_, i) => ({
            ...layer,
            id: `source-${i}`,
            x: (i % 8) * 64,
            y: Math.floor(i / 8) * 64,
            effects: [{ ...effect, id: `fx-${i}` }],
          }));
          await effects.withCanvasFrame(
            core.createPage({ width: 512, height: 448, layers }),
            assets,
            () => {},
          );
          load = effects.stats();
        } finally {
          await effects.dispose();
        }
        let movie: string | null = null;
        if (input.video && !input.webgl) {
          const exported = await render.exportMotionVideo(input.project, {
            compositionId: program.compositionId,
            scale: 1,
            container: "mp4",
            audio: false,
            videoBitrate: 8000000,
            maxGpuBytes: 384 * 1024 * 1024,
          });
          if (!exported.blob) throw Error("Native MP4 encoding produced no file");
          movie = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(exported.blob!);
          });
        }
        const adapter = await navigator.gpu?.requestAdapter();
        return {
          captures,
          identity,
          treatment,
          movie,
          frameMs,
          stats,
          load,
          disposedRejects,
          readbacks: window.__musartVideoReadbacks,
          environment: {
            availableWebGPUAdapter: adapter?.info
              ? {
                  vendor: adapter.info.vendor,
                  architecture: adapter.info.architecture,
                  device: adapter.info.device,
                  description: adapter.info.description,
                }
              : null,
            agent: navigator.userAgent,
            platform: navigator.platform,
            dpr: devicePixelRatio,
          },
        };
      },
      {
        project: manifest.project as Core.Project,
        core: `/@fs${resolve("packages/core/src/index.ts")}`,
        render: `/@fs${resolve("packages/render/src/index.ts")}`,
        webgl,
        video: process.env.MELT_TEMPLATE_VIDEO === "1",
      },
    );
    expect(result.disposedRejects).toBe(true);
    expect(result.stats?.backend).toBe(webgl ? "webgl" : "webgpu");
    expect(result.stats!.cacheBytes).toBeLessThanOrEqual(result.stats!.maxBytes);
    expect(result.stats!.spatial?.sources).toBe(1);
    expect(result.load!.cacheBytes).toBeLessThanOrEqual(result.load!.maxBytes);
    expect(result.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    const inspector = await page.context().newPage();
    try {
      const pixels = await inspector.evaluate(async (input) => {
        const decode = async (url: string) => {
          const image = new Image();
          image.src = url;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(image, 0, 0);
          return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        };
        const difference = async (a: string, b: string) => {
          const [x, y] = await Promise.all([decode(a), decode(b)]);
          return x.reduce((max, value, i) => Math.max(max, Math.abs(value - y[i]!)), 0);
        };
        return {
          identity: await difference(input.identity.baseline, input.identity.zero),
          deterministic: await difference(input.captures[2]!, input.captures[7]!),
          changed: await difference(input.identity.baseline, input.treatment),
          motion: await difference(input.captures[0]!, input.captures[2]!),
        };
      }, result);
      for (const [i, data] of result.captures.entries())
        await writeFile(`${folder}/frame-${i}.png`, Buffer.from(data.split(",")[1]!, "base64"));
      expect(pixels.identity).toBeLessThanOrEqual(1);
      expect(pixels.deterministic).toBeLessThanOrEqual(1);
      expect(pixels.changed).toBeGreaterThan(50);
      expect(pixels.motion).toBeGreaterThan(50);

      if (result.movie)
        await writeFile(
          `${folder}/angel-windows.mp4`,
          Buffer.from(result.movie.split(",")[1]!, "base64"),
        );
      await writeFile(
        `${folder}/report.json`,
        JSON.stringify(
          {
            ...result,
            pixels,
            captures: undefined,
            identity: undefined,
            treatment: undefined,
            movie: undefined,
          },
          null,
          2,
        ),
      );
    } finally {
      await inspector.close();
    }
  });
