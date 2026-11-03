import { expect, it, vi } from "vitest";
import {
  detectImageFormat,
  normalizeImageFile,
  ImageImportError,
} from "../../../src/services/assets/image-format";
import { importBatch, importImage, readDataUrl } from "../../../src/services/assets/imports";
import { createPage, EditorEngine } from "@musart/core";
import { formatUiError } from "../../../src/state/i18n/errors/format";
import { i18n } from "../../../src/state/i18n";

const jpeg = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0]);
it("recognizes extensionless JPEGs and generic MIME without changing original bytes", async () => {
  for (const type of ["", "application/octet-stream", "image/jpg"]) {
    const original = new File([jpeg], "idk", { type, lastModified: 12 });
    const file = await normalizeImageFile(original);
    expect(file).toMatchObject({
      name: "idk",
      type: "image/jpeg",
      size: jpeg.length,
      lastModified: 12,
    });
    const asset = await importImage(original, {
      dataUrl: readDataUrl,
      dimensions: async () => ({ width: 736, height: 635 }),
    });
    expect(asset).toMatchObject({ mime: "image/jpeg", name: "idk", width: 736, height: 635 });
    expect(asset.dataUrl).toBe("data:image/jpeg;base64,/9j/4AAQSkZJRgA=");
  }
});
it("detects supported signatures and validates sniffed SVG safety", async () => {
  const ascii = (text: string) => new TextEncoder().encode(text);
  for (const [bytes, mime] of [
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), "image/png"],
    [ascii("RIFF1234WEBP"), "image/webp"],
    [ascii("GIF89a"), "image/gif"],
    [ascii("0000ftypavif"), "image/avif"],
    [
      ascii('<?xml version="1.0"?><!-- safe --><svg xmlns="http://www.w3.org/2000/svg"/>'),
      "image/svg+xml",
    ],
  ] as const)
    expect(detectImageFormat(bytes)).toBe(mime);
  expect(detectImageFormat(ascii("just renamed .jpg"))).toBeNull();
  const read = { dataUrl: readDataUrl, dimensions: async () => ({ width: 1, height: 1 }) };
  await expect(importImage(new File(["<svg><script/></svg>"], "idk"), read)).rejects.toThrow(
    "actif",
  );
});
it("reports actionable localized failures with filenames and technical causes, leaving mixed batches untouched", async () => {
  const before = createPage(),
    engine = new EditorEngine();
  const decode = {
    dataUrl: readDataUrl,
    dimensions: vi.fn(async () => {
      throw Error("decoder rejected bytes");
    }),
  };
  await expect(importImage(new File([jpeg], "broken"), decode)).rejects.toMatchObject({
    code: "IMAGE_DECODE_FAILED",
    fileName: "broken",
    cause: { message: "decoder rejected bytes" },
  });
  const prepared = importBatch([new File([jpeg], "valid"), new File(["garbage"], "idk")], before, {
    dataUrl: readDataUrl,
    dimensions: async () => ({ width: 1, height: 1 }),
  });
  await expect(prepared).rejects.toMatchObject({
    code: "IMAGE_FORMAT_UNSUPPORTED",
    fileName: "idk",
  });
  expect(engine.getSnapshot().canUndo).toBe(false);
  const previous = i18n.language;
  try {
    await i18n.changeLanguage("fr");
    const error = new ImageImportError(
      "IMAGE_FORMAT_UNSUPPORTED",
      "idk",
      "Unrecognized image format.",
    );
    expect(formatUiError(error)).toContain("idk: Format d’image non reconnu");
    expect(formatUiError(error)).toContain("JPEG");
  } finally {
    await i18n.changeLanguage(previous);
  }
});
