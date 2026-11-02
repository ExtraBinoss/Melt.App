import type { Page } from "@playwright/test";

/** Compare real browser pixels against the same native glyph, never DOM bounding boxes. */
export async function measureHeroContourPoints(page: Page) {
  const chunk = page.locator(".hero-type-stage");
  const pointsStyle = await page.addStyleTag({
    content: `
    .hero-type-stage { --hero-ink: #d25488 !important; }
    .hero-chunk { color: transparent !important; background: none !important; }
    .hero-chunk::before { opacity: 1 !important; mask-image: none !important; transition: none !important; }
    .hero-chunk::after { display: none !important; }
    .hero-type-stage[data-vector-ready] .landing-headline { visibility: hidden !important; }
    .hero-glyph-overlay > g { opacity: 1 !important; }
    .hero-glyph-overlay > g > path { display: none !important; }
    .hero-glyph-overlay circle { opacity: 1 !important; transform: none !important; fill: #d25488 !important; }
  `,
  });
  const points = await chunk.screenshot();
  const referenceStyle = await page.addStyleTag({
    content: `
    .hero-chunk { color: #000 !important; background: none !important; }
    .hero-chunk::before, .hero-chunk::after { display: none !important; }
    .hero-glyph-overlay { visibility: hidden !important; }
    .hero-type-stage[data-vector-ready] .landing-headline { visibility: visible !important; mask-image: none !important; }
  `,
  });
  const reference = await chunk.screenshot();
  await referenceStyle.evaluate((node) => node.parentNode?.removeChild(node));
  await pointsStyle.evaluate((node) => node.parentNode?.removeChild(node));
  return page.evaluate(
    async ({ points, reference }) => {
      async function decode(data: string) {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        context.drawImage(image, 0, 0);
        return {
          pixels: context.getImageData(0, 0, image.width, image.height).data,
          width: image.width,
          height: image.height,
        };
      }
      const nodes = await decode(points);
      const native = await decode(reference);
      const { width, height } = native;
      const inside = (x: number, y: number) =>
        x >= 0 && y >= 0 && x < width && y < height && native.pixels[(y * width + x) * 4]! < 100;
      const edges: [number, number][] = [];
      for (let y = 1; y < height - 1; y++)
        for (let x = 1; x < width - 1; x++)
          if (
            inside(x, y) &&
            (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1))
          )
            edges.push([x, y]);
      const marked = new Uint8Array(width * height);
      const colored = (i: number) =>
        nodes.pixels[i * 4]! > 140 && nodes.pixels[i * 4]! - nodes.pixels[i * 4 + 1]! > 35;
      const distances: number[] = [];
      for (let i = 0; i < marked.length; i++) {
        if (marked[i] || !colored(i)) continue;
        const queue = [i];
        marked[i] = 1;
        let x = 0,
          y = 0;
        for (let j = 0; j < queue.length; j++) {
          const position = queue[j]!;
          x += position % width;
          y += Math.floor(position / width);
          for (const adjacent of [position - 1, position + 1, position - width, position + width])
            if (
              adjacent >= 0 &&
              adjacent < marked.length &&
              !marked[adjacent] &&
              colored(adjacent)
            ) {
              marked[adjacent] = 1;
              queue.push(adjacent);
            }
        }
        if (queue.length < 3) continue;
        x /= queue.length;
        y /= queue.length;
        distances.push(Math.min(...edges.map(([ex, ey]) => Math.hypot(ex - x, ey - y))));
      }
      return {
        points: distances.length,
        maximumEdgeDistance: Math.max(...distances),
        closeToEdge: distances.filter((distance) => distance <= 4.5).length,
      };
    },
    { points: points.toString("base64"), reference: reference.toString("base64") },
  );
}
