import { test, expect } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

for (const webgl of [false, true])
  test(`Bloom windows keep opaque video coverage over a full orbit (${webgl ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const entry = new URL("/__bloom-opacity", test.info().project.use.baseURL).href;
    await page.route(entry, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body></body></html>",
      }),
    );
    await page.goto(entry);
    const manifest = JSON.parse(
      await readFile(
        "apps/web/public/templates/motion/bloom-windows/bloom-windows.preview.json",
        "utf8",
      ),
    );
    const result = await page.evaluate(
      async (input) => {
        const core = (await import(
          input.coreUrl
        )) as typeof import("../../packages/core/src/index");
        const render = (await import(
          input.renderUrl
        )) as typeof import("../../packages/render/src/index");
        const source = input.manifest.originals[0];
        const original = await (await fetch("/templates/motion/" + source.file)).blob();
        const project = input.manifest.project;
        const composition = project.pages[0];
        const program = core.compileMotion(project, { compositionId: composition.id });
        const session = render.createRenderSession({
          forceWebGL: input.webgl,
          maxBytes: 128 * 1024 * 1024,
        });
        const frames = [];
        try {
          for (let step = 0; step <= 24; step++) {
            const plan = core.evaluateMotion(
              program,
              { value: step, rate: 2 },
              { terminalPreview: step === 24 },
            );
            const scene = core.applyMotionFrame(program, plan);
            const windows = scene.layers
              .filter((layer) => layer.id.endsWith("-window"))
              .map((layer) => ({
                id: layer.id,
                width: layer.width,
                height: layer.height,
                matrix: core.getWorldMatrix(scene, layer.id),
              }));
            const page = {
              ...scene,
              background: "transparent",
              layers: scene.layers.filter(
                (layer) =>
                  layer.id !== "bw-original" &&
                  !layer.id.endsWith("-shadow") &&
                  !layer.id.endsWith("-label"),
              ),
            };
            // Freeze the source to isolate geometry/coverage from the flower's changing brightness.
            const motionFrame = {
              ...plan,
              mediaRequests: plan.mediaRequests
                .filter((request) => request.layerId !== "bw-original")
                .map((request) => ({
                  ...request,
                  // Terminal still rendering subtracts 1 µs to sample before an exclusive end.
                  // Compensate while freezing this witness at the first valid source frame.
                  sourceTime: { value: plan.terminalPreview ? 1 : 0, rate: 1_000_000 },
                })),
            };
            const image = await session.withCanvasFrame(
              page,
              project.assets,
              (canvas) => canvas.toDataURL("image/png"),
              {
                scale: 0.25,
                motionFrame,
                mediaMode: "playback",
                mediaResolver: {
                  async resolveOriginal() {
                    return original;
                  },
                },
              },
            );
            frames.push({ image, windows });
          }
          return { frames, stats: session.stats() };
        } finally {
          await session.dispose();
        }
      },
      {
        manifest,
        webgl,
        coreUrl: new URL(`/@fs${resolve("packages/core/src/index.ts")}`, entry).href,
        renderUrl: new URL(`/@fs${resolve("packages/render/src/index.ts")}`, entry).href,
      },
    );
    const folder = `artifacts/bloom-flicker/${webgl ? "webgl" : "webgpu"}-coverage`;
    await mkdir(folder, { recursive: true });
    for (const [index, frame] of result.frames.entries())
      await writeFile(`${folder}/${index}.png`, Buffer.from(frame.image.split(",")[1]!, "base64"));
    await writeFile(
      `${folder}/windows.json`,
      JSON.stringify(result.frames.map((frame) => frame.windows)),
    );
    const proof = JSON.parse(
      execFileSync(
        "python3",
        [
          "-c",
          `
import json,sys
from PIL import Image
p=sys.argv[1]; frames=json.load(open(p+'/windows.json')); minima=[]
for index,windows in enumerate(frames):
 im=Image.open(f'{p}/{index}.png').convert('RGBA')
 for w in windows:
  m=w['matrix']; x=m[4]*.25; y=m[5]*.25
  a=im.getchannel('A').crop((round(x+4),round(y+4),round(x+w['width']*.25-4),round(y+w['height']*.25-4)))
  minima.append(a.getextrema()[0])
print(json.dumps({'minimumAlpha':min(minima),'samples':len(minima)}))
`,
          folder,
        ],
        { encoding: "utf8" },
      ),
    );
    await writeFile(
      `${folder}/report.json`,
      JSON.stringify({ proof, stats: result.stats }, null, 2),
    );
    expect(proof.samples).toBe(75);
    expect(proof.minimumAlpha).toBeGreaterThanOrEqual(254);
    expect(result.stats?.video?.uploads?.streams).toBe(1);
  });
