import { expect, test, vi } from "vitest";
import {
  signalMascotReady,
  waitForHeroMascot,
} from "../../../../src/components/projects/landing/hero/choreography";

test("a prepared title waits for its own mascot surface, then releases readiness listeners", async () => {
  const owner = document.createElement("div");
  owner.className = "landing-title-block";
  owner.innerHTML = '<div class="hero-mascot-stage"></div><div class="hero-type-stage"></div>';
  const mascot = owner.firstElementChild as HTMLElement;
  const stage = owner.lastElementChild as HTMLElement;
  const controller = new AbortController();
  const remove = vi.spyOn(owner, "removeEventListener");
  let started = false;
  const ready = waitForHeroMascot(stage, controller.signal).then(() => {
    started = true;
  });
  await Promise.resolve();
  expect(started).toBe(false);
  signalMascotReady(mascot);
  await ready;
  expect(started).toBe(true);
  expect(remove).toHaveBeenCalledWith("melt:mascot-ready", expect.any(Function));
  await expect(waitForHeroMascot(stage, controller.signal)).resolves.toBeUndefined();
});

test("disposal aborts a pending mascot handshake and standalone headings never wait", async () => {
  const owner = document.createElement("div");
  owner.className = "landing-title-block";
  owner.innerHTML = '<div class="hero-mascot-stage"></div><div class="hero-type-stage"></div>';
  const controller = new AbortController();
  const remove = vi.spyOn(owner, "removeEventListener");
  const ready = waitForHeroMascot(owner.lastElementChild as HTMLElement, controller.signal);
  controller.abort();
  await expect(ready).rejects.toThrow();
  expect(remove).toHaveBeenCalledWith("melt:mascot-ready", expect.any(Function));
  await expect(
    waitForHeroMascot(document.createElement("div"), new AbortController().signal),
  ).resolves.toBeUndefined();
});
