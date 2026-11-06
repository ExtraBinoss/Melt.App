import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { release } from "node:os";
import {
  preparePaletteProfile,
  openPalette,
  closePalette,
  paletteSelector,
  type PaletteKind,
  type WorkspaceKind,
} from "./support/palette-profile";
import { searchSurfaceCounters } from "./support/search-profile";

// Playwright DOM snapshots are expensive on the editor and are not application work.
// CPU/timeline tracing is enabled explicitly only in the separate diagnostic cohort below.
test.use({
  trace: "off",
  screenshot: "off",
  video: "off",
  channel: "chromium",
  headless: process.env.MUSART_PROFILE_HEADED !== "1",
});

for (const workspace of ["classic", "studio"] as const satisfies readonly WorkspaceKind[])
  for (const kind of ["quick-add", "cmdk"] as const satisfies readonly PaletteKind[])
    test(`${workspace} ${kind}: cold/warm native openings, input and isolated editor commits`, async ({
      page,
      browser,
    }) => {
      test.setTimeout(120000);
      const directory = "artifacts/quick-add-search-profile";
      await mkdir(directory, { recursive: true });
      const { point } = await preparePaletteProfile(page, workspace, kind);
      const before = await page.evaluate(() => window.musart!.snapshot());
      const counters = await searchSurfaceCounters(page);
      const body = await page.locator("body").getAttribute("style");
      for (const [index, query] of [
        "blur",
        "text",
        "hand",
        "contrast",
        "zoom",
        "zzzznone",
      ].entries()) {
        await openPalette(page, kind, point);
        const palette = page.locator(paletteSelector(kind)),
          input = palette.getByRole("combobox");
        if (kind === "quick-add") {
          expect(await page.locator("body").getAttribute("style")).toBe(body);
          const opening = await page.evaluate(() =>
            [...window.__searchProfile!.samples]
              .reverse()
              .find((sample) => sample.kind === "open")!,
          );
          expect(opening.firstVisibleBounds!.x).toBeGreaterThan(12);
          expect(Math.abs(opening.firstVisibleBounds!.x - point.x)).toBeLessThan(12);
        }
        if (index === 0) {
          const placeholder = await input.getAttribute("placeholder");
          await expect.poll(() => input.getAttribute("placeholder")).not.toBe(placeholder);
          await palette.screenshot({ path: `${directory}/${workspace}-${kind}.png` });
        }
        await input.pressSequentially(query, { delay: 15 });
        await page.waitForFunction((query) => {
          const sample = window.__searchProfile!.samples.at(-1);
          return (
            sample?.kind === "input" && sample.value === query && Boolean(sample.resultsSecondRaf)
          );
        }, query);
        const latest = await page.evaluate(() => window.__searchProfile!.samples.at(-1)!);
        await expect(palette).toHaveAttribute("data-palette-initial", "false");
        expect(
          await palette
            .locator(".blur-reveal")
            .evaluateAll((nodes) => nodes.every((node) => node.getAnimations().length === 0)),
        ).toBe(true);
        if (query === "zzzznone") expect(latest.correctResultCount).toBe(0);
        else expect(latest.correctResultCount).toBeGreaterThan(0);
        await closePalette(page, kind);
      }
      const after = await searchSurfaceCounters(page);
      expect(after.commits).toEqual(counters.commits);
      const measured = await page.evaluate(() => ({
        samples: window.__searchProfile!.samples,
        longTasks: window.__searchProfile!.longTasks,
        adapter: window.__searchProfile!.adapter,
      }));
      const delta = Object.fromEntries(
        (["gpu", "webgl", "canvas", "videoFrame"] as const).map((key) => [
          key,
          after.readbacks[key] - counters.readbacks[key],
        ]),
      );
      expect(delta).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
      expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(before.project);

      // Trace separately: tracing must not inflate the latency samples above.
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
      await cdp.send("Tracing.start", {
        categories: "devtools.timeline,blink.user_timing",
        transferMode: "ReturnAsStream",
      });
      await cdp.send("Profiler.start");
      await openPalette(page, kind, point);
      await page
        .locator(paletteSelector(kind))
        .getByRole("combobox")
        .pressSequentially("blur", { delay: 15 });
      await page.waitForFunction(() => window.__searchProfile!.samples.at(-1)?.resultsSecondRaf);
      const { profile } = await cdp.send("Profiler.stop");
      const complete = new Promise<{ stream?: string }>((resolve) =>
        cdp.once("Tracing.tracingComplete", resolve),
      );
      await cdp.send("Tracing.end");
      const { stream } = await complete;
      if (!stream) throw Error("No native trace stream.");
      let trace = "";
      for (;;) {
        const chunk = await cdp.send("IO.read", { handle: stream });
        trace += chunk.base64Encoded ? Buffer.from(chunk.data, "base64").toString() : chunk.data;
        if (chunk.eof) break;
      }
      await cdp.send("IO.close", { handle: stream });
      await cdp.detach();
      await closePalette(page, kind);
      await writeFile(`${directory}/${workspace}-${kind}.cpuprofile`, JSON.stringify(profile));
      await writeFile(`${directory}/${workspace}-${kind}.trace.json`, trace);
      await writeFile(
        `${directory}/${workspace}-${kind}.json`,
        JSON.stringify(
          {
            browser: browser.version(),
            platform: process.platform,
            kernel: release(),
            sourceCommit: process.env.MUSART_PROFILE_SHA,
            production: process.env.MUSART_PROFILE_PRODUCTION === "1",
            scope: "CPUQuota=200%, MemoryHigh=3000M, MemoryMax=3500M, no swap",
            workload: "Studio Starter",
            workspace,
            kind,
            point,
            countersBefore: counters,
            countersAfter: after,
            readbackDelta: delta,
            ...measured,
          },
          null,
          2,
        ),
      );
      await page.evaluate(() => window.__searchProfile!.stop?.());
    });
