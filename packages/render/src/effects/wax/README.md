# Wax

Wax coats incoming content with softened, translucent material. A fixed Gaussian
stencil smooths premultiplied source color and derives relief from both luminance
and coverage. Directional wrapped lighting, a broad specular lobe, tinted internal
scattering and a small differential RGB spread produce the surface finish.

The appearance reference is the [Madphase Wax documentation](https://help.madphase.app/reference/effects/material/damage/surface/wax/),
consulted November 6, 2026. Blur, luminous highlights, brightness and chromatic
spread follow its described finish; this implementation adds editable relief,
translucence, wax color and native lighting direction through the existing SDK.

The kernel uses 25 premultiplied bilinear samples (100 underlying texture taps),
plus the unchanged source sample. Its radius is bounded to 20 authored pixels.
It uses no time, history, CPU pixel reads, auxiliary texture or retained resource.
The wide-radius filter is an artistic approximation rather than an exact large
Gaussian convolution or a physical subsurface-scattering simulation. It cannot
reconstruct actual scene geometry. Brightness scales the body; specular and
scattering light remain independent.

Original alpha is retained exactly. Transparent neighbors contribute no hidden
RGB, and alpha is also used for the silhouette's relief. Neither smoothing nor
glow expands coverage. Zero amount returns the incoming source, and the standard
SDK application area finishes the result. Spatial sampling uses document-pixel
offsets in the current transport, so margins and viewport crops do not rescale it.
