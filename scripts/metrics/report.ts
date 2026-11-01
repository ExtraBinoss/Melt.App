import type { FileMetric, MetricsReport, Totals } from "./scan";

const number = (value: number) => value.toLocaleString("en-US");
const escape = (value: string) => value.replace(/\|/g, "\\|").replace(/[\r\n]/g, " ");
export const megabytes = (bytes: number) => (bytes / 1_000_000).toFixed(2);
const row = (label: string, totals: Totals) =>
  `| ${escape(label)} | ${number(totals.files)} | ${megabytes(totals.bytes)} | ${number(totals.lines)} | ${number(totals.nonBlank)} |`;
function table(title: string, groups: Record<string, Totals>, limit = Infinity): string {
  return [
    `## ${title}`,
    "",
    "| Group | Files | MB | Physical lines | Nonblank lines |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...Object.entries(groups)
      .sort((a, b) => b[1].bytes - a[1].bytes || a[0].localeCompare(b[0], "en"))
      .slice(0, limit)
      .map(([label, totals]) => row(label, totals)),
    "",
  ].join("\n");
}

export function markdownReport(report: MetricsReport): string {
  const sourceLines = report.source.nonBlank;
  const testCode = report.files.filter((file) => file.category === "tests" && file.code);
  const testLines = testCode.reduce((total, file) => total + file.nonBlank, 0);
  const ratio = sourceLines ? `${((testLines / sourceLines) * 100).toFixed(1)}%` : "unavailable";
  const diskBytes = Object.values(report.disk).reduce((total, entry) => total + entry.bytes, 0);
  const largest = (title: string, files: FileMetric[], metric: "bytes" | "lines") =>
    [
      `## ${title}`,
      "",
      "| File | Category | MB | Physical lines |",
      "| --- | --- | ---: | ---: |",
      ...[...files]
        .sort((a, b) => b[metric] - a[metric] || a.path.localeCompare(b.path, "en"))
        .slice(0, 20)
        .map(
          (file) =>
            `| ${escape(file.path)} | ${file.category} | ${megabytes(file.bytes)} | ${number(file.lines)} |`,
        ),
      "",
    ].join("\n");
  return [
    "# Codebase metrics",
    "",
    `Generated: ${report.createdAt}`,
    "",
    `Root: \`${report.root}\``,
    "",
    `Git HEAD: ${report.git?.head ?? "unavailable (filesystem mode)"}.`,
    "",
    "## Measurement boundaries",
    "",
    "Repository metrics include existing tracked and nonignored untracked regular files. Git-ignored files are inventoried by size only in the filesystem section. Symlinks are counted separately and never followed. The report output directory is excluded. Files can change during this live scan.",
    "",
    "MB = 1,000,000 bytes; MiB = 1,048,576 bytes. Sizes are logical file lengths, not allocated disk blocks, compressed transfer sizes or deduplicated hard-link usage. Physical lines include comments; nonblank lines exclude whitespace-only lines. A final newline does not create an extra line. Binary files contribute bytes and zero text lines. Unknown extensions are sampled for UTF-8 text; known binary formats are not decoded.",
    "",
    "Categories are mutually exclusive; extension, workspace, JSON and public views overlap. Source excludes tests, tooling, generated files and vendored code. Test declarations are static test()/it() call sites, including skipped tests; parameterized rows and runtime expansion are not counted. No tests, coverage collection, builds or performance benchmarks are executed by this script.",
    "",
    table("Overview", {
      Repository: report.repository,
      "Code and styles (all categories)": report.code,
      "Application/package source": report.source,
      "Tests and support/fixtures": report.tests,
      "JSON (all categories)": report.json,
      "Public (all extensions)": report.public,
    }),
    `Test files with .test/.spec names: **${number(report.tests.runnableFiles)}**; static test declarations: **${number(report.tests.declarations)}**. Test-code/source nonblank-line ratio: **${ratio}** (not coverage).`,
    "",
    `JSON: ${number(report.json.files)} files; ${report.json.invalid.length} invalid; ${report.json.unchecked.length} larger than the 64 MiB validation limit.`,
    "",
    table("Categories", report.byCategory),
    table("Extensions / file types", report.byExtension),
    table("Workspaces", report.byWorkspace),
    table("Directories (up to three levels; top 40 by size)", report.byDirectory, 40),
    table("Public directories", report.byPublicDirectory),
    table("Runnable test file kinds", report.byTestKind),
    "## Filesystem footprint",
    "",
    `Total: **${megabytes(diskBytes)} MB** (${(diskBytes / 1_048_576).toFixed(2)} MiB). Symlinks skipped: **${number(report.symlinks)}**. Filesystem rows measure file counts and bytes only.`,
    "",
    table("Filesystem buckets", report.disk),
    largest("Largest repository files", report.files, "bytes"),
    largest(
      "Longest code/style files",
      report.files.filter((file) => file.code),
      "lines",
    ),
    "## Dependency declarations",
    "",
    "Direct manifest entries; workspace dependencies can appear more than once. Installed/transitive dependency bytes are listed in the filesystem section.",
    "",
    "| Manifest | Package | Runtime | Development | Peer | Optional |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    ...report.manifests.map(
      (manifest) =>
        `| ${escape(manifest.path)} | ${escape(manifest.name ?? "unnamed")} | ${manifest.dependencies} | ${manifest.devDependencies} | ${manifest.peerDependencies} | ${manifest.optionalDependencies} |`,
    ),
    "",
    "## Existing coverage report",
    "",
    ...(report.coverage
      ? [
          `Saved report: \`${report.coverage.path}\`; modified ${report.coverage.modifiedAt}; ${report.coverage.files} reported files. This historical report was not regenerated and may cover only part of the current codebase.`,
          "",
          "```json",
          JSON.stringify(report.coverage.total, null, 2),
          "```",
          "",
        ]
      : ["No saved coverage summary found. Current coverage is unknown.", ""]),
    "## Invalid or unchecked JSON",
    "",
    ...[...report.json.invalid, ...report.json.unchecked].map((entry) => `- ${escape(entry)}`),
    ...(report.json.invalid.length || report.json.unchecked.length ? [] : ["None."]),
    "",
    "## Scan warnings",
    "",
    ...report.warnings.map((warning) => `- ${escape(warning)}`),
    ...(report.warnings.length ? [] : ["None."]),
    "",
  ].join("\n");
}

export function fileInventoryCsv(files: FileMetric[]): string {
  const columns: (keyof FileMetric)[] = [
    "path",
    "status",
    "category",
    "extension",
    "workspace",
    "code",
    "bytes",
    "textFiles",
    "lines",
    "nonBlank",
    "testKind",
    "testDeclarations",
  ];
  const csv = (value: string | number | boolean | undefined) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [
    columns.join(","),
    ...files.map((file) => columns.map((key) => csv(file[key])).join(",")),
    "",
  ].join("\n");
}
