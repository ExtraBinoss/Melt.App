import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { parseProject } from "../../packages/core/src/index";
import type {
  MotionTemplateManifest,
  MotionTemplateId,
} from "../../apps/web/src/services/projects/templates/motion/model";
import { isTemplateOriginalPath } from "../../apps/web/src/services/projects/templates/motion/paths";

import { MOTION_TEMPLATE_ASSET_REVISIONS } from "../../apps/web/src/services/projects/templates/motion/asset-revisions";

/** Immutable gallery cards use encoded native renders; the dialog/editor still use the live engine. */
export async function renderCardClip(id: string, url: string) {
  if (!Object.hasOwn(MOTION_TEMPLATE_ASSET_REVISIONS, id)) throw Error("Unknown Motion template.");
  const directory = resolve("apps/web/public/templates/motion", id);
  const manifestBytes = await readFile(resolve(directory, `${id}.json`));
  const manifest = JSON.parse(manifestBytes.toString()) as MotionTemplateManifest;
  if (manifest.version !== 1 || manifest.templateId !== id)
    throw Error("Invalid template manifest.");
  parseProject(JSON.stringify(manifest.project));
  for (const original of manifest.originals)
    if (!isTemplateOriginalPath(id, original.file)) throw Error("Unsafe original path.");
  const frames = resolve("artifacts/template-clips", id);
  await mkdir(frames, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_EXECUTABLE_PATH,
    args: [
      "--no-sandbox",
      "--enable-unsafe-webgpu",
      "--use-angle=vulkan",
      "--enable-features=Vulkan",
    ],
  });
  const fps = 25,
    edge = 480;
  try {
    const page = await browser.newPage();
    await page.exposeFunction("saveClipFrame", async (index: number, encoded: string) => {
      if (!Number.isInteger(index) || index < 0 || index >= 1500) throw Error("Invalid frame.");
      await writeFile(
        resolve(frames, `${String(index).padStart(5, "0")}.png`),
        Buffer.from(encoded, "base64"),
      );
    });
    const entry = new URL("/__template-card-renderer", url).href;
    await page.route(entry, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body></body></html>",
      }),
    );
    await page.goto(entry);
    await page.evaluate(
      async (input) => {
        const core = (await import(input.core)) as typeof import("../../packages/core/src/index");
        const renderer = (await import(
          input.render
        )) as typeof import("../../packages/render/src/index");
        const originals = new Map<string, Blob>();
        for (const original of input.manifest.originals) {
          const response = await fetch(new URL(`templates/motion/${original.file}`, input.url));
          if (!response.ok) throw Error(`Original HTTP ${response.status}`);
          const bytes = await response.arrayBuffer();
          const digest = Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
            (b) => b.toString(16).padStart(2, "0"),
          ).join("");
          if (
            bytes.byteLength !== original.byteLength ||
            `sha256:${digest}` !== original.contentRevision
          )
            throw Error("Original integrity mismatch.");
          originals.set(original.originalId, new Blob([bytes], { type: original.mime }));
        }
        const project = input.manifest.project,
          page = project.pages[0]!;
        const program = core.compileMotion(project, { compositionId: page.id });
        const count = Math.ceil(
          (page.motion!.duration.value / page.motion!.duration.rate) * input.fps,
        );
        if (count > 1500) throw Error("Card clips are limited to one minute.");
        const session = renderer.createRenderSession({ maxBytes: 128 * 1024 * 1024 });
        try {
          for (let index = 0; index < count; index++) {
            const frame = core.evaluateMotion(program, { value: index, rate: input.fps });
            await session.withCanvasFrame(
              core.applyMotionFrame(program, frame),
              project.assets,
              async (canvas) => {
                const blob = await new Promise<Blob>((resolve, reject) =>
                  canvas.toBlob(
                    (blob) => (blob ? resolve(blob) : reject(Error("Frame encoding failed."))),
                    "image/png",
                  ),
                );
                const encoded = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve((reader.result as string).split(",")[1]!);
                  reader.onerror = () => reject(reader.error);
                  reader.readAsDataURL(blob);
                });
                await (
                  window as unknown as { saveClipFrame(index: number, data: string): Promise<void> }
                ).saveClipFrame(index, encoded);
              },
              {
                scale: input.edge / Math.max(page.width, page.height),
                motionFrame: frame,
                mediaResolver: {
                  async resolveOriginal(asset) {
                    const blob = originals.get(asset.originalId);
                    if (!blob) throw Error("Missing original.");
                    return blob;
                  },
                },
              },
            );
          }
        } finally {
          await session.dispose();
          originals.clear();
        }
      },
      {
        manifest,
        fps,
        edge,
        url: new URL("/", url).href,
        core: new URL(`/@fs${resolve("packages/core/src/index.ts")}`, url).href,
        render: new URL(`/@fs${resolve("packages/render/src/index.ts")}`, url).href,
      },
    );
  } finally {
    await browser.close();
  }
  const output = resolve(directory, `${id}.card.mp4`);
  const encoder = Bun.spawn(
    [
      "ffmpeg",
      "-hide_banner",
      "-loglevel",
      "error",
      "-threads",
      "1",
      "-framerate",
      String(fps),
      "-i",
      resolve(frames, "%05d.png"),
      "-an",
      "-c:v",
      "libopenh264",
      "-threads",
      "1",
      "-profile:v",
      "high",
      "-b:v",
      "280k",
      "-maxrate",
      "330k",
      "-rc_mode",
      "bitrate",
      "-pix_fmt",
      "yuv420p",
      "-video_track_timescale",
      String(fps),
      "-g",
      String(fps),
      "-movflags",
      "+faststart",
      "-map_metadata",
      "-1",
      "-y",
      output,
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if ((await encoder.exited) !== 0) throw Error("Card clip encoding failed.");
  const bytes = await readFile(output);
  const provenance = {
    templateId: id,
    sourceRevision: MOTION_TEMPLATE_ASSET_REVISIONS[id as MotionTemplateId],
    manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.byteLength,
    fps,
    edge,
  };
  await writeFile(
    resolve(directory, `${id}.card.json`),
    JSON.stringify(provenance, null, 2) + "\n",
  );
  return provenance;
}

if (import.meta.main)
  console.log(
    await renderCardClip(Bun.argv[2] ?? "second-skin", Bun.argv[3] ?? "http://127.0.0.1:6100"),
  );
