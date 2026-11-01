import type { SpatialBounds, SpatialEntry } from "../src";
export type Distribution = "grid" | "clustered" | "overlap";
export function fixture(size: number, distribution: Distribution): SpatialEntry[] {
  let seed = 1729;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const side = Math.ceil(Math.sqrt(size));
  return Array.from({ length: size }, (_, at) => {
    const cluster = at % 5;
    return {
      id: `${at}`,
      x:
        distribution === "overlap"
          ? 0
          : distribution === "grid"
            ? (at % side) * 20
            : cluster * 100 + random() * 35,
      y:
        distribution === "overlap"
          ? 0
          : distribution === "grid"
            ? Math.floor(at / side) * 20
            : cluster * 100 + random() * 35,
      width: distribution === "overlap" ? 1000 : 8,
      height: distribution === "overlap" ? 1000 : 8,
    };
  });
}
export function queries(
  entries: readonly SpatialEntry[],
  kind: "point" | "tiny" | "marquee",
): SpatialBounds[] {
  return Array.from({ length: 128 }, (_, at) => {
    const source = entries[(at * 67) % entries.length]!;
    const width = kind === "point" ? 0 : kind === "tiny" ? 0.01 : 100;
    // Half hits, half gaps/offscene misses. Full overlap remains genuinely worst-case.
    return { x: source.x + (at % 2 ? 12 : 4), y: source.y + 4, width, height: width };
  });
}
export function linear(entries: readonly SpatialEntry[], b: SpatialBounds): string[] {
  return entries
    .filter(
      (e) =>
        e.x <= b.x + b.width &&
        e.y <= b.y + b.height &&
        e.x + e.width >= b.x &&
        e.y + e.height >= b.y,
    )
    .map((e) => e.id);
}
