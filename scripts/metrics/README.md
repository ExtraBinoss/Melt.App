# Codebase metrics

Run `bun run metrics` from the repository root. Reports go to the ignored
`artifacts/codebase-metrics/` directory:

- `summary.md`: readable tables, largest files, dependency declarations and measurement boundaries.
- `summary.json`: full metrics, group totals and per-file inventory.
- `files.csv`: one row per existing tracked/nonignored regular file, with category, bytes, lines and test metadata.

Use `bun run metrics -- --root /path/to/project --out /path/to/reports` to inspect
another project. Paths passed to `--root` and `--out` resolve against the current
working directory. The output directory itself is excluded from the scan. No
dependencies are installed and no tests, coverage collection or builds are run.

The scanner uses Git to include tracked and nonignored untracked files. It also
walks ignored directories to report their file counts and logical bytes separately:
dependencies, builds, artifacts, coverage, Git metadata, caches and other ignored
files. It never follows symlinks. Without Git, it uses common directory exclusions
and reports that `.gitignore` was not interpreted. Scans reflect live working-tree
contents, including local modifications, rather than a frozen commit.

Categories are exclusive; the JSON, public, extension and workspace views overlap.
Physical lines include comments, and nonblank lines exclude whitespace-only lines;
neither claims to measure executable statements. Text is streamed with bounded
buffers; binary formats contribute size without line counts. Generated-code
classification uses conventional paths and header markers. JSON syntax validation
is limited to files up to 64 MiB; larger JSON still contributes size and lines and
is listed as unchecked. MB uses decimal bytes; filesystem totals also show MiB.

Test metrics count `.test`/`.spec` files and static `test()`/`it()` declarations,
including skipped cases. Dynamic/parameterized expansion is not evaluated. Saved
`coverage/coverage-summary.json` totals include their timestamp and reported file
count, and may represent a partial or outdated run. They do not establish current
repository coverage. The script exits nonzero after writing reports if it finds
scan warnings, invalid JSON or JSON too large to validate.
