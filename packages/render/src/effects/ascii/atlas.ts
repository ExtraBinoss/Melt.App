import { CanvasTexture, LinearFilter, NoColorSpace } from "three/webgpu";
import { ASCII_DEFAULT_CHARACTERS } from "@musart/core";

/** One immutable upload used by every ASCII pass; no rasterized effect results. */
export function createGlyphAtlas(characters = ASCII_DEFAULT_CHARACTERS): CanvasTexture {
  if (!characters.length || characters.length > 64)
    throw new Error("ASCII requires 1–64 characters.");
  const glyphs = Array.from(characters);
  const canvas = document.createElement("canvas");
  canvas.width = glyphs.length * 16;
  canvas.height = 16;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Création de l’atlas ASCII impossible.");
  context.fillStyle = "#000000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.font = "bold 15px monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#ffffff";
  glyphs.forEach((glyph, index) => context.fillText(glyph, index * 16 + 8, 8));
  const atlas = new CanvasTexture(canvas);
  atlas.colorSpace = NoColorSpace;
  atlas.minFilter = LinearFilter;
  atlas.magFilter = LinearFilter;
  atlas.generateMipmaps = false;
  return atlas;
}
