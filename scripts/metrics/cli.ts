import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileInventoryCsv, markdownReport, megabytes } from "./report";
import { scanCodebase } from "./scan";

export async function runMetrics(args: string[]): Promise<void> {
  let root = process.cwd(),
    output: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--") continue;
    if (argument === "--help" || argument === "-h") {
      console.log(
        "Usage: bun run metrics -- [--root PATH] [--out PATH]\nDefault output: <root>/artifacts/codebase-metrics/{summary.md,summary.json,files.csv}\nScans repository text and inventories all local regular-file sizes without following symlinks.",
      );
      return;
    }
    if (
      !["--root", "--out"].includes(argument) ||
      !args[index + 1] ||
      args[index + 1].startsWith("--")
    )
      throw new Error(`Unknown option or missing value: ${argument}`);
    if (argument === "--root") root = resolve(args[++index]);
    else output = resolve(args[++index]);
  }
  output ??= resolve(root, "artifacts/codebase-metrics");
  if (resolve(root) === output)
    throw new Error("The report output must differ from the scan root.");
  console.log(`Scanning ${root} (including ignored-file sizes)…`);
  const report = await scanCodebase(root, output);
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, "summary.json"), JSON.stringify(report, null, 2) + "\n");
  await writeFile(resolve(output, "summary.md"), markdownReport(report));
  await writeFile(resolve(output, "files.csv"), fileInventoryCsv(report.files));
  console.log(
    `${report.repository.files} repository files; ${megabytes(report.repository.bytes)} MB; ${report.source.lines} physical source lines; ${report.tests.runnableFiles} test files.`,
  );
  console.log(`Reports: ${output}`);
  if (report.warnings.length || report.json.invalid.length || report.json.unchecked.length) {
    console.warn(
      `${report.warnings.length} scan warnings, ${report.json.invalid.length} invalid JSON files, ${report.json.unchecked.length} unchecked JSON files; see summary.md.`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  try {
    await runMetrics(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
