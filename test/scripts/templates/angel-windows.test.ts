import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";
import {
  applyMotionFrame,
  compileMotion,
  EditorEngine,
  evaluateMotion,
  parseProject,
  serializeProject,
  validateProject,
} from "../../../packages/core/src/index";
import { createAngelWindows } from "../../../apps/web/src/services/projects/templates/motion/angel-windows/build";
import { parseMotionTemplateManifest } from "../../../apps/web/src/services/projects/templates/motion/loader";
import { prepareAngel, ANGEL_SOURCE } from "../../../scripts/templates/angel-windows/source";

const root = "apps/web/public/templates/motion/angel-windows/angel-windows";
test("ships an editable 1080p native template with one shared angel and replayable sparse animation", async () => {
  const bundle = parseMotionTemplateManifest(
    JSON.parse(await readFile(`${root}.json`, "utf8")),
    "angel-windows",
  );
  validateProject(bundle.project);
  expect(bundle.originals).toEqual([]);
  const model = bundle.project.assets["angel-original"]!;
  const built = createAngelWindows(model);
  expect(built.project).toEqual(bundle.project);
  expect(serializeProject(createAngelWindows(model).project)).toBe(serializeProject(built.project));
  expect(parseProject(await readFile(`${root}.musart`, "utf8"))).toEqual(bundle.project);
  const journal = JSON.parse(await readFile(`${root}.commands.json`, "utf8"));
  const engine = new EditorEngine(journal.initial, { now: () => journal.initial.createdAt });
  for (const batch of journal.batches) engine.transaction(batch);
  expect(engine.getSnapshot().project).toEqual(bundle.project);
  const page = bundle.project.pages[0]!;
  expect(page).toMatchObject({ width: 1080, height: 1920 });
  expect(page.motion).toMatchObject({
    mode: "motion",
    duration: { value: 12800, rate: 1000 },
    frameRate: { numerator: 30, denominator: 1 },
  });
  expect(page.layers.filter((layer) => layer.spatial?.source === "glb")).toHaveLength(1);
  expect(page.layers.flatMap((layer) => layer.effects)).toMatchObject([
    {
      type: "window-trails",
      inputs: { frame: "angel-frame-atlas" },
      settings: { ribbons: 3, count: 26, sampling: "screen" },
    },
  ]);
  const properties = page.motion!.tracks.flatMap((track) => track.properties);
  expect(properties.flatMap((property) => property.keyframes)).toHaveLength(9);
  const program = compileMotion(bundle.project, { compositionId: page.id });
  const before = serializeProject(bundle.project);
  for (const second of [0, 1.2, 4, 12.79, 3, 4]) {
    const frame = evaluateMotion(program, { value: Math.round(second * 30000), rate: 30000 });
    const scene = applyMotionFrame(program, frame);
    expect(
      scene.layers.find((layer) => layer.id === "angel-desktop")!.effects[0]!.time,
    ).toBeCloseTo(second, 5);
    expect(
      scene.layers.find((layer) => layer.id === "angel-model")!.spatial!.rotationY,
    ).toBeCloseTo(-35 + (720 * second) / 12.8, 4);
  }
  expect(serializeProject(bundle.project)).toBe(before);
});

test("pins a compact geometry-only angel with embedded attribution and 16-bit indices", async () => {
  const bytes = await readFile("apps/web/public/templates/motion/media/angel-source.glb");
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(header.getUint32(0, true)).toBe(0x46546c67);
  expect(header.getUint32(8, true)).toBe(bytes.byteLength);
  const gltf = JSON.parse(
    new TextDecoder().decode(bytes.subarray(20, 20 + header.getUint32(12, true))),
  );
  expect(bytes.byteLength).toBeLessThan(600000);
  expect(gltf.meshes).toHaveLength(1);
  expect(gltf.images).toBeUndefined();
  expect(gltf.accessors[gltf.meshes[0].primitives[0].indices]).toMatchObject({
    count: 56199,
    componentType: 5123,
  });
  expect(gltf.asset.copyright).toContain("noe-3d.at");
  expect(gltf.extras.license).toBe(ANGEL_SOURCE.license);
  const provenance = JSON.parse(
    await readFile("apps/web/public/templates/motion/media/angel-source.json", "utf8"),
  );
  expect(provenance.sourceSha256).toBe(gltf.extras.sourceSha256);
  expect(provenance.preparedSha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  expect(provenance.preparedBytes).toBe(bytes.byteLength);
  for (const invalid of [new Uint8Array(), new Uint8Array(32), bytes])
    expect(() => prepareAngel(invalid)).toThrow();
});

test("prepares only the selected LOD with unchanged positions/normals and compact validated indices", () => {
  const metadata = {
    nodes: [{}, {}, { name: "LOD2", mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] }],
    accessors: [
      { type: "VEC3", componentType: 5126, count: 3, bufferView: 0, byteOffset: 0 },
      { type: "VEC3", componentType: 5126, count: 3, bufferView: 0, byteOffset: 12 },
      { type: "SCALAR", componentType: 5125, count: 3, bufferView: 1, byteOffset: 0 },
    ],
    bufferViews: [{ byteOffset: 0, byteStride: 24 }, { byteOffset: 72 }],
  };
  const json = new TextEncoder().encode(JSON.stringify(metadata)),
    size = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(28 + size + 84),
    view = new DataView(bytes.buffer);
  for (const [offset, value] of [
    [0, 0x46546c67],
    [4, 2],
    [8, bytes.byteLength],
    [12, size],
    [16, 0x4e4f534a],
    [20 + size, 84],
    [24 + size, 0x004e4942],
  ])
    view.setUint32(offset!, value!, true);
  bytes.fill(32, 20, 20 + size);
  bytes.set(json, 20);
  const start = 28 + size;
  for (let i = 0; i < 3; i++) {
    view.setFloat32(start + i * 24, i * 0.5, true);
    view.setFloat32(start + i * 24 + 16, 1, true);
    view.setUint32(start + 72 + i * 4, i, true);
  }
  const result = prepareAngel(bytes),
    header = new DataView(result.buffer);
  const doc = JSON.parse(
    new TextDecoder().decode(result.subarray(20, 20 + header.getUint32(12, true))),
  );
  const offset = 28 + header.getUint32(12, true);
  expect(doc.nodes).toHaveLength(1);
  expect(doc.meshes[0].primitives[0]).toMatchObject({
    attributes: { POSITION: 0, NORMAL: 1 },
    indices: 2,
  });
  expect(doc.accessors[2]).toMatchObject({ componentType: 5123, count: 3 });
  const output = new DataView(result.buffer);
  for (let i = 0; i < 3; i++) {
    expect(output.getFloat32(offset + i * 12, true)).toBe(i * 0.5);
    expect(output.getFloat32(offset + doc.bufferViews[1].byteOffset + i * 12 + 4, true)).toBe(1);
    expect(output.getUint16(offset + doc.bufferViews[2].byteOffset + i * 2, true)).toBe(i);
  }
  view.setUint32(start + 72, 65536, true);
  expect(() => prepareAngel(bytes)).toThrow("16-bit index range");
});
