import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { createEffect, type ImageAsset } from "@musart/core";
import { EffectImageInputs } from "../../../../src/components/properties/effects/inputs/EffectImageInputs";
import { setup } from "../../../support/ui";

const storage = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  importFile: vi.fn(),
  remove: vi.fn(),
  dispose: vi.fn(),
  load: vi.fn(),
}));
vi.mock("../../../../src/services/textures/store", () => ({
  TextureStore: class {
    constructor() {
      storage.create();
    }
    list = storage.list;
    get = storage.get;
    import = storage.importFile;
    delete = storage.remove;
    dispose = storage.dispose;
  },
}));
vi.mock("../../../../src/services/textures/library", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  loadBuiltinTexture: storage.load,
}));

const asset: ImageAsset = {
  id: "chosen-texture",
  name: "Chosen texture",
  mime: "image/png",
  width: 1,
  height: 1,
  dataUrl: "data:image/png;base64,iVBORw0KGgo=",
};
beforeEach(() => {
  vi.clearAllMocks();
  storage.list.mockResolvedValue([]);
  storage.load.mockResolvedValue(asset);
});
function fixture() {
  const d = setup();
  d.engine.execute({
    type: "updateLayers",
    ids: [d.rectangle.id],
    patch: { effects: [createEffect("displace")] },
  });
  d.engine.load(d.engine.getSnapshot().project);
  const effect = d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!;
  const node = (disabled = false) => (
    <EffectImageInputs
      engine={d.engine}
      layerId={d.rectangle.id}
      effect={effect}
      disabled={disabled}
    />
  );
  const view = d.mount(node());
  return { ...d, view, node, effect };
}
async function open() {
  fireEvent.click(screen.getByRole("button", { name: /Carte de déplacement/ }));
  return screen.findByRole("button", { name: "Pierre" });
}
function deferredAsset() {
  let resolve!: (value: ImageAsset) => void;
  const promise = new Promise<ImageAsset>((done) => {
    resolve = done;
  });
  storage.load.mockReturnValueOnce(promise);
  return resolve;
}

test("closed inputs allocate no store or tiles; a current assignment and original undo together", async () => {
  const d = fixture();
  expect(storage.create).not.toHaveBeenCalled();
  expect(document.querySelector(".texture-picker-tile")).toBeNull();
  const before = d.engine.getSnapshot();
  fireEvent.click(await open());
  await waitFor(() => expect(document.querySelector(".texture-picker")).toBeNull());
  const next = d.engine.getSnapshot();
  expect(next.project.assets[asset.id]).toEqual(asset);
  expect(next.project.pages[0]!.layers[0]!.effects[0]!.inputs?.map).toBe(asset.id);
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toBe(before.project);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  d.view.unmount();
  expect(storage.dispose).toHaveBeenCalledOnce();
});

test("same-ID loads retire an opening and abort a pending texture before it can assign", async () => {
  const d = fixture(),
    resolve = deferredAsset();
  fireEvent.click(await open());
  const signal = storage.load.mock.calls[0]![1] as AbortSignal;
  act(() => d.engine.load(d.engine.getSnapshot().project));
  const replacement = d.engine.getSnapshot();
  expect(signal.aborted).toBe(true);
  expect(document.querySelector(".texture-picker-tile")).toBeNull();
  await act(async () => resolve(asset));
  expect(d.engine.getSnapshot()).toBe(replacement);
  expect(replacement.project.assets[asset.id]).toBeUndefined();
});

test.each(["disabled", "selection", "locked"] as const)(
  "%s changes close the opening and refuse its pending assignment",
  async (change) => {
    const d = fixture(),
      resolve = deferredAsset();
    fireEvent.click(await open());
    const signal = storage.load.mock.calls[0]![1] as AbortSignal;
    act(() => {
      if (change === "disabled") d.view.rerender(d.node(true));
      else if (change === "selection") d.engine.select([d.text.id]);
      else
        d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { locked: true } });
    });
    const before = d.engine.getSnapshot();
    expect(signal.aborted).toBe(true);
    expect(document.querySelector(".texture-picker-tile")).toBeNull();
    await act(async () => resolve(asset));
    expect(d.engine.getSnapshot()).toBe(before);
    expect(storage.load).toHaveBeenCalledOnce();
  },
);

test("closing aborts imports and ignores their late results", async () => {
  const d = fixture();
  let resolve!: (header: { id: string }) => void;
  storage.importFile.mockReturnValueOnce(new Promise((done) => (resolve = done)));
  await open();
  const input = document.querySelector<HTMLInputElement>('.texture-picker input[type="file"]')!;
  fireEvent.change(input, {
    target: { files: [new File(["image"], "texture.png", { type: "image/png" })] },
  });
  const signal = storage.importFile.mock.calls[0]![1] as AbortSignal;
  fireEvent.click(screen.getByRole("button", { name: /Carte de déplacement/ }));
  const before = d.engine.getSnapshot();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ id: asset.id }));
  expect(storage.get).not.toHaveBeenCalled();
  expect(d.engine.getSnapshot()).toBe(before);
});

test("background metadata retains the open catalog and admits a new current choice", async () => {
  const d = fixture();
  const tile = await open();
  act(() => d.engine.execute({ type: "updatePage", patch: { background: "#123456" } }));
  expect(tile.isConnected).toBe(true);
  fireEvent.click(tile);
  await waitFor(() => expect(d.engine.getSnapshot().project.assets[asset.id]).toEqual(asset));
  expect(d.engine.getSnapshot().project.pages[0]!.background).toBe("#123456");
});
