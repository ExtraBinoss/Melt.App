import { readFile, mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("animation text and trim grips follow the actual fill in both themes", async ({ page }) => {
  const styles = await Promise.all(
    [
      "apps/web/src/components/motion/timeline.css",
      "apps/web/src/components/motion/row-hover.css",
      "apps/web/src/components/motion/animations/animations.css",
    ].map((path) => readFile(path, "utf8")),
  );
  await page.setContent(`<style>${styles.join("\n")}</style><style>
    :root { --border:#888; --motion-accent:#8b5cf6; --media-video:#8b5cf6; --media-audio:#16a34a; --motion-accent-foreground:#fff; --motion-simple-row-height:32px; }
    .motion-timeline { width:400px; height:120px; }
    .motion-row { position:relative; height:32px; grid-template-columns:0 1fr; }
    .motion-animation-block { position:relative; width:180px; }
  </style><div class="motion-timeline"><div class="motion-row is-selected" data-layer-kind="image"><div>
    <button class="motion-animation-block" data-selected="true"><span>Move · Left</span></button>
    <span class="motion-trim-handle"></span>
  </div></div></div>`);
  const row = page.locator(".motion-row"),
    block = page.locator(".motion-animation-block");
  const ink = async () => block.evaluate((node) => getComputedStyle(node).color);
  const cases = [
    { fill: "#8b5cf6", light: true },
    { fill: "#222222", light: true },
    { fill: "#ffffff", light: false },
    { fill: "#ffe900", light: false },
    { fill: "#16a34a", light: false },
    { fill: "rgb(30, 60, 190)", light: true },
  ];
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => {
      const root = document.documentElement;
      root.style.setProperty("--foreground", theme === "dark" ? "#ffffff" : "#24252b");
      root.style.setProperty("--background", theme === "dark" ? "#151515" : "#ffffff");
      root.style.setProperty("--muted-foreground", theme === "dark" ? "#a0a0a0" : "#797d88");
      root.style.setProperty("--muted", theme === "dark" ? "#282828" : "#ededed");
    }, theme);
    for (const kind of ["image", "video", "audio"])
      for (const item of cases) {
        await row.evaluate(
          (node, { kind, fill }) => {
            node.setAttribute("data-layer-kind", kind);
            node.style.setProperty("--motion-track-color", fill);
          },
          { kind, fill: item.fill },
        );
        const expected = item.light ? "color(srgb-linear 1 1 1)" : "color(srgb-linear 0 0 0)";
        expect(await ink(), `${theme}/${kind}/${item.fill}`).toBe(expected);
        expect(
          await block
            .locator("span")
            .first()
            .evaluate((node) => getComputedStyle(node).color),
        ).toBe(expected);
        const grip = await row
          .locator(".motion-trim-handle")
          .evaluate((node) => getComputedStyle(node, "::after").backgroundColor);
        expect(grip).toBe(expected);
        expect(await block.evaluate((node) => getComputedStyle(node).boxShadow)).toContain(
          expected,
        );
      }
  }
  // Unselected and hovered blocks also resolve their own changed background.
  await row.evaluate((node) => node.classList.remove("is-selected"));
  await page.mouse.move(500, 200);
  await page.evaluate(() => document.documentElement.style.setProperty("--muted", "#ffffff"));
  expect(await ink()).toBe("color(srgb-linear 0 0 0)");
  await block.hover();
  expect(await ink()).toBe("color(srgb-linear 1 1 1)");
  await row.evaluate((node) => {
    node.classList.add("is-selected");
    node.style.setProperty("--motion-track-color", "#8b5cf6");
  });
  await mkdir("artifacts/timeline-contrast", { recursive: true });
  await page.screenshot({ path: "artifacts/timeline-contrast/selected.png" });
});
