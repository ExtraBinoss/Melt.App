import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { BunPlugin } from "bun";

/** Preserve compiled code and source maps; optional snapshots freeze only the two changed owners. */
export async function buildVideoWitness(output: string, baseline?: string) {
  const urls: BunPlugin = {
    name: "native-asset-urls",
    setup(build) {
      build.onResolve({ filter: /\?url$/ }, (args) => ({
        path: args.path.startsWith(".")
          ? resolve(args.resolveDir, args.path.slice(0, -4))
          : Bun.resolveSync(args.path.slice(0, -4), args.resolveDir),
        namespace: "asset-url",
      }));
      build.onLoad({ filter: /.*/, namespace: "asset-url" }, (args) => ({
        contents: `export default ${JSON.stringify(`/@fs${args.path}`)}`,
        loader: "js",
      }));
    },
  };
  const snapshots: BunPlugin = {
    name: "frozen-video-baseline",
    setup(build) {
      for (const [filter, file] of [
        [/\/sources\/media\/video-sources\.ts$/, "video-sources-before.ts"],
        [/\/sources\/video\/playback\.ts$/, "playback-before.ts"],
      ] as const)
        build.onLoad({ filter }, async () => ({
          contents: await readFile(resolve(baseline!, file), "utf8"),
          loader: "ts",
        }));
    },
  };
  for (const variant of baseline ? ["baseline", "candidate"] : ["candidate"]) {
    await mkdir(resolve(output, variant), { recursive: true });
    const result = await Bun.build({
      entrypoints: ["test/performance/video-playback/witness.ts"],
      outdir: resolve(output, variant),
      target: "browser",
      format: "esm",
      sourcemap: "external",
      define: { "import.meta.env.DEV": "false", "import.meta.env.BASE_URL": '"/"' },
      plugins: variant === "baseline" ? [urls, snapshots] : [urls],
    });
    if (!result.success)
      throw new AggregateError(result.logs, "Native video witness build failed.");
  }
}
