import type { Font, PathCommand } from "text-shaper";
import { brand } from "../../../../ui/brand/config";
import manifest from "./font-curves/manifest.json";

export interface HeroGlyphOutline {
  cluster: number;
  xOffset: number;
  yOffset: number;
  commands: PathCommand[];
}
interface FontCurves {
  version: number;
  source: string;
  unitsPerEm: number;
  weights: Record<
    string,
    {
      glyphs: Record<string, PathCommand[]>;
      runs: Record<string, [number, number, number, number][] | null>;
    }
  >;
}
const cache: FontCurves = { ...manifest, weights: {} };
interface CurveShard {
  weight: number;
  glyphs?: Record<string, PathCommand[]>;
  runs?: Record<string, [number, number, number, number][] | null>;
}
const shards = import.meta.glob<CurveShard>(
  ["./font-curves/glyphs-*.json", "./font-curves/runs-*.json"],
  { eager: true, import: "default" },
);
for (const shard of Object.values(shards)) {
  const variant = (cache.weights[String(shard.weight)] ??= { glyphs: {}, runs: {} });
  Object.assign(variant.glyphs, shard.glyphs);
  Object.assign(variant.runs, shard.runs);
}
let font: Promise<Font> | undefined;

/** Cached UI graphics bypass the full font parser; arbitrary text keeps the generic path. */
export async function loadHeroOutlines(texts: string[], weight: number, signal: AbortSignal) {
  signal.throwIfAborted();
  const variant =
    cache.source === brand.typeface.source ? cache.weights[String(weight)] : undefined;
  if (variant && texts.every((text) => Object.hasOwn(variant.runs, text))) {
    if (texts.some((text) => variant.runs[text] === null)) return;
    return {
      unitsPerEm: cache.unitsPerEm,
      runs: texts.map((text) =>
        variant.runs[text]!.map(([glyph, cluster, xOffset, yOffset]) => ({
          cluster,
          xOffset,
          yOffset,
          commands: variant.glyphs[glyph]!,
        })),
      ),
    };
  }
  const api = await import("text-shaper");
  font ??= fetch(brand.typeface.source)
    .then(async (response) => {
      if (!response.ok) throw Error(`Hero font could not be loaded (${response.status}).`);
      return api.Font.loadAsync(await response.arrayBuffer());
    })
    .catch((error: unknown) => {
      font = undefined;
      throw error;
    });
  const native = await font;
  signal.throwIfAborted();
  if (
    texts.some((text) =>
      Array.from(text).some((char) => char.trim() && !native.glyphIdForChar(char)),
    )
  )
    return;
  const face = new api.Face(native, { wght: weight });
  const runs = texts.map((text) => {
    const buffer = new api.UnicodeBuffer().addStr(text).setScript("Latn");
    let offset = 0;
    buffer.codepoints.forEach((point, index) => {
      buffer.clusters[index] = offset;
      offset += point > 0xffff ? 2 : 1;
    });
    const shaped = api.shape(face, buffer, { script: "latn", direction: "ltr" });
    const run: HeroGlyphOutline[] = [];
    try {
      for (let i = 0; i < shaped.length; i++) {
        const info = shaped.infos[i]!,
          position = shaped.positions[i]!;
        if (!text.slice(info.cluster, info.cluster + 1).trim()) continue;
        const path = api.getGlyphPathWithVariation(native, info.glyphId, face.normalizedCoords);
        if (path?.commands.length)
          run.push({
            cluster: info.cluster,
            xOffset: position.xOffset,
            yOffset: position.yOffset,
            commands: path.commands,
          });
      }
    } finally {
      shaped.reset();
    }
    return run;
  });
  return { unitsPerEm: native.unitsPerEm, runs };
}
