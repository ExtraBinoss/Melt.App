import { expect, test, vi } from "vitest";
import { createGlyphSurface } from "../../../../src/components/projects/landing/hero/glyph-surface";

test("unchanged points and completed glyphs do not keep invalidating SVG attributes", () => {
  const stage = document.createElement("div"),
    heading = document.createElement("h1");
  stage.append(heading);
  document.body.append(stage);
  const surface = createGlyphSurface(stage, heading, [
    {
      d: "M0 0L40 0L40 80L0 80Z",
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 80 },
      ],
      x: 0,
      y: 0,
      width: 40,
      height: 80,
    },
  ]);
  const write = vi.spyOn(SVGElement.prototype, "setAttribute");
  try {
    surface.paint(0, 0.4, true);
    expect(heading.style.maskImage).toBe("");
    write.mockClear();
    surface.paint(0, 0.45, true);
    expect(
      write.mock.instances.filter(
        (node) => node instanceof SVGElement && node.localName === "circle",
      ),
    ).toHaveLength(0);
    write.mockClear();
    surface.paint(0, 0.45, true);
    expect(write).not.toHaveBeenCalled();
    surface.paint(0, 1, true);
    write.mockClear();
    surface.paint(0, 2, true);
    expect(write).not.toHaveBeenCalled();
    surface.clear();
    expect(stage.querySelector("[data-hero-glyph]")).toHaveAttribute("opacity", "0");
    surface.paint(0, 0.2, false);
    expect(heading.style.maskImage).toMatch(/^url/);
    expect(stage.querySelector("[data-hero-glyph]")).toHaveAttribute("opacity", "1");
    surface.paint(0, 1, false);
    surface.unmask();
    expect(heading.style.maskImage).toBe("");
    expect(stage.querySelector("[data-hero-glyph]")).toHaveAttribute("opacity", "0");
  } finally {
    write.mockRestore();
    surface.dispose();
    stage.remove();
  }
  expect(heading.style.maskImage).toBe("");
});
