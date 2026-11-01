import { expect, test } from "vitest";
import { createTimelapseReplay } from "../../src/animation/timelapse";
import { evaluateReplay } from "../../src/animation/evaluate";
import { recordSession } from "../../src/animation/recording";
import { setup, box } from "../support/fixture";

test("spreads every retained burst, undo and redo in order and holds the complete final state", () => {
  const { engine } = setup([box("subject", 0, 0, { fill: "#ff0000" })]);
  let time = 0;
  const recording = recordSession(engine, { now: () => time });
  time = 100000;
  engine.execute({ type: "updateLayers", ids: ["subject"], patch: { fill: "#00ff00", x: 10 } });
  engine.execute({ type: "updateLayers", ids: ["subject"], patch: { fill: "#0000ff", x: 20 } });
  engine.undo();
  engine.redo();
  engine.execute({ type: "updateLayers", ids: ["subject"], patch: { fill: "#ffffff", x: 30 } });
  const original = recording.stop(),
    replay = createTimelapseReplay(original);
  expect(original.events.map((event) => event.at)).toEqual(Array(5).fill(100000));
  expect(replay.events).toHaveLength(original.events.length);
  expect(replay.events.map((event) => event.kind)).toEqual([
    "commit",
    "commit",
    "undo",
    "redo",
    "commit",
  ]);
  const colours = ["#00ff00", "#0000ff", "#00ff00", "#0000ff", "#ffffff"];
  replay.events.forEach((event, i) => {
    expect(event.at).toBeGreaterThan(i ? replay.events[i - 1]!.at : 0);
    expect(event.delta).toBe(original.events[i]!.delta);
    expect(evaluateReplay(replay, event.at).pages[0]!.layers[0]!.fill).toBe(colours[i]);
  });
  expect(evaluateReplay(replay, replay.duration).pages).toEqual(engine.getSnapshot().project.pages);
  expect(evaluateReplay(replay, (replay.events.at(-1)!.at + replay.duration) / 2).pages).toEqual(
    engine.getSnapshot().project.pages,
  );
  expect(createTimelapseReplay(original)).toBe(replay);
  expect(replay.initial).toBe(original.initial);
  expect(replay.assets).toBe(original.assets);
});

test("zero and fractional history clocks preserve every entry and the latest discrete edit", () => {
  for (const time of [0, 123.422258426967]) {
    const { engine } = setup([box("subject")]);
    let now = 0;
    const recording = recordSession(engine, { now: () => now });
    now = time;
    engine.execute({ type: "updateLayers", ids: ["subject"], patch: { fill: "#ff0000" } });
    engine.execute({ type: "updateLayers", ids: ["subject"], patch: { fill: "#0000ff" } });
    const replay = createTimelapseReplay(recording.stop());
    expect(replay.events[0]!.at).toBeGreaterThan(0);
    expect(replay.events[1]!.at).toBeGreaterThan(replay.events[0]!.at);
    expect(replay.events[1]!.at).toBeLessThan(replay.duration);
    expect(evaluateReplay(replay, replay.duration).pages).toEqual(
      engine.getSnapshot().project.pages,
    );
    expect(evaluateReplay(replay, replay.events[0]!.at).pages[0]!.layers[0]!.fill).toBe("#ff0000");
  }
});
