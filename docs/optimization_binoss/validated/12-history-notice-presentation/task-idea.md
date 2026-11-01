# 12: Present authoritative undo/redo descriptions

Status: validated by root; see [acceptance evidence](../../undo-redo-validation.md).

The core owner implements task 11. A separate UI owner formats its immutable semantic descriptors without examining the current selection, active page or snapshot. Preserve the existing notice positioning, dimensions, direction icon, dismissal, hover/focus pause and lifetime. Use existing property and effect labels/units/options where possible and translated resources for missing semantic names in all twelve locales. Report the actual restored value for undo and final value for redo, with truthful compound/overflow/truncation handling.

Owned paths: `apps/web/src/components/notifications/history/**`, related notice resources/tests, and a small shared presentation resolver if required. No core, durable journal or unrelated translation changes. Agree the exported descriptor contract with the core owner before editing. Root supervises, reviews and runs all checks; workers format only and do not run tests, builds, lint, typechecks or browsers. No Git or shared changelog edits.

Acceptance covers artboard background, layer fill/stroke/gradient, opacity/text/transforms, effect parameters/settings, SVG topology, 3D pose/material, camera/lights/environment, audio and Motion edits; compound transactions, inactive owners, owner deletion, late observation, undo/redo branching and all supported locales. Existing generic fallback remains only for absent/unknown custom metadata. Native keyboard/pill geometry and timer interactions must remain intact.
