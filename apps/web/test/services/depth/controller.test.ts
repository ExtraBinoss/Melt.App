import { expect, it, vi } from "vitest";
import { createEffect, createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import {
  DepthPreparationController,
  depthPreparationFor,
} from "../../../src/services/depth/controller";
import { LocalModelManager } from "../../../src/services/selection/model/manager";
import type { DepthClient } from "../../../src/services/depth/client";
const { generate } = vi.hoisted(() => ({ generate: vi.fn(async () => {}) }));
vi.mock("../../../src/services/depth/service", () => ({
  canPrepareDepth: () => true,
  generateEffectDepth: generate,
}));
function fixture() {
  const engine = new EditorEngine(
    createProject({
      assets: {
        photo: {
          id: "photo",
          mime: "image/png",
          name: "Photo",
          width: 2,
          height: 2,
          dataUrl: "data:image/png;base64,AA==",
        },
      },
      pages: [createPage({ layers: [createLayer("image", { id: "subject", assetId: "photo" })] })],
    }),
  );
  const prepare = vi.fn(async () => {}),
    cancel = vi.fn();
  const client = {
    model: new LocalModelManager({ prepare, cancel }),
    cancel,
    dispose: vi.fn(),
  } as unknown as DepthClient;
  const port = new DepthPreparationController(engine, client);
  return { engine, port, prepare, client };
}
it("opens immediately for an added effect, waits for presentation, then downloads and generates in one job", async () => {
  generate.mockClear();
  const { engine, port, prepare } = fixture();
  const release = port.retainPresentation();
  try {
    engine.execute({
      type: "updateLayers",
      ids: ["subject"],
      patch: { effects: [createEffect("depth-anything")] },
    });
    expect(depthPreparationFor(engine)).toBe(port);
    expect(port.read()).toMatchObject({
      layerId: "subject",
      busy: true,
      thumbnail: "data:image/png;base64,AA==",
    });
    expect(prepare).not.toHaveBeenCalled();
    port.presented("subject");
    await vi.waitFor(() => expect(port.read()).toMatchObject({ busy: false, completed: true }));
    expect(prepare).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledOnce();
  } finally {
    release();
    port.dispose();
  }
  expect(depthPreparationFor(engine)).toBeUndefined();
});
it("cancels before download when a pending owner is removed", async () => {
  generate.mockClear();
  const { engine, port, prepare } = fixture();
  const release = port.retainPresentation();
  engine.execute({
    type: "updateLayers",
    ids: ["subject"],
    patch: { effects: [createEffect("depth-anything")] },
  });
  engine.execute({ type: "deleteLayers", ids: ["subject"] });
  await Promise.resolve();
  expect(port.read()).toBeNull();
  expect(prepare).not.toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
  release();
  port.dispose();
});
