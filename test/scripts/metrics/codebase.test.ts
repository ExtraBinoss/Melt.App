import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { scanCodebase } from "../../../scripts/metrics/scan";
import { fileInventoryCsv, markdownReport } from "../../../scripts/metrics/report";
import { runMetrics } from "../../../scripts/metrics/cli";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(git = true) {
  const root = await mkdtemp(resolve(tmpdir(), "codebase-metrics-"));
  roots.push(root);
  const put = async (path: string, text: string | Buffer) => {
    const full = resolve(root, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, text);
  };
  if (git) execFileSync("git", ["init", "-q", root]);
  return { root, put };
}

test("separates repository, JSON, public, generated, tests and ignored byte inventories", async () => {
  const { root, put } = await fixture();
  await put(".gitignore", "node_modules/\nartifacts/\ncoverage/\n.env\n");
  await put("apps/demo/src/clock.ts", "// comment\r\n\r\nexport const clock = 1;\r\n");
  await put("apps/demo/src/route.gen.ts", "// generated route\nexport {};\n");
  await put("apps/demo/src/data.json", '{"ok":true}\n');
  await put("apps/demo/src/tools/input.ts", "export {};\n");
  await put("apps/demo/public/data.json", "[1,2]");
  await put("apps/demo/public/image.png", Buffer.from([1, 0, 2, 3]));
  await put(
    "apps/demo/test/clock.test.ts",
    [
      'const fake = "test(\\\"fake\\\", () => {})";',
      'describe("clock", () => { it("one", () => {}); test.skip("two", () => {}); });',
      'test.each([1, 2])("row", () => {});',
    ].join("\n"),
  );
  await put(
    "test/browser/clock.spec.ts",
    'test.describe("browser", () => { test("works", async () => { await test.step("step", async () => {}); }); });',
  );
  await put("test/performance/clock.spec.ts", 'test("fast", () => {});');
  await put(
    "package.json",
    JSON.stringify({ name: "demo", dependencies: { a: "1" }, devDependencies: { b: "1", c: "2" } }),
  );
  await put("README.md", "# Demo\n");
  execFileSync("git", ["-C", root, "add", "."]);
  await put("untracked.ts", "export {};\n");
  await put("node_modules/ignored.js", "this is not source");
  await put("artifacts/capture.bin", Buffer.alloc(50));
  await put("artifacts/codebase-metrics/previous.json", "not included");
  await put(".env", "SECRET=value");
  await put(
    "coverage/coverage-summary.json",
    JSON.stringify({ total: { lines: { pct: 50 } }, "old.ts": {} }),
  );
  await symlink(root, resolve(root, "recursive-link"));
  const report = await scanCodebase(root, resolve(root, "artifacts/codebase-metrics"));
  const clock = report.files.find((file) => file.path.endsWith("src/clock.ts"));
  expect(clock).toMatchObject({
    lines: 3,
    nonBlank: 2,
    textFiles: 1,
    category: "source",
    workspace: "apps/demo",
  });
  expect(report.files.find((file) => file.path.endsWith("image.png"))).toMatchObject({
    lines: 0,
    textFiles: 0,
    bytes: 4,
  });
  expect(report.byCategory.generated.files).toBe(1);
  expect(report.files.find((file) => file.path.endsWith("tools/input.ts"))?.category).toBe(
    "source",
  );
  expect(report.json).toMatchObject({ files: 3, invalid: [], unchecked: [] });
  expect(report.public.files).toBe(2);
  expect(report.tests).toMatchObject({ runnableFiles: 3, declarations: 5 });
  expect(Object.keys(report.byTestKind).sort()).toEqual([
    "browser",
    "performance",
    "unit-integration",
  ]);
  expect(report.disk.artifacts.bytes).toBe(50);
  expect(report.disk.dependencies.files).toBe(1);
  expect(report.symlinks).toBe(1);
  expect(report.git?.untracked).toBe(2); // Source plus the symlink; only regular files enter repository metrics.
  expect(report.files.find((file) => file.path === "untracked.ts")?.status).toBe("untracked");
  expect(
    report.files.some((file) => file.path === ".env" || file.path.includes("ignored.js")),
  ).toBe(false);
  expect(report.manifests[0]).toMatchObject({ name: "demo", dependencies: 1, devDependencies: 2 });
  expect(report.coverage).toMatchObject({ files: 1, total: { lines: { pct: 50 } } });
  expect(report.warnings).toEqual([]);
  expect(report.repository.files).toBe(report.files.length);
  expect(report.repository.bytes).toBe(report.files.reduce((sum, file) => sum + file.bytes, 0));
  expect(report.repository.bytes).toBe(
    (report.disk.tracked?.bytes ?? 0) + report.disk.untracked.bytes,
  );
  expect(markdownReport(report)).toContain("not coverage");
  expect(markdownReport(report)).toContain("may cover only part");
});

test("handles no Git, empty text, binary sniffing, final lines, CSV paths and invalid JSON", async () => {
  const { root, put } = await fixture(false);
  await put('src/comma,"name.ts', "export {};\n\n");
  await put("src/empty.ts", "");
  await put("src/no-newline.ts", "export {};");
  await put("src/opaque.data", Buffer.from([0, 1, 2]));
  await put("src/invalid-utf8.data", Buffer.from([255, 254]));
  await put("data/broken.json", "{broken}");
  await put("node_modules/ignored.ts", "ignored");
  const report = await scanCodebase(root);
  expect(report.git).toBeNull();
  expect(report.warnings).toHaveLength(1);
  expect(report.json.invalid[0]).toContain("data/broken.json");
  expect(report.files.find((file) => file.path.endsWith("empty.ts"))).toMatchObject({
    lines: 0,
    textFiles: 1,
  });
  expect(report.files.find((file) => file.path.endsWith("no-newline.ts"))).toMatchObject({
    lines: 1,
  });
  expect(report.files.filter((file) => file.textFiles === 0)).toHaveLength(2);
  expect(report.files.some((file) => file.path.includes("node_modules"))).toBe(false);
  expect(fileInventoryCsv(report.files)).toContain('"src/comma,""name.ts"');
  expect(markdownReport(report)).toContain("Current coverage is unknown");
});

test("CLI writes real reports, excludes its own output and rejects malformed arguments", async () => {
  const { root, put } = await fixture();
  await put("clock.ts", "export {};\n");
  vi.spyOn(console, "log").mockImplementation(() => {});
  await expect(runMetrics(["--unknown"])).rejects.toThrow("Unknown option");
  await expect(runMetrics(["--root"])).rejects.toThrow("missing value");
  await expect(runMetrics(["--root", root, "--out", root])).rejects.toThrow("must differ");
  await runMetrics(["--root", root]);
  await runMetrics(["--root", root]);
  const data = JSON.parse(
    await readFile(resolve(root, "artifacts/codebase-metrics/summary.json"), "utf8"),
  );
  expect(data.repository.files).toBe(1);
  expect(data.files[0].path).toBe("clock.ts");
  expect(await readFile(resolve(root, "artifacts/codebase-metrics/files.csv"), "utf8")).toContain(
    '"clock.ts"',
  );
});
