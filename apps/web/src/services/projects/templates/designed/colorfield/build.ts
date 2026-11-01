import { TemplateAuthor } from "../../motion/author";

export function createColorfield() {
  const a = new TemplateAuthor("colorfield", "Colorfield", 1080, 1350);
  a.commit([{ type: "updatePage", patch: { background: "#ede8df" } }]);
  const colors = ["#ca715a", "#e8b766", "#657b67", "#768ab0", "#4b536e", "#ad8295"];
  const shapes = colors.map((fill, index) =>
    a.layer(
      index % 2 ? "ellipse" : "rectangle",
      `colorfield-shape-${index}`,
      `Color study ${index + 1}`,
      {
        x: 64 + (index % 2) * 480,
        y: 246 + Math.floor(index / 2) * 302,
        width: 456,
        height: 280,
        fill,
        radius: index % 2 ? 0 : 28,
        ...(index === 2
          ? {
              fillGradient: {
                kind: "linear" as const,
                angle: 30,
                stops: [
                  { offset: 0, color: fill },
                  { offset: 1, color: "#afbb92" },
                ],
              },
            }
          : {}),
      },
    ),
  );
  a.add([
    a.layer("text", "colorfield-title", "Colorfield", {
      x: 56,
      y: 64,
      width: 970,
      height: 140,
      text: "COLORFIELD.",
      fontFamily: "Space Grotesk",
      fontWeight: 700,
      fontSize: 112,
      letterSpacing: -5,
      fill: "#30342f",
    }),
    ...shapes,
    a.layer("text", "colorfield-footer", "Edition", {
      x: 64,
      y: 1210,
      width: 940,
      height: 66,
      text: "FORM, COLOR, POSSIBILITY.\nMUSART / SHAPE STUDIES 003",
      fontFamily: "Space Grotesk",
      fontSize: 20,
      letterSpacing: 1,
      lineHeight: 1.5,
      fill: "#676a61",
    }),
  ]);
  return a.finish();
}
