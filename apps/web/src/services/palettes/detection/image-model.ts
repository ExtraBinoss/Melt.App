import type { WeightedColor } from "./colors";
export const PALETTE_SAMPLE_SIDE = 64;
export const MAX_PALETTE_SOURCE_PIXELS = 40_000_000;
export const MAX_PALETTE_SOURCE_LENGTH = 24_000_000;
export interface PaletteImageRequest {
  id: number;
  source: string;
  width: number;
  height: number;
}
export interface PaletteImageResponse {
  id: number;
  colors?: WeightedColor[];
  error?: string;
  unsupported?: boolean;
}
