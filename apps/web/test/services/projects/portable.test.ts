import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { zipSync } from "fflate";
import { createProject, EditorEngine, recordSession } from "@musart/core";
import { encodeProject, decodeProject } from "../../../src/services/projects/portable/codec";
import { unpack } from "../../../src/services/projects/portable/zip";
import { templateMedia } from "../../support/motion-template-media";
import { ProjectStore } from "../../../src/services/projects/storage";
beforeEach(() => vi.stubGlobal("Blob", NodeBlob));
afterEach(() => vi.unstubAllGlobals());

it("roundtrips deduplicated image and binary media originals without base64 in the archive document", async () => {
  const { photos, video } = templateMedia();
  const project = createProject({
    assets: Object.fromEntries(
      [...photos, video, { ...video, id: "second-video" }].map((asset) => [asset.id, asset]),
    ),
  });
  const original = {
    originalId: video.originalId,
    contentRevision: video.contentRevision,
    blob: new Blob(["fakevideo"]),
  };
  const archive = await encodeProject(project, [original]);
  const files = await unpack(archive);
  expect(files.size).toBe(3);
  const text = await files.get("project.json")!.text();
  expect(text).not.toContain("base64");
  expect(text).toContain("assets/");
  expect(project.assets[photos[0]!.id]).toEqual(photos[0]);
  const decoded = await decodeProject(archive);
  expect(decoded.project).toEqual(project);
  expect(decoded.originals).toHaveLength(1);
  expect(await decoded.originals[0]!.blob.text()).toBe("fakevideo");
  const store = new ProjectStore(crypto.randomUUID());
  try {
    const prepared = await store.prepareSave(decoded.project, undefined, {
      mediaOriginals: decoded.originals,
      requireAbsent: true,
    });
    await store.persistPrepared(prepared);
    const reopened = await store.load(project.id);
    expect(reopened.assets).toEqual(project.assets);
    expect(await (await store.loadMediaOriginal(project.id, video)).text()).toBe("fakevideo");
  } finally {
    await store.close();
  }
});

it("reports missing originals and truncation", async () => {
  const { video } = templateMedia();
  await expect(encodeProject(createProject({ assets: { [video.id]: video } }), [])).rejects.toThrow(
    "Missing original",
  );
  const blob = await encodeProject(createProject(), []);
  await expect(decodeProject(blob.slice(0, blob.size - 3))).rejects.toThrow("Incomplete");
});

it.each(["../escape", "/absolute", "assets/../escape", "https://example.com/image.png"])(
  "rejects unsafe path %s",
  async (path) => {
    const bytes = zipSync({
      "project.json": new TextEncoder().encode("{}"),
      [path]: new Uint8Array([1]),
    });
    await expect(decodeProject(new Blob([bytes]))).rejects.toThrow("path");
  },
);

it("rejects missing entries, damaged originals and unsupported versions before installation", async () => {
  const { photos } = templateMedia();
  const blob = await encodeProject(createProject({ assets: { [photos[0]!.id]: photos[0]! } }), []);
  const files = await unpack(blob);
  const manifest = JSON.parse(await files.get("project.json")!.text());
  const mediaPath = Object.keys(Object.fromEntries(files)).find((p) => p !== "project.json")!;
  const make = async (version: number, media?: Uint8Array) =>
    new Blob([
      zipSync({
        "project.json": new TextEncoder().encode(JSON.stringify({ ...manifest, version })),
        ...(media ? { [mediaPath]: media } : {}),
      }),
    ]);
  await expect(decodeProject(await make(1))).rejects.toThrow("Missing archive entry");
  await expect(decodeProject(await make(1, new Uint8Array([0])))).rejects.toThrow("Damaged");
  await expect(decodeProject(await make(99))).rejects.toThrow("Unsupported");
});

it("retains replay originals and remaps duplicate document identities without losing events", async () => {
  const { photos } = templateMedia();
  const engine = new EditorEngine(createProject({ assets: { [photos[0]!.id]: photos[0]! } }));
  const recording = recordSession(engine, { now: () => 10 });
  engine.execute({ type: "renameProject", name: "Recorded edit" });
  const project = { ...engine.getSnapshot().project, replay: recording.stop() };
  const archive = await encodeProject(project, []);
  const document = await (await unpack(archive)).get("project.json")!.text();
  expect(document).not.toContain("base64");
  const decoded = await decodeProject(archive);
  expect(decoded.project).toEqual(project);
  const { remapPortableProject } = await import("../../../src/services/projects/portable/identity");
  const remapped = remapPortableProject(decoded.project, crypto.randomUUID());
  expect(remapped.replay!.initial.id).toBe(remapped.id);
  expect(remapped.replay!.events[0]!.projectId).toBe(remapped.id);
  expect(remapped.replay!.events).toHaveLength(1);
});
