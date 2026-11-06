import { expect, it } from "vitest";
import { createStore } from "jotai";
import { createProject, EditorEngine } from "@musart/core";
import { searchCatalogAtom } from "../../../../src/components/search/catalog/session";

it("shares one index across an editor's search surfaces, while isolating other engines and stores", () => {
  const first = new EditorEngine(createProject()),
    second = new EditorEngine(createProject());
  const store = createStore(),
    otherStore = createStore();
  expect(searchCatalogAtom(first)).toBe(searchCatalogAtom(first));
  const resource = store.get(searchCatalogAtom(first));
  expect(store.get(searchCatalogAtom(first))).toBe(resource);
  expect(store.get(searchCatalogAtom(second))).not.toBe(resource);
  expect(otherStore.get(searchCatalogAtom(first))).not.toBe(resource);
});
