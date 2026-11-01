# @musart/path-morph

Dependency-free TypeScript preparation and interpolation of closed polygon contours. Separate expensive correspondence from playback, reuse numeric buffers, and retain meaningful authored geometry.

Melt core uses this package to prepare contours. The Three TSL adapter uploads their states once and interpolates on the GPU. The package itself has no DOM, React, Three, worker, storage or GPU dependencies. It does not own document keys or read GPU pixels.

## Usage

```ts
import { compilePathPair } from "@musart/path-morph";

const morph = compilePathPair(
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ],
  [
    [0.5, 0],
    [1, 0.5],
    [0.5, 1],
    [0, 0.5],
  ],
  256,
);
const output = new Float64Array(morph.points * 2);

// Reuse this buffer for every sample. No correspondence search or allocation.
morph.interpolate(0.5, output);
```

Inputs are polygon rings, rather than SVG path strings. SVG parsing/curve flattening, winding policy, shape matching and explicit hole association belong to the caller. Melt core retains its winding normalization and disappearing-hole collapse. The package does not replace a font shaping engine.

## API and ownership

| Export                                          | Purpose                                                                                                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resampleClosed(points, samples)`               | Compute uniform arc-length samples once; return packed Float64 XY coordinates.                                                                          |
| `alignClosedInto(points, reference, output)`    | Find the exact least-squares cyclic origin, write the aligned coordinates and return the chosen point shift.                                            |
| `compilePathPair(from, to, samples)`            | Prepare two polygon rings once; expose prepared endpoints, point count and `interpolate(t, output)`.                                                    |
| `interpolateInto(from, to, t, output)`          | Interpolate already-corresponding numeric arrays into a retained Float32/Float64/number buffer. Also suitable for scalar profiles such as mascot radii. |
| `correspondingIndices(states, tolerance?)`      | Keep one shared vertex index set across all poses, preserving a bounded geometric error during interpolation.                                           |
| `correspondingIndicesSteps(states, tolerance?)` | The same preparation as a generator, for cooperative scheduling without DOM/scheduler dependencies.                                                     |

Prepared buffers must contain finite values. Resampling accepts 1–4,096 input points and 3–4,096 output points, including a collapsed contour. Alignment accepts 3–4,096 XY pairs. Trajectory simplification accepts up to 120 equal-sized contour states. Invalid dimensions, budgets and progress reject with a `RangeError`.

Interpolation accepts finite progress, including extrapolation; the caller decides whether to clamp. Its output may alias an endpoint. Alignment requires an output buffer that does not share either input's backing buffer. Preparation allocates bounded buffers and views; interpolation allocates none. Returned arrays are caller-owned mutable data, not a global cache or persistence identity.

## What makes it faster

**Prepared correspondence.** Arc-length sampling and origin alignment run when geometry changes, not on each animation frame. Coordinates live in contiguous numeric buffers rather than newly allocated point objects.

**Exact early rejection.** Cyclic alignment accumulates nonnegative squared distances. Once a candidate's partial cost cannot beat the best complete candidate, the rest of that candidate is unnecessary. Equal scores retain the earliest shift deterministically. This produces the exhaustive algorithm's answer; it does not approximate correspondence. Worst-case complexity remains quadratic, and gains depend on the contours.

**Allocation-free sampling.** Prepared interpolation performs a tight numeric loop into the caller's buffer. It does not build arrays of point tuples, format SVG strings, reparse paths or repeat matching. Different output contracts matter when interpreting benchmarks.

**Shared-trajectory simplification.** A vertex is removed only if all states place it within the tolerance of the same affine combination of its retained neighbors. For convex interpolation between those states, its error remains bounded by that tolerance. The default tolerance is 1e-10 normalized units, below the render adapter's float32 atlas precision. Authored state times, easing, placements and hole identities are retained. This is different from simplifying each frame independently, which could break correspondence or introduce intermediate deformation.

**GPU adapter.** Melt's render package packs each linear edge into one RGBA texel, reconstructs its midpoint in TSL and uses specialized analytical line coverage. Actual quadratic font curves retain their existing coverage path. The GPU adapter is outside this pure package; the CPU benchmark below does not measure those shader gains.

## CPU benchmark

Measured on 2026-11-01 with Bun 1.4.2 / JavaScriptCore, Linux, low priority and a one-core CPU quota. Four real Melt Mascot letter contours, 256 vertices each. Warmup precedes timing; output checksums consume the results. Correspondence uses 800 contour operations, prepared interpolation uses 40,000.

| Operation                                             | µs / contour |                                        Comparison on this workload |
| ----------------------------------------------------- | -----------: | -----------------------------------------------------------------: |
| Previous exhaustive cyclic correspondence             |       436.48 |                                                           Baseline |
| Exact pruned typed-buffer correspondence              |         3.83 |                                          Approximately 114× faster |
| Prepared interpolation into a retained Float64 buffer |         0.81 | Approximately 26× faster than the Flubber point-array output below |
| Flubber 0.4.2 prepared ring interpolation             |        20.99 |                                      Allocating point-array output |

Flubber receives identical 256-vertex input/output counts and already-created interpolators, with `string: false` and `maxSegmentLength: Infinity`. SVG parsing/string serialization and cold font shaping are excluded. The retained-buffer API intentionally avoids allocations that Flubber's point-array API performs. This is not a universal comparison of SVG/topology capabilities, a Firefox/Chrome JavaScript benchmark, or an assertion that a complete renderer becomes 26× faster. See Flubber's [documented output and sampling controls](https://github.com/veltman/flubber/blob/master/README.md#flubberinterpolatefromshape-toshape--options).

Reproduce from the repository root:

```sh
bun scripts/performance/path-morph.ts

# Optional benchmark-only dependency, never included in production:
npm install --prefix artifacts/morph-competitors --no-save --ignore-scripts --no-audit --no-fund flubber@0.4.2
bun scripts/performance/path-morph.ts artifacts/morph-competitors/node_modules/flubber/build/flubber.min.js
```

## Native render witness

In the shipped six-second, Full HD Melt Mascot composition, the render adapter reduces 1,024 prepared edges per pose to 188 while retaining all 268 per-shape authored states. Its maximum conservative ray band contains 29 edges.

Separate native-browser profiling at 1068 × 601 output measured:

| Browser                                        | Median preparation, baseline → final | Median GPU timestamp duration, baseline → final |
| ---------------------------------------------- | -----------------------------------: | ----------------------------------------------: |
| Chrome 156, WebGPU, Intel xe-lpg               |                           7 → 1.9 ms |                                  3.30 → 1.42 ms |
| Firefox 159, WebGPU, adapter identity withheld |                            88 → 4 ms |                                  3.49 → 1.35 ms |

These include the render adapter and a separate fix to per-frame GPU completion waiting. They are **not attributable solely to this CPU package**. Graphics playback now pipelines at most eight submitted frames while retaining real completion acknowledgments for backpressure and disposal. Video retains its conservative publication/ownership boundaries.

Chrome completed approximately 60 arbitrary seeks/s in the final cohort; Firefox headless completed approximately 34. Firefox's headless compositor reported SWGL/shared-texture limitations. These measurements do not establish 60 fps in headed Firefox or physical input-to-display latency. One intermediate cohort with slower unchanged static GPU passes is excluded from speedup claims.

The full [measurement report](../../docs/performance/path-morphing.md) documents environments, source variants, fidelity captures, timestamp/CPU distinctions, intermediate failures and remaining profiling targets.

## Verification

```sh
bunx tsc --noEmit -p packages/path-morph/tsconfig.json
bunx vitest run packages/path-morph/test/correspondence.test.ts --maxWorkers=1
```

Regressions cover exhaustive alignment equivalence, deterministic ties, endpoint identity, collapsed contours, reused/aliased interpolation buffers, invalid budgets, cooperative preparation and shared-trajectory error bounds, including loose tolerances. Render integration covers missing holes, cancellation, cached geometry/shaders, bounded timer buffers, native seeks and exports on Three's WebGPU/WebGL backends.

MIT licensed. See [LICENSE](./LICENSE). Existing analytical text coverage retains its upstream notices in the render package.
