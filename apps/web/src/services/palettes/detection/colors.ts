import type { PaletteSwatch } from "@musart/core";

export interface WeightedColor {
  value: string;
  weight: number;
}

/** Portable colors use hexadecimal RGB(A); canonical identities survive reordering. */
export function normalizePaletteColor(value: string): string | undefined {
  let hex = value.toLowerCase();
  if (hex === "transparent") return;
  if (!/^#[\da-f]{3,4}$|^#[\da-f]{6}([\da-f]{2})?$/.test(hex)) return;
  hex = hex.slice(1);
  if (hex.length <= 4)
    hex = hex
      .split("")
      .map((digit) => digit + digit)
      .join("");
  if (hex.length === 8 && hex.endsWith("00")) return;
  if (hex.length === 8 && hex.endsWith("ff")) hex = hex.slice(0, 6);
  return `#${hex}`;
}

export function paletteColorAlpha(value: string): number {
  return value.length === 9 ? parseInt(value.slice(7), 16) / 255 : 1;
}

export function detectedSwatches(colors: readonly WeightedColor[], limit = 12): PaletteSwatch[] {
  const weights = new Map<string, number>();
  for (const color of colors) {
    const value = normalizePaletteColor(color.value);
    if (value && Number.isFinite(color.weight) && color.weight > 0)
      weights.set(value, (weights.get(value) ?? 0) + color.weight);
  }
  return [...weights]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value]) => ({ id: `detected-${value.slice(1)}`, name: value, value }));
}

/** A small native-source histogram, weighted by alpha, never compositor pixels.
 * RGB is quantized to 5 bits; output uses each bin's weighted mean, preserving alpha.
 */
export function sampleSourceColors(pixels: Uint8ClampedArray): WeightedColor[] {
  const bins = new Map<
    number,
    { weight: number; red: number; green: number; blue: number; alpha: number }
  >();
  const count = Math.floor(pixels.length / 4);
  for (let at = 0; at < count * 4; at += 4) {
    const red = pixels[at]!,
      green = pixels[at + 1]!,
      blue = pixels[at + 2]!,
      alpha = pixels[at + 3]!;
    if (!alpha) continue;
    const key = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3);
    const bin = bins.get(key) ?? { weight: 0, red: 0, green: 0, blue: 0, alpha: 0 };
    const weight = alpha / 255;
    bin.weight += weight;
    bin.red += red * weight;
    bin.green += green * weight;
    bin.blue += blue * weight;
    bin.alpha += alpha * weight;
    bins.set(key, bin);
  }
  return [...bins.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 12)
    .map((bin) => ({
      value:
        "#" +
        [bin.red, bin.green, bin.blue, bin.alpha]
          .map((channel) =>
            Math.round(channel / bin.weight)
              .toString(16)
              .padStart(2, "0"),
          )
          .join(""),
      weight: bin.weight / count,
    }));
}
