import type { DBSchema } from "idb";
import { validateFillGradient, type FillGradient } from "@musart/core";
import { DatabaseConnection } from "../persistence/database";
export interface SavedGradient {
  id: string;
  name: string;
  paint: FillGradient;
}
interface Schema extends DBSchema {
  gradients: { key: string; value: SavedGradient };
}
export const GRADIENT_LIMIT = 200;
function valid(value: unknown): SavedGradient {
  if (!value || typeof value !== "object") throw Error("Invalid saved gradient");
  const item = value as SavedGradient;
  if (
    typeof item.id !== "string" ||
    !item.id ||
    item.id.length > 100 ||
    typeof item.name !== "string" ||
    !item.name.trim() ||
    item.name.length > 64
  )
    throw Error("Invalid saved gradient");
  validateFillGradient(item.paint);
  return {
    id: item.id,
    name: item.name,
    paint: {
      kind: item.paint.kind,
      angle: item.paint.angle,
      stops: item.paint.stops.map(({ offset, color }) => ({ offset, color })),
    },
  };
}
/** Small user library, shared across projects. The shared gateway owns transactions and disposal. */
export class GradientStore {
  private readonly db: DatabaseConnection<Schema>;
  constructor(name = "musart-gradients") {
    this.db = new DatabaseConnection<Schema>(name, 1, {
      upgrade(db) {
        db.createObjectStore("gradients", { keyPath: "id" });
      },
    });
  }
  async list(): Promise<SavedGradient[]> {
    const db = await this.db.open();
    const items = await db.getAll("gradients", undefined, GRADIENT_LIMIT + 1);
    if (items.length > GRADIENT_LIMIT) throw Error("Gradient library exceeds its limit");
    return items.map(valid);
  }
  async save(value: SavedGradient): Promise<void> {
    const item = valid(value);
    await this.db.write(["gradients"], async (tx) => {
      const entries = tx.objectStore("gradients");
      if (await entries.get(item.id)) throw Error("Gradient already exists");
      if ((await entries.count()) >= GRADIENT_LIMIT) throw Error("Gradient library is full");
      await entries.add(item);
    });
  }
  async remove(id: string): Promise<void> {
    await this.db.write(["gradients"], async (tx) => {
      await tx.objectStore("gradients").delete(id);
    });
  }
  dispose(): void {
    this.db.dispose();
  }
}
