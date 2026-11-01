import { expect, it } from "vitest";
import { deleteDB } from "idb";
import { TextureStore, type TextureHeader } from "../../../src/services/textures/store";
import type { ImageAsset } from "@musart/core";
const id = `texture-${"a".repeat(64)}`;
const header: TextureHeader = {
  id,
  name: "map.png",
  width: 1,
  height: 1,
  byteLength: 68,
  preview: "data:image/webp;base64,AAAA",
};
const asset: ImageAsset = {
  id,
  name: "map.png",
  width: 1,
  height: 1,
  mime: "image/png",
  dataUrl: "data:image/png;base64,AAAA",
};
it("stores immutable originals separately, reopens across projects and prevents delayed imports resurrecting deleted textures", async () => {
  const name = `texture-test-${crypto.randomUUID()}`,
    a = new TextureStore(name),
    b = new TextureStore(name);
  const generation = await a.generation();
  await a.save(header, asset, generation);
  expect(await b.list()).toEqual([header]);
  expect(await b.get(id)).toEqual(asset);
  const stale = await a.generation();
  await b.delete(id);
  await expect(a.save(header, asset, stale)).rejects.toThrow("changed");
  expect(await a.list()).toEqual([]);
  await expect(a.get(id)).rejects.toThrow("missing");
  await a.save(header, asset, await a.generation());
  a.dispose();
  b.dispose();
  const c = new TextureStore(name);
  expect((await c.list())[0]?.id).toBe(id);
  c.dispose();
  await deleteDB(name);
});
it("rejects invalid metadata and aborts both records together", async () => {
  const name = `texture-abort-${crypto.randomUUID()}`,
    store = new TextureStore(name);
  const generation = await store.generation();
  const signal = AbortSignal.abort();
  await expect(store.save(header, asset, generation, signal)).rejects.toThrow();
  expect(await store.list()).toEqual([]);
  await expect(store.save({ ...header, width: 5000 }, asset, generation)).rejects.toThrow();
  store.dispose();
  await deleteDB(name);
});
