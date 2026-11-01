import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const sources = {
  "feature-timelapse": "Composition 1-timelapse (1).mp4",
  "morphing-type": "MeltLandingPageMaskotANim.webm",
  "bloom-windows": "Bloom Windows_LandingPage.webm",
  "cornell-box": "Cornell Box_LandingPage.webm",
  "angel-windows": "Angel.exe_LandingPage.webm",
  "terminal-signal": "Terminal Signal_LandingPage.webm",
  "second-skin": "Second Skin_LandingPage.webm",
  "share-your-work": "Too Hot to Haunt_LandingPage.webm",
};
const posterTimes: Record<string, number> = { "feature-timelapse": 4.5 };
const posterQualities: Record<string, number> = { "feature-timelapse": 68 };
const input = process.argv[2];
if (!input) throw Error("Usage: bun scripts/landing-media/encode.ts <source-folder>");
const root = resolve(import.meta.dir, "../..");
const digest = async (file: string) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
interface Clip {
  video: string;
  poster: string;
  width: number;
  height: number;
  duration: number;
  bytes: number;
  source: string;
  sourceSha256: string;
  sha256: string;
  posterSha256: string;
  posterTime?: number;
}
const imagesOnly = process.argv.includes("--images-only");
const manifest: Record<string, Clip> = imagesOnly
  ? (JSON.parse(await readFile(resolve(root, "docs/media/landing-videos.json"), "utf8")) as Record<
      string,
      Clip
    >)
  : {};
for (const [id, filename] of Object.entries(imagesOnly ? {} : sources)) {
  const original = resolve(input, filename);
  const folder = resolve(root, "apps/web/public/videos/landing", id);
  await mkdir(folder, { recursive: true });
  const video = resolve(folder, "preview.webm"),
    poster = resolve(folder, "poster.webp");
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-threads",
      "2",
      "-i",
      original,
      "-map",
      "0:v:0",
      "-an",
      "-vf",
      "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30",
      "-c:v",
      "libvpx-vp9",
      "-crf",
      "38",
      "-b:v",
      "650k",
      "-maxrate",
      "900k",
      "-bufsize",
      "1800k",
      "-cpu-used",
      "6",
      "-row-mt",
      "1",
      "-threads",
      "2",
      "-g",
      "60",
      "-pix_fmt",
      "yuv420p",
      video,
    ],
    { stdio: "inherit" },
  );
  execFileSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-threads",
      "1",
      "-ss",
      String(posterTimes[id] ?? 0),
      "-i",
      video,
      "-frames:v",
      "1",
      "-vf",
      "scale=512:512:force_original_aspect_ratio=decrease",
      "-c:v",
      "libwebp",
      "-quality",
      String(posterQualities[id] ?? 84),
      "-threads",
      "1",
      poster,
    ],
    { stdio: "inherit" },
  );
  const hash = await digest(video),
    posterHash = await digest(poster);
  const videoName = `preview-${hash.slice(0, 12)}.webm`;
  const posterName = `poster-${posterHash.slice(0, 12)}.webp`;
  await rename(video, resolve(folder, videoName));
  await rename(poster, resolve(folder, posterName));
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration,size:stream=width,height",
        "-of",
        "json",
        resolve(folder, videoName),
      ],
      { encoding: "utf8" },
    ),
  ) as { streams: { width: number; height: number }[]; format: { duration: string; size: string } };
  manifest[id] = {
    video: `videos/landing/${id}/${videoName}`,
    poster: `videos/landing/${id}/${posterName}`,
    ...probe.streams[0]!,
    duration: Number(probe.format.duration),
    bytes: Number(probe.format.size),
    source: filename,
    sourceSha256: await digest(original),
    sha256: hash,
    posterSha256: posterHash,
    ...(posterTimes[id] !== undefined ? { posterTime: posterTimes[id] } : {}),
  };
  for (const name of await readdir(folder)) {
    if (/^(preview|poster)/.test(name) && name !== videoName && name !== posterName)
      await unlink(resolve(folder, name));
  }
  console.log(id, probe.format.size, "bytes");
}
await mkdir(resolve(root, "docs/media"), { recursive: true });
await writeFile(
  resolve(root, "docs/media/landing-videos.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
const runtime = Object.fromEntries(
  Object.entries(manifest).map(([id, clip]) => [
    id,
    {
      video: clip.video,
      poster: clip.poster,
      width: clip.width,
      height: clip.height,
    },
  ]),
);
const destination = resolve(root, "apps/web/src/components/projects/landing/media/manifest.json");
await writeFile(destination + ".pending", JSON.stringify(runtime, null, 2) + "\n");
await rename(destination + ".pending", destination);

// Native preparation preserves the source ICC profile; the browser receives one static WebP.
const imageSource = resolve(input, "LotsOfEffects.webp");
const imagePath = "apps/web/src/components/projects/landing/features/assets/effects.webp";
const imageTarget = resolve(root, imagePath);
await mkdir(resolve(root, "apps/web/src/components/projects/landing/features/assets"), {
  recursive: true,
});
execFileSync(
  "python3",
  [
    "-c",
    `from PIL import Image
import sys
with Image.open(sys.argv[1]) as original:
 profile = original.info.get("icc_profile", b"")
 image = original.resize((960, 540), Image.Resampling.LANCZOS)
 image.save(sys.argv[2], format="WEBP", quality=78, method=6, icc_profile=profile)
`,
    imageSource,
    imageTarget,
  ],
  { stdio: "inherit" },
);
await writeFile(
  resolve(root, "docs/media/landing-effects-image.json"),
  JSON.stringify(
    {
      source: "LotsOfEffects.webp",
      sourceSha256: await digest(imageSource),
      path: imagePath,
      sha256: await digest(imageTarget),
      width: 960,
      height: 540,
      bytes: (await readFile(imageTarget)).byteLength,
      iccPreserved: true,
    },
    null,
    2,
  ) + "\n",
);
