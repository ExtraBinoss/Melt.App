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

## Personal interface accents

Appearance preferences offer six curated interface palettes in `ui/brand/accents.ts`.
Each supplies theme-specific primary text, selection and focus colors, plus a
separate action fill and contrasting foreground. Brand assets and document colors
retain their original values; audio, video and error semantics remain independent.

The validated `musart.accent.v1` local preference stores a palette ID. A shared
pre-hydration script and an imperative Jotai subscription apply the same tokens to
the document root, including portals and the timeline's observed canvas palette.
Theme changes reapply the selected variant. Storage events synchronize other tabs;
blocked storage keeps the current session usable and the settings report failed
persistence. Menu hover/focus previews stay inside the two theme samples until an
option is selected. Closing the menu cancels the preview.

Focused palette checks require 4.5:1 for primary text against supported neutral
surfaces and for labels on primary/action fills, including action hover opacity;
focus accents require 3:1. These checks cover the accent roles, not an accessibility
certification of the entire application.

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
mascot artwork before hydration. The landing module includes its critical SVG
face engine so it does not arrive after the now-cached title geometry. The original silhouette
grows, holds and shrinks along the reference's continuous scale envelope. The
face makes one complete 360-degree spherical turn without rolling the body.
Mascot and title share a start epoch published after font preparation and mascot
surface readiness; aborted title owners release the readiness handshake. Both finite
clocks follow elapsed foreground time at the display's RAF cadence; slow visible
frames do not stretch the authored duration. They release work after completion. Hidden
and offscreen states pause the clock; reduced motion skips the character intro.

The choreography follows the supplied DevDay screen recording: scattered points
settle onto curve endpoints, glyph contours trace, and whole letters fill in a
left-to-right stagger. The known translated titles reuse generated UI glyph graphics
from the exact shared display-font source at weights 650 and 700. Regenerate them
with `bun scripts/brand/hero-font.ts` after changing the landing copy or font. The
manifest records the source URL and font SHA-256; bounded JSON shards deduplicate
glyphs across languages. Native ranges still position shaped glyphs, and original
font curves supply both outlines and control points. Unknown text or weights use
the existing lazy text shaper; known unsupported scripts select the native contour
fallback without loading that parser. The browser waits for the specific display
face rather than unrelated document fonts. A retained SVG mask, attached only while a hover pulse is active, permits local
hover replays without splitting the native text or moving its layout. Font bytes
are fetched from their existing UI source, rather than copied into document fonts.
The closing headline prepares its hover geometry only near the viewport or on
pointer intent, so it does not force offscreen layout during the hero entrance.
Retained SVG painting skips unchanged attributes and completed glyphs. An active
surface remains visible while replacement geometry is prepared; replacements
resume stored foreground progress instead of elapsed wall time. Incidental scroll
and font/layout adjustments do not cancel the writing entrance. Poster-first landing
videos acquire their sources after writing settles while the hero is visible, so
decoder startup does not compete with the mascot and glyphs. Leaving the intro
admits visible feature videos; returning suspends them until writing completes. Reduced motion still keeps posters.
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
attributes at the display's refresh cadence, including 120 Hz. Geometry sampling and path morphing run
on the CPU; the browser owns SVG painting and compositing. Idle requests no
frames. Document visibility, reduced motion,
intersection visibility and actual operation activity stop unnecessary work.
Resuming does not advance a hidden clock or queue missed frames. Completed
operations stop immediately, and every instance releases observers, callbacks,
SVG nodes and pending frames on unmount, including StrictMode replay.

The shared `Throbber` keeps its label readable as native muted text. Its violet
highlight uses a static gradient/mask and two opposite CSS transforms: the mask
travels while the text stays aligned. No animated background repaint or JavaScript
frame callback drives that sweep. A subtle composited float accompanies the native
mascot morph; reduced motion removes both decorations. Project opening supplies
the known project name, with a bounded cancellable metadata lookup for direct routes.

## Verification scope

Search palettes share `PalettePanel` and `PaletteReveal`. The shell fades over
120 ms; row text reveals with 2 px blur over 160 ms and at most 64 ms of stagger.
Neither shell nor glyphs scale or move. Radix placement and autofocus complete
before the first visible frame. Cmd+K retains its modal focus ownership; Quick Add
uses a nonmodal pointer-anchored popover. Advanced Studio and scene parameter
surfaces use the same shell with a whole-surface blur, including Activity resume.
Reduced motion presents the final state immediately.

The opening phase is a local Jotai atom. The first query/category interaction
retires it once, without per-frame state updates. Subsequent results mount without
blur listeners or another entrance; tab changes therefore do not replay a dark
loading sweep. Both searches reuse a store-local command catalogue, cached
translations and availability projections. The placeholder typewriter writes only
the native input placeholder. Actual compositor and input measurements, including
their limits, are in [the palette report](../performance/palettes-scene-previews.md).

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

The focused compositor witness (`test/browser/throbber-compositor.spec.ts`) records
actual browser frames during an intentional 1.6-second JavaScript task and compares
label pixels in a separate inspection page. It confirms that the violet highlight
keeps moving and that reduced motion removes the decoration. The 120 Hz clock
regression is synthetic; it is not a measured 120 fps guarantee on physical hardware.
