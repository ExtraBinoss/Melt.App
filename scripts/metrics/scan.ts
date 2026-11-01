import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { lstat, open, readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import ts from "typescript";

export interface Totals {
  files: number;
  bytes: number;
  textFiles: number;
  lines: number;
  nonBlank: number;
}
export interface FileMetric extends Totals {
  path: string;
  status: "tracked" | "untracked" | "filesystem";
  category: string;
  extension: string;
  workspace: string;
  code: boolean;
  testKind?: string;
  testDeclarations?: number;
}
export interface Manifest {
  path: string;
  name?: string;
  dependencies: number;
  devDependencies: number;
  peerDependencies: number;
  optionalDependencies: number;
}
export interface MetricsReport {
  root: string;
  createdAt: string;
  git: { head: string; tracked: number; untracked: number } | null;
  files: FileMetric[];
  repository: Totals;
  code: Totals;
  source: Totals;
  tests: Totals & { declarations: number; runnableFiles: number };
  json: Totals & { invalid: string[]; unchecked: string[] };
  public: Totals;
  byCategory: Record<string, Totals>;
  byExtension: Record<string, Totals>;
  byWorkspace: Record<string, Totals>;
  byDirectory: Record<string, Totals>;
  byPublicDirectory: Record<string, Totals>;
  byTestKind: Record<string, Totals>;
  disk: Record<string, Totals>;
  symlinks: number;
  manifests: Manifest[];
  coverage: { path: string; modifiedAt: string; files: number; total: unknown } | null;
  warnings: string[];
}

const codeExtensions = new Set(
  ".ts .tsx .mts .cts .js .jsx .mjs .cjs .css .scss .sass .less .html .vue .svelte .py .sh .bash .zsh .sql .rs .go .c .h .cpp .hpp .java .kt .swift .wgsl .glsl .frag .vert".split(
    " ",
  ),
);
const binaryExtensions = new Set(
  ".png .jpg .jpeg .webp .avif .gif .ico .mp4 .webm .mov .mp3 .ogg .wav .flac .ttf .otf .woff .woff2 .glb .bin .wasm .zip .gz .pdf .docx .pptx .xlsx .blend .psd .icc .icm .hdr .exr".split(
    " ",
  ),
);
const fallbackIgnored = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "artifacts",
  "test-results",
  "playwright-report",
  ".cache",
  ".tanstack",
  ".next",
  ".output",
]);
export const emptyTotals = (): Totals => ({
  files: 0,
  bytes: 0,
  textFiles: 0,
  lines: 0,
  nonBlank: 0,
});
export function addTotals(target: Totals, value: Totals): void {
  for (const key of ["files", "bytes", "textFiles", "lines", "nonBlank"] as const)
    target[key] += value[key];
}
const slash = (path: string) => path.split(sep).join("/");
const isTest = (path: string) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(path);

function category(path: string, header: string): string {
  const parts = path.split("/");
  if (parts.includes("public")) return "public";
  if (parts.some((part) => ["third_party", "vendor", "patches"].includes(part))) return "vendored";
  if (
    /\.gen\.|\.generated\.|(^|\/)generated\//.test(path) ||
    /@generated|automatically generated|auto-generated/i.test(header)
  )
    return "generated";
  if (
    parts.some((part) => ["test", "tests", "__tests__", "__mocks__", "fixtures"].includes(part)) ||
    isTest(path)
  )
    return "tests";
  if (
    /\.(md|mdx|rst|txt)$/i.test(path) ||
    parts.includes("docs") ||
    /(^|\/)(LICENSE|NOTICE|COPYING)(\.|$)/.test(path)
  )
    return "documentation";
  if (
    /(^|\/)(bun\.lockb?|[^/]*\.lock|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|package\.json|tsconfig[^/]*\.json|\.[^/]+|[^/]+\.config\.[^/]+)$/.test(
      path,
    ) ||
    parts.includes(".github")
  )
    return "configuration";
  if (!parts.includes("src") && parts.some((part) => ["scripts", "tools"].includes(part)))
    return "tooling";
  if (extname(path).toLowerCase() === ".json") return "json-data";
  if (codeExtensions.has(extname(path).toLowerCase())) return "source";
  if (binaryExtensions.has(extname(path).toLowerCase()) || /\.(svg|hdr|exr|gltf)$/i.test(path))
    return "assets";
  return "other";
}

function gitInventory(root: string, warnings: string[]) {
  try {
    const run = (args: string[]) =>
      execFileSync("git", ["-C", root, ...args], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      })
        .split("\0")
        .filter(Boolean);
    const tracked = new Set(run(["ls-files", "--cached", "-z", "--", "."]));
    const untracked = new Set(run(["ls-files", "--others", "--exclude-standard", "-z", "--", "."]));
    let head = "unborn";
    try {
      head = run(["rev-parse", "HEAD"])[0]?.trim() ?? head;
    } catch {
      /* New Git repository. */
    }
    return { tracked, untracked, head };
  } catch {
    warnings.push(
      "Git inventory unavailable; filesystem mode excludes common generated directories and .env files, without interpreting .gitignore.",
    );
    return null;
  }
}

async function inspectText(path: string, extension: string) {
  if (binaryExtensions.has(extension)) return { textFiles: 0, lines: 0, nonBlank: 0, header: "" };
  const handle = await open(path, "r");
  let header: string;
  try {
    const sample = Buffer.alloc(8192);
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
    const bytes = sample.subarray(0, bytesRead);
    if (bytes.includes(0)) return { textFiles: 0, lines: 0, nonBlank: 0, header: "" };
    try {
      header = new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: true });
    } catch {
      return { textFiles: 0, lines: 0, nonBlank: 0, header: "" };
    }
  } finally {
    await handle.close();
  }
  const stream = createReadStream(path, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  let lines = 0,
    nonBlank = 0;
  try {
    for await (const line of reader) {
      lines++;
      if (line.trim()) nonBlank++;
    }
  } finally {
    reader.close();
    stream.destroy();
  }
  return { textFiles: 1, lines, nonBlank, header: header.slice(0, 1024) };
}

function testDeclarations(path: string, text: string): number {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  let count = 0;
  const rootName = (node: ts.Expression): string => {
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isPropertyAccessExpression(node)) return rootName(node.expression);
    if (ts.isCallExpression(node)) return rootName(node.expression);
    return "";
  };
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ["test", "it"].includes(rootName(node.expression)) &&
      node.arguments.some(
        (argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument),
      ) &&
      !/\.(describe|beforeEach|afterEach|beforeAll|afterAll|extend|use|setTimeout|step)\b/.test(
        node.expression.getText(source),
      )
    )
      count++;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return count;
}

function diskBucket(path: string): string {
  const parts = path.split("/");
  if (parts.includes(".git")) return "git-metadata";
  if (parts.includes("node_modules")) return "dependencies";
  if (parts.includes("artifacts")) return "artifacts";
  if (parts.some((part) => ["dist", "build", ".output", ".next"].includes(part))) return "builds";
  if (parts.includes("coverage")) return "coverage";
  if (parts.some((part) => ["test-results", "playwright-report"].includes(part)))
    return "test-results";
  if (parts.some((part) => [".cache", ".tanstack"].includes(part))) return "caches";
  return "other-ignored";
}

export async function scanCodebase(rootPath: string, outputPath?: string): Promise<MetricsReport> {
  const root = resolve(rootPath),
    output = outputPath ? resolve(outputPath) : undefined;
  const warnings: string[] = [];
  const inventory = gitInventory(root, warnings);
  const report: MetricsReport = {
    root,
    createdAt: new Date().toISOString(),
    git: inventory
      ? {
          head: inventory.head,
          tracked: inventory.tracked.size,
          untracked: inventory.untracked.size,
        }
      : null,
    files: [],
    repository: emptyTotals(),
    code: emptyTotals(),
    source: emptyTotals(),
    tests: { ...emptyTotals(), declarations: 0, runnableFiles: 0 },
    json: { ...emptyTotals(), invalid: [], unchecked: [] },
    public: emptyTotals(),
    byCategory: {},
    byExtension: {},
    byWorkspace: {},
    byDirectory: {},
    byPublicDirectory: {},
    byTestKind: {},
    disk: {},
    symlinks: 0,
    manifests: [],
    coverage: null,
    warnings,
  };
  const group = (groups: Record<string, Totals>, key: string, file: Totals) =>
    addTotals((groups[key] ??= emptyTotals()), file);
  const walk = async (directory: string) => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const entry of entries) {
      const absolute = resolve(directory, entry.name),
        path = slash(relative(root, absolute));
      if (absolute === output) continue;
      if (entry.isSymbolicLink()) {
        report.symlinks++;
        continue;
      }
      if (entry.isDirectory()) {
        try {
          await walk(absolute);
        } catch (error) {
          warnings.push(`${path}: ${String(error)}`);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const stats = await lstat(absolute);
        const status = inventory?.tracked.has(path)
          ? "tracked"
          : inventory?.untracked.has(path)
            ? "untracked"
            : "filesystem";
        const included = inventory
          ? status !== "filesystem"
          : !path.split("/").some((part) => fallbackIgnored.has(part) || part.startsWith(".env"));
        group(report.disk, included ? status : diskBucket(path), {
          ...emptyTotals(),
          files: 1,
          bytes: stats.size,
        });
        if (!included) continue;
        const extension = extname(path).toLowerCase() || "(none)";
        const { header, ...text } = await inspectText(absolute, extension);
        const file: FileMetric = {
          path,
          status,
          category: category(path, header),
          extension,
          workspace: /^(apps|packages)\/[^/]+\//.exec(path)?.[0].slice(0, -1) ?? "(root)",
          code: codeExtensions.has(extension),
          files: 1,
          bytes: stats.size,
          ...text,
        };
        if (isTest(path)) {
          file.testKind = /(^|\/)performance\//.test(path)
            ? "performance"
            : /(^|\/)browser\//.test(path)
              ? "browser"
              : "unit-integration";
          file.testDeclarations = testDeclarations(path, await readFile(absolute, "utf8"));
          report.tests.runnableFiles++;
          report.tests.declarations += file.testDeclarations;
          group(report.byTestKind, file.testKind, file);
        }
        if (extension === ".json") {
          addTotals(report.json, file);
          if (stats.size > 64 * 1024 * 1024) report.json.unchecked.push(path);
          else {
            try {
              const value = JSON.parse(await readFile(absolute, "utf8")) as unknown;
              if (
                entry.name === "package.json" &&
                value &&
                typeof value === "object" &&
                !Array.isArray(value)
              ) {
                const manifest = value as Record<string, unknown>;
                const count = (key: string) =>
                  manifest[key] &&
                  typeof manifest[key] === "object" &&
                  !Array.isArray(manifest[key])
                    ? Object.keys(manifest[key]).length
                    : 0;
                report.manifests.push({
                  path,
                  name: typeof manifest.name === "string" ? manifest.name : undefined,
                  dependencies: count("dependencies"),
                  devDependencies: count("devDependencies"),
                  peerDependencies: count("peerDependencies"),
                  optionalDependencies: count("optionalDependencies"),
                });
              }
            } catch (error) {
              report.json.invalid.push(`${path}: ${String(error)}`);
            }
          }
        }
        report.files.push(file);
        addTotals(report.repository, file);
        if (file.code) addTotals(report.code, file);
        if (file.category === "source") addTotals(report.source, file);
        if (file.category === "tests") addTotals(report.tests, file);
        if (path.split("/").includes("public")) {
          addTotals(report.public, file);
          const parts = path.split("/"),
            index = parts.indexOf("public");
          group(
            report.byPublicDirectory,
            parts.slice(0, Math.min(parts.length - 1, index + 2)).join("/"),
            file,
          );
        }
        group(report.byCategory, file.category, file);
        group(report.byExtension, extension, file);
        group(report.byWorkspace, file.workspace, file);
        group(
          report.byDirectory,
          path.split("/").slice(0, -1).slice(0, 3).join("/") || "(root)",
          file,
        );
      } catch (error) {
        warnings.push(`${path}: ${String(error)}`);
      }
    }
  };
  await walk(root);
  const coveragePath = resolve(root, "coverage/coverage-summary.json");
  try {
    const coverage = JSON.parse(await readFile(coveragePath, "utf8")) as Record<string, unknown>;
    if (!coverage.total || typeof coverage.total !== "object")
      throw new Error("Missing coverage totals");
    report.coverage = {
      path: slash(relative(root, coveragePath)),
      modifiedAt: (await lstat(coveragePath)).mtime.toISOString(),
      files: Object.keys(coverage).filter((key) => key !== "total").length,
      total: coverage.total,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      warnings.push(`Coverage report: ${String(error)}`);
  }
  return report;
}
