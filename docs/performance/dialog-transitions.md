# Dialog presentation responsiveness

The 2026-10-31 investigation covers Preferences and static/Motion library details. Closing previously removed their entire dialog root immediately, bypassing Radix Presence and the exit animation. Preferences also published its visibility from ProjectDashboard; details selection changed the favorites provider owner. Both paths invoked the grid while opening/closing. These are distinct from document installation timings.

## Changes

- Modal visibility/selection subscribe at small Jotai leaves. The library, its favorites provider and card grid keep their current React inputs when a modal changes visibility. Mobile navigation subscribes to the same preference flag and still cancels swipes.
- Genuine Radix dialogs remain controlled through their closed state. Presence finishes the real fade, then releases the content and focus scope. Standalone Preferences reports dismissal after that lifecycle, and superseded/unmounted instances cannot dismiss a later screen. Focus returns to the actual opener.
- Shared dialog transitions animate opacity rather than scaling a large glass/backdrop surface. The first Preferences mount has one dialog transition; the requested blur reveal remains for subsequent settings-tab changes. Reduced motion disables both.
- Dialog entrance/exit participates in the shared UI-presentation coordinator. Optional Motion source preparation, compilation, GPU admission and frame requests yield to it. Waiting is cancellable, owns no fixed loading delay and releases its subscription on completion or disposal. Preview clocks freeze across presentation holds and manual pauses remain independent.

## Local diagnostics

A separate Chrome DevTools trace of the actual development dashboard recorded a 1,757 ms interaction: 5 ms input delay, 1,159 ms processing and 592 ms presentation delay. It includes tracing overhead and is **not** the baseline of the bounded comparison below.

The before/after diagnostic used a frozen worktree based on `e56b9ee` plus a recorded snapshot of the concurrently edited library cards, one native Chromium 156.0.8078.4 at 1440 × 900, Linux, Vite development mode, one browser worker, a one-core CPU quota for browser/server, 2.2–2.3 GiB limits and no swap. The GPU adapter was not identified. These are single local samples, not an SLA or a production INP cohort.

The table reports the largest observed animation-frame callback gap in each interaction window. Native pointer timestamps, CSS animation start/end events, exact source overrides and raw observations are retained in ignored `artifacts/overlays-before.json`, `overlays-after.json` and `source-freeze.json` in the isolated worktree.

| Interaction                         | Before: largest RAF gap | After: largest RAF gap |
| ----------------------------------- | ----------------------: | ---------------------: |
| First Preferences opening           |                333.3 ms |               149.9 ms |
| Preferences reopening               |                583.3 ms |                16.8 ms |
| Preferences closing, first / second |        283.2 / 483.3 ms |         16.8 / 16.8 ms |
| Static details opening / closing    |         16.8 / 116.6 ms |         16.7 / 16.8 ms |
| Motion details opening / closing    |         83.3 / 416.6 ms |         16.7 / 16.8 ms |

Test-only module probes count component **function executions**, not React commits. ProjectDashboard, LibraryBrowser and TemplateGallery each executed twice on every Preferences transition before the change and zero times afterward. Details no longer executes LibraryBrowser or TemplateGallery for selection/dismissal. Actual favorites changes still update the grid normally.

The earlier closing samples contain no content exit animation. Corrected samples retain distinct `dialog-surface-out` start/end events and visible intermediate-opacity frames before removal. The native regression records pointer-to-second-exit-RAF opportunities and verifies focus restoration, unchanged library executions, a real Motion canvas appearing after the entrance, genuine snapping controls and reduced motion. Callback/RAF observations are presentation opportunities, not physical display timestamps.

Cold modal setup still costs about 150 ms in this constrained development sample. Native modal focus/accessibility and body locking are preserved. Artwork single-click still waits for the existing 280 ms double-click decision; keyboard and explicit preview actions do not. Document loading, first GPU compilation and unrelated renderer throughput are separate workloads.

## Export close and background paint follow-up (2026-11-01)

The Angel.exe export close profile showed the entire App and export form rebuilding before the exit could start. Export and timelapse visibility now belong to a per-App Jotai atom observed only by their dialog owner. The export workspace retains stable props through closing. Native checks verify that opening, closing and reopening do not execute App again, while Radix still animates, restores focus and releases its modal lock.

Solid/Gradient publications also rebuilt unrelated Inspector and timeline controls. Background paint now has a narrowly subscribed leaf. The retained Inspector resolves compatible background/ruler metadata to the live canonical page; queued paint writes still reject intervening edits, loads and replaced artwork. Spatial controls retain fresh action ownership. Timeline duration controls consume only displayed inputs and capture a fresh revision when a gesture starts. Disabled compositing controls share a stable empty selection rather than invalidating their owner on every background edit.

Chrome for Testing 156.0.8078.4, Linux, Intel Xe-LPG WebGPU, 1600 × 1000 at DPR 1, Vite development mode: three native export closes were measured before and after with the same two-core CPU quota, bounded memory, one browser and a 1 ms CPU profiler. These are local diagnostic samples, not production percentile claims.

| Pointer to presentation opportunity | Before     | After      |
| ----------------------------------- | ---------- | ---------- |
| First observed closed state         | 143–220 ms | 65–113 ms  |
| First observed fading frame         | 189–257 ms | 93–153 ms  |
| Content removal                     | 407–459 ms | 320–355 ms |

Content removal includes the intentional exit transition and is not the close-handler cost. App and export-workspace work disappear from the close attribution; remaining work includes graphics submission and compositing. The final native overlay regression also checks actual playback progress, keyboard access, width, pointer release filtering and focus restoration.

The final Solid/Gradient witness on the same two-core development setup, without the CPU profiler, measured six pointer-to-control presentation opportunities at 161, 78, 113, 130, 140 and 102 ms, and corresponding new canvas draws at 213, 89, 155, 159, 192 and 147 ms. This removes identified React rebuilds but does **not** establish instantaneous switching or a consistent 60 fps interaction. A separate four-core diagnostic is not used as a before/after comparison. Raw profiles, cgroup accounting and native observations remain in ignored `artifacts/close-followup/`.

Focused regressions cover unchanged Inspector/header execution counts, exact single-command undo, current scene/dimension actions, cancellation, stale queued paints and stale duration drafts. They complement native timings; unchanged React counters alone do not prove responsiveness.
