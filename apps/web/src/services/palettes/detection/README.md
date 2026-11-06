# Detected document palettes

These are literal color suggestions, independent of saved library palettes and
explicit document global links. `useDocumentPalette` is mounted only while the
picker is open. It subscribes directly to the engine, defers work past the opening
input task, coalesces edits for 120 ms, ignores selection-only updates, and rejects
old project/page results. Unmount cancels work and disposes the worker.

Authored colors are ranked by their transformed source footprint clipped to the
artboard, inherited opacity and color alpha. Ellipses use an ellipse area factor;
strokes use a perimeter estimate. Gradient endpoint weights follow stop spacing.
Enabled effect color parameters follow their declared visibility conditions.
Hidden layers, hidden ancestors, mask sources, group placeholder paints, and image
and video placeholder paints are excluded.

Image suggestions use original embedded immutable image assets only. One native
preparation worker reduces each source to at most 64 by 64 pixels and reads that
small native source canvas. This never reads the compositor or a GPU render target.
The alpha-weighted histogram groups RGB channels into 5-bit bins, retains the
weighted mean RGBA per bin and returns the twelve strongest bins. At most sixteen
significant distinct originals are considered per document scan; one decode runs
at a time, the waiting queue is bounded at sixteen and the histogram cache at 24.
Sources above 40 million declared pixels or 24 million data-URL characters are
skipped. Each request has a ten-second timeout. Native unsupported formats fall
back to authored colors; actual fetch, decode and worker failures are reported.

This measures an authored-source approximation, not final visible pixel frequency:
source footprints can overlap, text/vector bounding rectangles approximate actual
ink, radial gradients share the stop-spacing estimate, and mask coverage, clipping,
blend modes, spatial projections, animation and effect-generated colors are not
simulated. Animated raster sources use their native first decoded frame. This
keeps detection bounded and avoids GPU work or readbacks during editor gestures.
