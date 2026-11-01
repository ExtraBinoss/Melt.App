import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import {
  addDither,
  addPop,
  createPracticeProject,
} from "../../../src/components/onboarding/tutorial/project";
import { Preferences } from "../../../src/components/projects/preferences/Preferences";
import { setup } from "../../support/ui";

test("tutorial helpers use real undoable document commands and sparse Pop controls", () => {
  const { engine } = setup();
  const page = engine.getSnapshot().project.pages[0]!;
  const image = page.layers.find((layer) => layer.kind === "image")!;
  addDither(engine, image.id);
  addDither(engine, image.id);
  expect(
    engine.getSnapshot().project.pages[0]!.layers.find((layer) => layer.id === image.id)!.effects,
  ).toHaveLength(1);
  engine.undo();
  expect(
    engine.getSnapshot().project.pages[0]!.layers.find((layer) => layer.id === image.id)!.effects,
  ).toHaveLength(0);
  engine.redo();
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  addPop(engine, image.id);
  const track = engine
    .getSnapshot()
    .project.pages[0]!.motion!.tracks.find((track) => track.layerId === image.id)!;
  expect(track.animations).toHaveLength(1);
  expect(track.animations![0]!.preset.id).toBe("scale-pop");
  expect(track.animations![0]!.preset.channels.every((channel) => channel.points.length <= 3)).toBe(
    true,
  );
  engine.undo();
  expect(
    engine
      .getSnapshot()
      .project.pages[0]!.motion!.tracks.find((track) => track.layerId === image.id)!.animations ??
      [],
  ).toHaveLength(0);
});

test("replay is available only with an editor callback", () => {
  const d = setup();
  const view = d.mount(<Preferences initialSection="editor" />);
  expect(screen.queryByRole("button", { name: "Replay onboarding" })).toBeNull();
  view.unmount();
  const replay = vi.fn();
  d.mount(<Preferences initialSection="editor" onReplayTutorial={replay} />);
  fireEvent.click(screen.getByRole("button", { name: "Replay onboarding" }));
  expect(replay).toHaveBeenCalledOnce();
});

test("missing practice assets and stale preparation never replace the active document", async () => {
  const d = setup();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("missing", { status: 404 }));
  await expect(createPracticeProject(d.engine, d.services)).rejects.toThrow(
    "Could not load tutorial image",
  );
  expect(d.services.createProject).not.toHaveBeenCalled();
  vi.mocked(fetch).mockImplementation(async () => {
    d.engine.execute({ type: "renameProject", name: "Changed while loading" });
    return new Response(new Blob(["image"], { type: "image/jpeg" }));
  });
  await expect(createPracticeProject(d.engine, d.services)).rejects.toThrow(
    "The active project changed",
  );
  expect(d.services.createProject).not.toHaveBeenCalled();
});
