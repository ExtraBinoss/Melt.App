# Native 3D library

Open **3D** in the editor toolbar. Choose **Shapes** or **GLB models**, select a
thumbnail, then **Add**. Hover or keyboard focus updates the single large preview;
on touch, tap a tile. Drag the preview to orbit. Arrow keys orbit, Home resets,
and +/− adjust distance. Preview changes never edit the composition.

The 21 shape families use Three.js geometry: box, sphere, torus, capsule, cone,
cylinder, circle, plane, ring, dodecahedron, icosahedron, octahedron, tetrahedron,
torus knot, lathe, tube, custom polyhedron, edges, wireframe, filled SVG shape and
SVG extrusion. Edges and wireframes are thin physical meshes so they accept the
same materials and effects. Text and GLB upload remain available below the grid.

Sixteen local Kenney GLBs provide hollow hexagons and rings, arcs, rims, wedges,
rounded blocks and low-poly rocks. The complete originals total 224,908 bytes.
They are CC0 from the [Prototype Kit](https://kenney.nl/assets/prototype-kit) and
[Nature Kit](https://kenney.nl/assets/nature-kit), permitting commercial use.
Their unmodified notices ship alongside the models. The metadata ledger in
`packages/assets/data/spatial/models.json` records author, source, archive and
original hashes, output hashes and the embedding of original palette textures.
No external model or texture requests are needed at runtime.

All thumbnails are native renders, baked by `scripts/spatial/render-library.ts`.
Only the selected preview runs: one retained renderer, one in-flight frame, at
most 30 frames per second and a 96 MiB GPU cache. Hidden tabs pause; reduced-motion
preferences disable automatic spin while retaining manual orbit. Closing the
popover releases its renderer, workers, targets and listeners. Immutable original
bytes have a separate eight-entry, 2 MiB cache with exact size and SHA-256 checks.

**Add** embeds a fresh model asset and layer in one validated transaction. Undo
removes both. Imports reject cancellation or a changed project/composition before
publishing. The inserted layer supports ordinary transforms, materials, effects,
Motion actions, property keyframes and native exports like other 3D layers.

The native Chrome regression in `test/browser/spatial-library.spec.ts` checks
one retained canvas across previews, real orbit input, unchanged project data,
one-undo insertion and disposal. The atlas generator records actual source
inventories, bounded cache use and production readback probes under ignored
`artifacts/spatial-library/`.
