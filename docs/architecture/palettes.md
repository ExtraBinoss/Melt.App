# Saved palettes and document colors

Saved palettes are user-wide local resources in `musart-palettes`. Their small
listing metadata and full swatches occupy separate stores; listing reads at most
50 metadata records and opening a palette reads its payload lazily. Saves and
renames compare the caller's revision inside the same transaction as both record
writes. Deletion also records a durable retired identity, so neither an old
revision nor a delayed create can resurrect that palette. New, duplicate and
import operations allocate fresh durable UUIDs, including their swatch identities.
The domain uses the shared database gateway and disposes owned connections.

A portable project may own `colors`; composition, layer and effect `colorLinks`
address their definitions explicitly. Renderers continue to consume ordinary
literal background, fill, stroke and effect setting values. Linking and global
updates use validated commands; one global update propagates every explicit use
in a single transaction and undo entry. Equal local colors never become linked
implicitly. Detaching or deleting a definition preserves its current appearance.
Literal edits detach only their changed fields. Undo, reload and duplication
retain links. Clipboard paste imports globals as remapped dependencies across
projects without overwriting destination definitions or matching by color value.

The palette button sits beside color controls and opens its own nonmodal popover.
It supplies named palette creation, explicit update, duplicate, import/export,
local swatches and optional document links. Editing a saved library entry never
silently modifies projects. Document globals show usage counts and explicit
commands to update all uses or detach the current target.

Dice rotates hue consistently in OKLab while preserving neutral anchors,
perceptual lightness, alpha and locked values exactly. Its draft previews use the
existing imperative presentation source; they do not write keys or document
history. Apply creates one document commit; Cancel, dismissal, changed selection,
changed document and unmount restore the canonical artwork. Saving a variation
is an explicit save-as action and never silently replaces its brand palette.

Focused regressions live in `packages/core/test/palettes`,
`apps/web/test/services/palettes`, `apps/web/test/components/palettes`, and
`test/browser/saved-palettes.spec.ts`. Native browser verification covers the
separate trigger, focus/keyboard behavior, body styles, visible preview and
commit boundaries.
