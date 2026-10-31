# Engine optimization batch

The coordinator supervises, reviews and runs all checks. One agent owns each
numbered task. Production code and regressions are implemented by task owners;
heavy validation is serial, with one bounded worker and no swap.

| Task                                                                                | Problem and intended result                                                                    | State     |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------- |
| [01 — affine hierarchy](validated/01-affine-2d/task-idea.md)                        | Preserve scale, shear and reflection when classic layers change parents.                       | Validated |
| [02 — opacity and depth](validated/02-spatial-opacity/task-idea.md)                 | Reveal rear objects through fractional opacity while retaining internal group occlusion.       | Validated |
| [03 — reflection admission](validated/03-reflection-admission/task-idea.md)         | Let dense GLBs receive reflections even when capture budgets omit their geometry.              | Validated |
| [04 — scene bindings](validated/04-scene-bindings/task-idea.md)                     | Synchronize material variants once per sample and reuse unaffected source/depth/shadow work.   | Validated |
| [05 — effect surfaces](validated/05-effect-surfaces/task-idea.md)                   | Reuse a bounded pool instead of reallocating textures when layer dimensions alternate.         | Validated |
| [06 — incremental transactions](validated/06-incremental-transactions/task-idea.md) | Validate certified local edits by touched domains while preserving atomicity and identity.     | Validated |
| [07 — property dependencies](validated/07-property-dependencies/task-idea.md)       | Share typed capabilities/dependencies and author durable camera, light and environment Motion. | Validated |

Each task directory contains `task-idea.md` and `task-checklist.md`, with scope,
file ownership, acceptance criteria, regressions, evidence and explicit limits.
Agent completion means implementation ready. Only coordinator review and passing
checks permit moving the entire directory from `active/` to `validated/`.

See [the validation plan](validation-plan.md) and [actual results](validation-results.md).
Ignored logs and captures are stored in `artifacts/optimization-binoss/` and the
native witness directories. Existing unrelated workstation work is preserved.
Development-server timing is not presented as production interaction latency.
