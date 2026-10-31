import type { SceneFrameSample } from "../render/scene-profile-source";
import type { CompositionPerformanceSnapshot } from "../../state/session/composition-performance";

/** Attribute a single p95-ranked pose per clock; never add unrelated percentile measurements. */
export function frameContributions(
  samples: readonly SceneFrameSample[],
  cpuValue: (sample: SceneFrameSample, index: number) => number | null,
): NonNullable<CompositionPerformanceSnapshot["contributions"]> {
  const critical = (value: (sample: SceneFrameSample, index: number) => number | null) => {
    const rows = samples
      .flatMap((sample, index) => {
        const total = value(sample, index);
        return total !== null && Number.isFinite(total) && total >= 0 ? [{ sample, total }] : [];
      })
      .sort((a, b) => a.total - b.total);
    return rows[Math.ceil(rows.length * 0.95) - 1];
  };
  const cpu = critical(cpuValue),
    gpu = critical((sample) => sample.gpuMs);
  const cpuParts = cpu
    ? [
        {
          id: "sourcePreparation",
          value: (cpu.sample.phases.pipeline ?? 0) + (cpu.sample.phases.sources ?? 0),
        },
        { id: "textPreparation", value: cpu.sample.phases.text ?? 0 },
        { id: "composition", value: cpu.sample.phases.compose ?? 0 },
        { id: "animationUpdate", value: Math.max(0, cpu.total - (cpu.sample.hostMs ?? cpu.total)) },
      ]
    : [];
  const sum = cpuParts.reduce((value, part) => value + part.value, 0);
  // Overlapping/unknown wall intervals cannot truthfully be presented as additive stages.
  const attributedCpu =
    cpu && sum <= cpu.total
      ? [...cpuParts, { id: "otherCpu", value: cpu.total - sum }]
      : cpu
        ? [{ id: "cpu", value: cpu.total }]
        : [];
  return {
    cpu: attributedCpu.filter((part) => part.value > 0),
    gpu: gpu?.sample.gpuPasses
      ? Object.entries(gpu.sample.gpuPasses)
          .map(([id, value]) => ({ id: `gpuPass:${id}`, value }))
          .filter((part) => part.value > 0)
      : [],
  };
}
