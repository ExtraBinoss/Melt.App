import { afterEach, expect, test, vi } from "vitest";
import { createProject, EditorEngine } from "@musart/core";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});
test("development reports bounded main-thread totals and disconnects its observer on completion", async () => {
  vi.stubEnv("DEV", true);
  vi.resetModules();
  const log = consoleSpies();
  let callback!: PerformanceObserverCallback;
  const disconnect = vi.fn(),
    observe = vi.fn();
  const entry = (startTime: number, duration: number) =>
    ({ startTime, duration }) as PerformanceEntry;
  vi.stubGlobal(
    "PerformanceObserver",
    class {
      static supportedEntryTypes = ["longtask"];
      constructor(receive: PerformanceObserverCallback) {
        callback = receive;
      }
      observe = observe;
      disconnect = disconnect;
      takeRecords() {
        return [entry(200, 55)];
      }
    },
  );
  vi.spyOn(performance, "now").mockReturnValue(100);
  const { beginProjectTiming } = await import("../../../src/services/performance/project-timing");
  const timing = beginProjectTiming("Open project")!;
  callback(
    { getEntries: () => [entry(80, 90), entry(110, 80)] } as PerformanceObserverEntryList,
    {} as PerformanceObserver,
  );
  timing.finish("published");
  timing.finish("failed");
  expect(observe).toHaveBeenCalledExactlyOnceWith({ type: "longtask" });
  expect(disconnect).toHaveBeenCalledOnce();
  expect(log.info).toHaveBeenCalledWith(
    expect.objectContaining({ mainThread: { longTasks: 2, totalMs: 135, maxMs: 80 } }),
  );
});
function consoleSpies() {
  return {
    info: vi.spyOn(console, "info").mockImplementation(() => {}),
    group: vi.spyOn(console, "groupCollapsed").mockImplementation(() => {}),
    table: vi.spyOn(console, "table").mockImplementation(() => {}),
    end: vi.spyOn(console, "groupEnd").mockImplementation(() => {}),
  };
}
test("development logs stage milliseconds and waits for the correct visible project frame", async () => {
  vi.stubEnv("DEV", true);
  vi.resetModules();
  const log = consoleSpies();
  let clock = 100;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  const { beginProjectTiming, reportProjectPresentation } =
    await import("../../../src/services/performance/project-timing");
  const timing = beginProjectTiming("Open project")!;
  clock = 150;
  timing.stage("Read");
  clock = 250;
  const snapshot = new EditorEngine(createProject()).getSnapshot();
  timing.waitForFrame(snapshot);
  expect(timing.waitingForFrame).toBe(true);
  reportProjectPresentation({ projectId: "other", revision: snapshot.revision }, snapshot.pageId);
  expect(log.group).not.toHaveBeenCalled();
  clock = 400;
  reportProjectPresentation(
    { projectId: snapshot.project.id, revision: snapshot.revision },
    snapshot.pageId,
  );
  expect(log.group).toHaveBeenCalledWith(expect.stringContaining("300 ms (ready)"));
  expect(log.table).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ stage: "First visible canvas frame", ms: 150 }),
    ]),
  );
  timing.finish("failed");
  expect(log.group).toHaveBeenCalledOnce();
});
test("production does not log, read clocks or retain presentation waits", async () => {
  vi.stubEnv("DEV", false);
  vi.resetModules();
  const log = consoleSpies();
  const now = vi.spyOn(performance, "now");
  const { beginProjectTiming, reportProjectPresentation } =
    await import("../../../src/services/performance/project-timing");
  expect(beginProjectTiming("Open project")).toBeUndefined();
  reportProjectPresentation({ projectId: "p", revision: 1 }, "page");
  expect(now).not.toHaveBeenCalled();
  expect(log.info).not.toHaveBeenCalled();
  expect(log.group).not.toHaveBeenCalled();
});
test("superseded navigation and real render failures close each development trace once", async () => {
  vi.stubEnv("DEV", true);
  vi.resetModules();
  const log = consoleSpies();
  const { beginProjectTiming, reportProjectRenderFailure } =
    await import("../../../src/services/performance/project-timing");
  const snapshot = new EditorEngine(createProject()).getSnapshot();
  beginProjectTiming("First")!.waitForFrame(snapshot);
  const next = beginProjectTiming("Second")!;
  next.waitForFrame(snapshot);
  expect(log.group).toHaveBeenCalledWith(expect.stringContaining("superseded"));
  reportProjectRenderFailure(
    { projectId: snapshot.project.id, revision: snapshot.revision },
    snapshot.pageId,
    Error("GPU failed"),
  );
  expect(log.group).toHaveBeenCalledTimes(2);
  expect(log.info).toHaveBeenCalledWith(
    expect.objectContaining({ status: "failed", error: "GPU failed" }),
  );
});
