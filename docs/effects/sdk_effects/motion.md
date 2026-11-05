# Motion and interactive input

## A single authoritative animation

An animation channel owns a typed output map and an optional driver. Reuse
`MotionAnimation` blocks, rational time, easing, sparse points and the existing
compiled evaluator. A driver transforms the sampling progress/input; it does not
write a second hidden keyframe track or run a shader wall clock.

Evaluation order is explicit: canonical value, authored property keys, enabled
animation channels in their existing order (add/multiply/replace), then normal
validated clamping. Driver input never mutates the canonical document during
playback. Strength and enabled state remain ordinary block properties.

## Drivers

| Driver | Default interaction | Compact controls |
| --- | --- | --- |
| Loop | Repeat output ramp | Period, range, phase. |
| Ping-pong | Forward then reverse | Period, range, easing. |
| Pulse | Smooth peak and return | Period, intensity. |
| Pointer X / Y | Map normalized owner position | Axis, range, smoothing. |
| Pointer XY | Bind two compatible targets | XY pad, ranges, smoothing. |
| Drag | Apply captured pointer displacement | Axes, strength, return/rebound. |
| Click | Trigger impulse or toggle | Primary/secondary, response, repeat policy. |

Spring response is sampled analytically from authored input events and elapsed
time. Scrubbing, reversed seeking and nonsequential export frames produce the
same result. Reduced-motion UI changes presentation without changing saved motion.

Color output uses two or more colors; booleans, choices and strings use discrete
states. Integer controls default to deliberate steps. Pointer bindings never
receive raw event objects in the portable document.

## Input take and export

An input take contains durable identity, rational event times, normalized values
and pointer/button state changes. Coalesce duplicate events and simplify within
an explicit error bound; retain clicks, releases, cancellations, extrema and
intentional corners. Do not generate one document keyframe per RAF.

The live web adapter supplies the same semantic input frame consumed by the pure
evaluator. Recorded takes travel with the project, duplicate with remapped IDs,
undo atomically and replay through the same program during scrub/export/headless
evaluation. No implicit global pointer or accumulated framebuffer is consulted.

For unrecorded live input, still export captures an explicit input sample. Video
export uses a recorded take; otherwise expose a concise choice to record input or
use the defined neutral sample. Never present an arbitrary pointer fallback as
a recorded performance. Interactive playback and rendered video remain distinct
outputs of the same declarative binding.

## Input ownership

Edit mode preserves selection, gizmos, orbit, panning and context menus. An explicit
interaction-test mode owns consuming drag/click bindings inside the canvas only.
Controls, popovers and timeline gestures are excluded. Escape, blur, visibility,
pointer cancellation, source replacement and unmount retire ownership and restore
unfinished previews. Hover/X/Y observation may be passive when it consumes no edit.

Primary click is the default. Secondary click binds only after an explicit choice
and only while testing; ordinary editor context menus remain available. Touch uses
the same pointer adapter, and keyboard actions provide a usable nonpointer test.

## Timeline integration

Mount one retained `MotionTimelineDock` for the active editor, independent of
workspace chrome. Reuse `TimelinePanel`, pin/hover behavior, focus ownership,
viewport reservation and transport. Studio's docks, object bar, notifications and
capture guides respect its actual occupied height and safe areas on mobile.

Show effect and composition-effect owners under their actual layers/composition.
Driver blocks share move/trim/enable/delete/details behavior. Detailed keys project
the authoritative channel points; they do not manufacture a second editable copy.
Input takes appear as linked recordings with a compact Record/Replay status.

Deleting an effect removes dependent bindings; duplication and clipboard remap
effect, owner, animation and take identities. Owner changes cannot leave a dangling
input listener or schedule work for a removed effect.
