# Library startup, initial styles and native brand artwork

Follow-up to [the first Lighthouse pass](lighthouse-2026-11-01.md). Measurements
use Chrome for Testing 156.0.8078.4 and Lighthouse 13.6.0, fresh private contexts,
empty browser caches/storage, foreground tabs and standard simulated mobile
settings (4× CPU slowdown). Linux commands run serially at nice 19 with a 200%
CPU budget, 3.2 GB memory maximum and no swapping inside the browser scope.

## Changes

- Render actual dashboard content on the server. Explicitly link its presentation
  stylesheet and the compiled search-field styles in the document head. Merely
  importing shared CSS from a route did not make the production server include
  it: extraction retained it in the lazy ProjectDialog chunk. Development also
  removed its temporary SSR sheet before that chunk initialized.
- Acquire project metadata, cached thumbnails and fonts independently of the
  editing runtime. Hand the same real resource owners to the editor on opening;
  abort stale leases and release late asynchronous results. Cached library reads
  do not construct an engine or read media originals and large journals.
- Defer creation forms, native preview engines and the footer's genuine language
  picker until intent. Encoded card playback retains a server-rendered video
  poster instead of inserting its first visible video element late in startup.
  Touch visibility autoplay and full originals for editing/export remain intact.
- Measure mobile navigation stride through ResizeObserver rather than forcing
  synchronous mount/translation layouts. Retain the observer across label
  changes and confine layout to the navigation. Read carousel geometry before
  restoring presentation styles. A diagnostic 4× CPU profile attributed about
  261 ms of sampled self time to the old navigation measurement.
- Seed SSR from a validated functional language cookie, without mutating the
  shared server translation registry. Migrate existing local-storage preferences
  once before visible content; blocked cookies do not cause reload loops. Client
  hydration uses the document's initial locale.
- Paint decorative marks from a transparent 256 px WebP (14,084 bytes), generated
  from the original idle mascot frame. Header/footer idle SVG animation loads
  only on hover/focus and releases after leaving. Real loaders retain the image
  until the first SVG frame is painted. No new rendering engine is involved.

## Measurements

A single ordered mobile dashboard control/candidate pair in the same session:

| Metric            | Previous frozen build | Candidate |
| ----------------- | --------------------: | --------: |
| Performance score |                    50 |        68 |
| FCP               |               1.057 s |   1.845 s |
| LCP               |               8.024 s |   3.607 s |
| TBT               |              1,070 ms |    914 ms |
| Speed Index       |               4.620 s |   2.558 s |
| CLS               |              0.000215 |  0.004850 |

The previous build's early paint included its startup indicator; the candidate
paints useful server content. Native video posters and early styles remove the
late visual replacement. Hydration still has a material mobile CPU cost: this is
not an instant-interaction or field-INP claim.

Other candidate runs:

| Page/device       | Performance |     FCP |     LCP |    TBT |
| ----------------- | ----------: | ------: | ------: | -----: |
| Landing/mobile    |          82 | 1.357 s | 3.867 s | 286 ms |
| Landing/desktop   |          99 | 0.333 s | 0.855 s |   0 ms |
| Dashboard/desktop |          94 | 0.410 s | 0.957 s | 178 ms |

Accessibility and Best Practices were 100 throughout. Landing SEO was 100;
dashboard SEO remains 66 because its intentional noindex is preserved. The
landing's earlier historical mobile score was 84; this follow-up does not claim
an improvement to that aggregate score. Its current first/largest paints are
earlier, while CPU blocking remains a follow-up opportunity.

The workstation experienced substantial memory and disk contention during
intermediate runs: one dashboard run measured 47 with 13.3 s TBT, while another
measured 50 with 1.26 s TBT. These reports and pressure samples are retained as
diagnostics, rather than hidden or used to claim an optimization. Even the paired
result is one local observation, not a statistical guarantee. The measured tree
also includes the concurrent stable-dependency/Three r187 update.

## Verification and provenance

Scoped production Oxlint type-aware/type-check and ESLint checks passed. The
frozen measured tree passes repository rules with zero violations and synchronized
workspace versions. An additional test-source typecheck exposed missing Vitest 5
DOM-matcher augmentations after the concurrent dependency update; runtime unit and
browser checks pass, but no full-project typecheck/CI pass is claimed. The live
shared tree contains concurrent unfinished edits; rules were therefore run on
the frozen measured tree, without modifying or staging those unrelated changes.

Focused behavior checks cover runtime/data ownership, cancellation, retries,
StrictMode leases, thumbnail suspension handoff, deferred preview cleanup,
creation dialogs, locale isolation/migration, native video source release and
navigation measurement. Integrated Chrome checks cover:

- Header/footer image decode, transparent corners, deferred SVG acquisition,
  actual animation and release after leaving.
- A deliberately blocked SVG chunk during startup: the native image stays
  visible, then the real animation starts after release.
- Dashboard styles while studio JavaScript is blocked, including development
  SSR-sheet removal; real cards and final layout with JavaScript disabled.
- Touch language selection, French SSR/first paint, concurrent German request
  isolation, visible desktop navigation bounds and one-time legacy migration.
- Encoded touch playback, a native GPU dialog, full original installation,
  metadata-only persisted-project reload and reopening the same durable ID.
- Both themes, install artwork, and genuine pending-template animation with
  cancellation, reduced motion, unchanged editor React counters and zero
  production pixel readbacks.

Ignored `artifacts/lighthouse/` retains the `mobile-ready`, `mobile-polish`,
`control-quiet`, `polish-quiet` and `polish-desktop` reports, traces, private-context
and GPU records. Frozen source trees, exact file hashes, source diffs and matching
production assets/maps accompany the builds. `artifacts/lighthouse-mobile/`
retains CPU profiles, native browser results, pressure samples and focused check
logs. Build outputs use the frozen tree's `artifacts/lighthouse-dist`; preview
ports were 4189/4191, separate from user development port 6100.
