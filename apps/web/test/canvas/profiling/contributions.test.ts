import { expect, it } from "vitest";
import { frameContributions } from "../../../src/canvas/profiling/contributions";
import type { SceneFrameSample } from "../../../src/canvas/render/scene-profile-source";
function sample(cpu: number, gpu: number): SceneFrameSample {
  return {
    compositionId: "page",
    revision: 1,
    at: 0,
    hostMs: cpu,
    hostStarted: 0,
    gpuMs: gpu,
    gpuPasses: { video: gpu / 2, "effects/ascii": gpu / 2 },
    stats: null,
    passes: 2,
    drawCommands: 2,
    phases: { pipeline: 0, sources: cpu / 2, text: 0, compose: cpu / 4 },
  };
}
it("attributes the exact p95-ranked pose independently for CPU and GPU", () => {
  const samples = Array.from({ length: 20 }, (_, index) => sample(index + 1, 20 - index));
  const result = frameContributions(samples, (row) => row.hostMs);
  expect(result.cpu.reduce((sum, row) => sum + row.value, 0)).toBe(19);
  expect(result.gpu.reduce((sum, row) => sum + row.value, 0)).toBe(19);
  expect(result.cpu.find((row) => row.id === "sourcePreparation")?.value).toBe(9.5);
  expect(result.gpu.find((row) => row.id === "gpuPass:effects/ascii")?.value).toBe(9.5);
});
it("does not turn overlapping or unavailable intervals into additive fake stages", () => {
  const row = sample(1, 2);
  row.phases.sources = 5;
  row.gpuMs = row.gpuPasses = null;
  expect(frameContributions([row], (row) => row.hostMs)).toEqual({
    cpu: [{ id: "cpu", value: 1 }],
    gpu: [],
  });
  expect(frameContributions([], () => null)).toEqual({ cpu: [], gpu: [] });
});
