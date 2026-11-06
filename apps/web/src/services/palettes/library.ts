import type { DBSchema } from "idb";
import { validateSavedPalette } from "@musart/core";
import type { SavedPalette } from "@musart/core";
import { DatabaseConnection } from "../persistence/database";
export interface PaletteRecord extends SavedPalette {
  revision: string;
}
export interface PaletteSummary {
  id: string;
  name: string;
  revision: string;
}
interface PaletteDatabase extends DBSchema {
  palettes: { key: string; value: PaletteRecord };
  metadata: { key: string; value: PaletteSummary };
  retired: { key: string; value: { id: string } };
}
export class PaletteConflictError extends Error {
  constructor() {
    super("This palette changed in another session. Reopen it before saving.");
  }
}
/** Metadata and payload use bounded independent reads, with compare-and-swap writes. */
export class PaletteLibrary {
  private connection: DatabaseConnection<PaletteDatabase>;
  constructor(name = "musart-palettes") {
    this.connection = new DatabaseConnection<PaletteDatabase>(name, 2, {
      upgrade(db, previous) {
        if (previous < 1) {
          db.createObjectStore("palettes", { keyPath: "id" });
          db.createObjectStore("metadata", { keyPath: "id" });
        }
        if (previous < 2) db.createObjectStore("retired", { keyPath: "id" });
      },
    });
  }
  async list(after?: string): Promise<{ items: PaletteSummary[]; more: boolean }> {
    const db = await this.connection.open(),
      tx = db.transaction("metadata"),
      items: PaletteSummary[] = [];
    let cursor = await tx.store.openCursor(after ? IDBKeyRange.lowerBound(after, true) : undefined);
    while (cursor && items.length < 50) {
      items.push(cursor.value);
      cursor = await cursor.continue();
    }
    await tx.done;
    return { items, more: cursor !== null };
  }
  async get(id: string): Promise<PaletteRecord> {
    const db = await this.connection.open(),
      record = await db.get("palettes", id);
    if (!record) throw Error("Palette no longer exists.");
    validateSavedPalette(record);
    if (typeof record.revision !== "string") throw Error("Invalid saved palette revision.");
    return record;
  }
  async save(palette: SavedPalette, expectedRevision: string | null): Promise<PaletteRecord> {
    const copy = structuredClone(palette);
    validateSavedPalette(copy);
    const record = { ...copy, revision: crypto.randomUUID() };
    return this.connection.write(["palettes", "metadata", "retired"], async (tx) => {
      if (await tx.objectStore("retired").get(copy.id)) throw new PaletteConflictError();
      const previous = await tx.objectStore("metadata").get(copy.id);
      if ((previous?.revision ?? null) !== expectedRevision) throw new PaletteConflictError();
      await tx.objectStore("palettes").put(record);
      await tx
        .objectStore("metadata")
        .put({ id: record.id, name: record.name, revision: record.revision });
      return record;
    });
  }
  async delete(id: string, expectedRevision: string): Promise<void> {
    await this.connection.write(["palettes", "metadata", "retired"], async (tx) => {
      const previous = await tx.objectStore("metadata").get(id);
      if (!previous || previous.revision !== expectedRevision) throw new PaletteConflictError();
      await tx.objectStore("retired").put({ id });
      await tx.objectStore("palettes").delete(id);
      await tx.objectStore("metadata").delete(id);
    });
  }
  dispose() {
    this.connection.dispose();
  }
}
