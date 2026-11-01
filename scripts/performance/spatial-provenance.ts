import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus, release, totalmem } from "node:os";

/** Include untracked implementation sources: a HEAD commit alone cannot identify this cohort. */
export function spatialProvenance() {
  const git = (args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
  const paths = [
    "packages/spatial-index",
    "packages/core/src/layers",
    "packages/render/src/spatial/picking.ts",
    "apps/web/src/canvas/selection",
    "apps/web/src/canvas/interaction/gestures.ts",
    "apps/web/src/state/motion/hover.ts",
    "scripts/performance/spatial-*.ts",
  ];
  const files = git(["ls-files", "--cached", "--others", "--exclude-standard", "--", ...paths])
    .split("\n")
    .filter(Boolean);
  return {
    date: new Date().toISOString(),
    bun: Bun.version,
    platform: process.platform,
    release: release(),
    cpu: cpus()[0]?.model,
    cpuCount: cpus().length,
    totalMemory: totalmem(),
    command: process.argv,
    commit: git(["rev-parse", "HEAD"]),
    status: git(["status", "--short"]),
    diff: git(["diff", "--", ...paths]),
    lockfileSha256: createHash("sha256").update(readFileSync("bun.lock")).digest("hex"),
    sources: files.map((path) => {
      const source = readFileSync(path, "utf8");
      return { path, sha256: createHash("sha256").update(source).digest("hex"), source };
    }),
  };
}
