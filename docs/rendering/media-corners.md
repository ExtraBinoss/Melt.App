# Rounded image and video sources

Images and videos reuse the portable `Layer.radius` field and its validated numeric
range. The Inspector exposes the same Corner radius control as rectangles, using
the core property capability registry. Existing imperative previews, cancellation,
Motion keyframes, serialization and single-entry undo apply unchanged. Radius is
in authored document pixels and is clamped at rendering to half the shorter side.
Native spatial layers keep their own geometry controls.

A shared rounded-rectangle signed distance function owns both rectangle paint and
media clipping. Nonzero media radii render one GPU source pass, multiplying original
alpha by antialiased corner coverage. Radius zero borrows the original media texture
and allocates no clipping target. Images and decoded video use the same node, stable
uniforms and Three.js resource owner, including WebGL fallback. The target is retained
under the existing layer cache, charged to its hard budget and included in preview
cost admission; cleanup disposes its material and compilation resources normally.

Clipping happens before color conversion and the effect stack. Bevel derives normals
from the rounded alpha, shadows and blur start with that silhouette, and effects with
expanding coverage can extend beyond it. User masks still compose in their normal
coordinate system. This is source coverage, not a CSS border radius or a final clip
that would cut off shadows. Preview, selection thumbnails, still exports and native
Motion exports share this pipeline and normal source-key invalidation.

Focused regressions cover image/video authoring, undo/redo, rejected values, sparse
Motion interpolation, portable round trips, allocation accounting and pass resource
cleanup. Native PNG witnesses inspect both backends, genuine decoded video, radius
zero restoration, bevel alpha, rounded shadow corners and side expansion, 2x export
and animated radius. Production GPU, WebGL and Canvas pixel-read probes are separate
from decoding on an inspection page. Captures live under ignored
`artifacts/media-rounding/`. Functional tests use the dev server on port 6100; they
make no frame-rate or latency claim. The rounded fifty-image Bevel workload checks
shared source uploads and the existing 64 MiB retained-resource bound.
