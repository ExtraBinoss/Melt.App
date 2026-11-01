import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { cleanup, library, platform } from "./fixtures";

beforeEach(platform);
afterEach(cleanup);

it("installs the template's real bundled DynaPuff bytes locally and restores them offline", async () => {
  const bytes = new Uint8Array(await readFile("apps/web/public/fonts/dynapuff/font.ttf"));
  const fetcher = vi.fn(async () => new Response(bytes));
  const catalog = vi.fn(async () => {
    throw new Error("Remote catalog is unavailable.");
  });
  const installed = library({ fetch: fetcher, catalog });
  expect(new Uint8Array(await installed.library.resolve("DynaPuff", 700))).toEqual(bytes);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/fonts/dynapuff/font.ttf", {
    signal: expect.any(AbortSignal),
  });
  expect(catalog).not.toHaveBeenCalled();
  installed.library.dispose();
  const offlineFetch = vi.fn(async () => {
    throw new Error("Offline");
  });
  const offline = library({
    databaseName: installed.databaseName,
    fetch: offlineFetch,
    catalog,
  });
  expect(new Uint8Array(await offline.library.resolve("DynaPuff", 700))).toEqual(bytes);
  expect(offlineFetch).not.toHaveBeenCalled();
  expect(catalog).not.toHaveBeenCalled();
});
