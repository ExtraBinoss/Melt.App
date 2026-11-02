import type { Font, PathCommand } from "text-shaper";
import { brand } from "../../../../ui/brand/config";

export interface GlyphGeometry {
  d: string;
  points: { x: number; y: number }[];
  x: number;
  y: number;
  width: number;
  height: number;
  tone?: number;
}
let font: Promise<Font> | undefined;

/** Reuse the exact display font, including its real Bézier endpoints and shaping. */
export async function prepareHeroGlyphs(
  stage: HTMLElement,
  heading: HTMLElement,
  signal: AbortSignal,
): Promise<GlyphGeometry[] | undefined> {
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
  await document.fonts.ready;
  signal.throwIfAborted();
  const chunks = [...heading.querySelectorAll<HTMLElement>(".hero-chunk")];
  if (
    chunks.some((chunk) =>
      Array.from(chunk.textContent ?? "").some(
        (char) => char.trim() && !native.glyphIdForChar(char),
      ),
    )
  )
    return;
  const style = getComputedStyle(heading);
  const size = parseFloat(style.fontSize);
  const scale = size / native.unitsPerEm;
  const face = new api.Face(native, { wght: Number(style.fontWeight) });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  context.font = `${style.fontWeight} ${size}px "${brand.typeface.family}"`;
  const ascent = context.measureText("Hg").fontBoundingBoxAscent;
  const bounds = stage.getBoundingClientRect();
  const glyphs: GlyphGeometry[] = [];
  for (const [tone, chunk] of chunks.entries()) {
    const node = chunk.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) continue;
    const text = node.textContent ?? "";
    const buffer = new api.UnicodeBuffer().addStr(text).setScript("Latn");
    let offset = 0;
    buffer.codepoints.forEach((point, index) => {
      buffer.clusters[index] = offset;
      offset += point > 0xffff ? 2 : 1;
    });
    const shaped = api.shape(face, buffer, { script: "latn", direction: "ltr" });
    try {
      for (let i = 0; i < shaped.length && glyphs.length < 160; i++) {
        const info = shaped.infos[i]!;
        const position = shaped.positions[i]!;
        if (!text.slice(info.cluster, info.cluster + 1).trim()) continue;
        const path = api.getGlyphPathWithVariation(native, info.glyphId, face.normalizedCoords);
        if (!path?.commands.length) continue;
        const range = document.createRange();
        range.setStart(node, info.cluster);
        range.setEnd(
          node,
          Math.min(text.length, info.cluster + (text.codePointAt(info.cluster)! > 0xffff ? 2 : 1)),
        );
        const rect = range.getBoundingClientRect();
        const x = rect.left - bounds.left + position.xOffset * scale;
        const y = rect.top - bounds.top + ascent - position.yOffset * scale;
        const commands = path.commands.map((command): PathCommand => {
          if (command.type === "Z") return command;
          const end = { x: x + command.x * scale, y: y - command.y * scale };
          if (command.type === "Q")
            return { type: "Q", ...end, x1: x + command.x1 * scale, y1: y - command.y1 * scale };
          if (command.type === "C")
            return {
              type: "C",
              ...end,
              x1: x + command.x1 * scale,
              y1: y - command.y1 * scale,
              x2: x + command.x2 * scale,
              y2: y - command.y2 * scale,
            };
          return { type: command.type, ...end };
        });
        const d = commands.map(serialize).join("");
        const outline = new Path2D(d);
        // Variable fonts can retain overlapping contours inside the filled glyph.
        // Probe vector geometry so only visible boundary endpoints receive dots.
        const ends = commands
          .filter((command) => command.type !== "Z")
          .filter((command) => onBoundary(context, outline, command.x, command.y));
        const stride = Math.max(1, Math.ceil(ends.length / 16));
        glyphs.push({
          d,
          points: ends.filter((_, index) => index % stride === 0).map(({ x, y }) => ({ x, y })),
          x: rect.left - bounds.left,
          y: rect.top - bounds.top,
          width: rect.width,
          height: rect.height,
          tone: tone % 3,
        });
      }
    } finally {
      shaped.reset();
    }
  }
  return glyphs.length ? glyphs : undefined;
}
function onBoundary(
  context: CanvasRenderingContext2D,
  outline: Path2D,
  x: number,
  y: number,
): boolean {
  let inside = false;
  let outside = false;
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const filled = context.isPointInPath(
      outline,
      x + Math.cos(angle) * 0.75,
      y + Math.sin(angle) * 0.75,
    );
    inside ||= filled;
    outside ||= !filled;
    if (inside && outside) return true;
  }
  return false;
}
function serialize(command: PathCommand): string {
  const n = (value: number) => Number(value.toFixed(3));
  if (command.type === "Z") return "Z";
  if (command.type === "Q")
    return `Q${n(command.x1)} ${n(command.y1)} ${n(command.x)} ${n(command.y)}`;
  if (command.type === "C")
    return `C${n(command.x1)} ${n(command.y1)} ${n(command.x2)} ${n(command.y2)} ${n(command.x)} ${n(command.y)}`;
  return `${command.type}${n(command.x)} ${n(command.y)}`;
}
