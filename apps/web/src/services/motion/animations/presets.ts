import { openDatabase, commitTransaction } from "../../persistence/database";
import { type DBSchema, type IDBPDatabase, type IDBPTransaction } from "idb";
import {
  validateMotionAnimationPreset,
  validateSceneMotionAnimationPreset,
  type MotionAnimationPreset,
  type SceneMotionAnimationPreset,
} from "@musart/core";
export type StoredMotionPreset = MotionAnimationPreset | SceneMotionAnimationPreset;
export function isSceneMotionPreset(
  preset: StoredMotionPreset,
): preset is SceneMotionAnimationPreset {
  return preset.channels.some(
    (channel) =>
      channel.target.kind === "camera" ||
      channel.target.kind === "environment" ||
      channel.target.kind === "light" ||
      channel.target.kind === "compositionEffect" ||
      channel.target.kind === "compositionEffectSetting",
  );
}
function validateStoredPreset(preset: StoredMotionPreset) {
  try {
    validateMotionAnimationPreset(preset);
  } catch {
    validateSceneMotionAnimationPreset(preset);
  }
}

export interface SavedMotionPreset {
  id: string;
  revision: number;
  updatedAt: number;
  deleted: boolean;
  preset: StoredMotionPreset;
}
interface Schema extends DBSchema {
  presets: { key: string; value: SavedMotionPreset; indexes: { updated: [number, string] } };
}

/** Global to this browser profile, independent of project deletion. Individual atomic records. */
export class MotionPresetStore {
  private connection: Promise<IDBPDatabase<Schema>> | undefined;
  private closed = false;
  private readonly writes = new Set<IDBPTransaction<Schema, ["presets"], "readwrite">>();
  constructor(private readonly name = "musart-motion-presets") {}
  private async database() {
    if (this.closed) throw Error("Motion preset store is closed");
    this.connection ??= openDatabase<Schema>(this.name, 1, {
      upgrade(db) {
        db.createObjectStore("presets", { keyPath: "id" }).createIndex("updated", [
          "updatedAt",
          "id",
        ]);
      },
      blocking: () => this.dispose(),
      terminated: () => this.dispose(),
    });
    const pending = this.connection;
    void pending.catch(() => {
      if (this.connection === pending) this.connection = undefined;
    });
    const db = await pending;
    if (this.closed) {
      db.close();
      throw Error("Motion preset store is closed");
    }
    return db;
  }
  async list(
    before?: [number, string],
    limit = 40,
  ): Promise<{ items: SavedMotionPreset[]; before: [number, string] | null }> {
    const db = await this.database();
    const items: SavedMotionPreset[] = [];
    let scanned = 0;
    let cursor = await db
      .transaction("presets")
      .store.index("updated")
      .openCursor(before ? IDBKeyRange.upperBound(before, true) : undefined, "prev");
    while (cursor && items.length < Math.max(1, Math.min(limit, 100)) && scanned++ < 200) {
      const record = cursor.value;
      if (
        !Number.isSafeInteger(record.revision) ||
        record.revision < 1 ||
        !Number.isFinite(record.updatedAt) ||
        typeof record.deleted !== "boolean" ||
        record.id !== record.preset.id
      )
        throw Error("Invalid saved motion preset");
      if (!cursor.value.deleted) {
        validateStoredPreset(cursor.value.preset);
        items.push(cursor.value);
      }
      const last = cursor.key;
      cursor = await cursor.continue();
      if (!cursor) return { items, before: null };
      if (items.length >= limit || scanned >= 200) return { items, before: last };
    }
    return { items, before: null };
  }
  async save(preset: StoredMotionPreset, expectedRevision = 0): Promise<SavedMotionPreset> {
    validateStoredPreset(preset);
    const db = await this.database();
    const tx = db.transaction("presets", "readwrite");
    this.writes.add(tx);
    try {
      return await commitTransaction(tx, async () => {
        const current = await tx.store.get(preset.id);
        if ((current?.revision ?? 0) !== expectedRevision || current?.deleted)
          throw Error("Motion preset changed in another window");
        const record = {
          id: preset.id,
          revision: expectedRevision + 1,
          updatedAt: Date.now(),
          deleted: false,
          preset: structuredClone(preset),
        };
        await tx.store.put(record);
        return record;
      });
    } finally {
      this.writes.delete(tx);
    }
  }
  async delete(record: SavedMotionPreset): Promise<void> {
    const db = await this.database();
    const tx = db.transaction("presets", "readwrite");
    this.writes.add(tx);
    try {
      return await commitTransaction(tx, async () => {
        const current = await tx.store.get(record.id);
        if (!current || current.deleted || current.revision !== record.revision)
          throw Error("Motion preset changed in another window");
        await tx.store.put({
          ...current,
          deleted: true,
          revision: current.revision + 1,
          updatedAt: Date.now(),
        });
        await tx.done;
      });
    } finally {
      this.writes.delete(tx);
    }
  }
  dispose() {
    this.closed = true;
    for (const tx of this.writes) {
      try {
        tx.abort();
      } catch {
        /* Already settled. */
      }
    }
    this.writes.clear();
    void this.connection?.then(
      (db) => db.close(),
      () => undefined,
    );
  }
}
