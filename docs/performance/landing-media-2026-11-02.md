# Landing media, product previews and navigation

## Delivered behavior

The landing carousel uses seven supplied recordings rather than live editor or
Three.js scenes. Each card links to its corresponding template dialog; opening
that dialog does not create a project. Its Open in Melt action retains the shared
opening surface until the canonical canvas is ready. Try Melt, the free-tools hub,
all six converters and their Back links use the same pointer-origin reveal.
Modified clicks, middle clicks and native link destinations remain available.

The reveal animates a native circle with transform and opacity. A Chrome layer
inspection confirmed a transform compositing reason. This is evidence for that
transition, not a claim that all application work happens on the GPU.

Native link dragging pans the carousel instead of dragging an HTML link. Pointer
hover pauses it; leaving resumes it. Keyboard focus retains its own pause intent.
Hidden and offscreen carousels stop their animation and inertia callbacks.
All bubbles share the same outer dimensions, including portrait recordings. Media
keeps its source aspect ratio, fills up to 92% of the bubble and inherits its radius.
The landing's Start creating buttons use the same 16 px, stronger label treatment
at mobile and desktop sizes.

The headline is now “Design and animate.”, with natural equivalents in all twelve
interface languages. Two short transform/opacity runs preserve Arabic shaping and
reduced-motion behavior. On mobile each run reserves its own line before the font
arrives. This fixes the observed one-line to two-line font swap that moved later
content by 44 px in an intermediate build.

## Prepared assets and bounded playback

Eight original recordings total 88,202,904 bytes; their silent VP9 WebM derivatives
total 4,027,230 bytes, a 95.4% reduction. Content-addressed videos and WebP posters
are recorded with original and derivative SHA-256 hashes, dimensions and durations
in [the media ledger](../media/landing-videos.json). The timelapse is a feature-card
recording, not a new project template.

| Recording         | Encoded dimensions | Duration | Video bytes |
| ----------------- | -----------------: | -------: | ----------: |
| Melt Mascot       |         1280 × 720 |      6 s |     140,385 |
| Bloom Windows     |         1280 × 720 |     12 s |   1,146,230 |
| Cornell Box       |          720 × 720 |      8 s |     228,492 |
| Angel.exe         |          406 × 720 |   12.8 s |   1,007,436 |
| Terminal Signal   |          406 × 720 |     16 s |     325,598 |
| Second Skin       |          406 × 720 |     10 s |     649,788 |
| Too Hot to Haunt  |          480 × 480 |    1.2 s |      62,804 |
| Feature timelapse |          720 × 720 |      5 s |     466,497 |

`scripts/landing-media/encode.ts` prepares these assets with FFmpeg: VP9, 30 fps,
CRF 38, a 650 kbit/s target, 900 kbit/s cap, two encoding threads and a maximum
1280 × 720 footprint without upscaling. Posters have a maximum 512 px edge. The
timelapse poster is sampled at 4.5 seconds because its initial frame is empty.
Playback holds its actual final frame for two seconds before restarting.

One page-level playback owner admits at most two visible players and retains at
most three sources. Server HTML includes the real poster and video geometry;
videos use `preload="none"` and acquire their source on visibility. The first
decoded frame triggers the poster fade. Reduced motion, Save-Data, hidden pages,
offscreen media and disposal stop playback and cancel delayed-loop timers and
frame callbacks. Rejected or stale play promises cannot revive a retired owner.

The supplied LotsOfEffects WebP was resized from 1920 × 1080 to 960 × 540 and
compressed from 923,870 to 79,036 bytes with its ICC profile preserved. Its hashes
are retained in [the image ledger](../media/landing-effects-image.json).

## Shared product components

Canvas, external-agent and Export feature panels use the existing React Button,
Input, Label, Switch, Kbd, SelectField and MeltMark components with theme tokens.
They do not render invented SVG interfaces or initialize an editing engine.
Their preview UI is in English, while surrounding marketing copy is localized.
The agent artwork fills its image frame and has no decorative download action;
the export panel displays the requested 1× resolution. Panels are inert,
decorative previews rather than misleading interactive controls.

These controls load near their panel's viewport entry. Server-rendered artwork
remains available until then, and the preview frame reserves its dimensions.
Neither final cold Lighthouse trace requested the Studio, App, EditorCanvas,
Three.js or product-panel Illustrations chunks.

Opening your studio uses the existing shared `Throbber`, with its 80 px mascot and
label below it. Violet-to-gray pulsation belongs to the shared throbber stylesheet
and covers both its initial raster and ready animated SVG. Existing inactive and
reduced-motion rules pause or disable it. A native browser test held the real
Studio module request, inspected the actual loading surface and captured the
mascot at the violet and gray phases. No substitute loading component was used.

The GitHub repository is now [ExtraBinoss/Melt.App](https://github.com/ExtraBinoss/Melt.App),
and the local origin fetch/push URLs use that name. Portable-format, package and
persistence identifiers are preserved. The README links the Melt recording and
embeds a 960 × 540 animated WebP derived from it: 120 optimized frames, a 5,999 ms
loop and approximately 668 KiB. GitHub's Markdown API strips raw video elements
but retains the linked image, so the README animation does not depend on a raw
HTML video element.

## Private production Lighthouse measurements

These are single local lab samples, not field percentiles. Each run used a fresh
foreground private Chrome for Testing 156.0.8078.4 context and Lighthouse 13.6.0.
Mobile uses default simulated mobile throttling, including 4× CPU slowdown;
desktop uses the desktop preset. Checks ran serially at low priority with a
200% CPU limit, 3.2 GB memory limit and no swap. The workstation's user browser
and development server remained running. Environment files preserve native Intel
Arc/Mesa GPU details and exact Lighthouse settings.

| Metric                         | Previous landing, mobile | Final mobile | Final desktop |
| ------------------------------ | -----------------------: | -----------: | ------------: |
| Performance                    |                       80 |           87 |            99 |
| FCP, simulated                 |                   1.36 s |       1.35 s |        0.28 s |
| LCP, simulated                 |                   4.28 s |       4.09 s |        0.87 s |
| Total blocking time, simulated |                   274 ms |      47.5 ms |          0 ms |
| Cumulative layout shift        |                        0 |            0 |       0.00102 |
| Speed index, simulated         |                   1.99 s |       1.58 s |        0.54 s |

Final accessibility, best practices and SEO scores are 100 on both devices.
Mobile LCP is still about four seconds under the simulated slow network and
remains a limitation. The small desktop shift is attributed to the display-font
swap. An intermediate candidate scored 73 on mobile with 0.0906 CLS; its trace
identified the headline line-wrap change described above. Its reports are kept.

The fresh control uses the previous landing based on `233a718`; the final frozen
tree uses committed base `ce0e90f` plus the owned overlays in
`artifacts/landing-videos/frozen-source-delivery.json`. Other committed application
work landed between those bases. These samples therefore compare delivered
builds; they do not isolate every score difference to one patch.

## Verification and retained evidence

Focused landing, carousel, media playback, template-dialog, opening-navigation,
tool-navigation and locale unit checks passed. Scope-limited production type
checks, type-aware lint, React lint, formatting and contribution rules passed.
All eight derivatives decoded without errors in FFmpeg, and asset checks verify
hashes, dimensions and byte budgets. The production Vite build passed.

Nine integrated native Chrome cases passed for decoded playback and budgets,
timelapse hold, native links, compositor reveal, template dialog to editor,
drag/pause/resume, real feature panels, first-paint locales and all converter Back
links. Two subsequent native checks passed after restoring the shared throbber,
then two passed for its violet/gray phases and final reveal. Captures include the
real feature panels in light/dark themes and on mobile. No repository-wide
coverage or complete release gate is claimed.

Ignored evidence lives under `artifacts/landing-videos/` (source hashes, logs,
browser captures) and `artifacts/lighthouse/landing-media-delivery/` (HTML/JSON
reports, compressed traces/devtools logs and environment files). The final build
is `artifacts/landing-refresh/review-src/artifacts/landing-media-delivery-dist`.

```sh
node artifacts/lighthouse/audit.mjs landing-media-delivery \
  http://127.0.0.1:4195 landing-mobile,landing-desktop
```

Only the temporary preview server uses port 4195. The user's port 6100 is untouched.
