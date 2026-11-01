import { expect, test } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { installReadbackProbe } from "./support/readback-probe";
import { createLayer, createPage, createProject } from "@musart/core";

const folder = "artifacts/export-size";

test("Angel.exe shows observed encoder size, exact delivered bytes and matching-scope reuse without extra encoding", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await mkdir(folder, { recursive: true });
  await installReadbackProbe(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => !!window.musart);
  await page.evaluate(async () => {
    const manifest = await (await fetch("/templates/motion/angel-windows.json")).json();
    window.musart!.load(manifest.project);
  });
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Exporter la composition", exact: true });
  const size = dialog.locator(".export-file-size");
  await expect(size).toHaveAttribute("data-size-kind", "target");
  await expect(size).toHaveText(/Poids cible · ≈ 13,06\sMo/);
  await expect(dialog.getByRole("button", { name: "Export en arrière-plan" })).toHaveCount(0);
  const initial = Number(await size.getAttribute("data-size-bytes"));
  await dialog.getByRole("button", { name: "Poids cible", exact: true }).click();
  await expect(page.getByRole("tooltip")).toContainText("débit variable");
  await page.mouse.move(20, 20);
  const samples = await dialog.evaluateHandle((element) => {
    const values: { kind: string; bytes: number }[] = [];
    const observer = new MutationObserver(() => {
      const size = element.querySelector<HTMLElement>(".export-file-size");
      if (size)
        values.push({ kind: size.dataset.sizeKind!, bytes: Number(size.dataset.sizeBytes) });
    });
    observer.observe(element, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-size-kind", "data-size-bytes"],
    });
    return { values, stop: () => observer.disconnect() };
  });
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Exporter la vidéo", exact: true }).click();
  const delivery = await download;
  const file = `${folder}/angel.mp4`;
  await delivery.saveAs(file);
  const actual = (await readFile(file)).byteLength;
  await expect(size).toHaveAttribute("data-size-kind", "measured");
  await expect(size).toHaveAttribute("data-size-bytes", String(actual));
  await expect(size).not.toContainText("≈");
  const observed = await samples.evaluate(({ values, stop }) => {
    stop();
    return values;
  });
  await samples.dispose();
  const projected = observed.filter((sample) => sample.kind === "projected");
  expect(projected.length).toBeGreaterThan(0);
  expect(Math.abs(projected.at(-1)!.bytes - actual)).toBeLessThan(Math.abs(initial - actual));
  const metadata = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration,size:stream=codec_name,width,height,nb_frames",
        "-of",
        "json",
        file,
      ],
      { encoding: "utf8" },
    ),
  );
  expect(Number(metadata.format.size)).toBe(actual);
  expect(Number(metadata.format.duration)).toBeCloseTo(12.8, 2);
  expect(metadata.streams[0]).toMatchObject({ codec_name: "h264", width: 1080, height: 1920 });
  await dialog.screenshot({ path: `${folder}/motion-desktop.png` });
  await dialog.getByRole("combobox", { name: "Résolution", exact: true }).click();
  await page.getByRole("option", { name: "2×", exact: true }).click();
  await expect(size).toHaveAttribute("data-size-kind", "target");
  await dialog.getByRole("combobox", { name: "Résolution", exact: true }).click();
  await page.getByRole("option", { name: "1×", exact: true }).click();
  await expect(size).toHaveAttribute("data-size-kind", "measured");
  await dialog
    .locator(".export-footer-actions")
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  await expect(size).toHaveAttribute("data-size-bytes", String(actual));
  await expect(dialog.getByRole("progressbar")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  const footer = await dialog.locator(".export-dialog-footer").boundingBox();
  const button = await dialog
    .getByRole("button", { name: "Exporter la vidéo", exact: true })
    .boundingBox();
  expect(button!.x).toBeGreaterThanOrEqual(0);
  expect(button!.x + button!.width).toBeLessThanOrEqual(390);
  expect(button!.y + button!.height).toBeLessThanOrEqual(footer!.y + footer!.height);
  await dialog.screenshot({ path: `${folder}/motion-mobile.png` });
  const reads = await page.evaluate(() => window.__musartVideoReadbacks);
  expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
  expect(errors).toEqual([]);
  await writeFile(
    `${folder}/native-size.json`,
    JSON.stringify({ initial, actual, observed, metadata, reads }, null, 2),
  );
});

test("image and quality-based timelapse share contextual sizes and a stable mobile footer", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "fr");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => !!window.musart);
  const project = createProject({
    pages: [
      createPage({
        width: 320,
        height: 180,
        layers: [createLayer("rectangle", { id: "art", width: 80, height: 80, fill: "#8956ff" })],
      }),
    ],
  });
  await page.evaluate(async (project) => {
    window.musart!.load(project);
    window.musart!.execute({ type: "updateLayers", ids: ["art"], patch: { x: 20 } });
    await window.musart!.flush();
    window.musart!.execute({ type: "updateLayers", ids: ["art"], patch: { x: 160 } });
    await window.musart!.flush();
  }, project);
  await page.getByRole("button", { name: "Exporter", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Exporter la composition", exact: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.evaluate(async (element) => {
    await Promise.allSettled(element.getAnimations().map((animation) => animation.finished));
  });
  const size = dialog.locator(".export-file-size");
  await expect(size).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Export en arrière-plan" })).toHaveCount(0);
  const initial = await dialog.locator(".export-dialog-footer").boundingBox();
  const png = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Exporter l’image", exact: true }).click();
  await mkdir(folder, { recursive: true });
  await (await png).saveAs(`${folder}/image.png`);
  await expect(size).toHaveAttribute(
    "data-size-bytes",
    String((await readFile(`${folder}/image.png`)).byteLength),
  );
  await expect(size).toHaveAttribute("data-size-kind", "measured");
  expect(await dialog.locator(".export-dialog-footer").boundingBox()).toEqual(initial);
  await dialog.screenshot({ path: `${folder}/image-mobile.png` });
  await dialog.getByRole("radio", { name: "Timelapse", exact: true }).click();
  await expect(size).toHaveCount(0);
  await dialog.getByRole("spinbutton", { name: "Durée finale de la vidéo", exact: true }).fill("3");
  const button = dialog.getByRole("button", { name: "Exporter la vidéo", exact: true });
  await expect(button).toBeEnabled();
  const seen = await dialog.evaluateHandle((element) => {
    let projected = false;
    const observer = new MutationObserver(() => {
      projected ||= !!element.querySelector('[data-size-kind="projected"]');
    });
    observer.observe(element, { subtree: true, attributes: true });
    return {
      finish() {
        observer.disconnect();
        return projected;
      },
    };
  });
  const replay = page.waitForEvent("download");
  await button.click();
  await (await replay).saveAs(`${folder}/timelapse.mp4`);
  await expect(size).toHaveAttribute("data-size-kind", "measured");
  await expect(size).toHaveAttribute(
    "data-size-bytes",
    String((await readFile(`${folder}/timelapse.mp4`)).byteLength),
  );
  expect(await seen.evaluate((observer) => observer.finish())).toBe(true);
  await seen.dispose();
  expect(await dialog.locator(".export-dialog-footer").boundingBox()).toEqual(initial);
  await dialog.screenshot({ path: `${folder}/timelapse-mobile.png` });
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    gpu: 0,
    webgl: 0,
    canvas: 0,
    videoFrame: 0,
  });
});

test("preparation feedback fits shallow mobile previews without clipping the label", async ({
  page,
}) => {
  await page.setContent(`<style>:root { --background: white; --muted-foreground: #666; --brand-primary: #8956ff; --foreground: #111; } body { font-family: sans-serif; } #surface { position: relative; width: 340px; height: 76px; overflow: hidden; }</style>
    <div id="surface"><div class="export-preview-preparation" data-ready="false">
      <span class="ui-throbber" data-visible="true" data-active="true" data-variant="shimmer" style="--throbber-size: 56px">
        <span class="ui-throbber-mark"><svg width="56" height="56"><circle cx="28" cy="28" r="25" fill="#8956ff" /></svg></span>
        <span class="ui-throbber-label">Préparation de l’aperçu…</span>
      </span>
    </div></div>`);
  await page.addStyleTag({
    content: await readFile("apps/web/src/components/ui/throbber/throbber.css", "utf8"),
  });
  await page.addStyleTag({
    content: await readFile("apps/web/src/components/export/preview-preparation.css", "utf8"),
  });
  const surface = page.locator("#surface"),
    label = page.locator(".ui-throbber-label");
  for (const height of [76, 160]) {
    await surface.evaluate((element, height) => {
      element.style.height = `${height}px`;
    }, height);
    await expect(page.locator(".ui-throbber")).toHaveCSS(
      "flex-direction",
      height < 110 ? "row" : "column",
    );
    const bounds = await surface.boundingBox(),
      text = await label.boundingBox();
    expect(text!.y).toBeGreaterThanOrEqual(bounds!.y);
    expect(text!.y + text!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
  }
});
