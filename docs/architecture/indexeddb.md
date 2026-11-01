# IndexedDB ownership

Production IndexedDB opens go through
`apps/web/src/services/persistence/database.ts`. `check:rules` rejects direct
`idb.openDB` imports/calls and native `indexedDB.open` calls elsewhere in web source.
The shared gateway owns opening/version-change close behavior; each domain still
owns its schema, migrations and persisted record validation. Existing database
names and versions are preserved.

`commitTransaction(transaction, operation)` awaits both the operation and native
transaction completion, aborts on failure and never retries an uncertain write.
Use it for atomic groups of related requests. File decoding, hashing, image
preparation and unrelated asynchronous work happen before starting transactions.

`DatabaseConnection` adds a lazy shared opening promise, retry after failed opens,
a permanent disposal barrier and cancellation of owned writes. It closes late
connections after disposal. A disposed owner must be recreated; React StrictMode
cleanup/setup cannot reuse the same disposed instance. Component owners capture
an instance for each asynchronous operation and cancel pending work on unmount.

Projects, fonts, motion presets, favorites and imported textures all use the shared
opening gateway. Existing project journal transactions and font/preset concurrency
contracts remain with their domain owners. New stores should reuse the connection
and commit helpers rather than duplicate connection/disposal/rollback logic.

Texture originals and listing metadata live in separate stores. Their writes and
deletes share atomic transactions and a durable deletion generation. A project
embeds its chosen original, so deleting the library item cannot break existing
portable projects or their retained undo history.
