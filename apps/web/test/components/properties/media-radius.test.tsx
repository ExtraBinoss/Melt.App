import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { createLayer, type VideoAsset } from "@musart/core";
import { Inspector } from "../../../src/components/properties/Inspector";
import { useEngine } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";
it.each(["image", "video"] as const)(
  "exposes the shared corner control on %s and commits one undoable edit",
  (kind) => {
    const d = setup();
    let id = d.image.id;
    if (kind === "video") {
      const asset: VideoAsset = {
        id: "movie",
        kind: "video",
        name: "Movie",
        mime: "video/mp4",
        width: 64,
        height: 64,
        originalId: "original",
        contentRevision: "v1",
        byteLength: 100,
        duration: { value: 2, rate: 1 },
        firstTimestamp: { value: 0, rate: 1 },
        timeResolution: 30000,
        orientation: {
          rotation: 0,
          flip: false,
          pixelAspectRatio: { numerator: 1, denominator: 1 },
        },
      };
      id = "movie-layer";
      d.engine.transaction([
        { type: "addAssets", assets: [asset] },
        { type: "addLayers", layers: [createLayer("video", { id, assetId: asset.id })] },
      ]);
    }
    d.engine.select([id]);
    function Live() {
      const s = useEngine(d.engine),
        page = s.project.pages[0]!;
      return (
        <Inspector
          engine={d.engine}
          page={page}
          selected={page.layers.filter((layer) => s.selection.includes(layer.id))}
          run={d.run}
        />
      );
    }
    d.mount(<Live />);
    const before = d.engine.getSnapshot().project;
    const input = screen.getByRole("textbox", { name: "Arrondi" });
    fireEvent.change(input, { target: { value: "24" } });
    expect(d.engine.getSnapshot().project).toBe(before);
    fireEvent.blur(input);
    expect(
      d.engine.getSnapshot().project.pages[0]!.layers.find((layer) => layer.id === id)!.radius,
    ).toBe(24);
    act(() => d.engine.undo());
    expect(d.engine.getSnapshot().project).toEqual(before);
  },
);
