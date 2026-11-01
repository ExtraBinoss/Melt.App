import type { DBSchema } from "idb";
import { sameAssetOriginal, validateAssetDescription, type ImageAsset } from "@musart/core";
import { DatabaseConnection } from "../persistence/database";
import { importImage } from "../assets/imports";
export interface TextureHeader {
  id: string;
  name: string;
  width: number;
  height: number;
  byteLength: number;
  preview: string;
}
interface Original {
  id: string;
  asset: ImageAsset;
}
interface Schema extends DBSchema {
  originals: { key: string; value: Original };
  textures: { key: string; value: TextureHeader };
  state: { key: string; value: number };
}
const MAX_FILE = 8 * 1024 * 1024,
  MAX_TOTAL = 64 * 1024 * 1024,
  MAX_ITEMS = 128;
/** Browser-wide originals are separate from bounded listing metadata; selected copies enter projects. */
export class TextureStore {
  private readonly connection: DatabaseConnection<Schema>;
  constructor(name = "musart-texture-library") {
    this.connection = new DatabaseConnection<Schema>(name, 2, {
      upgrade(db, version) {
        if (version < 1) {
          db.createObjectStore("originals", { keyPath: "id" });
          db.createObjectStore("textures", { keyPath: "id" });
        }
        if (version < 2) db.createObjectStore("state");
      },
    });
  }
  async list(): Promise<TextureHeader[]> {
    const db = await this.connection.open();
    const items = await db.getAll("textures", undefined, MAX_ITEMS + 1);
    if (items.length > MAX_ITEMS) throw Error("Texture library exceeds its limit");
    for (const item of items) validateHeader(item);
    return items;
  }
  async get(id: string): Promise<ImageAsset> {
    const db = await this.connection.open();
    const record = await db.get("originals", id);
    if (!record || record.id !== record.asset.id) throw Error("Texture original is missing");
    validateAssetDescription(record.asset as unknown as Record<string, unknown>);
    if (
      !record.asset.dataUrl.startsWith("data:image/") ||
      record.asset.dataUrl.length > 12 * 1024 * 1024
    )
      throw Error("Invalid texture original");
    return record.asset;
  }
  async generation(): Promise<number> {
    const db = await this.connection.open();
    const value = (await db.get("state", "generation")) ?? 0;
    if (!Number.isSafeInteger(value) || value < 0) throw Error("Invalid texture generation");
    return value;
  }
  async import(file: File, signal?: AbortSignal): Promise<TextureHeader> {
    const generation = await this.generation();
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > MAX_FILE)
      throw Error("Invalid texture image");
    signal?.throwIfAborted();
    const asset = await importImage(file);
    if (asset.width > 4096 || asset.height > 4096)
      throw Error("Texture dimensions exceed 4096 pixels");
    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const id =
      "texture-" +
      Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join("");
    asset.id = id;
    const preview = await thumbnail(file);
    signal?.throwIfAborted();
    const header: TextureHeader = {
      id,
      name: file.name.slice(0, 160),
      width: asset.width,
      height: asset.height,
      byteLength: file.size,
      preview,
    };
    return this.save(header, asset, generation, signal);
  }
  async save(
    header: TextureHeader,
    asset: ImageAsset,
    generation: number,
    signal?: AbortSignal,
  ): Promise<TextureHeader> {
    validateHeader(header);
    validateAssetDescription(asset as unknown as Record<string, unknown>);
    if (
      header.id !== asset.id ||
      header.width !== asset.width ||
      header.height !== asset.height ||
      asset.dataUrl.length > 12 * 1024 * 1024
    )
      throw Error("Texture metadata mismatch");
    return this.connection.write(["originals", "textures", "state"], async (tx) => {
      if (((await tx.objectStore("state").get("generation")) ?? 0) !== generation)
        throw Error("Texture library changed during import");
      const found = await tx.objectStore("textures").get(header.id);
      if (found) {
        const original = await tx.objectStore("originals").get(header.id);
        if (!original || !sameAssetOriginal(original.asset, asset))
          throw Error("Texture identity conflict");
        return found;
      }
      const headers = await tx.objectStore("textures").getAll(undefined, MAX_ITEMS + 1);
      if (
        headers.length >= MAX_ITEMS ||
        headers.reduce((n, item) => n + item.byteLength, 0) + header.byteLength > MAX_TOTAL
      )
        throw Error("Texture library is full");
      signal?.throwIfAborted();
      await tx.objectStore("originals").add({ id: header.id, asset });
      await tx.objectStore("textures").add(header);
      signal?.throwIfAborted();
      return header;
    });
  }

  async delete(id: string): Promise<void> {
    await this.connection.write(["originals", "textures", "state"], async (tx) => {
      await tx.objectStore("originals").delete(id);
      await tx.objectStore("textures").delete(id);
      const generation = (await tx.objectStore("state").get("generation")) ?? 0;
      await tx.objectStore("state").put(generation + 1, "generation");
    });
  }
  dispose() {
    this.connection.dispose();
  }
}
async function thumbnail(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  try {
    const size = 96,
      canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw Error("Texture preview unavailable");
    context.drawImage(bitmap, 0, 0, size, size);
    return canvas.toDataURL("image/webp", 0.7);
  } finally {
    bitmap.close();
  }
}

function validateHeader(item: TextureHeader): void {
  if (
    !/^texture-[a-f0-9]{64}$/.test(item.id) ||
    typeof item.name !== "string" ||
    item.name.length > 160 ||
    !Number.isSafeInteger(item.width) ||
    !Number.isSafeInteger(item.height) ||
    item.width < 1 ||
    item.height < 1 ||
    item.width > 4096 ||
    item.height > 4096 ||
    !Number.isSafeInteger(item.byteLength) ||
    item.byteLength < 1 ||
    item.byteLength > MAX_FILE ||
    typeof item.preview !== "string" ||
    !item.preview.startsWith("data:image/webp;base64,") ||
    item.preview.length > 256 * 1024
  )
    throw Error("Invalid texture metadata");
}
