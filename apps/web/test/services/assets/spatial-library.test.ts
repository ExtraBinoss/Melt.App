import { expect, test, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import { SpatialLibraryModels } from "../../../src/services/assets/spatial-library";
import type { SpatialModelDefinition } from "@musart/assets";
vi.mock("../../../src/services/assets/imports", () => ({
  readDataUrl: async () => "data:model/gltf-binary;base64,dGVzdA==",
}));
function fixture(id = "rockA", bytes = new Uint8Array([1, 2, 3])) {
  return {
    id,
    file: `spatial/models/${id}.glb`,
    byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  } as SpatialModelDefinition;
}
test("lazy originals validate exact bytes and hashes; bounded LRU never fetches a cached model", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
  const store = new SpatialLibraryModels(fetcher),
    signal = new AbortController().signal;
  try {
    const original = await store.load(fixture(), signal);
    expect(await store.load(fixture(), signal)).toBe(original);
    expect(fetcher).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 8; i++) await store.load(fixture(`model${i}`), signal);
    await store.load(fixture(), signal);
    expect(fetcher).toHaveBeenCalledTimes(10);
    store.clear();
    await store.load(fixture(), signal);
    expect(fetcher).toHaveBeenCalledTimes(11);
  } finally {
    store.clear();
    vi.unstubAllGlobals();
  }
});
test("failed integrity, oversized streams and cancelled results cannot populate the model cache", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 4])));
  const store = new SpatialLibraryModels(fetcher),
    controller = new AbortController();
  try {
    await expect(store.load(fixture(), controller.signal)).rejects.toThrow("integrity");
    fetcher.mockImplementationOnce(async () => new Response(new Uint8Array([1, 2, 3, 4])));
    await expect(store.load(fixture(), controller.signal)).rejects.toThrow("byte budget");
    fetcher.mockImplementationOnce(async () => {
      controller.abort();
      return new Response(new Uint8Array([1, 2, 3]));
    });
    await expect(store.load(fixture(), controller.signal)).rejects.toThrow();
    fetcher.mockImplementationOnce(async () => new Response(new Uint8Array([1, 2, 3])));
    await store.load(fixture(), new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(4);
  } finally {
    store.clear();
    vi.unstubAllGlobals();
  }
});
