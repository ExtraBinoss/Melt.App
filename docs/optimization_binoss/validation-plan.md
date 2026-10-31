# Coordinator validation plan

The coordinator owns this batch's integrated checks. Implementation reports do
not complete acceptance criteria. No production source changes are made by the
coordinator; findings go back to the owning agent.

| Task | Required evidence                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01   | Full affine matrices across ungroup/reparent; legacy documents, shear/reflection, masks, undo/redo; decoded native hierarchy witness.                       |
| 02   | Half-opacity rear-color witness on WebGPU/WebGL; ancestor/material opacity, opaque ordering, masks, shadows and selected exports.                           |
| 03   | A receiver larger than capture budget still receives reflections; original/override GLB materials; bounded contributors and cleanup.                        |
| 04   | Instrumented material-copy counts with increasing sources; uniform updates without material version changes; native visual regressions.                     |
| 05   | Warm alternating-size target reuse and real decoded multi-stage pixels; pool accounting/eviction/failure/disposal; relevant fifty-image effect workload.    |
| 06   | Unchanged identities and bounded local validation/ID work; invalid batches/references reject atomically; history, replay and stale reservations.            |
| 07   | Property dependency partitions and precise invalidation; real scene camera/light/environment Motion commands and UI; legacy tracks, duplication and export. |

Run explicit affected unit/integration paths with one bounded worker. Run native
browser checks serially against the existing development server for functional
correctness. Use the repository performance protocol for operation counts or
measurements; development timing is not production input latency. Never restart
the user's server. Stop on memory pressure rather than launching competing
cohorts. Retain captures/logs under ignored `artifacts/optimization-binoss/`.

After affected checks pass, run relevant TypeScript and lint checks, formatting,
version synchronization and `bun run check:rules`. Require zero rule violations
before committing. Stage only task-owned changes and the batch documentation;
preserve unrelated workstation edits. Move validated task directories out of
`active/`, recording exact evidence and remaining limitations in each checklist.
