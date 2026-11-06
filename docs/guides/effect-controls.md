# Effect controls and catalog

| Control                     | Behavior                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Add effect / Add adjustment | Keep the core catalog's existing effect/adjustment split. Both entry points use the same searchable catalog.                                     |
| Search                      | Match localized names, stable effect identifiers and translated family names. Search ignores case and accents; multiple words all have to match. |
| Category                    | Filter the current catalog to color, tone, texture, distortion, lighting, blur, retro or motion. Only families present in that catalog appear.   |
| Results                     | Show clear family headings and sort each family's translated names alphabetically. Empty results are explicit.                                   |
| Keyboard                    | Type in the search field without menu typeahead taking focus. Arrow Down enters the results; Escape dismisses the menu.                          |
| Scrolling                   | The results viewport remains bounded and uses the shared ScrollShadow. The category filter uses the shared nonmodal SelectField.                 |
| Selection                   | Add only the chosen registered effect through the existing command path. Browsing and filtering do not preview, edit or create undo entries.     |

Every effect parameter uses the same label, value and keyframe columns. Numeric fields retain their scrub/reset gestures, selects retain hover drafts, and color controls retain their cancel/commit lifecycle. The right-hand diamond column stays reserved when Static mode hides the buttons, so changing modes does not shift the values. Opacity, blending and alpha composition use the same row layout as the catalog-defined parameters.

Presentation families live in the web catalog and cover every registered effect through a typed mapping. They do not change portable documents or the core effect taxonomy. Controls still subscribe at their existing leaf/imperative boundaries; this layout adds no animation-frame subscriptions or App/Inspector updates.

The position pad and its X/Y fields share an owner-scoped Jotai presentation
source. Pointer moves paint the dot and native numeric fields through imperative
subscriptions, with no React state update or document write. Release commits the
pair once; cancellation restores the original pair. Layer and composition fields
keep their motion/keyframe controls and normal numeric editing.

The focused Profiler regression records zero React commits during pad previews and
cancellation. Native Chromium 156.0.8078.4 checks on Linux with Vite port 6102
recorded zero commits on App, Inspector, CanvasArea, EditorCanvas and EditorScene.
Input-to-handler delays were 1.0 ms (layer), 0.8 ms (composition); handler-to-next-RAF
presentation samples were 32.9 ms (layer), 31.0 ms (composition). These are development-server
DOM/RAF observations, not production or physical-display latency benchmarks.

Focused mirrors cover catalog membership, localized sorting/search, filtering, real Radix selection, stale action guards and parameter row structure. Native catalog checks verify real searching/selection. Native geometry checks verify the actual label/value/diamond columns; a DOM test alone does not prove pixel alignment.

Each applied effect starts with a **Preset** selector and one inline save **+**,
followed by a divider above compositing and parameter controls. The naming form
uses a name field, Check to confirm and X to cancel; Escape cancels it too. Saving captures the current literal settings, application area and
compositing values under a user-supplied name. **Modified** compares the applied
values with the saved treatment and appears inside the selector beside a small
status icon. Hovering or focusing a saved option temporarily previews its values,
including the current modified preset. Closing the selector, changing owners,
starting an edit or deactivating the popover restores the canonical frame. Preview
reads are debounced and serialized with at most one latest pending request. No
document edits, persistence writes or undo entries are created, and image inputs
use transient frame assets rather than project originals. **Restore saved preset** reapplies that saved
copy; the separate **Factory defaults** button restores the effect definition's
defaults and removes the preset reference. The actions menu also updates,
renames or deletes the saved entry. Updating the library never changes other
applied copies. A missing entry is explicitly shown as unavailable while the
document keeps its applied values.
The applied name remains visible during local IndexedDB reads and preset switches;
loading never replaces it. The treatment browser uses the shared delayed brand
throbber instead of a visible loading sentence, and avoids flashing an empty list
while its first metadata read is pending.

**Save effect stack** lives in the preset actions menu and captures the owner's
complete ordered stack, including
disabled effects. **My treatments** is available in Classic and Studio's Add
effect catalogs for layer and composition owners. **Append** adds independent
copies after the existing stack; **Replace stack** replaces it. Applying to
multiple editable layers is one transaction and one undo entry. Incompatible
native-depth requirements and locked or stale targets are real errors.

The personal library is stored locally in IndexedDB and shared across projects
on the same browser origin. List
pages return at most 100 small metadata records, scanning at most 200 including
deletion markers; image originals are read lazily for the selected preset, explicit hover previews
or application actions. Payloads
are limited to 64 effects, 128 embedded images and 24 MB of serialized content.
Metadata and originals are written atomically. Revision checks reject concurrent
overwrites and durable deletion markers prevent delayed saves from resurrecting
deleted entries. Reload the library after a conflict.

Reusable treatments preserve ordinary parameters, macro settings and image
inputs with newly allocated asset identities on application. They contain no
project palette-token IDs: captured colors stay literal, and restoring a preset
detaches its previous effect color links. Source-owned Liquify paint, Morph
geometry and generated Depth Anything maps are excluded. Existing projects and
applied copies remain usable after library entries are renamed or deleted.
