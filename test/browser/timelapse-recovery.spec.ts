import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type * as Witness from "./support/timelapse-recovery";
import { installReadbackProbe } from "./support/readback-probe";

test("legacy timelapse previews and decoded exports work, while real corruption offers console details and native copy", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [],
    consoleErrors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await installReadbackProbe(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    localStorage.setItem("musart.editor-tutorial.v1", "done");
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await mkdir("artifacts/timelapse-recovery", { recursive: true });
  await writeFile(
    "artifacts/timelapse-recovery/editor.html",
    `<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true; const { mountEditorWitness } = await import("/@fs${resolve("test/browser/support/editor-witness.tsx")}"); await mountEditorWitness();</script></body></html>`,
  );
  await page.goto(`/@fs${resolve("artifacts/timelapse-recovery/editor.html")}?automation=1`);
  await page.waitForFunction(() => !!window.musart, undefined, { timeout: 20000 });
  await expect(page.getByRole("button", { name: "Exporter", exact: true })).toBeVisible({
    timeout: 20000,
  });
  const project = createProject({
    name: "Timelapse recovery",
    pages: [
      createPage({
        id: "recovery-page",
        width: 96,
        height: 64,
        layers: [
          createLayer("rectangle", {
            id: "subject",
            x: 8,
            y: 8,
            width: 64,
            height: 48,
            fill: "#ff0000",
          }),
        ],
      }),
    ],
  });
  await page.evaluate(async (project) => {
    window.musart!.load(project);
    window.musart!.execute({
      type: "updateLayers",
      ids: ["subject"],
      patch: { fillGradient: undefined, x: 12 },
    });
    window.musart!.execute({
      type: "updateLayers",
      ids: ["subject"],
      patch: { fillGradient: undefined, x: 16 },
    });
    window.musart!.execute({
      type: "updateLayers",
      ids: ["subject"],
      patch: { fill: "#0000ff", x: 20 },
    });
    await window.musart!.flush();
  }, project);
  const modulePath = `/@fs${resolve("test/browser/support/timelapse-recovery.ts")}`;
  const history = await page.evaluate(
    async (path) => ((await import(path)) as typeof Witness).installLegacyHistory(),
    modulePath,
  );
  await expect(page.locator(".inspector-header .export-options")).toHaveCount(0);
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Exporter la composition", exact: true });
  const previewStarted = Date.now();
  await dialog.getByRole("radio", { name: "Timelapse", exact: true }).click();
  const preview = dialog.locator('.motion-export-preview-surface[data-preview-ready="true"]');
  await expect(preview).toBeVisible();
  await expect(preview.locator("canvas")).toBeVisible();
  const previewReadyMs = Date.now() - previewStarted;
  await dialog.getByRole("spinbutton", { name: "Durée finale de la vidéo", exact: true }).fill("1");
  await expect(preview).toBeVisible();
  const pending = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Exporter la vidéo", exact: true }).click();
  const download = await pending;
  await mkdir("artifacts/timelapse-recovery", { recursive: true });
  const output = `artifacts/timelapse-recovery/${download.suggestedFilename()}`;
  await download.saveAs(output);
  const decoded = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-count_frames",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,nb_read_frames:format=duration",
        "-of",
        "json",
        output,
      ],
      { encoding: "utf8" },
    ),
  );
  expect(decoded.streams[0]).toMatchObject({ width: 96, height: 64, nb_read_frames: "30" });
  expect(Number(decoded.format.duration)).toBeCloseTo(1, 2);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    output,
    "-vf",
    "select=eq(n\\,29)",
    "-frames:v",
    "1",
    "artifacts/timelapse-recovery/last.png",
  ]);
  const finalPixel = execFileSync("ffmpeg", [
    "-v",
    "error",
    "-i",
    "artifacts/timelapse-recovery/last.png",
    "-vf",
    "crop=1:1:48:32",
    "-frames:v",
    "1",
    "-pix_fmt",
    "rgb24",
    "-f",
    "rawvideo",
    "pipe:1",
  ]);
  // The final stored edit changes the subject from red to blue; frame count alone cannot prove it landed.
  expect(finalPixel[0]).toBeLessThan(35);
  expect(finalPixel[1]).toBeLessThan(35);
  expect(finalPixel[2]).toBeGreaterThan(220);
  await expect(dialog.locator('.export-job[data-status="complete"]')).toBeVisible();
  expect(consoleErrors).toEqual([]);
  await dialog
    .locator(".export-dialog-footer")
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
  await page.evaluate(
    async (path) => ((await import(path)) as typeof Witness).installLegacyHistory(true),
    modulePath,
  );
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  await dialog.getByRole("radio", { name: "Timelapse", exact: true }).click();
  await expect(dialog.locator(".export-failure")).toContainText("Replay path is missing");
  await dialog.getByRole("button", { name: "Exporter la vidéo", exact: true }).click();
  const failure = dialog.locator('.export-job[data-status="failed"] .export-failure');
  await expect(failure).toBeVisible();
  await failure.getByRole("button").click();
  await expect(failure.getByRole("button")).toHaveAttribute("data-copy-state", "copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("Replay path is missing");
  expect(copied).toContain("timelapse export");
  expect(consoleErrors.some((message) => message.includes("[Melt export failed]"))).toBe(true);
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
  expect(errors).toEqual([]);
  await page.screenshot({ path: "artifacts/timelapse-recovery/error.png" });
  await writeFile(
    "artifacts/timelapse-recovery/witness.json",
    JSON.stringify({ history, previewReadyMs, decoded, copied, consoleErrors }, null, 2),
  );
  await page.evaluate(() => window.disposeEditorWitness?.());
});
