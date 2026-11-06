import { expect, test } from "vitest";
import { createLayer, createPage, createSpatialLayer } from "@musart/core";
import {
  compositionHasDepth,
  ownerHasDepth,
  selectionHasDepth,
  effectCatalogEntries,
} from "../../../../src/components/layers/catalog/model";

const catalog = (depthAvailable: boolean, scope: "layer" | "composition" = "layer") =>
  effectCatalogEntries("effect", (key) => key, "en", { scope, depthAvailable }).map(
    (entry) => entry.type,
  );

test("native object and containing group admission follows real visible meshes rather than neighbours", () => {
  const group = createLayer("group", { id: "group" }),
    nested = createLayer("group", {
      id: "nested",
      parentId: group.id,
      spatial: createSpatialLayer("group"),
    }),
    object = createLayer("rectangle", {
      id: "object",
      parentId: nested.id,
      spatial: createSpatialLayer("box"),
    }),
    flat = createLayer("rectangle", { id: "flat" }),
    empty = createLayer("group", { id: "empty", spatial: createSpatialLayer("group") }),
    page = createPage({ layers: [group, nested, object, flat, empty] });
  expect(compositionHasDepth(page)).toBe(true);
  for (const id of [group.id, nested.id, object.id]) expect(ownerHasDepth(page, id)).toBe(true);
  for (const id of [flat.id, empty.id, "missing"]) expect(ownerHasDepth(page, id)).toBe(false);
  expect(selectionHasDepth(page, [object.id, group.id])).toBe(true);
  expect(selectionHasDepth(page, [object.id, flat.id])).toBe(false);
  expect(selectionHasDepth(page, [])).toBe(false);
  const hidden = {
    ...page,
    layers: page.layers.map((layer) =>
      layer.id === group.id ? { ...layer, visible: false } : layer,
    ),
  };
  expect(compositionHasDepth(hidden)).toBe(false);
  expect(ownerHasDepth(hidden, object.id)).toBe(false);
  const disabled = {
    ...page,
    layers: page.layers.map((layer) =>
      layer.id === object.id
        ? { ...layer, spatial: { ...object.spatial!, enabled: false } }
        : layer,
    ),
  };
  expect(ownerHasDepth(disabled, group.id)).toBe(false);
});

test("native mask sources lend depth to their own treatment without advertising composition/group paint", () => {
  const group = createLayer("group", { id: "group" }),
    object = createLayer("rectangle", {
      id: "mask",
      parentId: group.id,
      maskSource: true,
      spatial: createSpatialLayer("box"),
    }),
    page = createPage({ layers: [group, object] });
  expect(ownerHasDepth(page, object.id)).toBe(true);
  expect(ownerHasDepth(page, group.id)).toBe(false);
  expect(compositionHasDepth(page)).toBe(false);
});

test("DOF requires native owner depth in both catalog scopes, while Trail is available for flat layers", () => {
  for (const scope of ["layer", "composition"] as const) {
    expect(catalog(true, scope)).toContain("depth-of-field");
    expect(catalog(false, scope)).not.toContain("depth-of-field");
    expect(catalog(false, scope)).toContain("trail");
  }
});
