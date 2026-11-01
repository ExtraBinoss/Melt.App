import { expect, test } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { installReadbackProbe } from "./support/readback-probe";

for (const webgl of [false, true])
  test(`Bloom Windows: native aligned effects and seamless loop (${webgl ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const folder = `artifacts/bloom-windows/${webgl ? "webgl" : "webgpu"}`;
    await mkdir(folder, { recursive: true });
    await installReadbackProbe(page);
    const entry = new URL("/__bloom-windows-check", test.info().project.use.baseURL).href;
    await page.route(entry, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body></body></html>",
      }),
    );
    await page.goto(entry);
    const manifest = JSON.parse(
      await readFile("apps/web/public/templates/motion/bloom-windows/bloom-windows.json", "utf8"),
    );
    const captured = await page.evaluate(
      async (input) => {
        const core = (await import(
          input.coreUrl
        )) as typeof import("../../packages/core/src/index");
        const render = (await import(
          input.renderUrl
        )) as typeof import("../../packages/render/src/index");
        const original = input.manifest.originals[0]!;
        const response = await fetch(`/templates/motion/${original.file}`);
        if (!response.ok) throw Error(`Missing original: ${response.status}`);
        const blob = await response.blob();
        const mediaResolver = {
          async resolveOriginal(asset: { originalId: string }) {
            if (asset.originalId !== original.originalId) throw Error("Unexpected original");
            return blob;
          },
        };
        const project = input.manifest.project;
        const composition = project.pages[0]!;
        const program = core.compileMotion(project, { compositionId: composition.id });
        const session = render.createRenderSession({
          forceWebGL: input.webgl,
          maxBytes: 128 * 1024 * 1024,
        });
        const images: string[] = [];
        let stats;
        try {
          for (const seconds of [0, 1 / 60, 2.6, 6, 719 / 60, 12]) {
            const frame = core.evaluateMotion(
              program,
              { value: Math.round(seconds * 60000), rate: 60000 },
              { terminalPreview: seconds === 12 },
            );
            images.push(
              await session.withCanvasFrame(
                core.applyMotionFrame(program, frame),
                project.assets,
                (canvas) => canvas.toDataURL("image/png"),
                { scale: 0.5, motionFrame: frame, mediaResolver, mediaMode: "exact" },
              ),
            );
          }
          // Independent source-only witness at the same source timestamp.
          const frame = core.evaluateMotion(program, { value: 2600, rate: 1000 });
          const scene = core.applyMotionFrame(program, frame);
          images.push(
            await session.withCanvasFrame(
              { ...scene, layers: scene.layers.filter((layer) => layer.id === "bw-original") },
              project.assets,
              (canvas) => canvas.toDataURL("image/png"),
              { scale: 0.5, motionFrame: frame, mediaResolver, mediaMode: "exact" },
            ),
          );
          stats = session.stats();
        } finally {
          await session.dispose();
        }
        let video: string | null = null;
        if (!input.webgl) {
          const exported = await render.exportMotionVideo(project, {
            compositionId: composition.id,
            scale: 0.5,
            frameRate: { numerator: 15, denominator: 1 },
            container: "mp4",
            audio: false,
            mediaResolver,
            videoBitrate: 5000000,
            maxGpuBytes: 128 * 1024 * 1024,
          });
          if (!exported.blob) throw Error("Missing encoded MP4");
          video = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(exported.blob!);
          });
        }
        return { images, video, stats, reads: window.__musartVideoReadbacks };
      },
      {
        manifest,
        webgl,
        coreUrl: `/@fs${resolve("packages/core/src/index.ts")}`,
        renderUrl: `/@fs${resolve("packages/render/src/index.ts")}`,
      },
    );
    expect(captured.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
    expect(captured.stats?.backend).toBe(webgl ? "webgl" : "webgpu");
    expect(captured.stats!.video?.uploads?.streams).toBe(1);
    expect(captured.stats!.cacheBytes).toBeLessThanOrEqual(captured.stats!.maxBytes);
    for (const [index, image] of captured.images.entries())
      await writeFile(`${folder}/frame-${index}.png`, Buffer.from(image.split(",")[1]!, "base64"));
    if (captured.video) {
      await writeFile(
        `${folder}/bloom-windows.mp4`,
        Buffer.from(captured.video.split(",")[1]!, "base64"),
      );
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-threads",
        "1",
        "-filter_threads",
        "1",
        "-i",
        `${folder}/bloom-windows.mp4`,
        "-vf",
        "select=lt(n\\,3)+gte(n\\,177)",
        "-fps_mode",
        "vfr",
        "-frames:v",
        "6",
        "-y",
        `${folder}/encoded-%d.png`,
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
            "im=[Image.open(f'{p}/frame-{i}.png').convert('RGB') for i in range(7)]",
            "d=lambda a,b:sum(ImageStat.Stat(ImageChops.difference(a,b)).mean)/3",
            "encoded=None",
            "if sys.argv[2]=='1':",
            " e=[Image.open(f'{p}/encoded-{i}.png').convert('RGB') for i in range(1,7)]",
            " encoded={'boundary':d(e[-1],e[0]),'adjacent':max(d(e[-2],e[-1]),d(e[0],e[1]))}",
            "print(json.dumps({'seam':d(im[0],im[5]),'lastFrame':d(im[0],im[4]),'motion':d(im[0],im[3]),'outside':d(im[2].crop((0,0,80,540)),im[6].crop((0,0,80,540))),'treatments':d(im[2],im[6]),'encodedSeam':encoded}))",
          ].join("\n"),
          folder,
          captured.video ? "1" : "0",
        ],
        { encoding: "utf8" },
      ),
    );
    expect(witness.seam).toBeLessThan(0.15);
    expect(witness.lastFrame).toBeLessThan(witness.motion);
    expect(witness.motion).toBeGreaterThan(5);
    expect(witness.outside).toBeLessThan(0.05);
    expect(witness.treatments).toBeGreaterThan(5);
    if (captured.video)
      expect(witness.encodedSeam.boundary).toBeLessThan(witness.encodedSeam.adjacent * 1.35 + 1);
    await writeFile(
      `${folder}/report.json`,
      JSON.stringify({ witness, stats: captured.stats, reads: captured.reads }, null, 2),
    );
  });
