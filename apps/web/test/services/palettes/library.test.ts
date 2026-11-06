import { expect, it } from "vitest";
import { deleteDB } from "idb";
import { PaletteLibrary } from "../../../src/services/palettes/library";
const palette = {
  id: "company",
  name: "Company",
  colors: [{ id: "red", name: "Red", value: "#a64433" }],
};
it("reopens saved palettes, compares revisions atomically and prevents stale resurrection after delete", async () => {
  const name = `palette-${crypto.randomUUID()}`,
    a = new PaletteLibrary(name),
    b = new PaletteLibrary(name);
  try {
    const first = await a.save(palette, null);
    const read = await b.get(first.id);
    expect(read).toEqual(first);
    const updated = await b.save({ ...read, name: "Company 2" }, read.revision);
    await expect(a.save({ ...first, name: "Stale" }, first.revision)).rejects.toThrow("changed");
    expect(await a.get(first.id)).toEqual(updated);
    await a.delete(first.id, updated.revision);
    await expect(b.save(read, read.revision)).rejects.toThrow("changed");
    await expect(b.save(read, null)).rejects.toThrow("changed");
    expect((await b.list()).items).toEqual([]);
    await expect(b.get(first.id)).rejects.toThrow("no longer exists");
  } finally {
    a.dispose();
    b.dispose();
    await deleteDB(name);
  }
});
it("lists bounded metadata pages, snapshots caller input and rejects corrupt or disposed writes", async () => {
  const name = `palette-${crypto.randomUUID()}`,
    store = new PaletteLibrary(name);
  try {
    const input = structuredClone(palette),
      saving = store.save(input, null);
    input.name = "Mutated";
    expect((await saving).name).toBe("Company");
    await expect(store.save({ ...palette, id: "invalid", colors: [] }, null)).rejects.toThrow();
    for (let i = 0; i < 52; i++)
      await store.save({ ...palette, id: `item-${String(i).padStart(2, "0")}` }, null);
    const page = await store.list();
    expect(page.items).toHaveLength(50);
    expect(page.more).toBe(true);
    expect(page.items.every((item) => !("colors" in item))).toBe(true);
    const rest = await store.list(page.items.at(-1)!.id);
    expect(rest.items).toHaveLength(3);
    expect(rest.more).toBe(false);
    store.dispose();
    await expect(store.save({ ...palette, id: "late" }, null)).rejects.toThrow("closed");
  } finally {
    store.dispose();
    await deleteDB(name);
  }
});
