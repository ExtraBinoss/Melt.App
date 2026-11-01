import { expect, it } from "vitest";
import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  type HistoryDescription,
} from "@musart/core";
import { i18n } from "../../../../src/state/i18n";
import { formatHistoryDescription } from "../../../../src/components/notifications/history/presentation";
import "../../../../src/components/notifications/history/messages";

it.each([
  ["en", "Clip · End 5s", "Clip · End 2s"],
  ["fr", "Clip · Fin 5s", "Clip · Fin 2s"],
])("%s trim notices retain effective bounds through undo and redo", (locale, undo, redo) => {
  const page = createPage({
    id: "page",
    layers: [createLayer("rectangle", { id: "shape" })],
    motion: {
      version: 2,
      mode: "motion",
      initialized: true,
      duration: { value: 5, rate: 1 },
      frameRate: { numerator: 30, denominator: 1 },
      tracks: [
        { id: "clip", layerId: "shape", start: { value: 0, rate: 1 }, end: null, properties: [] },
      ],
    },
  });
  const engine = new EditorEngine(createProject({ pages: [page] }));
  let description: HistoryDescription | undefined;
  const unsubscribe = engine.subscribeCommitInfo((event) => {
    description = event.history;
  });
  const t = i18n.getFixedT(locale);
  engine.execute({
    type: "setMotionTrackRange",
    trackId: "clip",
    start: { value: 0, rate: 1 },
    end: { value: 2, rate: 1 },
  });
  engine.undo();
  expect(engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.end).toBeNull();
  expect(formatHistoryDescription(description, "undo", t)).toBe(undo);
  engine.redo();
  expect(formatHistoryDescription(description, "redo", t)).toBe(redo);
  unsubscribe();
});
