import { afterEach, expect, test, vi } from "vitest";
import { bindSelectSizing } from "../../../../src/components/ui/select/sizing";
afterEach(() => vi.unstubAllGlobals());
test("tracks a moving dialog only during its entrance and retires sizing work on close", async () => {
  const pending = new Map<number, FrameRequestCallback>();
  let sequence = 0,
    width = 200,
    left = 80;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    pending.set(++sequence, callback);
    return sequence;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    pending.delete(id);
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const dialog = document.createElement("div");
  dialog.dataset.slot = "dialog-content";
  const animation = { playState: "running" };
  dialog.getAnimations = () => [animation as unknown as Animation];
  const trigger = document.createElement("button");
  dialog.append(trigger);
  trigger.getBoundingClientRect = () => ({ width, left }) as DOMRect;
  const wrapper = document.createElement("div"),
    content = document.createElement("div");
  wrapper.append(content);
  document.body.append(dialog, wrapper);
  const cleanup = bindSelectSizing(trigger, content, "item-aligned");
  expect(content.style.getPropertyValue("--select-trigger-width")).toBe("200px");
  const paint = () => {
    const [id, callback] = pending.entries().next().value!;
    pending.delete(id);
    callback(performance.now());
  };
  width = 230;
  left = 96;
  paint();
  expect(wrapper.style.width).toBe("230px");
  expect(wrapper.style.left).toBe("96px");
  width = 240;
  left = 100;
  animation.playState = "finished";
  paint();
  expect(wrapper.style.width).toBe("240px");
  expect(pending.size).toBe(0);
  wrapper.style.width = "260px";
  wrapper.style.left = "120px";
  await Promise.resolve();
  expect(wrapper.style.width).toBe("240px");
  expect(wrapper.style.left).toBe("100px");
  expect(pending.size).toBe(0);
  window.dispatchEvent(new Event("resize"));
  expect(pending.size).toBe(1);
  cleanup();
  expect(pending.size).toBe(0);
  window.dispatchEvent(new Event("resize"));
  expect(pending.size).toBe(0);
  dialog.remove();
  wrapper.remove();
});
