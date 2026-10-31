# Cornell Box

An original 1080 × 1080, eight-second, 60 fps Motion template demonstrating
one native 3D scene per composition. Seven editable boxes form the room, ceiling
emitter and block; a silver sphere and brand-violet extruded text complete the
nine native objects. They sit under one genuine 3D group with a shared pivot.
The text uses shaped Inter outlines and remains editable.

The parent carries one ordinary **3D · Turntable** Motion action, with one rotation
channel and three poses: −5° → +5° → −5°. Ease-in-out on both segments gives matching
endpoint poses and zero endpoint velocity. Children need no duplicate actions or
sampled per-frame keys. Native parent motion, independent child motion and ordinary
layer effects use the same document engine and history.

All objects share camera, opaque depth, lights, cross-object shadows and bounded
scene-reflection probes. Sphere roughness is 0.26 for a softer silver finish.
This is realtime PBR raster rendering; probes approximate local reflections and
do not provide recursive path-traced global illumination. Transparent contributions
and post-composite 2D effects retain the normal layer order.

## Rebuild

Run `bun scripts/templates/cornell-box.ts` to regenerate the portable bundle and
replayable command journal. The template contains no embedded GLB or downloaded
model. The older procedural room builder remains a legacy fixture, not a source
for the current template.

The current poster is a real native 512-pixel render at time zero:

```sh
CHROME_PATH=/opt/google/chrome/chrome bun scripts/templates/render.ts \
  --url http://127.0.0.1:6100 --input apps/web/public/templates/motion \
  --output artifacts/scene-reflections/poster --template cornell-box --edge 512 --time 0
```

Inspect the result before copying it to the public template directory. Change the
Cornell portable-source revision and poster query together when shipping a new
scene so gallery caches cannot mix revisions.

## Verification

`test/scripts/templates/cornell-box.test.ts` checks the native hierarchy, sparse
Motion action, journal replay, loop closure and undo. Native Chrome witnesses in
`spatial-composition.spec.ts`, `spatial-groups.spec.ts` and `spatial-shadows.spec.ts`
cover shared occlusion/reflections, actual group-ring gestures and undo, directional
and point cross-object shadows, cropped selection framing and a decoded six-frame
H.264 group-Motion export. The Cornell start/end PNGs also close after evaluating
the intermediate moving pose. These checks cover both WebGPU and WebGL where
specified, with production readback instrumentation.

The refreshed poster was generated on Linux/Chrome 156 with one worker and a
one-core CPU limit. It prepared nine meshes / 20,188 triangles and two 128-pixel
probes. Reported cache accounting was 79,742,680 bytes under a 128 MiB session
budget, with zero instrumented GPU/WebGL/Canvas/VideoFrame production readbacks.
This is cache accounting, not measured driver VRAM or GPU duration. A full-length
480-frame export has not been rerun for this revised native hierarchy.
