# Portable projects

Use the project-name menu to download a `.musart` project or choose **Download
project ZIP**. Both media-bearing `.musart` files and explicit `.zip` downloads
contain a versioned ZIP archive. Documents without originals or an embedded replay retain the legacy JSON
representation. Both formats reopen through the existing project import picker.

The archive contains `project.json` and original binary files under `assets/`.
The manifest identifies `melt-project`, version 1, and includes the portable
project plus a scoped original-file index. Embedded-image references become
relative paths; video/audio metadata retains its durable original ID and revision,
with a relative-file entry in the index. Identical bytes share a file identified
by SHA-256. Replay inventories are included when already embedded in the document;
the separate local editing journal is not added implicitly. Custom font installation
remains separate, as with existing portable documents.

ZIP encoding, decoding, hashing and image conversion run in a disposable worker.
Already encoded media uses stored ZIP entries, passed through in Blob chunks.
The archive and expanded contents are limited to 512 MiB, its JSON document to
32 MiB, and its file inventory to 10,001 entries. Import checks paths, duplicate
entries, completion, checksums, original sizes and core document validation before
installation. Video/audio originals and their manifest are persisted atomically.
Existing/deleted project IDs are replaced, including embedded replay identities.
A changed editing origin rejects an asynchronous import.

Legacy JSON `.musart` and `.json` imports remain supported, with their existing
200 MiB file limit. Inside the editor the established core format remains unchanged:
images are embedded data URLs, and video/audio originals are platform-owned Blobs.
Archive-relative paths never enter the renderer or persisted core document.
