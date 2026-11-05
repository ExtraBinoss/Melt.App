import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("violet text visibly advances while JavaScript is blocked, with an accessible static reduced-motion label", async ({
  page,
  context,
}) => {
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/throbber-compositor.tsx",
      "--target=browser",
      '--define=import.meta.env.BASE_URL="/"',
      // The fixture uses the explicit EN/FR resources, without Vite's extra-locale glob.
      "--define=import.meta.glob=globalThis.__fixtureLocales",
      "--outdir=artifacts/throbber-compositor",
    ],
    { stdio: "pipe" },
  );
  const bundle = await readFile("artifacts/throbber-compositor/throbber-compositor.js", "utf8");
  const css = await readFile("artifacts/throbber-compositor/throbber-compositor.css", "utf8");
  await page.route("**/throbber-witness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html>
    <style>:root{--muted-foreground:#999;--brand-primary:#8b5cf6;--primary-foreground:#fff}body{margin:40px;background:#232323;font-family:Arial}#root{width:360px}.ui-throbber{display:grid!important;justify-items:center;font-size:18px!important;gap:24px!important}</style>
    <style>${css}</style><div id="root"></div><script>globalThis.__fixtureLocales=()=>({});</script><script type="module" src="/throbber-witness.js"></script>`,
    }),
  );
  await page.route("**/throbber-witness.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: bundle }),
  );
  await page.goto("/throbber-witness");
  const label = page.locator(".ui-throbber-label");
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.locator(".melt-mascot")).toBeVisible();
  const clip = await label.boundingBox();
  expect(clip).not.toBeNull();
  await label.evaluate((node) => {
    for (const animation of node.getAnimations({ subtree: true })) animation.currentTime = 1000;
    return new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  const cdp = await context.newCDPSession(page);
  let blocking = false;
  const captures: string[] = [];
  cdp.on("Page.screencastFrame", (event) => {
    if (blocking) captures.push(event.data);
    void cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId });
  });
  page.on("console", (event) => {
    if (event.text() === "block-start") blocking = true;
    if (event.text() === "block-end") blocking = false;
  });
  await cdp.send("Page.startScreencast", {
    format: "png",
    maxWidth: 800,
    maxHeight: 500,
    everyNthFrame: 4,
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          console.log("block-start");
          const until = performance.now() + 1600;
          while (performance.now() < until) {
            /* Intentional fixture task, never production. */
          }
          console.log("block-end");
          resolve();
        }, 0),
      ),
  );
  await cdp.send("Page.stopScreencast");
  expect(captures.length, "compositor must present frames during the blocked task").toBeGreaterThan(
    1,
  );
  const inspector = await context.newPage();
  const changed = await inspector.evaluate(
    async ({ captures, clip, viewportWidth }) => {
      const decode = async (png: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        const scale = image.width / viewportWidth;
        return ctx.getImageData(
          Math.floor(clip.x * scale),
          Math.floor(clip.y * scale),
          Math.ceil(clip.width * scale),
          Math.ceil(clip.height * scale),
        ).data;
      };
      const first = await decode(captures[0]!);
      for (const png of captures.slice(1)) {
        const next = await decode(png);
        if (first.some((value, index) => value !== next[index])) return true;
      }
      return false;
    },
    { captures, clip: clip!, viewportWidth: page.viewportSize()!.width },
  );
  await inspector.close();
  expect(changed, "label pixels must visibly advance independently of JavaScript").toBe(true);
  await mkdir("artifacts/throbber-compositor", { recursive: true });
  for (const [index, png] of [captures[0]!, captures.at(-1)!].entries())
    await writeFile(
      `artifacts/throbber-compositor/blocked-${index}.png`,
      Buffer.from(png, "base64"),
    );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(label.locator("[aria-hidden=true]")).toBeHidden();
  expect(await label.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
  await expect(page.getByRole("status")).toContainText("My winter studio");
  await cdp.detach();
});
