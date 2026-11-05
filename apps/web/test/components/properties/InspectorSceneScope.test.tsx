import { act, fireEvent, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { createSpatialLayer, createSpatialScene } from "@musart/core";
import { Inspector } from "../../../src/components/properties/Inspector";
import { useEngine } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";

it("keeps scene animations in scene properties and object animations on their selected owner", () => {
  const d = setup();
  d.engine.execute({
    type: "updatePage",
    patch: { spatial: createSpatialScene() },
  });
  d.engine.execute({
    type: "updateLayers",
    ids: [d.text.id],
    patch: { spatial: createSpatialLayer("extrude") },
  });
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  d.engine.select([d.text.id]);
  function Live() {
    const snapshot = useEngine(d.engine);
    const page = snapshot.project.pages[0]!;
    return (
      <Inspector
        engine={d.engine}
        page={page}
        selected={page.layers.filter((layer) => snapshot.selection.includes(layer.id))}
        run={d.run}
      />
    );
  }
  d.mount(<Live />);
  expect(document.querySelectorAll(".layer-animations")).toHaveLength(1);
  expect(document.querySelector("[data-scene-animations]")).toBeNull();
  expect(screen.queryByRole("button", { name: "Caméra", exact: true })).toBeNull();
  act(() => d.engine.select([]));
  expect(screen.getByRole("button", { name: "Environnement", exact: true })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Caméra", exact: true }));
  expect(document.querySelector('[data-scene-animations="camera"]')).toHaveAccessibleName(
    "Animations de la caméra",
  );
  act(() => d.engine.select([d.rectangle.id]));
  expect(document.querySelector("[data-scene-animations]")).toBeNull();
  expect(document.querySelectorAll(".layer-animations")).toHaveLength(1);
});
