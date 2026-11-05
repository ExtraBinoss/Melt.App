import { afterEach, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import {
  loadPackPosters,
  PACK_POSTERS,
  packPosterStyle,
} from "../../../src/services/assets/studio/posters";

afterEach(() => vi.unstubAllGlobals());
test("one verified atlas serves all474 identities offline without fetching model originals", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const bytes = new Uint8Array(readFileSync(`apps/web/public/${PACK_POSTERS.file}`));
  const entries = new Map<string, Response>();
  const key = (request: RequestInfo | URL) =>
    typeof request === "string" ? request : request instanceof URL ? request.href : request.url;
  const cache = {
    match: async (request: RequestInfo | URL) => entries.get(key(request))?.clone(),
    put: async (request: RequestInfo | URL, response: Response) => {
      entries.set(key(request), response.clone());
    },
    delete: async (request: RequestInfo | URL) => entries.delete(key(request)),
    keys: async () => [...entries.keys()].map((url) => new Request(url)),
  };
  const storage = { open: async () => cache } as unknown as CacheStorage;
  const fetcher = vi.fn(async () => new Response(bytes));
  const signal = new AbortController().signal;
  expect((await loadPackPosters(signal, storage, fetcher)).size).toBe(PACK_POSTERS.byteLength);
  expect(fetcher).toHaveBeenCalledOnce();
  fetcher.mockRejectedValue(new Error("Offline"));
  expect((await loadPackPosters(signal, storage, fetcher)).size).toBe(PACK_POSTERS.byteLength);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(entries.size).toBe(1);
  const cells = Array.from({ length: PACK_POSTERS.count }, (_, index) =>
    packPosterStyle(index, "blob:atlas"),
  );
  expect(new Set(cells.map((cell) => cell.backgroundPosition)).size).toBe(474);
  expect(cells[0]!.backgroundPosition).toBe("0% 0%");
  entries.set([...entries.keys()][0]!, new Response("corrupt"));
  await expect(loadPackPosters(signal, storage, fetcher)).rejects.toThrow("Offline");
  expect(entries.size).toBe(0);
  const controller = new AbortController();
  controller.abort();
  await expect(loadPackPosters(controller.signal, storage, fetcher)).rejects.toThrow();
});
