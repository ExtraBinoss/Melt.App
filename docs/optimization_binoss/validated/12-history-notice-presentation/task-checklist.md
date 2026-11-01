# 12: Implementation and verification

## Owner handoff

- [x] Implement the frozen history descriptor presentation contract.
- [x] Prepare meaningful focused regressions and report owned paths.
- [x] Preserve interaction, cleanup, localization and truthful value formatting.
- [x] Supply an English changelog bullet and explicit limitations.

## Coordinator acceptance

- [x] Review the implementation and translated labels against actual domain definitions.
- [x] Run integrated focused core/UI tests serially with bounded resources.
- [x] Verify real browser undo/redo notices and existing pill interaction.
- [x] Pass affected static checks, zero rules and synchronized versions.
- [x] Record evidence, commit and archive this task.

## UI owner handoff

The notice source forwards retained `event.history` metadata directly. The formatter
accepts only descriptions, direction and translation, resolves property/effect
names and choice labels through registered domain resources, and displays the
restored value for undo or final value for redo. All twelve notice locales include
missing semantic names, structural actions, mixed/unset/empty values and truthful
compound/overflow text. Decimal display scaling preserves meaningful precision
without binary multiplication artifacts. IDs are never presented as names.

Owned implementation paths: `apps/web/src/components/notifications/history/`
(`source.ts`, `presentation.ts`, `property-label.ts`, the HistoryNotice formatter
call and twelve locale files). CSS, animation, placement, timers, hover/focus and
close handlers retain their existing behavior.

Prepared regressions: the three files in
`apps/web/test/components/notifications/history/`, including new
`presentation.test.ts`; `test/browser/history-notice.spec.ts` keeps the existing
native geometry/timer checks and adds a real background HEX input commit followed
by keyboard undo/redo, numeric position and effect amount checks. Code cases cover
retained/inactive/deleted owners, late observation, branching, load clearing,
compound edits, paints/gradient/text/transforms, SVG flags/structure, 3D scene,
audio, Motion, choice resources, bounds and explicit value truncation.

Only targeted `oxfmt` was run by the UI owner. The coordinator owns all tests,
static checks and browser validation; no passing result is claimed here.

Suggested changelog entry: “Undo and redo notices now retain the edited property,
semantic owner and restored value across artboard, layer, effect, 3D, audio and
Motion edits, including compound changes and history predating the notice.”

Intentional limits: the pill presents the first named change and a truthful count
or overflow suffix; structural geometry/gradient edits use semantic actions rather
than serializing paths or stops. Owner categories stay readable after deletion;
user-assigned owner names are outside the core descriptor contract. Asset/parent
references display Assigned/Unset rather than durable IDs. Existing domain locale
fallbacks remain those of the editor; all newly introduced notice semantics have
twelve explicit locale resources.

Coordinator acceptance: focused code, native Chrome and affected static checks passed. See [actual validation evidence](../../undo-redo-validation.md).
