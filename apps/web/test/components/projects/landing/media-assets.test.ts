import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import effects from "../../../../../../docs/media/landing-effects-image.json";
import manifest from "../../../../../../docs/media/landing-videos.json";
import { LANDING_TEMPLATES } from "../../../../src/components/projects/landing/catalog";

test("every supplied clip has intact content-addressed media and the timelapse stays outside templates", async () => {
  expect(LANDING_TEMPLATES.map((template) => template.id)).toEqual([
    "morphing-type",
    "bloom-windows",
    "cornell-box",
    "angel-windows",
    "terminal-signal",
    "second-skin",
    "share-your-work",
  ]);
  expect(Object.keys(manifest)).toHaveLength(8);
  for (const item of Object.values(manifest)) {
    const video = await readFile(resolve("apps/web/public", item.video));
    const poster = await readFile(resolve("apps/web/public", item.poster));
    expect(createHash("sha256").update(video).digest("hex")).toBe(item.sha256);
    expect(createHash("sha256").update(poster).digest("hex")).toBe(item.posterSha256);
    expect(item.video).toContain(item.sha256.slice(0, 12));
    expect(video.byteLength).toBe(item.bytes);
    expect(video.byteLength).toBeLessThan((item.duration * 900000) / 8 + 100000);
    expect(poster.byteLength).toBeLessThan(50000);
    expect(item.width).toBeLessThanOrEqual(1280);
    expect(item.height).toBeLessThanOrEqual(720);
    expect(item.duration).toBeGreaterThan(0);
  }
  const effectsImage = await readFile(effects.path);
  expect(createHash("sha256").update(effectsImage).digest("hex")).toBe(effects.sha256);
  expect(effectsImage.byteLength).toBeLessThan(100000);
  expect(LANDING_TEMPLATES.some((template) => template.id === "feature-timelapse")).toBe(false);
});
