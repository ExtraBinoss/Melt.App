import { expect, test, vi } from "vitest";
import { WorkspaceTransition } from "../../../src/ui/studio/transition/controller";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function harness() {
  const exit = deferred(),
    enter = deferred(),
    ready = deferred();
  const ports = {
    animate: vi.fn((direction: "exit" | "enter", _signal: AbortSignal) =>
      direction === "exit" ? exit.promise : enter.promise,
    ),
    ready: vi.fn((_signal: AbortSignal) => ready.promise),
    restore: vi.fn(),
  };
  const transition = new WorkspaceTransition("classic", ports);
  return { transition, ports, exit, enter, ready };
}

test("retains outgoing chrome, then waits for real readiness before revealing the chosen workspace", async () => {
  const d = harness(),
    notify = vi.fn();
  d.transition.subscribe(notify);
  d.transition.request("studio");
  expect(d.transition.read()).toEqual({ mode: "classic", target: "studio", phase: "exiting" });
  expect(d.ports.ready).not.toHaveBeenCalled();
  d.exit.resolve();
  await Promise.resolve();
  expect(d.transition.read()).toEqual({ mode: "studio", target: "studio", phase: "preparing" });
  expect(d.ports.ready).toHaveBeenCalledOnce();
  expect(d.ports.animate).toHaveBeenCalledTimes(1);
  d.ready.resolve();
  await Promise.resolve();
  expect(d.transition.read().phase).toBe("entering");
  d.enter.resolve();
  await Promise.resolve();
  expect(d.transition.read().phase).toBe("idle");
  expect(d.ports.restore).toHaveBeenCalledOnce();
  const changes = notify.mock.calls.length;
  d.transition.request("studio");
  expect(notify).toHaveBeenCalledTimes(changes);
});

test("a rapid reversal aborts the old exit and cannot reveal a superseded workspace", async () => {
  const d = harness();
  d.transition.request("studio");
  const superseded = d.ports.animate.mock.calls[0]![1];
  d.transition.request("classic");
  expect(superseded.aborted).toBe(true);
  d.exit.resolve();
  await Promise.resolve();
  expect(d.transition.read().mode).toBe("classic");
  expect(d.transition.read().target).toBe("classic");
  d.ready.resolve();
  await Promise.resolve();
  d.enter.resolve();
  await Promise.resolve();
  expect(d.transition.read()).toEqual({ mode: "classic", target: "classic", phase: "idle" });
});

test("late preparation and animation completions after unmount do not publish or retain control styles", async () => {
  const d = harness(),
    notify = vi.fn();
  d.transition.subscribe(notify);
  d.transition.request("studio");
  d.exit.resolve();
  await Promise.resolve();
  const pending = d.ports.ready.mock.calls[0]![0];
  const count = notify.mock.calls.length;
  d.transition.dispose();
  expect(pending.aborted).toBe(true);
  expect(d.ports.restore).toHaveBeenCalledOnce();
  d.ready.resolve();
  d.enter.resolve();
  await Promise.resolve();
  expect(notify).toHaveBeenCalledTimes(count);
  expect(d.ports.animate).toHaveBeenCalledTimes(1);
});

test("switching again during preparation cancels its readiness lifetime and only the latest mode enters", async () => {
  const exits: ReturnType<typeof deferred>[] = [],
    readiness: ReturnType<typeof deferred>[] = [];
  const ports = {
    animate: vi.fn((direction: "exit" | "enter", _signal: AbortSignal) => {
      const operation = deferred();
      if (direction === "exit") exits.push(operation);
      else operation.resolve();
      return operation.promise;
    }),
    ready: vi.fn((_signal: AbortSignal) => {
      const operation = deferred();
      readiness.push(operation);
      return operation.promise;
    }),
    restore: vi.fn(),
  };
  const transition = new WorkspaceTransition("classic", ports);
  transition.request("studio");
  exits[0]!.resolve();
  await Promise.resolve();
  const oldReadiness = ports.ready.mock.calls[0]![0];
  transition.request("classic");
  expect(oldReadiness.aborted).toBe(true);
  readiness[0]!.resolve();
  exits[1]!.resolve();
  await Promise.resolve();
  expect(transition.read()).toEqual({ mode: "classic", target: "classic", phase: "preparing" });
  readiness[1]!.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(transition.read()).toEqual({ mode: "classic", target: "classic", phase: "idle" });
  expect(ports.animate.mock.calls.filter(([direction]) => direction === "enter")).toHaveLength(1);
});
