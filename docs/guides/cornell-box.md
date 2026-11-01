# Cornell Box

An original 1080 × 1080, eight-second, 60 fps Motion template demonstrating
one native 3D scene per composition. Seven editable boxes form the room, ceiling
emitter and block; a silver sphere and brand-violet extruded text complete the
nine native objects. They sit under one genuine 3D group with a shared pivot.
The text uses shaped Inter outlines and remains editable.

One composition-owned **Camera orbit** Motion action moves the actual camera.
The reusable `scene-camera-orbit` recipe has one yaw channel and three poses:
+5° → −5° → +5°. Ease-in-out on both segments gives matching endpoint poses and
zero endpoint velocity. The parent group, its children and the shared lights stay
stationary throughout the loop. The group remains available for ordinary user
edits, with no turntable action or duplicate child actions. Camera Motion uses the
public engine command and the same interpolation, history and frame evaluation as
preview and export; no per-frame keys or custom renderer updates are generated.

All objects share camera, opaque depth, lights, cross-object shadows and bounded
scene-reflection probes. Sphere roughness is 0.26 for a softer silver finish.
Camera orbit changes the view while preserving the physical relationship between
objects and lights, so unchanged world-space reflection captures remain reusable.
This is realtime PBR raster rendering; probes approximate local reflections and
do not provide recursive path-traced global illumination. Transparent contributions
and post-composite 2D effects retain the normal layer order.

## Rebuild

Run `bun scripts/templates/cornell-box.ts` to regenerate the portable bundle and
replayable command journal. The template contains no embedded GLB or downloaded
model. The older procedural room builder remains a legacy fixture, not a source
for the current template. Generated JSON, `.musart` and command batches must all
come from the same builder revision.

Render the poster from the regenerated template through the actual native renderer
at time zero, then inspect it before copying it into the public template directory:

```sh
CHROME_PATH=/opt/google/chrome/chrome bun scripts/templates/render.ts \
  --url http://127.0.0.1:6100 --input apps/web/public/templates/motion \
  --output artifacts/cornell/camera-poster --template cornell-box --edge 512 --time 0
cp artifacts/cornell/camera-poster/cornell-box.webp \
  apps/web/public/templates/motion/cornell-box.webp
```

The portable-source revision and poster query are both `4`; publish the freshly
rendered poster with the regenerated source so gallery caches cannot mix revisions.
The render command reports its actual cache accounting and instrumented readbacks.
A poster from the earlier parent-turntable template is not evidence for this
camera-motion revision.

## Verification

`test/scripts/templates/cornell-box.test.ts` checks the native hierarchy, one
composition-owned camera action using the shared recipe, three sparse control
points, deterministic generated assets, command-journal replay, loop closure,
stationary objects/lights and undo/redo of camera-action strength.

`test/browser/cornell-box.spec.ts` samples the real camera at the beginning,
midpoint, exact end and last encoded-frame time on WebGPU and WebGL. It decodes
PNG pixels to check visible motion and loop closure, verifies that camera-only
samples reuse scene-reflection captures, and checks the gallery installation after
reload. The bounded native cohort keeps the actual eight-second loop and exports
32 frames at 4 fps on WebGPU. A separate full-rate case retains the full 480-frame,
60 fps WebGPU export and its original endpoint-fidelity assertions. Both decode
beginning, midpoint and final frames. Each encoded endpoint is compared with its
corresponding native sample. Production readback instrumentation stays active
during rendering and encoding. Pixel inspection runs separately from production.

```sh
bun run test -- test/scripts/templates/cornell-box.test.ts --maxWorkers=1
bun run test:browser -- test/browser/cornell-box.spec.ts --grep 'bounded' --workers=1
bun run test:browser -- test/browser/cornell-box.spec.ts --grep 'full-rate' --workers=1
```

The bounded cohort is appropriate for focused camera changes. Keep the full-rate
case available for release/export verification; a bounded pass is not a claim that
the full 480-frame export was run.

The gallery reload witness first waits for the actual editor kernel to recover the
installed project, then verifies its persisted camera action. Installation and
reopen each wait up to 30 seconds for the native canvas to attach before applying
the unchanged 30-second native-frame readiness check. This separates cold editor
module loading from rendering on an actual canvas. Observed click-to-attachment,
attachment-to-frame, reload-to-kernel and kernel-to-attachment/frame times are
recorded separately, along with the live/persisted project, canvas state, relevant
font/worker requests and browser errors. These are functional readiness boundaries,
not input-latency or end-to-end cold-load performance claims.
Gallery preview/install and persistent reopen are two serial
cases, each retaining a 90-second budget. They share one real browser context:
the second case reopens the project actually installed by the first, without
seeding a replacement document. Diagnostic captures are bounded to two seconds,
and teardown diagnostics cannot replace the original assertion failure.

The shared-scene witnesses in `spatial-composition.spec.ts`, `spatial-groups.spec.ts`
and `spatial-shadows.spec.ts` continue to cover cross-object reflections, actual
group-ring edits, cropped selection framing and shared directional/point shadows.
Their independent group-motion scenarios remain useful editor regressions; the
Cornell template itself moves the camera.

These commands are correctness checks, not frame-time benchmarks. Results and
poster measurements must be recorded after validating this camera revision; the
older parent-motion measurements do not establish its performance.
