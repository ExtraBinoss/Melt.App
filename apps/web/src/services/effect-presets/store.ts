import type { DBSchema } from "idb";
import { validateEffectTreatment, type EffectTreatment } from "@musart/core";
import { DatabaseConnection, commitTransaction } from "../persistence/database";
export interface TreatmentHeader {
  id: string;
  name: string;
  kind: EffectTreatment["kind"];
  types: string[];
  revision: number;
  updatedAt: number;
  deleted: boolean;
}
export interface SavedTreatment extends TreatmentHeader {
  treatment: EffectTreatment;
}
interface Schema extends DBSchema {
  headers: { key: string; value: TreatmentHeader; indexes: { updated: [number, string] } };
  payloads: { key: string; value: EffectTreatment };
}
function validateHeader(header: TreatmentHeader): void {
  if (
    typeof header.id !== "string" ||
    !header.id ||
    header.id.length > 256 ||
    typeof header.name !== "string" ||
    !header.name ||
    header.name.length > 120 ||
    header.name.trim() !== header.name ||
    !Number.isSafeInteger(header.revision) ||
    header.revision < 1 ||
    !Number.isFinite(header.updatedAt) ||
    header.updatedAt < 0 ||
    !Array.isArray(header.types) ||
    !header.types.length ||
    header.types.length > 64 ||
    header.types.some((type) => typeof type !== "string" || !type) ||
    !["effect", "stack"].includes(header.kind) ||
    (header.kind === "effect" && header.types.length !== 1) ||
    typeof header.deleted !== "boolean"
  )
    throw Error("Invalid saved treatment metadata");
}
export class EffectPresetStore {
  private readonly connection: DatabaseConnection<Schema>;
  constructor(name = "musart-effect-presets") {
    this.connection = new DatabaseConnection(name, 1, {
      upgrade(db) {
        db.createObjectStore("headers", { keyPath: "id" }).createIndex("updated", [
          "updatedAt",
          "id",
        ]);
        db.createObjectStore("payloads", { keyPath: "id" });
      },
    });
  }
  async list(
    before?: [number, string],
    limit = 40,
  ): Promise<{ items: TreatmentHeader[]; before: [number, string] | null }> {
    const db = await this.connection.open();
    const tx = db.transaction("headers");
    return commitTransaction(tx, async () => {
      const items: TreatmentHeader[] = [];
      let scanned = 0;
      let last: [number, string] | null = null;
      let cursor = await tx.store
        .index("updated")
        .openCursor(before ? IDBKeyRange.upperBound(before, true) : undefined, "prev");
      const count = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 100)) : 40;
      while (cursor && items.length < count && scanned++ < 200) {
        const header = cursor.value;
        validateHeader(header);
        if (!header.deleted) items.push(header);
        last = cursor.key;
        cursor = await cursor.continue();
      }
      return { items, before: cursor ? last : null };
    });
  }
  async get(id: string): Promise<SavedTreatment | null> {
    const db = await this.connection.open();
    const tx = db.transaction(["headers", "payloads"]);
    return commitTransaction(tx, async () => {
      const header = await tx.objectStore("headers").get(id);
      if (!header) return null;
      validateHeader(header);
      if (header.deleted) return null;
      const treatment = await tx.objectStore("payloads").get(id);
      validateEffectTreatment(treatment);
      if (
        treatment.id !== header.id ||
        treatment.name !== header.name ||
        treatment.kind !== header.kind ||
        JSON.stringify(treatment.effects.map((effect) => effect.type)) !==
          JSON.stringify(header.types)
      )
        throw Error("Invalid saved treatment metadata");
      return { ...header, treatment };
    });
  }
  async save(treatment: EffectTreatment, expectedRevision = 0): Promise<SavedTreatment> {
    validateEffectTreatment(treatment);
    const copy = structuredClone(treatment);
    // Bound each payload before an IndexedDB clone; listings never read these originals.
    if (JSON.stringify(copy).length > 24 * 1024 * 1024)
      throw Error("Treatment exceeds the 24 MB library limit");
    return this.connection.write(["headers", "payloads"], async (tx) => {
      const headers = tx.objectStore("headers");
      const current = await headers.get(copy.id);
      if (current) validateHeader(current);
      if ((current?.revision ?? 0) !== expectedRevision || current?.deleted)
        throw Error("Treatment changed in another window. Reload the library.");
      const header: TreatmentHeader = {
        id: copy.id,
        name: copy.name,
        kind: copy.kind,
        types: copy.effects.map((effect) => effect.type),
        revision: expectedRevision + 1,
        updatedAt: Date.now(),
        deleted: false,
      };
      await tx.objectStore("payloads").put(copy);
      await headers.put(header);
      return { ...header, treatment: copy };
    });
  }
  async delete(header: TreatmentHeader): Promise<void> {
    return this.connection.write(["headers", "payloads"], async (tx) => {
      const current = await tx.objectStore("headers").get(header.id);
      if (current) validateHeader(current);
      if (!current || current.deleted || current.revision !== header.revision)
        throw Error("Treatment changed in another window. Reload the library.");
      await tx.objectStore("payloads").delete(header.id);
      await tx
        .objectStore("headers")
        .put({ ...current, revision: current.revision + 1, updatedAt: Date.now(), deleted: true });
    });
  }
  dispose() {
    this.connection.dispose();
  }
}
