import { readdir, readFile, writeFile, rename, mkdir, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Font, Face, UnicodeBuffer, shape, getGlyphPathWithVariation } from "text-shaper";
import type { PathCommand } from "text-shaper";
import { brand } from "../../apps/web/src/ui/brand/config";

/** UI title outlines only; never bundle or expose an editable font binary. */
const folder = new URL("../../apps/web/src/components/projects/landing/", import.meta.url);
const response = await fetch(brand.typeface.source);
if (!response.ok) throw Error(`Hero font source returned ${response.status}.`);
const bytes = await response.arrayBuffer();
const native = await Font.loadAsync(bytes);
const weights: Record<
  string,
  {
    glyphs: Record<string, PathCommand[]>;
    runs: Record<string, [number, number, number, number][] | null>;
  }
> = { 650: { glyphs: {}, runs: {} }, 700: { glyphs: {}, runs: {} } };
for (const file of await readdir(new URL("locales/", folder))) {
  if (!file.endsWith(".json")) continue;
  const copy = JSON.parse(await readFile(new URL(`locales/${file}`, folder), "utf8")) as {
    titleFirst: string;
    titleSecond: string;
    end: string;
  };
  for (const [weight, texts] of [
    [700, [copy.titleFirst, copy.titleSecond]],
    [650, [copy.end]],
  ] as const) {
    const variant = weights[weight]!;
    const face = new Face(native, { wght: weight });
    for (const text of texts) {
      if (Object.hasOwn(variant.runs, text)) continue;
      if (Array.from(text).some((char) => char.trim() && !native.glyphIdForChar(char))) {
        variant.runs[text] = null;
        continue;
      }
      const buffer = new UnicodeBuffer().addStr(text).setScript("Latn");
      let offset = 0;
      buffer.codepoints.forEach((point, index) => {
        buffer.clusters[index] = offset;
        offset += point > 0xffff ? 2 : 1;
      });
      const shaped = shape(face, buffer, { script: "latn", direction: "ltr" });
      const run: [number, number, number, number][] = [];
      try {
        for (let i = 0; i < shaped.length; i++) {
          const info = shaped.infos[i]!,
            position = shaped.positions[i]!;
          if (!text.slice(info.cluster, info.cluster + 1).trim()) continue;
          const path = getGlyphPathWithVariation(native, info.glyphId, face.normalizedCoords);
          if (!path?.commands.length) continue;
          variant.glyphs[info.glyphId] = path.commands;
          run.push([info.glyphId, info.cluster, position.xOffset, position.yOffset]);
        }
      } finally {
        shaped.reset();
      }
      variant.runs[text] = run;
    }
  }
}
const cache = {
  version: 1,
  source: brand.typeface.source,
  sha256: createHash("sha256").update(new Uint8Array(bytes)).digest("hex"),
  unitsPerEm: native.unitsPerEm,
};
const output = new URL("hero/font-curves/", folder);
await mkdir(output, { recursive: true });
const generated = new Set<string>();
let outputBytes = 0;
async function save(name: string, value: unknown) {
  const json = execFileSync(
    "bunx",
    ["--no-install", "oxfmt", "--stdin-filepath=font-curves.json"],
    {
      input: JSON.stringify(value),
      encoding: "utf8",
    },
  );
  if (json.split("\n").length > 600) throw Error(`Generated curve shard is too large: ${name}`);
  await writeFile(new URL(name + ".tmp", output), json);
  await rename(new URL(name + ".tmp", output), new URL(name, output));
  generated.add(name);
  outputBytes += json.length;
}
await save("manifest.json", cache);
for (const [weight, variant] of Object.entries(weights)) {
  await save(`runs-${weight}.json`, { weight: Number(weight), runs: variant.runs });
  const glyphs = Object.entries(variant.glyphs);
  for (let start = 0; start < glyphs.length; start += 10) {
    await save(`glyphs-${weight}-${start / 10}.json`, {
      weight: Number(weight),
      glyphs: Object.fromEntries(glyphs.slice(start, start + 10)),
    });
  }
}
for (const name of await readdir(output)) {
  if (/^(glyphs|runs)-[\d-]+\.json$/.test(name) && !generated.has(name))
    await unlink(new URL(name, output));
}
console.log(
  JSON.stringify({
    bytes: outputBytes,
    files: generated.size,
    glyphs: Object.values(weights).reduce((n, v) => n + Object.keys(v.glyphs).length, 0),
    runs: Object.values(weights).reduce((n, v) => n + Object.keys(v.runs).length, 0),
    sha256: cache.sha256,
  }),
);
