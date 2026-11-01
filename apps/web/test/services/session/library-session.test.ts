import { expect, test, vi } from "vitest";
import { LibrarySession } from "../../../src/services/session/library-session";
import { createLibraryServices } from "../../../src/services/session/library-services";
import type { LibraryData } from "../../../src/services/session/library-data";
import type { EditorRuntime } from "../../../src/services/session/runtime";

const data = () =>
  ({
    store: { listPage: vi.fn(async () => ({ projects: [], before: null })) },
    fonts: {},
    thumbnails: {},
    activity: {},
    dispose: vi.fn(async () => {}),
  }) as unknown as LibraryData;
const runtime = () => ({ dispose: vi.fn(async () => {}) }) as unknown as EditorRuntime;

test("library metadata uses the existing store and acquires no editing runtime; one open hands off the same resources", async () => {
  const resources = data(),
    editor = runtime();
  const dependencies = { data: vi.fn(async () => resources), runtime: vi.fn(async () => editor) };
  const session = new LibrarySession(dependencies, { library: true });
  const services = createLibraryServices(
    () => session.data(),
    () => session.runtime(),
    vi.fn(),
  );
  expect(await services.listProjectPage({ limit: 5 })).toEqual({ projects: [], before: null });
  expect(resources.store.listPage).toHaveBeenCalledExactlyOnceWith({ limit: 5 });
  expect(dependencies.runtime).not.toHaveBeenCalled();
  expect(await Promise.all([session.runtime(), session.runtime()])).toEqual([editor, editor]);
  expect(dependencies.data).toHaveBeenCalledOnce();
  expect(dependencies.runtime).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      store: resources.store,
      fonts: resources.fonts,
      thumbnails: resources.thumbnails,
      thumbnailActivity: resources.activity,
      library: true,
    }),
  );
  expect(session.peek()).toBe(editor);
  const closing = session.dispose();
  expect(editor.dispose).toHaveBeenCalledOnce();
  expect(session.dispose()).toBe(closing);
  await closing;
  expect(resources.dispose).not.toHaveBeenCalled();
});

test("direct editor startup does not construct separate library resources", async () => {
  const editor = runtime(),
    dependencies = { data: vi.fn(async () => data()), runtime: vi.fn(async () => editor) };
  const session = new LibrarySession(dependencies, { editor: true, projectId: "saved" });
  await session.runtime();
  expect(dependencies.data).not.toHaveBeenCalled();
  expect(dependencies.runtime).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ editor: true, projectId: "saved" }),
  );
  await session.dispose();
});

test("unmount rejects late metadata acquisition and closes its store/thumbnail owner exactly once", async () => {
  const resources = data();
  let finish!: (value: LibraryData) => void;
  const session = new LibrarySession(
    {
      data: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      runtime: vi.fn(),
    },
    { library: true },
  );
  const read = expect(session.data()).rejects.toMatchObject({ name: "AbortError" });
  const closing = session.dispose();
  finish(resources);
  await closing;
  await read;
  expect(resources.dispose).toHaveBeenCalledOnce();
  await expect(session.runtime()).rejects.toMatchObject({ name: "AbortError" });
});

test("a runtime finishing after unmount owns cleanup; failed startup closes the unused library resources", async () => {
  const resources = data(),
    editor = runtime();
  let finish!: (value: EditorRuntime) => void;
  const create = vi.fn(
    () =>
      new Promise<EditorRuntime>((resolve) => {
        finish = resolve;
      }),
  );
  const session = new LibrarySession(
    { data: async () => resources, runtime: create },
    { library: true },
  );
  const opening = session.runtime();
  await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
  const rejected = expect(opening).rejects.toMatchObject({ name: "AbortError" });
  const closing = session.dispose();
  finish(editor);
  await closing;
  await rejected;
  expect(editor.dispose).toHaveBeenCalledOnce();
  expect(resources.dispose).not.toHaveBeenCalled();
  const failure = Error("Storage unavailable");
  const failed = new LibrarySession(
    {
      data: async () => resources,
      runtime: async () => {
        throw failure;
      },
    },
    { library: true },
  );
  await expect(failed.runtime()).rejects.toBe(failure);
  await failed.dispose();
  expect(resources.dispose).toHaveBeenCalledOnce();
});

test("failed preparation can be retried without caching its rejected promise", async () => {
  const resources = data(),
    editor = runtime();
  const getData = vi
    .fn()
    .mockRejectedValueOnce(Error("Chunk unavailable"))
    .mockResolvedValue(resources);
  const getRuntime = vi
    .fn()
    .mockRejectedValueOnce(Error("Runtime unavailable"))
    .mockResolvedValue(editor);
  const session = new LibrarySession({ data: getData, runtime: getRuntime }, { library: true });
  await expect(session.data()).rejects.toThrow("Chunk unavailable");
  expect(await session.data()).toBe(resources);
  await expect(session.runtime()).rejects.toThrow("Runtime unavailable");
  expect(await session.runtime()).toBe(editor);
  expect(getData).toHaveBeenCalledTimes(2);
  expect(getRuntime).toHaveBeenCalledTimes(2);
  await session.dispose();
});
