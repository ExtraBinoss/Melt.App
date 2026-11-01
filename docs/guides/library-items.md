# Library previews and favorites

In Projects and Templates, single-click a card to open **Open in Melt**. The dialog shows its name and author on the left and the preview on the right. Local projects are attributed to **ExtraBinoss · You**; built-in templates are attributed to Melt. Double-click a card or use its top-right Open button to open it directly. Keyboard activation opens the detail dialog immediately. Middle-click or Ctrl/Cmd-click a card to open its detail dialog in a new tab. These real links preserve native browser navigation and identify the item by its durable ID. Reloading that URL restores the preview without opening or creating an editor document. The editor mascot also links to the dashboard for native new-tab gestures; an ordinary click retains its project-menu action.

Each template has a descriptive summary in all twelve interface languages, including
honest empty-canvas descriptions for format presets. Cards show a short inventory
and the detail dialog shows its full **What's inside** list. A single pure core
detector discovers layer kinds, effects and authored features across all pages;
there are no per-template capability lists. Template manifests are scanned by
`templateContentsPlugin` at build time, emitting only small tag IDs. Project
writes persist the same inventory atomically beside document metadata. Existing
records derive it from the page metadata already loaded for listing; neither
path opens originals or history. A legacy favorite resolves at most one bounded
summary and rejects stale results. Template search also indexes localized
summaries and detected tags. When Projects is empty, its primary creation button
opens the regular project creation flow.

Use the star in the detail dialog to add or remove a favorite. Favorites appear above the library search and persist in this browser across sessions. Bookmarks store durable item IDs and small metadata separately from documents, original assets and history. They retain at most 128 entries; saving failures are displayed and never treated as success. Mutations merge through an IndexedDB write transaction and active library windows synchronize through BroadcastChannel. A deleted project is never recreated by a bookmark; opening still uses the normal validated project loader.

Projects and Templates use the same `LibraryCard` artwork/caption layout, with the options menu immediately above the Motion/Static label. Motion cards play on fine-pointer hover or keyboard focus. On touch devices, one card that is at least 60% visible plays automatically, choosing the card nearest the viewport center. The detail dialog takes priority and starts playback on opening, without a hover hint. It keeps explicit pause/resume controls. Automatic playback respects reduced motion; manual play remains available. Scrolling pauses optional preview work, then resolves the item actually under the stationary pointer after 120 ms of quiet time. Add motion, saved projects and templates share this hover-intent controller. Hidden pages, pointer gestures, reduced motion and disposal stop preview admission and clear pending timers. Only one saved-project/template renderer owns playback at a time. Preparing previews show a small indicator in the top-right corner; failures remain explicit.

The Add motion search uses the same text-only typewriter component as the project/template library. Its horizontal category strip has immediately visible overflow fades, hover-edge scrolling and a subtle native bottom scrollbar. The vertical preset scrollbar occupies the outer right gutter; card sizes still use the actual grid content width.

Melt's interface mascot uses the existing SVG engine and the shared brand primary with a slight color gradient; editor, landing and library do not override that color. Hover or keyboard-focus the top-left wordmark to animate its natural blinking and movement; it has no idle frame clock once the pointer/focus leaves, and respects hidden/offscreen/reduced-motion states. Branding and the landing/library headings use Clash Display, served directly from [Fontshare](https://www.fontshare.com/fonts/clash-display) under its [ITF Free Font License](https://www.fontshare.com/licenses/itf-ffl). The font is used only for the application's own interface and is not supplied as an editable document font or redistributed in the repository.

On 2026-11-01, the native `library-contents` witness verified the actual empty
library creation flow, persisted project effect tags and template descriptions
and inventories on desktop and 390 × 844 phone layouts. The detail dialog kept
its content within the phone width. Captures are in `artifacts/library-contents/`.
Focused tests cover all twelve resource sets, document edits, legacy summaries,
atomic inventory persistence and stale favorite reads.
