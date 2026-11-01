import { expect, it } from "vitest";
import { createLayer } from "../../src/index";
import { fixture, scalar } from "./support";
it("records the authoritative last selected mask owner and its independent property edits", () => {
  const d = fixture([
    createLayer("rectangle", { id: "source" }),
    createLayer("rectangle", { id: "target" }),
  ]);
  d.engine.execute({ type: "createMaskFromSelection", ids: ["source", "target"] });
  expect(d.description().changes[0]).toEqual({
    kind: "action",
    action: "add",
    owner: { kind: "mask", compositionId: "page", layerId: "target" },
  });
  d.engine.execute({
    type: "updateMask",
    targetId: "target",
    patch: { inverted: true, mode: "luminance" },
  });
  expect(d.properties()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        target: {
          owner: { kind: "mask", compositionId: "page", layerId: "target" },
          property: "inverted",
        },
        before: scalar(false),
        after: scalar(true),
      }),
      expect.objectContaining({
        target: {
          owner: { kind: "mask", compositionId: "page", layerId: "target" },
          property: "mode",
        },
        after: scalar("luminance"),
      }),
    ]),
  );
});
it("describes layer-owned guide parameters rather than treating guide targetId as an inactive composition", () => {
  const d = fixture();
  d.engine.execute({
    type: "addGuide",
    targetId: "item",
    guide: { id: "guide", axis: "x", position: 10 },
  });
  d.engine.execute({
    type: "updateGuide",
    targetId: "item",
    id: "guide",
    patch: { position: 30, color: "#ff0000" },
  });
  expect(d.properties().map((change) => change.target.property)).toEqual(["position", "color"]);
  expect(d.properties()[0]).toMatchObject({
    target: { owner: { kind: "guide", compositionId: "page", guideId: "guide" } },
    before: scalar(10),
    after: scalar(30),
  });
});
