# Cornell Box

An original 1080 × 1080, eight-second, 60 fps Motion template demonstrating
native 3D sources. The red/green room, ceiling emitter, block and silver sphere
are one small procedural GLB. The violet chrome word uses Melt's brand settings
and remains a normal editable, extruded text layer.

Both sources carry one ordinary **3D · Turntable** Motion action. Each action
has one rotation channel and just three poses: −5° → +5° → −5°. Ease-in-out on
both segments gives identical endpoint poses and zero endpoint velocity. There
are no property-keyframe tracks or sampled per-frame animation data.

The room has a shadowed overhead spot, subtle colored fill lights and studio
reflections. This is a realtime PBR study, not a ray-tracing mode. Physical room
shadows remain inside the imported source; the separate floating word keeps its
text, font, extrusion, color and material controls editable.

## Rebuild

Run `bun scripts/templates/cornell-box.ts` to regenerate the portable bundle and
replayable command journal. All geometry is original procedural data generated
by `scripts/templates/cornell/room.ts`. There are no downloaded models, external
binary references, baked scene movies or new dependencies.

The poster is a real native render at two seconds:

```sh
CHROME_PATH=/opt/google/chrome/chrome bun scripts/templates/render.ts \
  --url http://127.0.0.1:6100 --input apps/web/public/templates/motion \
  --output artifacts/cornell/poster --template cornell-box --edge 640 --time 2
```

Inspect the result before copying it to the public template directory. The
focused authoring tests are in `test/scripts/templates/cornell-box.test.ts`;
`test/browser/cornell-box.spec.ts` checks decoded native pixels, both backends,
loop closure and an actual 60 fps native Motion export. A gallery check also previews the
template, opens it in Melt and reloads the saved project.

The focused native check passed in Chrome 156 on Linux using WebGPU and the
WebGL fallback. Exact start/end PNGs have zero mean RGB difference; the last
60 fps sample differs by less than 0.002 on the 0–255 channel scale. The actual
8-second MP4 contains 480 frames at 360 × 360. Its H.264 first/final samples
differ by about 1.95 levels, within the independently checked lossy endpoint
fidelity budget; compressed video is not asserted to be pixel-identical.
Production GPU, WebGL, Canvas2D and VideoFrame readback probes remain zero.
