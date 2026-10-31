import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  planMotionInitialization,
} from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";
const folder = "artifacts/export-centering/native";
function fixture(motion: boolean) {
  const engine = new EditorEngine(
    createProject({
      pages: [
        createPage({
          width: 320,
          height: 240,
          background: "#2244ff",
          layers: [
            createLayer("rectangle", {
              id: "subject",
              x: 20,
              y: 30,
              width: 80,
              height: 40,
              fill: "#ff0000",
            }),
          ],
        }),
      ],
    }),
  );
  if (motion) {
    engine.execute({
      type: "setCompositionMode",
      mode: "motion",
      plan: planMotionInitialization(
        engine.getSnapshot(),
        { value: 1, rate: 1 },
        { numerator: 12, denominator: 1 },
      ),
    });
    for (const value of [0, 1])
      engine.execute({
        type: "upsertMotionKeyframe",
        target: { kind: "layer", layerId: "subject", property: "x" },
        time: { value, rate: 1 },
        value: 20 + value * 24,
      });
  }
  return engine.getSnapshot().project;
}
for (const motion of [false, true])
  test(`single-layer centering matches native preview and decoded ${motion ? "Motion video" : "PNG"} without document edits`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await mkdir(folder, { recursive: true });
    await page.addInitScript(() => {
      localStorage.setItem("musart.language", "en");
      localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    });
    await installReadbackProbe(page);
    await page.goto("/editor?automation=1");
    await page.waitForFunction(() => !!window.musart);
    await page.evaluate((project) => {
      window.musart!.load(project);
      window.musart!.select(["subject"]);
    }, fixture(motion));
    await expect(page.locator(".editor-gpu-scene canvas")).toHaveAttribute(
      "data-renderer-ready",
      "true",
      { timeout: 30000 },
    );
    const before = await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project));
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const dialog = page.locator(".export-dialog");
    const center = dialog.getByRole("switch", { name: "Center selected layer", exact: true });
    await expect(center).not.toBeChecked();
    await dialog.getByRole("button", { name: "Center selected layer", exact: true }).click();
    await expect(page.getByRole("tooltip")).toContainText("Keeps the artboard size");
    await center.click();
    await expect(center).toBeChecked();
    if (motion) {
      await expect(dialog.locator(".motion-export-preview-surface")).toHaveAttribute(
        "data-preview-ready",
        "true",
        { timeout: 30000 },
      );
      const dimensions = await dialog
        .locator(".motion-export-preview-surface canvas")
        .evaluate((canvas: HTMLCanvasElement) => ({ width: canvas.width, height: canvas.height }));
      expect(dimensions.width / dimensions.height).toBeCloseTo(4 / 3, 2);
      await dialog.getByRole("combobox", { name: "File format", exact: true }).click();
      await page.getByRole("option", { name: "MP4", exact: true }).click();
    } else {
      const image = dialog.getByRole("img", { name: "Export preview", exact: true });
      await expect(image).toBeVisible({ timeout: 30000 });
      const data = await image.evaluate(async (image: HTMLImageElement) => {
        await image.decode();
        const blob = await (await fetch(image.src)).blob();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === "string"
              ? resolve(reader.result)
              : reject(new Error("Invalid preview encoding"));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      });
      await writeFile(`${folder}/preview.webp`, Buffer.from(data.split(",")[1]!, "base64"));
    }
    const downloaded = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: motion ? "Export video" : "Export image", exact: true })
      .click();
    const file = await downloaded,
      path = `${folder}/centered.${motion ? "mp4" : "png"}`;
    await file.saveAs(path);
    expect(await page.evaluate(() => JSON.stringify(window.musart!.snapshot().project))).toBe(
      before,
    );
    expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
      gpu: 0,
      webgl: 0,
      canvas: 0,
      videoFrame: 0,
    });
    if (motion)
      execFileSync("ffmpeg", [
        "-v",
        "error",
        "-threads",
        "1",
        "-filter_threads",
        "1",
        "-i",
        path,
        "-vf",
        "select=eq(n\\,0)+eq(n\\,11)",
        "-fps_mode",
        "vfr",
        "-y",
        `${folder}/motion-%d.png`,
      ]);
    const report = JSON.parse(
      execFileSync(
        "python3",
        [
          "-c",
          [
            "from PIL import Image",
            "import sys,json",
            "p=sys.argv[1]; motion=sys.argv[2]=='1'",
            "out={}",
            "files=['motion-1.png','motion-2.png'] if motion else ['centered.png','preview.webp']",
            "for name in files:",
            " im=Image.open(p+'/'+name).convert('RGBA'); w,h=im.size",
            " pts=[(x,y) for y in range(h) for x in range(w) if (lambda c:c[0]>120 and c[1]<80 and c[2]<80 and c[3]>128)(im.getpixel((x,y)))]",
            " assert pts, 'No red artwork'",
            " out[name]={'size':[w,h], 'center':[sum(x for x,y in pts)/len(pts),sum(y for x,y in pts)/len(pts)], 'corner':im.getpixel((0,0))}",
            "print(json.dumps(out))",
          ].join("\n"),
          folder,
          motion ? "1" : "0",
        ],
        { encoding: "utf8" },
      ),
    );
    await writeFile(
      `${folder}/${motion ? "motion" : "image"}-report.json`,
      JSON.stringify(report, null, 2),
    );
    if (motion) {
      expect(report["motion-1.png"].size).toEqual([320, 240]);
      expect(report["motion-1.png"].center[0]).toBeCloseTo(159.5, 0);
      expect(Math.abs(report["motion-2.png"].center[0] - 181.5)).toBeLessThan(1.5);
    } else
      for (const [name, entry] of Object.entries(report) as [
        string,
        { size: number[]; center: number[]; corner: number[] },
      ][]) {
        expect(Math.abs(entry.center[0] / entry.size[0]! - 0.5)).toBeLessThan(0.005);
        expect(Math.abs(entry.center[1] / entry.size[1]! - 0.5)).toBeLessThan(0.005);
        expect(entry.corner[3], name).toBe(0);
        if (name === "centered.png") expect(entry.size).toEqual([320, 240]);
      }
  });
