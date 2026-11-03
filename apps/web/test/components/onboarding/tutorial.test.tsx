import fr from "../../../src/components/onboarding/tutorial/locales/fr.json";
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
  expect(
    engine.getSnapshot().project.pages[0]!.layers.find((layer) => layer.id === image.id)!
      .effects[0]!.type,
  ).toBe("dither");
  engine.undo();
  expect(
    engine.getSnapshot().project.pages[0]!.layers.find((layer) => layer.id === image.id)!.effects,
  ).toHaveLength(0);
  engine.redo();
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  addPop(engine, image.id);
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
  expect(screen.queryByRole("button", { name: fr.replay })).toBeNull();
  view.unmount();
  const replay = vi.fn();
  d.mount(<Preferences initialSection="editor" onReplayTutorial={replay} />);
  fireEvent.click(screen.getByRole("button", { name: fr.replay }));
  expect(replay).toHaveBeenCalledOnce();
});

test("missing practice assets and stale preparation never replace the active document", async () => {
  const d = setup();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("missing", { status: 404 }));
  await expect(createPracticeProject(d.engine, d.services)).rejects.toThrow(
    fr.errors.imageLoad.replace("{{name}}", fr.project.mountains),
  );
  expect(d.services.createProject).not.toHaveBeenCalled();
  vi.mocked(fetch).mockImplementation(async () => {
    d.engine.execute({ type: "renameProject", name: "Changed while loading" });
    return new Response(new Blob(["image"], { type: "image/jpeg" }));
  });
  await expect(createPracticeProject(d.engine, d.services)).rejects.toThrow(fr.errors.changedStart);
  expect(d.services.createProject).not.toHaveBeenCalled();
});

test("pending tutorial actions release timers on cancellation and reject a changed project", async () => {
  const { waitForTutorial } = await import("../../../src/components/onboarding/tutorial/actions");
  const d = setup();
  const context = {
    engine: d.engine,
    projectId: d.engine.getSnapshot().project.id,
    layerId: d.engine.getSnapshot().project.pages[0]!.layers[0]!.id,
  };
  vi.useFakeTimers();
  try {
    const before = vi.getTimerCount();
    const controller = new AbortController();
    const condition = vi.fn(() => false);
    const pending = waitForTutorial(context, condition, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    const calls = condition.mock.calls.length;
    vi.advanceTimersByTime(10000);
    expect(condition).toHaveBeenCalledTimes(calls);
    expect(vi.getTimerCount()).toBe(before);
    await expect(
      waitForTutorial(
        { ...context, projectId: "other" },
        () => false,
        new AbortController().signal,
      ),
    ).rejects.toThrow(fr.errors.activeProject);
    expect(vi.getTimerCount()).toBe(before);
  } finally {
    vi.useRealTimers();
  }
});

test("pending tutorial actions resolve only when the real document confirms the action", async () => {
  const { waitForTutorial } = await import("../../../src/components/onboarding/tutorial/actions");
  const d = setup();
  const snapshot = d.engine.getSnapshot();
  const context = {
    engine: d.engine,
    projectId: snapshot.project.id,
    layerId: snapshot.project.pages[0]!.layers[0]!.id,
  };
  const pending = waitForTutorial(
    context,
    () => d.engine.getSnapshot().project.name === "Ready",
    new AbortController().signal,
  );
  d.engine.execute({ type: "renameProject", name: "Ready" });
  await pending;
  expect(d.engine.getSnapshot().revision).toBe(snapshot.revision + 1);
});

test("tutorial completion follows export start without waiting for the render", async () => {
  const { stepDone } = await import("../../../src/components/onboarding/tutorial/actions");
  const { getExportJobs } = await import("../../../src/services/export/jobs");
  const d = setup();
  const snapshot = d.engine.getSnapshot();
  const context = {
    engine: d.engine,
    projectId: snapshot.project.id,
    layerId: snapshot.project.pages[0]!.layers[0]!.id,
  };
  let finish!: () => void;
  const rendering = new Promise<void>((resolve) => {
    finish = resolve;
  });
  expect(stepDone("render", context)).toBe(false);
  const jobs = getExportJobs(d.engine);
  jobs.start({ kind: "motion", projectId: context.projectId, name: "Practice" }, async () => {
    await rendering;
  });
  expect(jobs.pending).toBe(true);
  expect(stepDone("render", context)).toBe(true);
  const done = new Promise<void>((resolve) => {
    const stop = jobs.subscribe(() => {
      if (!jobs.pending) {
        stop();
        resolve();
      }
    });
  });
  finish();
  await done;
});
