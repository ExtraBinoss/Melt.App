import { i18n } from "../../../src/state/i18n";
import "../../../src/components/spatial/messages";
import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  createPage,
  createProject,
  createSpatialLight,
  createSpatialScene,
  EditorEngine,
  resolveSceneMotionProperty,
} from "@musart/core";
import { SpatialLightEditor } from "../../../src/components/spatial/SpatialLightEditor";
import { TooltipProvider } from "../../../src/components/ui/tooltip";
import { createMotionTransport } from "../../../src/services/motion/transport";

it("shows controls for the sampled light type without rerendering the authoring surface or changing dormant capabilities", () => {
  const spatial = createSpatialScene();
  spatial.lights[0]!.id = "light";
  const engine = new EditorEngine(createProject({ pages: [createPage({ id: "scene", spatial })] }));
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const target = {
    kind: "light",
    compositionId: "scene",
    lightId: "light",
    property: "type",
  } as const;
  engine.transaction(
    (["directional", "spot", "point"] as const).map((value, index) => ({
      type: "upsertMotionKeyframe",
      target,
      value,
      time: { value: index, rate: 1 },
    })),
  );
  const authored = engine.getSnapshot().project.pages[0]!,
    light = authored.spatial!.lights[0]!;
  const transport = createMotionTransport(engine),
    rootRender = vi.fn();
  function Host() {
    rootRender();
    return (
      <SpatialLightEditor
        engine={engine}
        compositionId="scene"
        light={light}
        onPreview={vi.fn()}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />
    );
  }
  const view = render(
    <TooltipProvider>
      <Host />
    </TooltipProvider>,
  );
  const label = (key: "angle" | "softness" | "lights") => i18n.t(`spatial:${key}`);
  const targetX = i18n.t("spatial:targetAxis", { axis: "X" });
  try {
    const renders = rootRender.mock.calls.length;
    expect(screen.getByRole("combobox", { name: label("lights") })).toHaveTextContent(
      i18n.t("spatial:lightTypes.directional"),
    );
    expect(screen.getByRole("textbox", { name: targetX })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: label("angle") })).not.toBeInTheDocument();
    act(() => transport.seek({ value: 1, rate: 1 }));
    expect(screen.getByRole("combobox", { name: label("lights") })).toHaveTextContent(
      i18n.t("spatial:lightTypes.spot"),
    );
    expect(screen.getByRole("textbox", { name: label("angle") })).toHaveValue("45");
    expect(screen.getByRole("textbox", { name: label("softness") })).toHaveValue("0.5");
    expect(screen.getByRole("textbox", { name: targetX })).toBeInTheDocument();
    act(() => transport.seek({ value: 2, rate: 1 }));
    expect(screen.getByRole("combobox", { name: label("lights") })).toHaveTextContent(
      i18n.t("spatial:lightTypes.point"),
    );
    expect(screen.queryByRole("textbox", { name: targetX })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: label("angle") })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: label("softness") })).not.toBeInTheDocument();
    expect(resolveSceneMotionProperty(authored, { ...target, property: "angle" })).not.toBeNull();
    expect(resolveSceneMotionProperty(authored, { ...target, property: "targetX" })).not.toBeNull();
    expect(engine.getSnapshot().project.pages[0]).toBe(authored);
    expect(light.type).toBe("directional");
    expect(rootRender).toHaveBeenCalledTimes(renders);
  } finally {
    view.unmount();
    transport.dispose();
  }
});

it("keeps conditional controls available for ordinary static light descriptions", () => {
  const light = createSpatialLight("point"),
    onPreview = vi.fn(),
    onCommit = vi.fn(),
    onCancel = vi.fn();
  const props = { onPreview, onCommit, onCancel };
  const view = render(
    <TooltipProvider>
      <SpatialLightEditor {...props} light={light} />
    </TooltipProvider>,
  );
  const angle = i18n.t("spatial:angle"),
    targetX = i18n.t("spatial:targetAxis", { axis: "X" });
  expect(screen.queryByRole("textbox", { name: angle })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: targetX })).not.toBeInTheDocument();
  view.rerender(
    <TooltipProvider>
      <SpatialLightEditor {...props} light={{ ...light, type: "spot" }} />
    </TooltipProvider>,
  );
  expect(screen.getByRole("textbox", { name: angle })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: targetX })).toBeInTheDocument();
});
