# Melt brand and SVG animation API

The interface identity lives in `apps/web/src/ui/brand/`. `config.ts` supplies
`brand.name`, the saturated violet primary `#8B5CF6` and deeper action fill `#7C3AED`, the palette, mascot and asset paths.
The generated palette.css takes its values from config.ts; regenerate with the asset script.
Global CSS variables apply the same palette to both themes and Radix portals.
The same configuration owns the UI display font URL. `bun scripts/brand-assets.ts`
generates `typeface.css`, and the landing head preloads that exact source. The
Fontshare display font remains UI-only and is never offered as an editable
document font or redistributed as a font binary.
Primary actions and dark-theme switch thumbs use white. The slightly deeper
action fill keeps white labels legible while accent lines and the mascot use the same saturated violet primary. Translated product copy uses `brand.name`, not separate hardcoded names.

Existing local projects, `.musart` imports/exports, clipboard payloads, database
keys, automation methods, package names and GitHub URLs keep their established
identifiers. Changing the visible brand does not migrate or rename documents.

## Logo and real pending states

```tsx
import { brand, MeltLogo, BrandStatus } from "@/ui/brand";

<MeltLogo size={32} />                    // Decorative idle Dahlia; no RAF.
<MeltLogo size={64} decorative={false} /> // Accessible name: Melt.
<MeltLogo size={48} lively />            // Explicit idle animation and natural blinking.
<MeltLogo size={48} lively shape="pointer" /> // The same face morphs into a pointer.
<span>{brand.name}</span>
{exportPending && <BrandStatus state="preparing" size={28} />}
```

`BrandStatus` is decorative. The owning operation keeps its existing status text,
errors and cancellation action. Mount it only during real work. Never time it to
pretend an operation completed. `loading` morphs into the source engine's thinking
state; `preparing` uses its orbit state. Idle uses the genuine `fleur8` Dahlia with
its `surpris` expression. All paths come from Maskot's original engine. The opt-in `lively` prop keeps idle
playback active for an accompanying mascot; it stops when hidden, offscreen or
reduced motion is requested. Ordinary idle logos continue to own no frame clock.

An imperative operation can drive the same leaf without React frame updates:

```ts
import { createBrandActivity } from "@/ui/brand";
const activity = createBrandActivity(false);
activity.set(true); // The real request starts.
try {
  await prepareActualPreview();
} finally {
  activity.set(false);
}
// <BrandStatus state="preparing" activity={activity} />
activity.dispose();
```

An external source can instead supply `{ read(): boolean, subscribe(listener) }`.
Canvas startup subscribes to actual canonical presentation. Motion card previews
publish their real runtime status. No App, Inspector or canvas React component
subscribes to the mascot frame clock.

## Reusing SVG morphing

```tsx
import { MorphPath } from "@/ui/brand";
<svg viewBox="0 0 40 40">
  <MorphPath
    d={open ? "M4 16L20 28L36 16" : "M4 24L20 12L36 24"}
    stroke="#B39ADB"
    fill="none"
    strokeWidth={3}
  />
</svg>;
```

This is Maskot's copied numeric SVG interpolation, not a CSS string approximation.
Matching `d`/`transform` command topology, numeric opacity/stroke width and six-digit
hex colors interpolate directly. Incompatible topology or unsupported values snap
honestly to the new target. Retargeting starts at the displayed value. Hidden tabs
pause transitions; reduced motion completes them; unmount retires callbacks and
releases Motion controls and listeners.

For other mascot states, the complete clock-free source engine is available:

```ts
import { BotEngine, createDahliaEngine } from "@/ui/brand";
const engine: BotEngine = createDahliaEngine();
engine.setState("wink", 1);
const frame = engine.sample(1.25); // Deterministic SVG geometry, no browser clock.
```

The original timestamped `setShape`, `setExpression`, `setEyes`, `setEyeGeometry`,
`setState`, `blink` and `sample` methods remain available. The copied engine owns
geometry; UI adapters own clocks and DOM presentation. It has no core, React,
storage or GPU dependency. Original tests, licensing and checksums are described
in [provenance](../legal/provenance.md).

## Playback and disposal

The landing hero owns a separate finite choreography in
`components/projects/landing/hero/`. Its server-rendered `MeltMark` reserves the
mascot artwork before the lazy SVG face engine loads. The original silhouette
grows, holds and shrinks along the reference's continuous scale envelope. The
face makes one complete 360-degree spherical turn without rolling the body.
Mascot and title share a start epoch published after font preparation. Both finite
clocks paint at the display's RAF cadence and release work after completion. Hidden
and offscreen states pause the clock; reduced motion skips the character intro.

The choreography follows the supplied DevDay screen recording: scattered points
settle onto curve endpoints, glyph contours trace, and whole letters fill in a
left-to-right stagger. The exact shared display-font source is parsed lazily with
the existing text shaper. Native ranges position shaped glyphs; the original font
curves supply both outlines and control points. A retained SVG mask permits local
hover replays without splitting the native text or moving its layout. Font bytes
are fetched from their existing UI source, rather than copied into document fonts.
The first run is neutral, the next green, and a third uses the brand violet; the
palette repeats for additional runs. Outlines, points, fills and the final native
text keep their run's color in both themes, without splitting shaped text.
Hover packets coalesce into a single frame that reads current surface geometry
before SVG writes. Replay depends on active pulses rather than a remembered
letter: the same glyph remains replayable after completion, and pointer movement
works when paths are rebuilt underneath an already hovered heading. A pointer
retained during the entrance starts its hover replay when the entrance finishes.

If the display font does not cover a script, browser-shaped text and a native
contour filter retain its actual fallback glyphs, Arabic shaping and CJK wrapping.
These contours use glyph alpha without pixel readbacks. Geometry is rebuilt on
resize, asynchronous results reject stale owners, and completed or unmounted
animations release their RAF, listeners, observers and retained SVG nodes. Reduced
motion and JavaScript-disabled pages show the complete native heading immediately.

The branded playback adapter owns at most one RAF and updates retained SVG
attributes at most 30 times per second. Geometry sampling and path morphing run
on the CPU; the browser owns SVG painting and compositing. Idle requests no
frames. Document visibility, reduced motion,
intersection visibility and actual operation activity stop unnecessary work.
Resuming does not advance a hidden clock or queue missed frames. Completed
operations stop immediately, and every instance releases observers, callbacks,
SVG nodes and pending frames on unmount, including StrictMode replay.

## Verification scope

The copied engine keeps its full upstream geometry witnesses. Run the exhaustive
catalogue and fit-table checks explicitly when changing geometry or catalogue
data, rather than for an unrelated UI adjustment:

```sh
bun x vitest run apps/web/test/ui/brand/engine/skins-catalogue.test.ts apps/web/test/ui/brand/engine/eyefit.test.ts --maxWorkers=1
```

On the bounded Linux workstation (Node 24.19.0, one worker, CPU quota 200%, heap 1536 MiB), the
complete 60-frame shape/expression/eye-contour matrix took 39.678 seconds, the
oscillation witness 3.433 seconds and the full table reconstruction/equality
check 0.596 seconds. These are test costs, not interactive frame-rate claims.
The application imports the precomputed table and never calls its full rebuild.

`test/browser/brand.spec.ts` checks the mobile SVG identity in both themes,
decodes all three install-icon sizes, and holds a genuine template download while
observing the animated SVG. Its pending/reduced-motion witness preserves all
five editor React counters, performs zero GPU/WebGL/Canvas readbacks and cancels
without changing the current document.

Theme changes crossfade the complete interface through native View Transitions when available. Initial application, unchanged resolved colors and reduced motion apply immediately. System-color changes use the same path; rapid selections supersede pending transitions without a React frame loop.

## Immediate native artwork

Use `MeltMark` for decorative interface marks. Its transparent 256 px WebP is
rasterized from the same timestamped idle engine frame (`bun scripts/brand-assets.ts
--webp`). It reserves the final dimensions in server HTML and requires no animation
code to display. Header and footer links acquire the SVG only on fine-pointer hover
or focus; touch and reduced-motion idle marks remain native images. Leaving the
link crossfades to the image and releases the SVG leaf.

Real loaders use the same mark with `state="working"`. The native image remains
visible while the animation module loads, then crossfades only after the first SVG
frame has been painted. There is no simulated progress or extra completion delay.
`BrandStatus` displays immediately beside an existing pending label; standalone
`Throbber` keeps its configurable reveal delay for short operations.
