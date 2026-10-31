import { expect, test } from "@playwright/test";
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
for (const webgl of [false, true])
  test(`Cornell Box native loop and Motion export (${webgl ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const folder = `artifacts/cornell/native/${webgl ? "webgl" : "webgpu"}`;
    await mkdir(folder, { recursive: true });
    const manifest = JSON.parse(
      await readFile("apps/web/public/templates/motion/cornell-box.json", "utf8"),
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
        return module.renderCornell(input.project, input.webgl);
      },
      { project: manifest.project, webgl },
    );
    expect(result.unchanged).toBe(true);
    expect(result.stats.backend).toBe(webgl ? "webgl" : "webgpu");
    expect(result.stats.spatial).toMatchObject({ sources: 2, meshes: 9 });
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
      expect(result.frameCount).toBe(480);
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
        r_frame_rate: "60/1",
        nb_frames: "480",
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
        "select=eq(n\\,0)+eq(n\\,1)+eq(n\\,240)+eq(n\\,478)+eq(n\\,479)",
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
            "im=[Image.open(f'{p}/frame-{i}.png').convert('RGB') for i in range(4)]",
            "d=lambda a,b:sum(ImageStat.Stat(ImageChops.difference(a,b)).mean)/3",
            "out={'seam':d(im[0],im[2]),'motion':d(im[0],im[1]),'nearSeam':d(im[0],im[3])}",
            "if sys.argv[2]=='1':",
            " e=[Image.open(f'{p}/decoded-{i}.png').convert('RGB') for i in range(1,6)]",
            " out.update({'encodedSeam':d(e[0],e[-1]),'encodedMotion':d(e[0],e[2]),'encodedStartError':d(e[0],im[0]),'encodedEndError':d(e[-1],im[3])})",
            "print(json.dumps(out))",
          ].join("\n"),
          folder,
          result.video ? "1" : "0",
        ],
        { encoding: "utf8" },
      ),
    );
    await writeFile(`${folder}/witness.json`, JSON.stringify(witness, null, 2));
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
    await writeFile(
      `${folder}/report.json`,
      JSON.stringify({ witness, stats: result.stats, video: info?.streams[0] }, null, 2),
    );
  });

test("Cornell Box previews from the gallery and installs both native sources durably", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/dashboard?automation=1");
  await page.getByRole("button", { name: "Preview Cornell Box", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Cornell Box", exact: true });
  const preview = dialog.locator(".motion-template-preview");
  await expect(preview).toHaveAttribute("data-preview-status", "playing", { timeout: 30000 });
  await expect
    .poll(async () =>
      Number(
        await preview.locator(".motion-template-preview-canvas").getAttribute("data-preview-time"),
      ),
    )
    .toBeGreaterThan(0.1);
  await page.screenshot({ path: "artifacts/cornell/native/gallery-dialog.png" });
  await dialog.getByRole("button", { name: "Open in Melt", exact: true }).click();
  const canvas = page.locator(".editor-gpu-scene canvas");
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true", { timeout: 30000 });
  await expect(page.locator('.layer-row[data-layer-id="cornell-melt"]')).toBeVisible();
  await expect(canvas).not.toHaveAttribute("data-project-id", "template-cornell-box");
  await page.reload();
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true", { timeout: 30000 });
  await expect(canvas).not.toHaveAttribute("data-render-error");
  await expect(page.locator('.layer-row[data-layer-id="cornell-room"]')).toBeVisible();
});
