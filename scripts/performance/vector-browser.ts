import {
  BufferGeometry,
  CurvePath,
  DoubleSide,
  Mesh,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  Scene,
  ShapePath,
  ShapeUtils,
  WebGPURenderer,
} from "three/webgpu";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { parseVectorGeometry } from "../../packages/render/src/surface/vector/geometry";
import type { VectorGeometryPart } from "../../packages/render/src/surface/vector/geometry";
import { parseVectorGeometryBaseline } from "./vector-baseline";
import { vectorWitness, vectorWorkloads } from "./vector-workloads";

type Mode = "baseline" | "batch";
const implementations = { baseline: parseVectorGeometryBaseline, batch: parseVectorGeometry };
function describe(parts: VectorGeometryPart[]) {
  let bytes = 0,
    vertices = 0,
    hash = 2166136261;
  for (const item of parts) {
    vertices += item.geometry.getAttribute("position").count;
    for (const attribute of [...Object.values(item.geometry.attributes), item.geometry.index]) {
      if (!attribute) continue;
      const array = attribute.array;
      bytes += array.byteLength;
      const data = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (const byte of data) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
    }
    hash = Math.imul(hash ^ item.partIndex, 16777619) >>> 0;
  }
  return { geometries: parts.length, vertices, bytes, hash };
}
function dispose(parts: VectorGeometryPart[]) {
  for (const item of parts) item.geometry.dispose();
}
function diagnostics(run: () => VectorGeometryPart[]) {
  const phases: Record<string, { calls: number; milliseconds: number }> = {};
  const restore: (() => void)[] = [];
  function probe<T extends object, K extends keyof T>(object: T, key: K, name: string) {
    const original = object[key] as (...args: unknown[]) => unknown;
    const phase = (phases[name] = { calls: 0, milliseconds: 0 });
    object[key] = function (this: unknown, ...args: unknown[]) {
      phase.calls++;
      const start = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        phase.milliseconds += performance.now() - start;
      }
    } as T[K];
    restore.push(() => {
      object[key] = original as T[K];
    });
  }
  probe(DOMParser.prototype, "parseFromString", "native XML DOM parse");
  probe(SVGLoader.prototype, "parse", "SVGLoader parse (includes DOM and command parsing)");
  probe(ShapePath.prototype, "toShapes", "fill classification (includes its samples)");
  probe(CurvePath.prototype, "getPoints", "curve sampling (fill and stroke)");
  probe(ShapeUtils, "triangulateShape", "Three Earcut triangulation");
  probe(SVGLoader, "pointsToStroke", "Three stroke expansion");
  probe(BufferGeometry.prototype, "applyMatrix4", "buffer transforms");
  try {
    const parts = run();
    const geometry = describe(parts);
    dispose(parts);
    return { phases, geometry };
  } finally {
    for (const reset of restore.reverse()) reset();
  }
}
async function benchmark(mode: Mode, workload: number, samples: number) {
  const entry = vectorWorkloads[workload]!;
  const run = () => implementations[mode](entry.layer);
  const firstStart = performance.now();
  const first = run();
  const firstPreparationMs = performance.now() - firstStart;
  const geometry = describe(first);
  dispose(first);
  // Retained resources already avoid preparation in VectorSources. These are rebuilds,
  // not per-frame cache hits, and resource disposal is outside the measured boundary.
  for (let i = 0; i < 3; i++) dispose(run());
  const repeatedPreparationMs: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    const parts = run();
    repeatedPreparationMs.push(performance.now() - start);
    dispose(parts);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return {
    mode,
    workload: entry.name,
    firstPreparationMs,
    repeatedPreparationMs,
    geometry,
    diagnostics: diagnostics(run),
  };
}
async function pairedBenchmark(workload: number, samples: number) {
  const entry = vectorWorkloads[workload]!;
  const prepare = (mode: Mode) => implementations[mode](entry.layer);
  const modes: Mode[] = ["baseline", "batch"];
  const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  // Both paths share the same native DOM, Three/Earcut code and allocation realm.
  // Balance which path runs first before every warmup and measured pair.
  const warmupPairs = 8;
  for (let round = 0; round < warmupPairs; round++) {
    for (const mode of round % 2 ? [...modes].reverse() : modes) {
      dispose(prepare(mode));
      await turn();
    }
  }
  const pairs: { round: number; order: Mode[]; baselineMs: number; batchMs: number }[] = [];
  for (let round = 0; round < samples; round++) {
    const order = round % 2 ? [...modes].reverse() : [...modes];
    const milliseconds = { baseline: 0, batch: 0 };
    for (const mode of order) {
      const start = performance.now();
      const parts = prepare(mode);
      milliseconds[mode] = performance.now() - start;
      dispose(parts);
      await turn();
    }
    pairs.push({ round, order, baselineMs: milliseconds.baseline, batchMs: milliseconds.batch });
  }
  // Separately instrument both paths after all uninstrumented pairs; report raw
  // samples because a common realm cannot force equal GC placement or eliminate it.
  const phases = Object.fromEntries(modes.map((mode) => [mode, diagnostics(() => prepare(mode))]));
  if (JSON.stringify(phases.baseline!.geometry) !== JSON.stringify(phases.batch!.geometry))
    throw Error(`Paired geometry mismatch: ${entry.name}`);
  return { workload: entry.name, warmupPairs, pairs, diagnostics: phases };
}
async function witness(mode: Mode, forceWebGL: boolean) {
  const canvas = document.createElement("canvas");
  canvas.id = "witness";
  document.body.append(canvas);
  const renderer = new WebGPURenderer({ canvas, forceWebGL, antialias: true });
  const parts = implementations[mode](vectorWitness);
  const scene = new Scene();
  const materials: MeshBasicNodeMaterial[] = [];
  try {
    await renderer.init();
    const backend = renderer.backend as unknown as {
      isWebGPUBackend?: boolean;
      device?: GPUDevice;
    };
    if (!forceWebGL && !backend.isWebGPUBackend) throw Error("Native WebGPU unavailable");
    const adapter = backend.device?.adapterInfo;
    const gl = forceWebGL ? canvas.getContext("webgl2") : null;
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    const adapterInfo = adapter
      ? {
          vendor: adapter.vendor,
          architecture: adapter.architecture,
          device: adapter.device,
          description: adapter.description,
        }
      : {
          vendor: debug && gl?.getParameter(debug.UNMASKED_VENDOR_WEBGL),
          renderer: debug && gl?.getParameter(debug.UNMASKED_RENDERER_WEBGL),
        };
    renderer.setSize(512, 512);
    renderer.setClearColor("#17171b", 1);
    const camera = new OrthographicCamera(0, 256, 0, 256, 0, 100);
    camera.position.z = 10;
    for (const [index, item] of parts.entries()) {
      const material = new MeshBasicNodeMaterial({
        color: item.part[item.kind] ?? "white",
        side: DoubleSide,
        depthTest: false,
        depthWrite: false,
      });
      materials.push(material);
      const mesh = new Mesh(item.geometry, material);
      mesh.renderOrder = index;
      scene.add(mesh);
    }
    await renderer.compileAsync(scene, camera);
    const firstDrawStart = performance.now();
    renderer.render(scene, camera);
    const firstDrawSubmissionMs = performance.now() - firstDrawStart;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const info = {
      backend: renderer.backend.constructor.name,
      adapterInfo,
      firstDrawSubmissionMs,
      uploadBoundary:
        "first renderer.render CPU submission, not GPU duration or isolated transfer time",
      geometry: describe(parts),
    };
    const release = async () => {
      dispose(parts);
      for (const material of materials) material.dispose();
      await renderer.dispose();
    };
    return { info, release };
  } catch (error) {
    dispose(parts);
    for (const material of materials) material.dispose();
    await renderer.dispose();
    throw error;
  }
}
Object.assign(window, {
  vectorBenchmark: benchmark,
  vectorPairedBenchmark: pairedBenchmark,
  vectorWitness: witness,
});
