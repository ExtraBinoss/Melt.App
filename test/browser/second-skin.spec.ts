import { expect, test } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { installReadbackProbe } from "./support/readback-probe";

test("Second Skin renders distinct native treatments, exports a loop and installs its owned video from the real gallery", async ({
  page,
}) => {
  test.setTimeout(90000);
  const folder = "artifacts/second-skin/native";
  await mkdir(folder, { recursive: true });
  const manifest = JSON.parse(
    await readFile("apps/web/public/templates/motion/second-skin/second-skin.json", "utf8"),
  );
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  const entry = new URL("/__second-skin-check", test.info().project.use.baseURL).href;
  await page.route(entry, (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }),
  );
  await page.goto(entry);
  const result = await page.evaluate(
    async (input) => {
      const core = (await import(input.coreUrl)) as typeof import("../../packages/core/src/index");
      const render = (await import(
        input.renderUrl
      )) as typeof import("../../packages/render/src/index");
      const original = input.manifest.originals[0];
      const response = await fetch("/templates/motion/" + original.file);
      if (!response.ok) throw Error("Missing owned source");
      const blob = await response.blob();
      const mediaResolver = {
        async resolveOriginal(asset: { originalId: string }) {
          if (asset.originalId !== original.originalId) throw Error("Unexpected original");
          return blob;
        },
      };
      const project = input.manifest.project,
        page = project.pages[0];
      const program = core.compileMotion(project, { compositionId: page.id });
      const session = render.createRenderSession({
        forceWebGL: false,
        maxBytes: 128 * 1024 * 1024,
      });
      const images: string[] = [];
      let stats;
      try {
        for (const time of [0, 0.04, 1, 3, 7, 9.96, 10]) {
          const frame = core.evaluateMotion(
            program,
            { value: Math.round(time * 1000), rate: 1000 },
            { terminalPreview: time === 10 },
          );
          images.push(
            await session.withCanvasFrame(
              core.applyMotionFrame(program, frame),
              project.assets,
              (c) => c.toDataURL("image/png"),
              { scale: 0.25, motionFrame: frame, mediaResolver, mediaMode: "exact" },
            ),
          );
        }
        stats = session.stats();
      } finally {
        await session.dispose();
      }
      const exported = await render.exportMotionVideo(project, {
        compositionId: page.id,
        scale: 1 / 3,
        frameRate: { numerator: 25, denominator: 1 },
        container: "mp4",
        audio: false,
        mediaResolver,
        maxGpuBytes: 128 * 1024 * 1024,
      });
      if (!exported.blob) throw Error("Missing real MP4");
      const video = await new Promise<string>((ok, fail) => {
        const r = new FileReader();
        r.onload = () => ok(r.result as string);
        r.onerror = () => fail(r.error);
        r.readAsDataURL(exported.blob!);
      });
      return { images, video, stats, reads: window.__musartVideoReadbacks };
    },
    {
      manifest,
      coreUrl: `/@fs${resolve("packages/core/src/index.ts")}`,
      renderUrl: `/@fs${resolve("packages/render/src/index.ts")}`,
    },
  );
  expect(result.reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  expect(result.stats?.backend).toBe("webgpu");
  expect(result.stats?.video?.uploads?.streams).toBe(1);
  expect(result.stats!.cacheBytes).toBeLessThanOrEqual(result.stats!.maxBytes);
  for (const [i, image] of result.images.entries())
    await writeFile(`${folder}/frame-${i}.png`, Buffer.from(image.split(",")[1]!, "base64"));
  await writeFile(`${folder}/second-skin.mp4`, Buffer.from(result.video.split(",")[1]!, "base64"));
  const metrics = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `from PIL import Image,ImageChops,ImageStat
import json,sys
p=sys.argv[1]; im=[Image.open(f'{p}/frame-{i}.png').convert('RGB') for i in range(7)]
d=lambda a,b:sum(ImageStat.Stat(ImageChops.difference(a,b)).mean)/3
print(json.dumps({'seam':d(im[0],im[6]),'adjacent':max(d(im[0],im[1]),d(im[5],im[6])),'thermal':d(im[2],im[3]),'contour':d(im[3],im[4])}))`,
        folder,
      ],
      { encoding: "utf8" },
    ),
  );
  expect(metrics.seam).toBeLessThan(metrics.adjacent * 1.35 + 1);
  expect(metrics.thermal).toBeGreaterThan(5);
  expect(metrics.contour).toBeGreaterThan(5);
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=width,height,codec_name",
        "-of",
        "json",
        `${folder}/second-skin.mp4`,
      ],
      { encoding: "utf8" },
    ),
  );
  expect(Number(probe.format.duration)).toBeCloseTo(10, 1);
  expect(probe.streams[0]).toMatchObject({ width: 360, height: 640, codec_name: "h264" });
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-threads",
    "1",
    "-i",
    `${folder}/second-skin.mp4`,
    "-f",
    "null",
    "-",
  ]);
  await writeFile(
    `${folder}/report.json`,
    JSON.stringify({ metrics, probe, stats: result.stats, reads: result.reads }, null, 2),
  );
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => !!window.musart);
  await page.getByRole("button", { name: "Project menu", exact: true }).click();
  await page.locator(".library-navigation-item").filter({ hasText: "Templates" }).click();
  await page.getByRole("button", { name: "Create from Second Skin", exact: true }).click();
  await expect(page.locator(".project-dashboard")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.musart?.snapshot().project.name))
    .toBe("Second Skin");
  const project = await page.evaluate(() => window.musart!.snapshot().project);
  expect(project.id).not.toBe(manifest.project.id);
  expect(project.pages).toEqual(manifest.project.pages);
  await expect(page.locator('canvas[data-renderer-ready="true"]').first()).toBeVisible();
  await page.evaluate(() => window.musart!.save());
  await page.goto(`/editor?project=${project.id}&automation=1`);
  await page.waitForFunction((id) => window.musart?.session().projectId === id, project.id);
  expect((await page.evaluate(() => window.musart!.snapshot().project)).pages).toEqual(
    project.pages,
  );
  await expect(page.locator('canvas[data-renderer-ready="true"]').first()).toBeVisible();
});
