import { afterEach, beforeEach, expect, test, vi } from "vitest";
vi.mock("../../../src/services/selection/model/manifest", () => ({
  MODEL_CACHE: "test-model-cache",
  MODEL_FILES: { "encoder.ort": 3 },
  MODEL_HASHES: {
    "encoder.ort": "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
  },
  modelUrl: (file: string) => `https://model.test/${file}`,
}));
const put = vi.fn(),
  match = vi.fn(),
  remove = vi.fn(),
  fetcher = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("caches", { open: vi.fn(async () => ({ put, match, delete: remove })) });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());
test("verifies exact download bytes/hash, awaits persistence and reuses verified cache", async () => {
  fetcher.mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
  const progress = vi.fn();
  const { downloadModelFile } = await import("../../../src/services/selection/websam/download");
  expect(Array.from(await downloadModelFile("encoder.ort", progress))).toEqual([1, 2, 3]);
  expect(put).toHaveBeenCalledOnce();
  expect(progress).toHaveBeenLastCalledWith({ file: "encoder.ort", status: "done" });
  match.mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
  await downloadModelFile("encoder.ort", progress);
  expect(fetcher).toHaveBeenCalledOnce();
});
test("evicts corrupted cache and rejects truncated, oversized and invalid-checksum downloads", async () => {
  const { downloadModelFile } = await import("../../../src/services/selection/websam/download");
  match.mockResolvedValueOnce(new Response(new Uint8Array([1])));
  fetcher.mockResolvedValueOnce(new Response(new Uint8Array([1, 2])));
  await expect(downloadModelFile("encoder.ort")).rejects.toThrow("Incomplete");
  expect(remove).toHaveBeenCalledOnce();
  fetcher.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3, 4])));
  await expect(downloadModelFile("encoder.ort")).rejects.toThrow("exceeds");
  fetcher.mockResolvedValueOnce(new Response(new Uint8Array([3, 2, 1])));
  await expect(downloadModelFile("encoder.ort")).rejects.toThrow("checksum");
  expect(put).not.toHaveBeenCalled();
});
