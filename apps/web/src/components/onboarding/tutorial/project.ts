import { createEffect, MOTION_ANIMATION_PRESETS, type EnginePort } from "@musart/core";
import type { EditorServices } from "../../../state/contracts";

export async function createPracticeProject(engine: EnginePort, services: EditorServices) {
  const origin = engine.getSnapshot();
  const ensureOrigin = () => {
    const current = engine.getSnapshot();
    if (current.project !== origin.project || current.pageId !== origin.pageId)
      throw new Error("The active project changed. Start the tutorial again.");
  };
  // Fetch before changing projects: a missing asset leaves the current document intact.
  const names = ["mountains", "lake", "forest"];
  const files = await Promise.all(
    names.map(async (name) => {
      const response = await fetch(`${import.meta.env.BASE_URL}images/tutorial/${name}.jpg`);
      if (!response.ok) throw new Error(`Could not load tutorial image: ${name}`);
      return new File([await response.blob()], `${name}.jpg`, { type: "image/jpeg" });
    }),
  );
  ensureOrigin();
  await services.saveProject();
  ensureOrigin();
  await services.createProject({
    name: "Learning with Melt",
    width: 1200,
    height: 800,
    background: "#e8e5dc",
  });
  const projectId = engine.getSnapshot().project.id;
  await services.importFiles(files);
  const snapshot = engine.getSnapshot();
  if (snapshot.project.id !== projectId) throw new Error("The active project changed.");
  const page = snapshot.project.pages.find((page) => page.id === snapshot.pageId)!;
  const images = page.layers.filter((layer) => layer.kind === "image");
  if (images.length !== 3) throw new Error("The tutorial images could not be imported.");
  engine.transaction(
    images.map((layer, index) => ({
      type: "updateLayers" as const,
      ids: [layer.id],
      patch: {
        name: ["Mountains", "Lake", "Forest"][index],
        x: 65 + index * 365,
        y: index === 1 ? 145 : 205,
        width: 340,
        height: 450,
      },
    })),
  );
  engine.select([]);
  await services.saveProject();
  return { projectId, layerId: images[1]!.id };
}
export function addDither(engine: EnginePort, layerId: string) {
  const snapshot = engine.getSnapshot();
  const layer = snapshot.project.pages
    .find((page) => page.id === snapshot.pageId)!
    .layers.find((layer) => layer.id === layerId)!;
  if (layer.effects.some((effect) => effect.type === "bit-dither")) return;
  engine.execute({
    type: "updateLayers",
    ids: [layerId],
    patch: { effects: [...layer.effects, createEffect("bit-dither")] },
  });
}
export function addPop(engine: EnginePort, layerId: string) {
  const snapshot = engine.getSnapshot();
  const track = snapshot.project.pages
    .find((page) => page.id === snapshot.pageId)
    ?.motion?.tracks.find((track) => track.layerId === layerId);
  if (!track) throw new Error("Select a Motion artboard first.");
  engine.execute({
    type: "addMotionAnimation",
    trackId: track.id,
    preset: MOTION_ANIMATION_PRESETS.find((preset) => preset.id === "scale-pop")!,
    start: { value: 0, rate: 1 },
    duration: { value: 600, rate: 1000 },
  });
}
