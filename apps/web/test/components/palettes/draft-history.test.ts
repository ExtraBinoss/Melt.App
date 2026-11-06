import { expect, it } from "vitest";
import {
  appendPaletteGeneration,
  createPaletteHistory,
  movePaletteHistory,
  PALETTE_HISTORY_LIMIT,
} from "../../../src/components/palettes/PaletteDraftHistory";

it("bounds generated swatches while retaining the original draft and cuts abandoned futures", () => {
  const base = [{ id: "brand", name: "Brand", value: "#5130a8" }];
  let history = createPaletteHistory(base);
  for (let i = 0; i < PALETTE_HISTORY_LIMIT + 10; i++)
    history = appendPaletteGeneration(history, [
      { ...base[0]!, value: `#${i.toString(16).padStart(6, "0")}` },
    ]);
  expect(history.generations).toHaveLength(PALETTE_HISTORY_LIMIT);
  expect(history.base).toBe(base);
  for (let i = 0; i < PALETTE_HISTORY_LIMIT + 10; i++) history = movePaletteHistory(history, -1);
  expect(history.index).toBe(-1);
  history = movePaletteHistory(history, 1);
  expect(history.index).toBe(0);
  history = appendPaletteGeneration(history, base);
  expect(history.generations).toHaveLength(2);
  expect(history.index).toBe(1);
  expect(movePaletteHistory(history, 1).index).toBe(1);
});
