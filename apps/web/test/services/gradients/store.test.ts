import { expect, it } from "vitest";
import { deleteDB } from "idb";
import { GradientStore, GRADIENT_LIMIT } from "../../../src/services/gradients/store";
import { GRADIENT_PRESETS } from "../../../src/components/properties/gradient/presets";
import { validateFillGradient } from "@musart/core";
it("ships fifty distinct valid compact paints", () => {
  expect(GRADIENT_PRESETS).toHaveLength(50);
  expect(new Set(GRADIENT_PRESETS.map((preset) => JSON.stringify(preset.paint))).size).toBe(50);
  for (const preset of GRADIENT_PRESETS)
    expect(() => validateFillGradient(preset.paint)).not.toThrow();
});
it("shares saved gradients across projects, rejects overwrite/resurrection and validates originals", async () => {
  const name = `gradient-test-${crypto.randomUUID()}`,
    a = new GradientStore(name),
    b = new GradientStore(name);
  const item = { id: "stable", name: "My gradient", paint: GRADIENT_PRESETS[0]!.paint };
  await a.save(item);
  expect(await b.list()).toEqual([item]);
  await expect(b.save({ ...item, name: "Overwrite" })).rejects.toThrow("exists");
  await expect(
    a.save({ ...item, id: "invalid", paint: { ...item.paint, stops: [] } }),
  ).rejects.toThrow();
  expect(await a.list()).toHaveLength(1);
  await b.remove(item.id);
  expect(await a.list()).toEqual([]);
  a.dispose();
  b.dispose();
  await expect(a.save(item)).rejects.toThrow("closed");
  const c = new GradientStore(name);
  expect(await c.list()).toEqual([]);
  c.dispose();
  await deleteDB(name);
});
it("enforces the library bound inside the transaction under concurrent saves", async () => {
  const name = `gradient-limit-${crypto.randomUUID()}`,
    a = new GradientStore(name),
    b = new GradientStore(name);
  for (let at = 0; at < GRADIENT_LIMIT - 1; at++)
    await a.save({ id: String(at), name: "Paint", paint: GRADIENT_PRESETS[0]!.paint });
  const results = await Promise.allSettled([
    a.save({ id: "last-a", name: "Paint", paint: GRADIENT_PRESETS[0]!.paint }),
    b.save({ id: "last-b", name: "Paint", paint: GRADIENT_PRESETS[0]!.paint }),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(await a.list()).toHaveLength(GRADIENT_LIMIT);
  a.dispose();
  b.dispose();
  await deleteDB(name);
});
