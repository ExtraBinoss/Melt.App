# Project template ownership

The public `TEMPLATE_CATALOG` contains six curated artwork templates and the
canonical blank canvas formats. Search, the dashboard, project dialogs and landing
cards consume that catalog. Retired designs are absent from it.

Each Motion design owns `motion/<id>/build.ts` and any template-specific helpers
or reference data. Its headless entry point is
`scripts/templates/<id>/generate.ts`. Its immutable bundle, command journal,
portable metadata and rendered poster live together under
`apps/web/public/templates/motion/<id>/`.

Shared Motion authoring, bounded loading, source caching, identity, messages and
manifest types remain in `motion/`. Original media reused by multiple workloads
lives in `public/templates/motion/media/`, with its provenance and license records.
Media manifests resolve those paths from that shared Motion root, while template
manifests resolve from their owning `<id>/` directory. Do not move an original or
change its hash merely to reorganize a template.

`fixtures/catalog.ts` records retired designs needed by existing performance,
command-replay and media tests. Their builders and payloads also have individual
directories. The compatibility loader can prepare them for those callers, but
that registry must not be spread into the public gallery or landing showcase.
Already-created projects are independent saved documents.

When adding a template, add its owned builder/generator/assets directory, register
its metadata in the public catalog, and use sparse engine-native Motion actions
or meaningful interpolation points. Generate real posters through the shared
render graph; preserve original-media provenance and bounded atomic installation.
