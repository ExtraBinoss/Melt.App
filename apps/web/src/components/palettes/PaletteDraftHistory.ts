import type { PaletteSwatch } from "@musart/core";

/** Keep the original draft separately so a bounded history can always restore it. */
export type PaletteDraftHistory = {
  base: PaletteSwatch[];
  generations: PaletteSwatch[][];
  index: number;
};
export const PALETTE_HISTORY_LIMIT = 50;
export function createPaletteHistory(base: PaletteSwatch[]): PaletteDraftHistory {
  return { base, generations: [], index: -1 };
}
export function appendPaletteGeneration(
  history: PaletteDraftHistory,
  colors: PaletteSwatch[],
): PaletteDraftHistory {
  const generations = [...history.generations.slice(0, history.index + 1), colors].slice(
    -PALETTE_HISTORY_LIMIT,
  );
  return { ...history, generations, index: generations.length - 1 };
}
export function movePaletteHistory(
  history: PaletteDraftHistory,
  direction: -1 | 1,
): PaletteDraftHistory {
  return {
    ...history,
    index: Math.max(-1, Math.min(history.generations.length - 1, history.index + direction)),
  };
}
