# Melt

Melt pulls original source paint into uneven liquid drips along an authored direction.
The visual reference is [Madphase Smear / Melt](https://help.madphase.app/reference/effects/distortion/warp/distortion/smear/).
This is an original finite GPU gather, without fluid simulation or feedback.

Direction uses owner coordinates: 0° pulls right, 90° pulls down. Distance and drip
width are authored pixels. Seeded smooth cross-flow lanes produce different pull
lengths, with slower length variation along the pull. Liquidity increases lane
variation and softens the pull with four nearby source samples. A preliminary
source sample weights displacement by highlights or shadows. Tone influence zero
removes the tonal weighting. Source colors are retained, without a palette or glow.

Phase is an explicit 0–360° periodic field control. Motion can animate it through
the SDK. Seeking, replay and export evaluate the same field directly; no elapsed
wall-clock time, generated document keys or previous frames are consulted. Seed
hashing uses the exact uint uniform. Logical owner coordinates exclude transport
margins, so added padding and raster density do not move the drip pattern.

Coverage can move beyond transparent text and logo silhouettes. Five bilinear
premultiplied source samples (one tone probe and four gather taps) use transparent
transport edges; hidden RGB contributes no paint. The processed paint is mixed
with the original in premultiplied space. Amount zero and distance zero return the
unchanged source. The conservative footprint is one-sided distance projected onto
the pull axis, plus one interpolation texel on each nonzero side. It does not shrink
with amount, tone, phase, liquidity or seed. No extra targets are allocated and no
production GPU pixels are read into JavaScript.

The effect is bounded to 512 authored pixels and four gather positions. Extreme
lengths may reveal finite sampling or fold stretched detail. It is not a physical
mass-conserving fluid simulation. Native validation should cover portraits and
transparent lettering, opposing directions, selected tones, explicit phases, high
seeds, original-alpha holes, amount/distance identity, and padded owner transports
on both Three backends. Graph tests alone do not establish pixel correctness.
