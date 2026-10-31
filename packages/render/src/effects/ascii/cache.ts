import { ASCII_DEFAULT_CHARACTERS } from "@musart/core";
import type { CanvasTexture } from "three/webgpu";
import { createGlyphAtlas } from "./atlas";
const bytes = (characters: string) => Array.from(characters).length * 16 * 16 * 4;
/** Small immutable uploads, shared by passes; no rasterized effect result or idle work. */
export class GlyphAtlasCache {
  private readonly entries = new Map<string, CanvasTexture>();
  constructor(private readonly capacity = 8) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 8)
      throw new Error("Invalid glyph cache capacity.");
  }
  get(characters = ASCII_DEFAULT_CHARACTERS): CanvasTexture {
    if (!characters.length || characters.length > 64)
      throw new Error("ASCII requires 1–64 characters.");
    const known = this.entries.get(characters);
    if (known) {
      this.entries.delete(characters);
      this.entries.set(characters, known);
      return known;
    }
    if (this.entries.size >= this.capacity) {
      const key = this.entries.keys().next().value!;
      this.entries.get(key)!.dispose();
      this.entries.delete(key);
    }
    const texture = createGlyphAtlas(characters);
    this.entries.set(characters, texture);
    return texture;
  }
  bytes() {
    return [...this.entries.keys()].reduce((sum, key) => sum + bytes(key), 0);
  }
  projectedBytes(requests: readonly string[]) {
    const keys = new Map([...this.entries.keys()].map((key) => [key, bytes(key)]));
    let peak = this.bytes();
    for (const key of requests) {
      if (!key.length || key.length > 64) throw new Error("ASCII requires 1–64 characters.");
      if (!keys.has(key) && keys.size >= this.capacity) keys.delete(keys.keys().next().value!);
      keys.delete(key);
      keys.set(key, bytes(key));
      peak = Math.max(
        peak,
        [...keys.values()].reduce((sum, value) => sum + value, 0),
      );
    }
    return peak;
  }
  dispose() {
    for (const texture of this.entries.values()) texture.dispose();
    this.entries.clear();
  }
}
