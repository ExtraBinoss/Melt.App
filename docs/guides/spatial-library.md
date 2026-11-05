# Native 3D library

Open **3D** in the editor toolbar. Search or choose **Shapes** / **GLB models**,
then click any tile to add it immediately. Hover or keyboard focus spins the
actual native object inside its tile; one preview surface follows the active tile.
The plus overlay indicates insertion. Touch users tap a tile directly. Preview
changes never edit the composition. The top **GLB** control imports a local model.

The separate **Text** tool opens compact **Text 2D** / **Text 3D** choices. Choose
a source, then click or drag on the canvas to place its editable text frame.
Studio defaults to 3D and Classic to 2D; either workspace supports both. Placement
and any required native scene initialization share one undo entry.

The 21 shape families use Three.js geometry: box, sphere, torus, capsule, cone,
cylinder, circle, plane, ring, dodecahedron, icosahedron, octahedron, tetrahedron,
torus knot, lathe, tube, custom polyhedron, edges, wireframe, filled SVG shape and
SVG extrusion. Edges and wireframes are thin physical meshes so they accept the
same materials and effects. New library shapes use neutral gray paint.

Sixteen local Kenney GLBs provide hollow hexagons and rings, arcs, rims, wedges,
rounded blocks and low-poly rocks. The complete originals total 224,908 bytes.
They are CC0 from the [Prototype Kit](https://kenney.nl/assets/prototype-kit) and
[Nature Kit](https://kenney.nl/assets/nature-kit), permitting commercial use.
Their unmodified notices ship alongside the models. The metadata ledger in
`packages/assets/data/spatial/models.json` records author, source, archive and
original hashes, output hashes and the embedding of original palette textures.
No external model or texture requests are needed at runtime.

The curated shape/model thumbnails are native atlas renders from
`scripts/spatial/render-library.ts`, presented in neutral gray. Optional pack tiles
show a neutral model symbol until their real native preview is hovered. Imported
GLBs and their live previews retain original materials. Only the hovered preview runs: one retained renderer, one in-flight frame, at
most 30 frames per second and a 96 MiB GPU cache. Hidden tabs pause; reduced-motion
preferences disable automatic spin. Closing the
popover releases its renderer, workers, targets and listeners. Immutable original
bytes have a separate eight-entry, 2 MiB cache with exact size and SHA-256 checks.

Clicking a tile embeds a fresh model asset and layer in one validated transaction. Undo
removes both. Imports reject cancellation or a changed project/composition before
publishing. The inserted layer supports ordinary transforms, materials, effects,
Motion actions, property keyframes and native exports like other 3D layers.

The native Chrome regression in `test/browser/spatial-library.spec.ts` checks
one retained canvas across hovered previews, unchanged project data, search,
one-undo insertion, 2D/3D pointer placement and disposal. The atlas generator records actual source
inventories, bounded cache use and production readback probes under ignored
`artifacts/spatial-library/`.
