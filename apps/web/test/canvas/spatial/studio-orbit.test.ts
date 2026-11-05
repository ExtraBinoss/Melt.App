import { expect, test, vi } from "vitest";
import { PerspectiveCamera } from "three/webgpu";
import { StudioOrbit, type OrbitClock } from "../../../src/canvas/spatial/StudioOrbit";

function fixture(reduced = false) {
  const element = document.createElement("div");
  element.style.touchAction = "pan-y";
  document.body.append(element);
  Object.defineProperties(element, { clientWidth: { value: 1600 }, clientHeight: { value: 1000 } });
  const camera = new PerspectiveCamera(35, 1.6);
  camera.position.set(0, 0, 5);
  let now = 0,
    next = 0,
    current = false;
  const frames = new Map<number, (time: number) => void>();
  const timing: OrbitClock = {
    now: () => now,
    request: (cb) => {
      frames.set(++next, cb);
      return next;
    },
    cancel: (id) => {
      frames.delete(id);
    },
  };
  const callbacks = {
    begin: vi.fn(() => {
      current = true;
    }),
    preview: vi.fn(),
    commit: vi.fn(() => {
      current = false;
    }),
    cancel: vi.fn(() => {
      current = false;
    }),
    current: () => current,
    reducedMotion: () => reduced,
  };
  const orbit = new StudioOrbit(camera, element, callbacks, timing);
  orbit.enabled = true;
  const pointer = (type: string, x: number) => {
    now += 16;
    (type === "pointerdown" ? element : document).dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        pointerId: 1,
        pointerType: "mouse",
        clientX: x,
        clientY: 300,
      }),
    );
  };
  const step = () => {
    now += 16;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((cb) => cb(now));
  };
  const settle = () => {
    for (let i = 0; i < 120 && frames.size; i++) step();
    expect(frames.size).toBe(0);
  };
  const drag = () => {
    pointer("pointerdown", 300);
    for (let i = 1; i <= 8; i++) pointer("pointermove", 300 + i * 12);
    pointer("pointerup", 396);
  };
  return {
    orbit,
    camera,
    callbacks,
    frames,
    step,
    settle,
    drag,
    dispose: () => {
      orbit.dispose();
      element.remove();
    },
    element,
  };
}
test("native drag continues after release, commits once at rest and reuses controls after cancellation", () => {
  const f = fixture();
  f.drag();
  expect(f.orbit.coasting).toBe(true);
  expect(f.callbacks.commit).not.toHaveBeenCalled();
  const released = f.camera.position.clone();
  f.step();
  expect(f.camera.position.distanceTo(released)).toBeGreaterThan(0.001);
  f.settle();
  expect(f.callbacks.commit).toHaveBeenCalledOnce();
  f.drag();
  f.orbit.cancel();
  expect(f.frames.size).toBe(0);
  f.orbit.enabled = true;
  f.drag();
  f.settle();
  expect(f.callbacks.commit).toHaveBeenCalledTimes(2);
  f.dispose();
  expect(f.element.style.touchAction).toBe("pan-y");
});
test("wheel burst eases one bounded camera zoom, with cancellation and reduced motion", () => {
  const f = fixture();
  f.orbit.zoomBy(1.2);
  f.orbit.zoomBy(1.2);
  expect(f.camera.position.length()).toBe(5);
  f.step();
  expect(f.camera.position.length()).toBeLessThan(5);
  f.settle();
  expect(f.camera.position.length()).toBeCloseTo(5 / 1.44, 4);
  expect(f.callbacks.commit).toHaveBeenCalledOnce();
  f.orbit.zoomBy(1000);
  f.settle();
  expect(f.camera.position.length()).toBeCloseTo(0.2);
  f.orbit.zoomBy(0.5);
  f.orbit.cancel();
  expect(f.frames.size).toBe(0);
  f.dispose();
  const r = fixture(true);
  r.drag();
  expect(r.orbit.coasting).toBe(false);
  expect(r.callbacks.commit).toHaveBeenCalledOnce();
  r.dispose();
});

test("a held mobile pinch remains one preview even when the fingers pause", () => {
  const f = fixture();
  f.orbit.beginZoom();
  f.orbit.zoomBy(1.5);
  f.settle();
  expect(f.callbacks.commit).not.toHaveBeenCalled();
  f.orbit.zoomBy(1.1);
  f.settle();
  expect(f.callbacks.commit).not.toHaveBeenCalled();
  f.orbit.endZoom();
  f.settle();
  expect(f.callbacks.commit).toHaveBeenCalledOnce();
  expect(f.camera.position.length()).toBeCloseTo(5 / 1.65, 4);
  f.dispose();
});

test("rapid wheel targets stay close to the presented pose and reverse immediately", () => {
  const f = fixture();
  try {
    for (let i = 0; i < 100; i++) f.orbit.zoomWheel(1.2);
    expect(f.frames.size).toBe(1);
    expect(f.callbacks.preview).not.toHaveBeenCalled();
    f.step();
    expect(f.camera.position.length()).toBeGreaterThanOrEqual(5 / 1.18);
    const presented = f.camera.position.length();
    f.orbit.zoomWheel(0.9);
    f.step();
    expect(f.camera.position.length()).toBeGreaterThan(presented);
    f.settle();
    expect(f.callbacks.commit).toHaveBeenCalledOnce();
    expect(f.frames.size).toBe(0);
    f.orbit.zoomWheel(1.2);
    f.orbit.cancel();
    expect(f.frames.size).toBe(0);
  } finally {
    f.dispose();
  }
  const reduced = fixture(true);
  try {
    reduced.orbit.zoomWheel(2);
    expect(reduced.camera.position.length()).toBeCloseTo(2.5);
    reduced.settle();
    expect(reduced.callbacks.commit).toHaveBeenCalledOnce();
  } finally {
    reduced.dispose();
  }
});

test("native pointer packets publish at most one drag preview per frame and release keeps the final pose", () => {
  const f = fixture();
  try {
    f.drag();
    // Eight native changes before a RAF still publish the final release pose once.
    expect(f.callbacks.preview).toHaveBeenCalledOnce();
    expect(f.frames.size).toBe(1);
    f.orbit.cancel();
    expect(f.frames.size).toBe(0);
  } finally {
    f.dispose();
  }
});
