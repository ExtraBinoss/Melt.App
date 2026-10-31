# Native multi-video playback witness

This workload uses eight **independent, unmodified 1920 × 1080 H.264 originals** from
[FOCA Stock](https://www.focastock.com/license), licensed CC0-1.0. `sources.json`
records each asset's source page, original URL, byte length, SHA-256 and native cadence.
Downloads stay in ignored `artifacts/video-stress/media/` (approximately 280 MB).
The helper verifies hashes and inspects actual stream metadata with `ffprobe`.

Use Bun, an installed Google Chrome with H.264 support, ffprobe, and the existing
Vite development server at port 6100. Run one native GPU cohort at a time, following
[the performance protocol](../../../docs/performance/protocol.md). On a shared
Linux workstation, bound the entire browser process tree:

```sh
systemd-run --user --scope --quiet \
  -p CPUQuota=400% -p MemoryHigh=2800M -p MemoryMax=3800M -p MemorySwapMax=0 \
  nice -n 15 bun test/performance/video-playback/run.ts --headed
```

The default headed run uses Chrome's normal GPU configuration. For an explicit
Vulkan comparison, add `--vulkan`; this is a different environment, not a substitute
for reproducing the user's GPU path. `--gpu` enables optional GPU timestamp profiling.
`--frames 20` shortens each sample; the default is 45, maximum 240. Warm statistics
exclude the first twelve preparations but retain every cold timing in `report.json`.

Scenarios, run serially:

- Four independent native originals, without effects.
- Eight originals, without effects.
- Eight originals with GPU Dither, ASCII, Cyanotype, blur, sparse Spin animations and masks.
- Four to eight originals across a timed layout handoff. This also exercises shrinking
  retained decode history before new streams enter the bounded memory budget.
- Twelve independent source-time streams: expected admission failure at the existing
  eight-stream safety boundary, rather than an unbounded browser crash.

The standalone witness bundles the **production core/render graph**, not a fake decoder
or separate video player. Originals are resolved directly, bypassing editor-generated
preview proxies. GPU output is full 1080p, displayed at 960 × 540 CSS pixels. The
composition clock uses exact frame samples; this measures preparation capacity,
**not wall-clock playback speed or physical screen FPS**. End-to-end editor/hover
presentation needs its own native interaction capture.

Output includes frozen executable JavaScript/source maps, project JSON, PNG captures
before resource disposal, browser/GPU configuration, all preparation timings, decoded
memory, optional timestamp samples, actual read-API counts and native frame/decoder
cleanup. PNG encoding occurs outside the measured loop. JavaScript GPU pixel reads
are forbidden in the render path. Resource leaks, double closes, unexpected rendering
errors and missing overload rejection fail the command.

For a controlled before/after comparison, `--baseline <directory>` loads reviewed
snapshots named `video-sources-before.ts` and `playback-before.ts`. Only these two
owners differ between frozen bundles. Retain the source diff and scope limits next
to the generated report; never infer a clean build from HEAD when other WIP exists.
