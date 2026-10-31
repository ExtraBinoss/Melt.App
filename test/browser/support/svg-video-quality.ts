import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { createRenderSession, exportMotionVideo } from "../../../packages/render/src/index";
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from "mediabunny";

export async function renderSvgVideo(svg: string, forceWebGL: boolean) {
  const source = new DOMParser().parseFromString(svg, "image/svg+xml");
  const parts = [...source.querySelectorAll("path")].map((path) => ({
    path: path.getAttribute("d")!,
    matrix: (() => {
      const m = new DOMMatrix(path.getAttribute("transform") ?? undefined);
      return [m.a, m.b, m.c, m.d, m.e, m.f] as [number, number, number, number, number, number];
    })(),
    fill: ["#fff", "#ffffff"].includes(path.getAttribute("fill")?.toLowerCase() ?? "")
      ? "#ffffff"
      : "#000000",
  }));
  const page = createPage({
    id: "svg-quality",
    width: 960,
    height: 320,
    background: "#ffffff",
    layers: [
      createLayer("vector", {
        id: "mascot",
        x: 32,
        y: 32,
        width: 256,
        height: 256,
        fill: "#000000",
        vector: {
          viewBox: source.documentElement.getAttribute("viewBox")!,
          preserveColors: true,
          parts,
        },
      }),
      createLayer("vector", {
        id: "color",
        x: 352,
        y: 32,
        width: 256,
        height: 256,
        fill: "#8b5cf6",
        vector: { viewBox: "0 0 256 256", path: "M8 14 L243 98 L32 247 Z" },
      }),
      createLayer("text", {
        id: "native-text",
        x: 672,
        y: 32,
        width: 256,
        height: 240,
        text: "Melt",
        fontFamily: "Inter",
        fontSize: 80,
        fill: "#000000",
      }),
    ],
  });
  const engine = new EditorEngine(createProject({ pages: [page] }));
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({ type: "setMotionDuration", duration: { value: 1, rate: 30 } });
  const project = engine.getSnapshot().project;
  const fontResolver = async () => {
    const response = await fetch("/svg-font.ttf");
    if (!response.ok) throw Error("Font request failed");
    return response.arrayBuffer();
  };
  const renderer = createRenderSession({ forceWebGL, fontResolver });
  let aliased = "",
    antialiased = "";
  try {
    aliased = await renderer.withCanvasFrame(
      page,
      project.assets,
      (canvas) => canvas.toDataURL("image/png"),
      { vectorAntialias: false },
    );
    antialiased = await renderer.withCanvasFrame(
      page,
      project.assets,
      (canvas) => canvas.toDataURL("image/png"),
      { vectorAntialias: true },
    );
  } finally {
    await renderer.dispose();
  }
  const video = await exportMotionVideo(project, {
    compositionId: page.id,
    container: "mp4",
    audio: false,
    forceWebGL,
    fontResolver,
    videoBitrate: 8_000_000,
    maxFrames: 2,
  });
  if (!video.blob) throw Error("Missing encoded MP4");
  return { aliased, antialiased, bytes: [...new Uint8Array(await video.blob.arrayBuffer())] };
}
export async function inspectSvgVideo(value: Awaited<ReturnType<typeof renderSvgVideo>>) {
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 320;
  const context = canvas.getContext("2d")!;
  async function image(url: string) {
    const image = new Image();
    image.src = url;
    await image.decode();
    context!.clearRect(0, 0, 960, 320);
    context!.drawImage(image, 0, 0);
    return context!.getImageData(0, 0, 960, 320).data;
  }
  const alias = await image(value.aliased),
    aa = await image(value.antialiased);
  const input = new Input({
    source: new BlobSource(new Blob([new Uint8Array(value.bytes)], { type: "video/mp4" })),
    formats: ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw Error("No decoded video track");
    let pixels: Uint8ClampedArray | undefined,
      frames = 0;
    for await (const sample of new VideoSampleSink(track).samples()) {
      try {
        sample.draw(context, 0, 0);
        pixels = context.getImageData(0, 0, 960, 320).data;
        frames++;
      } finally {
        sample.close();
      }
    }
    if (!pixels) throw Error("No decoded MP4 pixels");
    let edges = 0,
      aliasError = 0,
      aaError = 0;
    for (let y = 30; y < 290; y++)
      for (let x = 30; x < 290; x++) {
        const index = (y * 960 + x) * 4;
        if (Math.abs(alias[index]! - aa[index]!) < 16) continue;
        edges++;
        aliasError += (pixels[index]! - alias[index]!) ** 2;
        aaError += (pixels[index]! - aa[index]!) ** 2;
      }
    let textEdges = 0,
      textError = 0;
    for (let y = 20; y < 240; y++)
      for (let x = 660; x < 960; x++) {
        const i = (y * 960 + x) * 4;
        if (aa[i]! > 8 && aa[i]! < 247) {
          textEdges++;
          textError += (pixels[i]! - aa[i]!) ** 2;
        }
      }
    return {
      textEdges,
      textRmse: Math.sqrt(textError / textEdges),
      edges,
      frames,
      aliasRmse: Math.sqrt(aliasError / edges),
      aaRmse: Math.sqrt(aaError / edges),
      decoded: canvas.toDataURL("image/png"),
    };
  } finally {
    input.dispose();
  }
}
