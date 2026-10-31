import { expect, it, vi } from "vitest";
import { createPage } from "@musart/core";
import { GpuCompositor } from "../../src/compositing/GpuCompositor";
import { makeGpuRenderer } from "../gpu-fixture";

it("keeps the displayed texture intact and publishes its successor only after GPU acknowledgement", async () => {
  const { renderer, fake } = makeGpuRenderer();
  const graph = new GpuCompositor(renderer);
  const first = await graph.render(
    createPage({ id: "page", width: 32, height: 32, background: "#ff0000" }),
    {},
  );
  let acknowledge!: () => void;
  fake.backend.device.queue.onSubmittedWorkDone.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        acknowledge = resolve;
      }),
  );
  let published = false;
  const next = graph
    .render(
      createPage({ id: "page", width: 32, height: 32, background: "#00ff00" }),
      {},
      { mediaMode: "playback" },
    )
    .then((frame) => {
      published = true;
      return frame;
    });
  await vi.waitFor(() => expect(acknowledge).toBeTypeOf("function"));
  expect(published).toBe(false);
  const targets = fake.setRenderTarget.mock.calls.flatMap(([target]) =>
    target ? [target.texture] : [],
  );
  expect(targets.at(-1)).not.toBe(first.texture);
  acknowledge();
  const second = await next;
  expect(second.texture).not.toBe(first.texture);
  const third = await graph.render(
    createPage({ id: "page", width: 32, height: 32, background: "#0000ff" }),
    {},
  );
  expect(third.texture).toBe(first.texture);
  await graph.dispose();
});

it("a canceled pending publication never replaces the last accepted output", async () => {
  const { renderer, fake } = makeGpuRenderer();
  const graph = new GpuCompositor(renderer);
  const first = await graph.render(
    createPage({ id: "page", width: 16, height: 16, background: "#ff0000" }),
    {},
  );
  let acknowledge!: () => void;
  fake.backend.device.queue.onSubmittedWorkDone.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        acknowledge = resolve;
      }),
  );
  const abort = new AbortController();
  const pending = graph.render(
    createPage({ id: "page", width: 16, height: 16, background: "#00ff00" }),
    {},
    { mediaMode: "playback", signal: abort.signal },
  );
  await vi.waitFor(() => expect(acknowledge).toBeTypeOf("function"));
  abort.abort();
  acknowledge();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  const recovered = await graph.render(
    createPage({ id: "page", width: 16, height: 16, background: "#0000ff" }),
    {},
  );
  expect(recovered.texture).not.toBe(first.texture);
  await graph.dispose();
});
