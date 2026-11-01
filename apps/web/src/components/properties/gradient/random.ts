import type { FillGradient } from "@musart/core";
/** Generate independent paint parameters within the portable two-to-eight-stop contract. */
export function randomGradient(random = Math.random): FillGradient {
  const count = 2 + Math.floor(random() * 7);
  const kind = random() < 0.5 ? "linear" : "radial";
  const angle = Math.floor(random() * 360);
  const offsets = [
    0,
    ...Array.from({ length: count - 2 }, () => random()).sort((a, b) => a - b),
    1,
  ];
  return {
    kind,
    angle,
    stops: offsets.map((offset) => ({
      offset,
      color:
        "#" +
        Array.from({ length: 4 }, () =>
          Math.floor(random() * 256)
            .toString(16)
            .padStart(2, "0"),
        ).join(""),
    })),
  };
}
