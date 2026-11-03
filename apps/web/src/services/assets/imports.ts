import {
  createLayer,
  type ImageAsset,
  type Command,
  type Composition,
  type Layer,
} from "@musart/core";
import { normalizeImageFile, ImageImportError } from "./image-format";
export function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Contenu du fichier invalide."));
    };
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsDataURL(file);
  });
}
export function imageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("Image illisible."));
    image.src = dataUrl;
  });
}
export function assertSafeSvg(text: string) {
  const xml = new DOMParser().parseFromString(text, "image/svg+xml");
  if (xml.querySelector("parsererror") || xml.documentElement.localName !== "svg")
    throw new Error("SVG invalide.");
  for (const element of xml.querySelectorAll("*")) {
    if (
      ["script", "foreignObject", "iframe", "style", "animate", "set"].includes(element.localName)
    )
      throw new Error("SVG actif non autorisé.");
    for (const attribute of element.attributes) {
      if (/^on/i.test(attribute.name)) throw new Error("Événement SVG non autorisé.");
      if (
        /(?:href|src)$/i.test(attribute.localName) &&
        !attribute.value.startsWith("#") &&
        !attribute.value.startsWith("data:image/")
      )
        throw new Error("Ressource SVG externe non autorisée.");
      if (/url\(\s*['"]?(?!#)/i.test(attribute.value))
        throw new Error("Ressource SVG externe non autorisée.");
    }
  }
}
export interface ImageReader {
  dataUrl: (file: Blob) => Promise<string>;
  dimensions: (url: string) => Promise<{ width: number; height: number }>;
}
const defaultReader: ImageReader = { dataUrl: readDataUrl, dimensions: imageDimensions };
export async function importImage(
  file: File,
  reader: ImageReader = defaultReader,
): Promise<ImageAsset> {
  if (file.size > 50 * 1024 * 1024)
    throw new ImageImportError(
      "IMAGE_TOO_LARGE",
      file.name,
      "Image exceeds the 50 MiB import limit.",
    );
  file = await normalizeImageFile(file);
  let dataUrl: string;
  try {
    dataUrl = await reader.dataUrl(file);
  } catch (cause) {
    throw new ImageImportError(
      "IMAGE_READ_FAILED",
      file.name,
      "The file could not be read. Try selecting it again.",
      cause,
    );
  }
  if (file.type === "image/svg+xml") {
    const text = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        if (typeof r.result === "string") resolve(r.result);
        else reject(new Error("Contenu du fichier invalide."));
      };
      r.onerror = reject;
      r.readAsText(file);
    });
    assertSafeSvg(text);
  }
  let dimensions: { width: number; height: number };
  try {
    dimensions = await reader.dimensions(dataUrl);
  } catch (cause) {
    throw new ImageImportError(
      "IMAGE_DECODE_FAILED",
      file.name,
      "The image is damaged or cannot be decoded by this browser. Save a new JPEG, PNG or WebP copy and retry.",
      cause,
    );
  }
  const { width, height } = dimensions;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > 64 * 1024 * 1024
  )
    throw new ImageImportError(
      "IMAGE_DIMENSIONS_INVALID",
      file.name,
      "Invalid image dimensions or image exceeds 64 megapixels.",
    );
  return { id: crypto.randomUUID(), name: file.name, mime: file.type, width, height, dataUrl };
}
export async function importBatch(
  files: File[],
  page: Composition,
  reader?: ImageReader,
): Promise<Command> {
  if (!files.length) throw new Error("Aucune image à importer.");
  if (files.length > 100) throw new Error("Importer au maximum 100 images à la fois.");
  const assets: ImageAsset[] = [];
  // Bounded concurrent decode; a rejected file leaves the document untouched.
  for (let offset = 0; offset < files.length; offset += 3) {
    assets.push(
      ...(await Promise.all(
        files.slice(offset, offset + 3).map((file) => importImage(file, reader)),
      )),
    );
  }
  const layers: Layer[] = assets.map((asset, index) => {
    const fit = Math.min(1, (page.width * 0.72) / asset.width, (page.height * 0.72) / asset.height);
    const width = Math.round(asset.width * fit),
      height = Math.round(asset.height * fit);
    return createLayer("image", {
      name: asset.name,
      assetId: asset.id,
      width,
      height,
      x: (page.width - width) / 2 + (index % 8) * 16,
      y: (page.height - height) / 2 + (index % 8) * 16,
    });
  });
  return { type: "addLayers", layers, assets };
}
