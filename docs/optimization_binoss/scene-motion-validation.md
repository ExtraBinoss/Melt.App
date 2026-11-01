# Scene Motion validation — tasks 08–10

The coordinator runs checks serially under one-CPU cgroup quotas, `nice -n 19`, no swap, and bounded heaps. Chrome uses `/opt/google/chrome/chrome` against the existing Vite server on port 6100, a 1600 × 1000 viewport and device scale 1. HMR messages are filtered only in the test-owned browser context to isolate unrelated concurrent workstation edits. The development server is not restarted. These timings are test execution costs, not production latency measurements.

## Code regressions

- Initial integrated run: 31 files, 169 tests; 168 passed and the new missing-track keyboard guard failed. The owner corrected the guard; affected keyboard/scene/catalog rerun passed 11 tests.
- Scene navigation/details and catalog rerun: 12 tests passed. Stale project/page ownership catalog rerun: 4 tests passed.
- Final sampler/diamond/Cornell corrections: 23 tests passed in five files; scene diamond transport updates never project action points or rerender the observed component.
- Final additional sampler/naming checks: 7 tests passed in three files, including untouched light sampler identity and translated Light type/editor choice.

## Native rendering

- Native WebGPU Cornell Motion: 32 decoded frames at 4 fps over eight seconds, sparse canonical camera action, no object/light pose changes, probe reuse, loop/seam and decoded framing checks passed.
- Native WebGL fallback Cornell PNG: camera motion, fixed objects/lights and loop/seam checks passed.
- The encoded last-frame assertion compares the fifth image with the actual final encoded PTS (8 - 1/export fps); the near-seam rendering check independently retains canonical 60 fps timing. Thresholds were not weakened.
- Native 512-pixel WebGPU poster was rendered and visually inspected; nine source/mesh objects and two probes, zero GPU readbacks, approximately 78 MB of a 128 MB cache budget. The poster, JSON, journal and portable project use shared template asset revision 4.
- Native personal preset workflow passed: save, apply to another real owner/project, filter incompatible recipe kinds, relative owner remapping and saved-store persistence.

## Timeline and preset acceptance

Native shared gestures passed (40.8 seconds test execution): action drag with unchanged React commit counters and no authored preview revisions, one commit on release, undo, Escape cancellation, derived-point drag/easing, mixed layer/scene keys, Delete/undo and actual camera/light context navigation. Readbacks remain zero. The separate native personal-preset workflow passed. Overlay retirement passed 14 focused tests; catalog/context-menu navigation passed 7 tests.

The coordinator found and corrected two shared focus defects: retiring a focused semantic key overlay moved focus to body and disabled subsequent Delete; opening a light editor before the context menu restored focus dismissed that editor. Focus now returns to the existing timeline surface only for an owned retiring control, and explicit owner navigation occurs at guarded menu close. External input focus and replaced projects are preserved.

## Gallery acceptance

Both provenance-backed serial cases passed: preview/install through the real gallery, then reopening the same actual persisted project without replacement seeding. The stored and live sparse camera actions match and both editor canvases present native pixels without renderer errors.

Cold Vite editor-module loading is a separate bounded phase from native frame preparation: canvas attachment has a 30-second bound, then renderer readiness retains its 30-second bound, within the unchanged 90-second case limit. The previous clean trace spent 12.30 seconds of its render assertion before renderer startup; the native frame completed about 20.58 seconds after startup. This is correctness evidence on a throttled development environment, not a production latency claim. An earlier gallery run was invalidated by unrelated HMR; the ignored coordinator harness now freezes HMR in fixture and explicitly created test contexts. No renderer or timeout inflation was used to address those samples.

## Static checks and publication boundary

Strict focused TypeScript, type-aware Oxlint, ESLint, formatting, synchronized workspace versions 0.2.0 and `bun run check:rules` all passed in an isolated review worktree containing exactly the owned changes on baseline `0fc0ca6`. Rules reported zero violations. Workspace dependency links reuse the frozen existing installation; no install/build/coverage gate was requested or repeated.

The shared working tree also contains unrelated in-progress video/backend, loading, navigation and profiling changes. Its new native video-import probe triggers the Three-only rule; it is excluded from this milestone. The isolated rules pass validates the exact intended commit, without editing, hiding or weakening the unrelated implementation or checker. Native checks used the existing shared Vite server and are reported as functional checks, not a production benchmark.

Task directories 08–10 are archived only after these checks pass. The full-rate 480-frame export, full CI coverage/build/release gate and a production performance benchmark were not run for this bounded feature iteration. Undo/redo notice descriptions remain a separate queued follow-up (tasks 11–12).

Logs and screenshots remain ignored under `artifacts/scene-motion/`, `artifacts/motion/scene-timeline/` and `artifacts/cornell/`.
