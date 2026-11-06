import { atom, type Atom } from "jotai";
import type { EnginePort } from "@musart/core";
import { SearchCatalog } from "./cache";

const catalogs = new WeakMap<EnginePort, Atom<SearchCatalog>>();
/** Each editor/store owns one reusable command index for Cmd+K, its dock and quick add. */
export function searchCatalogAtom(engine: EnginePort): Atom<SearchCatalog> {
  let resource = catalogs.get(engine);
  if (!resource) {
    resource = atom(() => new SearchCatalog());
    catalogs.set(engine, resource);
  }
  return resource;
}
