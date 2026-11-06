import { assertColor } from "../document/guards";
import { ensure } from "../errors";
import type { PaletteSwatch } from "./model";
type Lab = { l: number; a: number; b: number; alpha: string };
const linear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
function decode(value: string): Lab {
  const raw = value === "transparent" ? "00000000" : value.slice(1);
  const hex =
    raw.length < 5
      ? raw
          .split("")
          .map((item) => item + item)
          .join("")
      : raw;
  const [r, g, b] = [0, 2, 4].map((offset) =>
    linear(parseInt(hex.slice(offset, offset + 2), 16) / 255),
  ) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    alpha: hex.slice(6),
  };
}
function rgb({ l, a, b }: Lab): number[] {
  const x = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    y = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    z = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * x - 3.3077115913 * y + 0.2309699292 * z,
    -1.2684380046 * x + 2.6097574011 * y - 0.3413193965 * z,
    -0.0041960863 * x - 0.7034186147 * y + 1.707614701 * z,
  ];
}
function encode(lab: Lab): string {
  let channels = rgb(lab);
  // Reduce chroma instead of clipping channels: retain perceptual lightness and hue.
  for (let step = 0; step < 40 && channels.some((channel) => channel < 0 || channel > 1); step++) {
    lab = { ...lab, a: lab.a * 0.9, b: lab.b * 0.9 };
    channels = rgb(lab);
  }
  return `#${channels
    .map((channel) => {
      const value = Math.max(0, Math.min(1, channel));
      return Math.round(
        255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055),
      )
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}${lab.alpha}`;
}
/** One shared hue rotation preserves harmony and perceptual lightness ordering. */
export function varyPalette(colors: readonly PaletteSwatch[], random: number): PaletteSwatch[] {
  ensure(Number.isFinite(random), "INVALID_COMMAND", "Invalid variation seed");
  for (const color of colors) assertColor(color.value);
  const angle = (0.15 + Math.max(0, Math.min(1, random)) * 0.7) * Math.PI * 2;
  return colors.map((color) => {
    if (color.locked) return { ...color };
    const lab = decode(color.value),
      chroma = Math.hypot(lab.a, lab.b);
    if (chroma < 0.015) return { ...color }; // Keep neutral anchors and their contrast.
    return {
      ...color,
      value: encode({
        ...lab,
        a: lab.a * Math.cos(angle) - lab.b * Math.sin(angle),
        b: lab.a * Math.sin(angle) + lab.b * Math.cos(angle),
      }),
    };
  });
}
