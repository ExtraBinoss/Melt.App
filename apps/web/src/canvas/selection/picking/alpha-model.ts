export interface AlphaRequest {
  id: number;
  source: string;
  width: number;
  height: number;
}
export interface AlphaResponse {
  id: number;
  width: number;
  height: number;
  alpha?: Uint8Array;
  error?: string;
}
export const MAX_ALPHA_PIXELS = 16_777_216;
export const ALPHA_CACHE_BYTES = 33_554_432;
