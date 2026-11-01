# Composition background paint

A composition retains its solid `background` color and may carry an optional
`backgroundGradient` using the existing portable `FillGradient` definition.
Removing the gradient restores the preserved solid color. The validated page
command, local mutation scope, serialization, undo/redo, thumbnail hash, artboard
copy and search duplication retain this metadata. Isolated layer exports explicitly
remove it with the artboard background.

GPU composition and shaped text share the bounded eight-stop paint graph and
uniform updates. The existing background clear pass produces premultiplied color;
it needs no additional texture, pass, readback or per-preset shader. Only the root
composition receives background paint; group surfaces remain transparent. Linear
paint projects over the full artboard span, with angles in a top-left coordinate
system; radial paint uses an ellipse centered on the artboard. The same graph feeds
the editor, thumbnails, image/video exports and print color conversion.

The shared paint editor retains linear/radial settings, angle, stop positions,
alpha and direct color edits. Its preset popover contains fifty bundled palettes,
compact CSS thumbnails, built-in/saved tabs, random generation with two to eight independently positioned RGBA stops, angle/type selection and named saving.
Hover and keyboard focus preview through the existing imperative page/layer draft
channel. Leaving the grid or dismissing the popover restores canonical paint;
choosing a swatch publishes one validated command and one history entry. Touch
uses explicit selection without requiring hover. Previewing never writes history
or IndexedDB and does not subscribe editor roots to local palette state.

`GradientStore` reuses the shared `DatabaseConnection` gateway. It is lazy, scoped
to the open library, disposed on close and shared across projects in the same
browser profile. Original paint is copied into the project when selected, so
removing a personal preset cannot affect existing work or portable exports. Reads
are bounded to 201 entries, and the 200-preset limit is checked inside the native
write transaction. IDs are durable UUIDs, creation refuses overwrites, and stale
UI completions are ignored after the owner closes. Saving errors are surfaced.

Focused regressions cover canonical edits, validation failures, atomic undo,
isolated exports, independent library connections, limits under concurrent writes,
disposal, hover cancellation and persistent reuse. Native Chromium checks decode
GPU exports on WebGPU/WebGL and exercise actual preset input without editor-root
renders. Pixel reads are confined to the test inspection page.
