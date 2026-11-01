# Export dialog and print output

Image, Motion and Timelapse use the same responsive dialog: useful settings in
the scrolling left column, a preview/player in the right column and a fixed
footer. Extra encoder controls are collapsed under **Advanced**. PDF controls
are collapsed under **Print**. The ordinary export path is two clicks: open,
then export. Switching output type uses one direct segmented choice, so that
path also takes three clicks. The editor has one full Export button; Timelapse
is selected in the dialog's output group. Opening export pauses editor
playback; closing does not resume it.

The captured artboard ID is independent of the active editing page. A selected
layer/group defaults to selection output; **Whole artboard** restores the full
canvas. Choosing a different artboard clears the previous page's selection.
Motion and replay retain the selection's final authored crop across frames,
rather than moving the output crop with the animated content. Independent audio
tracks are excluded from selection video; selected video layers retain their
own source audio. Whole-artboard export retains the normal audio mix.

## Task ownership

One export belongs to the editor session, independently of the dialog. A shared
job publishes integer progress to the dialog and the export button. It never
publishes frame/progress state into App, Inspector or the canvas. The document
snapshot and originals are frozen at execution; subsequent ordinary edits can
continue. Same-ID reloads and project replacement cancel the task and reject
late delivery. Legacy synchronous consumers retain strict stale-scope checks.

Between video/replay frames, the background gate yields a real task and defers
GPU work during active pointer, wheel and drag gestures. It owns and disposes
its input listeners. Preview disposal is awaited before the full-resolution
export context is allocated. A closed dialog releases only its own preview;
it does not abort the session's encoding task.

Cancel remains pending until actual encoder/renderer cleanup finishes. Another
export cannot start during cleanup. Progress is monotonic, capped at 99% until
the encoding, finalization and delivery promise succeeds; no partial file is
downloaded. Failures retain their actual cause for the export status surface.
History, preview and export failures display a red alert with a copy button for
the original message, stack and bounded cause chain. Export failures also log
their kind and project identity with the actual error in the browser console.
Runtime disposal drains/cancels the task before retiring fonts and storage.

Project switching and route navigation share one confirmation. **Stay in
project** retains the task. **Cancel export and leave** waits for cancellation
before replacing the project. Native reload/close uses the browser's own
`beforeunload` confirmation, whose wording is controlled by the browser.

## Color targets

New canvases can target sRGB or CMYK. The portable `colorSpace: "cmyk"` automatically
applies an ICC soft proof to the main canvas, thumbnails, Motion and Timelapse.
The GPU compositing buffers remain RGB, but the visible document previews the
same CGATS21 CRPC6 / Perceptual print conversion used by native CMYK export.
Transparent artwork is shown over white paper, as in print output. This is
color-managed display, not four-channel ink/separation editing. The former `cmyk-proof` value remains
readable as a legacy generic simulation; it is not the new CMYK output target.
Display-P3 documents retain the existing explicit conversion to sRGB output.

The display proof samples a precomputed 86³ RGBA8 lookup texture in the final
GPU pass. It requires 2,544,224 bytes per renderer, accounted in the existing
GPU LRU, with one shared immutable CPU copy. It loads only for CMYK display,
renders on demand and performs no runtime CPU pixel conversion or GPU readback.
Regenerate it with `bun scripts/color/print-proof.ts`; `--check` verifies the
table/profile checksums. The synthetic build-time grid uses the same native
ICC library and unmodified profiles as export. Both WebGPU and WebGL use TSL.

`RenderOptions.colorOutput: "source"` bypasses the display proof only before
native CMYK encoding. Display/source frame and preview caches are distinct;
the export preview performs its native proof once, while RGB image/video output
keeps the document's proofed appearance. No proof is baked into native CMYK input.

The LUT is an interpolated display approximation, not a promise of bit-identical
RGB values after an 8-bit CMYK round trip. Against 10,000 seeded random samples
through independent Pillow/LittleCMS, maximum channel error was 13/255, p99 4/255
and mean maximum-channel error 0.704/255. Sharp 8-bit ink quantization boundaries
cause the largest differences. Screen calibration, viewing light, press and
paper still determine the physical match. WYSIWYG here uses one explicit print
profile throughout the canvas/preview/output pipeline.

| Output             | Color contract                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| PNG / WebP         | sRGB; native file encoding and embedded RGB ICC profile.                                                                                     |
| JPEG / TIFF        | sRGB or true four-channel CMYK with embedded ICC profile.                                                                                    |
| PDF                | Raster artwork with an ICCBased image, output intent and vector print marks; sRGB or CMYK. This is not advertised as a certified PDF/X file. |
| Motion / Timelapse | RGB native video encoding; CMYK is a print-image option.                                                                                     |

CMYK uses the unmodified **CGATS21 CRPC6** standard profile from Idealliance /
X-Rite with a perceptual rendering intent. It is a standard print target, not a
promise of a match on every press or paper. The UI identifies the profile and
asks users to check it with their printer. Profile attribution, license and
download origin are in `packages/render/assets/profiles/NOTICE.md`.

The managed encoder is lazy-loaded in a disposable module worker. Native canvas
encoding produces a PNG file; ImageMagick/LittleCMS in WebAssembly decodes that
file, transforms its color and encodes the result. GPU pixels never cross into
JavaScript arrays. Neither canvas `getImageData`, WebGL `readPixels`, GPU buffer
mapping nor VideoFrame `copyTo` is used. The worker is terminated on cancellation
and on completion. Multi-artboard ZIP packaging also runs in an abortable
worker, with transferable encoded buffers and a 128-MiB archive bound. Conversion has a 32-megapixel / 128-MiB input limit and a
512-MiB native memory ceiling; excess work fails visibly.

## Print geometry

PDF defaults to 300 dpi, no added bleed and no marks. Print options include
0–25 mm bleed, crop marks, registration marks, CMYK color bars and the actual
artwork name/profile. Bleed extends the document render domain, retaining real
artwork beyond the trim; it does not stretch or mirror edge pixels. Transparent
areas are flattened against white paper for CMYK and PDF.

The PDF contains explicit MediaBox, BleedBox and TrimBox values. Crop marks sit
outside the bleed. Registration uses the PDF `/All` separation. Print marks and
labels stay vector paths/text; the composed artwork uses the existing GPU graph.
The preview and PDF share page/mark geometry. The preview embeds a native
CMYK-to-sRGB soft proof and uses screen approximations for the solid ink bars.

## Verification

`test/browser/export-dialog.spec.ts` exercises real Chrome input, downloaded
files, selected scopes, background cancellation, leaving confirmation and all
three dialog types. The print witness decodes the PDF with Poppler and verifies
PNG dimensions/color, embedded four-channel ICC output, page boxes and document
immutability. Pixel/video inspection is separate from production readback probes.
Focused service/UI tests cover cleanup gates, stale identity, actual errors,
monotonic progress, print geometry and fixed selection crops.

Executed on 2026-10-31 with Chrome 154.0.8037.97 on Linux: nine relevant
native scenarios passed, including WebGPU/WebGL, DPR 3 backing density, selected
mask alpha, inactive artboards, decoded videos and background cancellation.
The final print/mobile follow-up also passed against the production client under
`CPUQuota=100%`, `MemoryHigh=1600M`, `MemoryMax=2200M`, `MemorySwapMax=0` and
low CPU/I/O priority. Its TIFF CMYK sample matches the independent Pillow/LittleCMS
ICC reference exactly; JPEG differs by one 8-bit level in two ink channels.
Production readback probes remain zero. These are functional witnesses, not
input-latency benchmarks. Logs and captures are retained in `artifacts/export-dialog/`.

The subsequent CMYK-canvas witness (`test/browser/cmyk-canvas.spec.ts`) passed
on both WebGPU and WebGL in Chrome 154 on Linux, at 1600 × 1000 / DPR 1.
On its eight-patch color/alpha grid, the largest canvas-to-native-preview or
canvas-to-independently-decoded-TIFF channel difference was 1/255. RGB delivery
matched the displayed proof; switching to sRGB and undo restored the expected
unproofed/proofed colors. The 50-photo / 100-effect workload also passed with
bounded GPU accounting and unchanged GPU-pass/React-commit counts across idle
frames. All production readback counts were zero. These checks used one CPU
core, low CPU/I/O priority and no swap, with a 3,000 MiB memory ceiling. See
`artifacts/cmyk-canvas/` for captures and reports; the random-color precision
limits above remain applicable beyond the grid.

Primary references: [ICC CRPC6 profile and license](https://registry.color.org/profile-registry/CGATS21_CRPC6),
[LittleCMS ICC soft-proofing](https://www.littlecms.com/LittleCMS2.18%20tutorial.pdf),
[Affinity soft-proof/export guidance](https://www.affinity.studio/blog/screen-to-paper-how-to-hand-off-your-logo),
[native ICC conversion API](https://github.com/dlemstra/magick-wasm),
[canvas serialization color contract](https://html.spec.whatwg.org/multipage/canvas.html).

Motion, Timelapse and local tools use the shared [media player](../guides/media-player.md).
Motion preview monitoring starts muted and reuses the bounded audio mixer. Monitor
volume never changes authored audio or the delivered file. Selection monitoring
excludes independent audio tracks and unselected video sources.

## Preview presentation

Export controls and the dialog paint before GPU preparation. Image, Motion and
Timelapse previews are admitted when the actual panel entrance animation finishes;
reduced motion admits them on the first frame, with no artificial minimum wait.
Closing before admission cancels it. All three outputs reuse the shared 56 px
mascot/shimmer throbber used by the canvas, with the same delayed appearance.
A 240 ms crossfade retires feedback only after image decode or an actual rendered
canvas frame. Readiness belongs to the captured preview owner; stale callbacks,
errors and cancelled scopes cannot reveal a different preview. Reduced motion
skips the crossfade, and failures replace feedback with an honest error message.

The footer reserves its control height and paints progress along its bottom edge,
so job updates never resize the dialog or preview. The footer groups file size and its help beside the export actions. Background
help appears beside an active job, rather than as an isolated idle icon. Mobile
reserves two footer rows so progress and completed sizes cannot move the buttons.
Terminal jobs from earlier openings are hidden; a currently running job remains
cancellable.

Before the first Motion export, **Target size** explicitly identifies the nominal
bitrate calculation, including enabled audio and a 2% mux allowance. It is not a
content measurement: VBR can produce a smaller or larger file. Timelapse uses a
quality-based encoder and therefore has no invented 8 Mb/s initial estimate.
During either video export, encoded packet byte counts and durations refine the
estimate after a full two-second GOP (or the whole clip for shorter outputs).
Audio and video rates are measured separately so asynchronous encoder output does
not count audio twice or extrapolate it from video progress. Measured payloads do
not receive the nominal calculation’s guessed 2% allowance; actual container
metadata is included at finalization. The estimate still
assumes the remaining content compresses like the encoded portion; a scene change
can alter it. Finalization and successful delivery replace it with the actual
Blob size, also for image/PDF/ZIP output.

Completed byte measurements are session-local, with at most 32 settings per weakly
held canonical document/replay. They can be reused for an identical captured scope;
selection, centering, resolution, format, timing, bitrate, audio and document edits
cannot adopt another scope's measurement. Failed, cancelled or invalid outputs do
not enter this cache. Short preview surfaces place preparation feedback horizontally so the mascot and
label fit without clipping. No file buffers, extra render pass, preflight encoding, pixel
readback or IndexedDB writes are required. Job updates remain bounded by integer
progress publications. Units use the shared decimal formatter (including French
Mo/ko) rather than a hardcoded MB suffix.

The packet metadata contract is provided by
[Mediabunny's encoded-packet callback](https://mediabunny.dev/api/VideoEncodingConfig).

Motion preview GPU admission yields to shared overlay entrances while retaining
the running transport/audio clock. The volume trigger acquires that lease at
pointer-down or keyboard activation. Select menus keep their width during entry,
tracking only a live ancestor entrance and releasing their observers on close.

On 2026-11-01, focused Chrome 156 checks on Linux verified the shared Motion,
image and Timelapse footer, scope changes, dialog reopening and 390 × 844 mobile
geometry. Service regressions cover cancelled/failed measurement handling. Angel.exe delivered a decoded
1080 × 1920 AVC file lasting 12.8 seconds; the displayed completed size matched
all 12,682,701 downloaded bytes. Actual GPU/WebGL/canvas/VideoFrame read probes
remained zero. A separate native layout witness verifies preparation labels in
76 px and 160 px preview surfaces. These are functional checks, not latency
benchmarks. Captures and logs are in `artifacts/export-size/`. Browser checks used
one worker, a one-core CPU quota, no swap and a 3200 MiB memory ceiling.
