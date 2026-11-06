import { expect, it, vi } from "vitest";
import { createEffect, createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { generateEffectDepth } from "../../../src/services/depth/service";
import type { DepthClient } from "../../../src/services/depth/client";
function setup() {
  const effect = createEffect("depth-anything", { id: "fx" });
  const layer = createLayer("image", { id: "image", assetId: "photo", effects: [effect] });
  const engine = new EditorEngine(
    createProject({
      assets: {
        photo: {
          id: "photo",
          name: "Photo",
          mime: "image/png",
          width: 2,
          height: 2,
          dataUrl: "data:image/png;base64,AA==",
        },
      },
      pages: [createPage({ layers: [layer] })],
    }),
  );
  return { engine, effect };
}
it("admits a depth original and reference as one undo/redo step", async () => {
  const { engine } = setup();
  const effect = engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!;
  const client = {
    generate: vi.fn(async () => ({
      blob: new Blob(["depth"], { type: "image/png" }),
      width: 2,
      height: 2,
    })),
    cancel: vi.fn(),
  } as unknown as DepthClient;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(
    async () => new Response(new Blob(["source"])),
  ) as unknown as typeof fetch;
  try {
    await generateEffectDepth(
      engine,
      "image",
      effect,
      client,
      new AbortController().signal,
      () => {},
    );
    expect(Object.keys(engine.getSnapshot().project.assets)).toHaveLength(2);
    const id = engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.inputs?.depth;
    expect(id).toBeTruthy();
    engine.undo();
    expect(Object.keys(engine.getSnapshot().project.assets)).toEqual(["photo"]);
    engine.redo();
    expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.inputs?.depth).toBe(id);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
it("rejects stale asynchronous results without reviving a deleted layer", async () => {
  const { engine } = setup();
  const effect = engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!;
  const client = {
    generate: vi.fn(async () => {
      engine.execute({ type: "deleteLayers", ids: ["image"] });
      return { blob: new Blob(["depth"]), width: 2, height: 2 };
    }),
    cancel: vi.fn(),
  } as unknown as DepthClient;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn(
    async () => new Response(new Blob(["source"])),
  ) as unknown as typeof fetch;
  try {
    await expect(
      generateEffectDepth(engine, "image", effect, client, new AbortController().signal, () => {}),
    ).rejects.toThrow("target changed");
    expect(engine.getSnapshot().project.pages[0]!.layers).toHaveLength(0);
    expect(Object.keys(engine.getSnapshot().project.assets)).toEqual(["photo"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
