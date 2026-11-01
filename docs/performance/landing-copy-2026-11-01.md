# Landing copy and rendering follow-up — November 1, 2026

## Delivered behavior

The heading is “Design with ease. Animate like a pro.”, with natural equivalents
in all twelve interface languages. The supporting sentence explicitly describes
simple static and motion design. Two additional cards describe Timelapse (10,000
history entries **by default**, not a hard maximum) and Export (images, timelapses,
MP4/WebM video with audio, selected resolutions and real-time preview). There is
no audio-only, unlimited-resolution or universal instantaneous-export claim.
Feature video slots remain ready for the user’s clips; no Three.js landing scene
was added. Copy followed the user-requested
[Copywriting skill](https://skills.sh/coreyhaines31/marketingskills/copywriting).

The headline animates two naturally wrapping text runs instead of a separate
masked, blurred, animated element for every character. This also preserves Arabic
shaping and readable narrow-screen font sizes. The FAQ uses native exclusive
`details` disclosures, including before JavaScript loads, and retains focus and
reduced-motion styling. Offscreen sections skip unnecessary layout/painting with
`content-visibility: auto`. The carousel retains one imperative controller, owns
its media-query subscriptions and starts after the initial layout commit.

The client reuses its already initialized translation instance; server rendering
retains request-local instances. The shared brand configuration supplies both the
UI font stylesheet and matching preload URL. The first real showcase poster is
preloaded with high priority; the larger body font is not preloaded ahead of it.

## Reproducible measurements

The control is the previous production landing, based on `fdf8938`. The candidate
is Git revision `94567ada121ec8fadf868f53b751d7e6e6d14a94` plus the owned overlays
recorded in `artifacts/landing-refresh/overlays-priority.json`. Both ran on the
same workstation in fresh private foreground Chrome for Testing 156.0.8078.4
contexts, using Lighthouse 13.6.0 default mobile simulation (4× CPU slowdown).
The final desktop run uses Lighthouse’s desktop preset. Native GPU information
and exact settings are retained beside each report. The harness is scoped to
200% CPU, 3.2 GB RAM, no swap, low priority, and one browser at a time. User Chrome
and the development server remain running, so these are local lab samples, not
field percentiles or a claim of identical external-machine load.

| Metric                            | Previous mobile | Final mobile | Final desktop |
| --------------------------------- | --------------: | -----------: | ------------: |
| Performance score                 |              81 |           82 |           100 |
| FCP, simulated                    |          1.36 s |       1.35 s |        0.29 s |
| LCP, simulated                    |          3.89 s |       4.28 s |        0.80 s |
| Total blocking time, simulated    |          304 ms |       204 ms |         63 ms |
| Cumulative layout shift           |         0.00329 |            0 |       0.00047 |
| Style/layout, observed trace      |        1,136 ms |       522 ms |             — |
| Paint/compositing, observed trace |          259 ms |       106 ms |             — |
| Script evaluation, observed trace |        1,002 ms |       871 ms |             — |

Accessibility, best practices and SEO score 100 on both final surfaces. Observed
trace work and simulated timings are different measurement boundaries; the rows
must not be added together. Rendering work and blocking time improved, but the
mobile LCP **did not improve**. It remains the first real carousel poster, below
the now longer localized hero; cold mobile startup remains a limitation. Do not
present the desktop score or reduced React work as proof that mobile LCP is solved.

An intermediate two-font-preload candidate scored 79 on mobile (LCP 4.40 s).
Removing the body-font preload and prioritizing the real first poster recovered
the score and speed index. The intermediate report is retained rather than hidden.
No content was delayed past the audit or removed to manufacture a score.

## Verification and artifacts

Focused landing/carousel/FAQ/routing units passed (nine files, 51 checks), followed
by the final copy/font-generator/route checks (eight checks) and two related
welcome navigation checks. Six real Chrome browser cases passed. The native
regression covers no-JavaScript FAQ keyboard
interaction, exclusive opening, shared tool-page FAQ behavior, 320/390 px text
bounds in French/German/Arabic/Japanese, touch language changes and anchor
navigation, and a real React commit probe during imperative carousel animation.

Ignored artifacts retain frozen source overlays, compiled outputs with source maps,
HTML/JSON reports, compressed traces/devtools logs, environment records and browser
screenshots. The final audit command is:

```sh
node artifacts/lighthouse/audit.mjs landing-refresh-priority \
  http://127.0.0.1:4194 landing-mobile,landing-desktop
```

Control and final servers use ports 4193 and 4194. Port 6100 is untouched. No
repository-wide coverage, global TypeScript pass or full release gate is claimed.
