# Chromatic Aberration

This standalone image effect separates red and blue around an unchanged green source channel. The visual reference is lateral color fringing described by [Nikon's chromatic aberration guide](https://www.nikonusa.com/learn-and-explore/c/products-and-innovation/chromatic-aberration). The implementation is an artistic channel-registration model; it does not trace wavelengths, simulate a particular lens or correct optical aberrations.

Radial mode derives its axis from a normalized center in authored image coordinates. Direction rotates that axis, allowing a tangential split at 90°. Directional mode uses a common oriented axis. Both modes multiply separation by a power falloff from the center to the falloff radius; falloff zero provides uniform separation. Thus the center remains a meaningful control in either mode. Separation is measured in authored pixels, independent of editor zoom and raster density. Three bounded shared source samples provide the original, displaced red and displaced blue values.

Original alpha is retained exactly. Each displaced channel is mixed back toward the original channel according to the displaced source alpha, suppressing hidden transparent RGB and black fringes at cutouts. Coordinates are clamped at the transport edges. Zero separation or zero amount produces the original image; no seed or time dependency is introduced. The graph uses the common TSL sampler and no CPU readbacks, caches or extra GPU resources.

Visual acceptance should cover a photographic high-contrast edge, white/black calibration edges, graded-alpha cutouts, off-center radial separation, 90° rotation, directional mode and extreme separation. Confirm both backend exports preserve source alpha and zero separation exactly, then inspect masked/nested and preview/export agreement at multiple zooms. Graph regressions do not claim optical fidelity or rendered equivalence; native rendering is verified by the batch's validation owner.

## Native 3D rotations

Chromatic aberration preserves source coverage, including the visible sides of
extruded text and vectors. The shared 3D effect preparation ordinarily maps the
native raster into the authored front-face plane. If the native transport crosses
that plane's inverse projection horizon, that mapping has no finite rectangle:
a modest source can otherwise expand to hundreds of millions of virtual pixels
and disappear when reduced to the bounded GPU raster. Preparation now detects
that crossing before allocation and evaluates the full stack on the native raster
for that pose. Depth and history inputs use that same coordinate space. Finite
front-face mappings retain their authored effect coordinates; the document,
object geometry and camera are unchanged. The problem is shared effect projection,
not chromatic aberration changing alpha or camera frustum clipping.
