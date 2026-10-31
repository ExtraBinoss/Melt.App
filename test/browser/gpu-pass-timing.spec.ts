import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installReadbackProbe } from "./support/readback-probe";

const folder = "artifacts/gpu-pass-timing";
let bundle: string;
test.beforeAll(async () => {
  await mkdir(folder, { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/gpu-pass-timing.ts",
      "--target=browser",
      "--format=esm",
      `--outfile=${resolve(folder, "fixture.js")}`,
    ],
    { stdio: "pipe" },
  );
  bundle = await readFile(`${folder}/fixture.js`, "utf8");
});
test("Three timestamps include actual native video, mask and separate effect passes", async ({
  page,
  browser,
}) => {
  await installReadbackProbe(page);
  await page.route("**/__gpu-passes", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }),
  );
  await page.route("**/__gpu-passes.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: bundle }),
  );
  await page.goto("/__gpu-passes");
  const result = await page.evaluate(async () => {
    const url = new URL("/__gpu-passes.js", location.href).href;
    const { measureGpuPasses } = (await import(url)) as typeof import("./support/gpu-pass-timing");
    return measureGpuPasses();
  });
  const readbacks = await page.evaluate(() => window.__musartVideoReadbacks);
  await writeFile(
    `${folder}/native.json`,
    JSON.stringify({ browser: browser.version(), ...result, readbacks }, null, 2),
  );
  expect(result.backend).toBe("webgpu");
  expect(result.closed).toBe(true);
  expect(result.sample.gpuPasses).not.toBeNull();
  for (const name of ["video", "mask", "effects/dither", "effects/ascii", "display"])
    expect(result.sample.gpuPasses?.[name]).toBeGreaterThanOrEqual(0);
  expect(result.sample.gpuMs).toBeGreaterThan(0);
  expect(result.sample.gpuMs).toBeCloseTo(
    Object.values(result.sample.gpuPasses!).reduce((a, b) => a + b, 0),
    9,
  );
  expect(readbacks).toMatchObject({ canvas: 0, webgl: 0, videoFrame: 0 });
});
