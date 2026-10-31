import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Project } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";
const project = JSON.parse(
  readFileSync("apps/web/public/templates/motion/morphing-type.json", "utf8"),
).project as Project;

test("performance footer samples the actual Motion canvas, restores its pose and stops on outside dismissal", async ({
  page,
}) => {
  await installReadbackProbe(page);
  await page.addInitScript(() => {
    localStorage.setItem("musart.language", "en");
    localStorage.setItem("musart.onboarding.v1", JSON.stringify({ version: 1, completed: true }));
    const labels = new WeakMap<GPUBuffer, string>();
    const reads: string[] = [];
    const writes: boolean[] = [];
    (window as Window & { __profileTimestampWrites?: boolean[] }).__profileTimestampWrites = writes;
    (window as Window & { __profileBufferReads?: string[] }).__profileBufferReads = reads;
    if (typeof GPUDevice === "undefined") return;
    const begin = GPUCommandEncoder.prototype.beginRenderPass;
    GPUCommandEncoder.prototype.beginRenderPass = function (descriptor) {
      if (descriptor.timestampWrites)
        writes.push(
          document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
            .compositionProfiling === "true",
        );
      return begin.call(this, descriptor);
    };
    const create = GPUDevice.prototype.createBuffer;
    GPUDevice.prototype.createBuffer = function (descriptor) {
      const result = create.call(this, descriptor);
      labels.set(result, descriptor.label ?? "");
      return result;
    };
    const map = GPUBuffer.prototype.mapAsync;
    GPUBuffer.prototype.mapAsync = function (...args) {
      reads.push(labels.get(this) ?? "");
      return map.apply(this, args);
    };
  });
  await page.goto("/editor?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((data) => window.musart!.load(data), project);
  const canvas = page.locator(".editor-gpu-scene canvas");
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true");
  const footer = page.locator(
    `.artboard-performance-footer[data-artboard-id="${project.pages[0]!.id}"]`,
  );
  const mode = page.locator(`.artboard-mode-footer[data-artboard-id="${project.pages[0]!.id}"]`);
  const a = (await footer.boundingBox())!,
    b = (await mode.boundingBox())!;
  expect(Math.abs(a.y - b.y)).toBeLessThan(1);
  expect(Math.abs(a.height - b.height)).toBeLessThan(1);
  expect(a.x).toBeLessThan(b.x);
  const revision = await page.evaluate(() => window.musart!.snapshot().revision);
  const initialTime = await canvas.getAttribute("data-motion-time");
  const originalPixels = await canvas.screenshot();
  await footer.getByRole("button", { name: "Performance", exact: true }).click();
  const popup = page.locator(".composition-performance-popover");
  await expect(popup).toBeVisible();
  await expect(popup.getByText("12 samples", { exact: true })).toBeVisible({ timeout: 12000 });
  await expect(popup.getByRole("meter", { name: "CPU host elapsed", exact: true })).toBeVisible();
  await popup.getByRole("button", { name: "120 fps", exact: true }).click();
  await expect(popup.getByRole("meter", { name: "CPU host elapsed" })).toHaveAttribute(
    "aria-valuemax",
    String(1000 / 120),
  );
  await popup.getByRole("spinbutton", { name: "Target frame rate" }).fill("144");
  await expect(popup.getByRole("meter", { name: "CPU host elapsed" })).toHaveAttribute(
    "aria-valuemax",
    String(1000 / 144),
  );
  await page.screenshot({ path: "artifacts/composition-performance-popover.png" });
  await popup.getByRole("button", { name: /^GPU/ }).click();
  const drawCommands = popup.getByRole("term").filter({ hasText: "Draw commands" });
  await drawCommands.scrollIntoViewIfNeeded();
  await expect(drawCommands).toBeVisible();
  await expect(canvas).toHaveAttribute("data-composition-profiling", "false");
  await expect(canvas).toHaveAttribute("data-motion-time", initialTime!);
  expect(await page.evaluate(() => window.musart!.snapshot().revision)).toBe(revision);
  const reads = await page.evaluate(
    () => (window as Window & { __profileBufferReads?: string[] }).__profileBufferReads ?? [],
  );
  expect(reads.every((label) => label.startsWith("buffer_timestamp_result_"))).toBe(true);
  if (await popup.getByRole("meter", { name: "GPU timestamp duration" }).count()) {
    expect(reads.length).toBeGreaterThan(0);
    await expect(popup.getByRole("term").filter({ hasText: "GPU display" })).toBeVisible();
    await expect(popup.getByRole("term").filter({ hasText: "GPU morph" })).toBeVisible();
  }
  expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
    webgl: 0,
    canvas: 0,
  });
  await popup.getByRole("button", { name: "Measure again" }).click();
  await expect(canvas).toHaveAttribute("data-composition-profiling", "true");
  await page.mouse.click(30, 120);
  await expect(popup).toBeHidden();
  await expect(canvas).toHaveAttribute("data-composition-profiling", "false");
  await expect(canvas).toHaveAttribute("data-renderer-ready", "true");
  await expect(canvas).toHaveAttribute("data-motion-time", initialTime!);
  expect(await canvas.screenshot()).toEqual(originalPixels);
  expect(
    await page.evaluate(() =>
      (
        (window as Window & { __profileTimestampWrites?: boolean[] }).__profileTimestampWrites ?? []
      ).every(Boolean),
    ),
  ).toBe(true);
});
