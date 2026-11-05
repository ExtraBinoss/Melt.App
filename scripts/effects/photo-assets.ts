/** Bake-time originals only. Catalog browsing fetches the completed atlas, never these files. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { EffectPreviewSource } from "../../packages/core/src/index";

export const PHOTO_SOURCES = [
  "editorial-portrait",
  "alpine-lake",
  "studio-still-life",
  "neon-city",
] as const satisfies readonly EffectPreviewSource[];
export interface CatalogOriginal {
  id: string;
  file: string;
  mime: "image/webp" | "image/png";
  dataUrl: string;
  sha256: string;
  bytes: number;
}
async function original(
  id: string,
  file: string,
  mime: CatalogOriginal["mime"],
): Promise<CatalogOriginal> {
  const bytes = await readFile(file);
  if (!bytes.length || bytes.length > 4 * 1024 * 1024)
    throw new Error(`Catalog original must be nonempty and <= 4 MiB: ${file}`);
  return {
    id,
    file,
    mime,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
  };
}
export async function loadCatalogOriginals(): Promise<CatalogOriginal[]> {
  // Read before opening Chrome so missing originals do not allocate a renderer.
  return Promise.all([
    ...PHOTO_SOURCES.map((id) =>
      original(`catalog-${id}`, `apps/web/public/effects/sources/${id}.webp`, "image/webp"),
    ),
    original("catalog-displacement", "apps/web/public/textures/normal.png", "image/png"),
  ]);
}
export function catalogAttribution(
  file: string,
  count: number,
  originals: readonly Omit<CatalogOriginal, "dataUrl">[],
): string {
  return `# Effect catalog previews\n\n\`${file}\` contains ${count} static 240 × 180 thumbnails baked with Melt's production Three.js TSL renderer. Classic and Studio load this atlas; browsing never creates an effect renderer or reads source photographs.\n\nRegenerate with the development server running:\n\n\`\`\`sh\nbun scripts/effects/render-catalog.ts\n\`\`\`\n\nThe four photographic originals in [sources/](sources/) were generated specifically for Melt; [generation prompts and provider records](sources/GENERATION.json) and the [source manifest](sources/manifest.json) are bundled alongside them. No external photographer or stock service supplied these originals. The SDK's typed \`preview\` declarations select the photograph, native scene and representative effect values. Each active effect, including adjustments and geometry morph, is baked once. Depth of Field uses real native depth; Trail samples sparse authored Motion poses. Unsupported or failed scenes stop publication and retain the previous atlas.\n\nThe Displace input is the bundled Poly Haven **Grey Plaster** CC0-1.0 normal map; see [texture licenses](../textures/LICENSE.md). Source dimensions, hashes, exact authored documents, native frame statistics and zero-production-readback results are recorded in the atlas metadata and ignored \`artifacts/effect-catalog/atlas-report.json\`. \`EFFECT_PREVIEW_URL\` and \`CHROME_PATH\` select a local server and Chrome installation. One bounded render session processes scenes serially and is disposed after baking.\n\n| Original | SHA-256 | Bytes |\n| --- | --- | ---: |\n${originals.map((source) => `| \`${source.file}\` | \`${source.sha256}\` | ${source.bytes} |`).join("\n")}\n`;
}
