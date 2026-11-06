import { expect, it, vi } from "vitest";
import { deleteDB } from "idb";
import { captureEffectTreatment, createEffect } from "@musart/core";
import { EffectPresetStore } from "../../../src/services/effect-presets/store";

const treatment = (id: string, name = "Poster ink") =>
  captureEffectTreatment(
    id,
    name,
    [createEffect("grain", { id: `effect-${id}`, amount: 0.3 })],
    {},
    "effect",
  );
it("persists copies across sessions and prevents concurrent overwrite or deleted-record resurrection", async () => {
  const name = `effect-presets-${crypto.randomUUID()}`,
    a = new EffectPresetStore(name),
    b = new EffectPresetStore(name);
  try {
    const input = treatment("saved");
    const saving = a.save(input);
    input.name = "Mutated after save began";
    const first = await saving;
    expect((await b.get("saved"))?.name).toBe("Poster ink");
    const outcomes = await Promise.allSettled([
      a.save({ ...first.treatment, name: "First writer" }, first.revision),
      b.save({ ...first.treatment, name: "Second writer" }, first.revision),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const current = (await a.get("saved"))!;
    expect(current.revision).toBe(2);
    await expect(b.delete(first)).rejects.toThrow("changed");
    expect(await a.get("saved")).toEqual(current);
    await b.delete(current);
    expect(await a.get("saved")).toBeNull();
    expect((await a.list()).items).toEqual([]);
    await expect(a.save(current.treatment, current.revision)).rejects.toThrow("changed");
    await expect(b.save(current.treatment, 0)).rejects.toThrow("changed");
  } finally {
    a.dispose();
    b.dispose();
    await deleteDB(name);
  }
});
it("lists bounded metadata pages without reading originals, including equal timestamps", async () => {
  const name = `effect-presets-pages-${crypto.randomUUID()}`,
    store = new EffectPresetStore(name);
  try {
    vi.spyOn(Date, "now").mockReturnValue(100);
    for (const id of ["a", "b", "c", "d", "e"]) await store.save(treatment(id));
    const get = vi.spyOn(IDBObjectStore.prototype, "get");
    const first = await store.list(undefined, 2);
    expect(first.items.map((item) => item.id)).toEqual(["e", "d"]);
    expect(first.items.every((item) => !("treatment" in item))).toBe(true);
    const second = await store.list(first.before!, 2);
    const last = await store.list(second.before!, 2);
    expect([...second.items, ...last.items].map((item) => item.id)).toEqual(["c", "b", "a"]);
    expect(last.before).toBeNull();
    expect(get).not.toHaveBeenCalled();
    await store.get("a");
    expect(get).toHaveBeenCalledTimes(2);
  } finally {
    store.dispose();
    await deleteDB(name);
  }
});
it("rejects invalid payloads and disposed pending writes without reporting success", async () => {
  const name = `effect-presets-close-${crypto.randomUUID()}`,
    store = new EffectPresetStore(name);
  await expect(store.save({ ...treatment("bad"), effects: [] })).rejects.toThrow();
  const saving = store.save(treatment("pending"));
  store.dispose();
  await expect(saving).rejects.toThrow("closed");
  const reopened = new EffectPresetStore(name);
  try {
    expect(await reopened.get("pending")).toBeNull();
  } finally {
    reopened.dispose();
    await deleteDB(name);
  }
});
