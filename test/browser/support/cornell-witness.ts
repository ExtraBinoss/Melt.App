import {
  compileMotion,
  evaluateMotion,
  applyMotionFrame,
  type Project,
} from "../../../packages/core/src/index";
import { createRenderSession, exportMotionVideo } from "../../../packages/render/src/index";

/** Thin native harness: do not keep the complete editor and multiple export contexts alive. */
export async function renderCornell(project: Project, webgl: boolean) {
  const original = JSON.stringify(project);
  const program = compileMotion(project, { compositionId: project.pages[0]!.id });
  const session = createRenderSession({ forceWebGL: webgl, maxBytes: 128 * 1024 * 1024 });
  const images: string[] = [];
  let stats;
  try {
    for (const time of [0, 4, 8, 479 / 60]) {
      const plan = evaluateMotion(
        program,
        { value: Math.round(time * 60), rate: 60 },
        { terminalPreview: time === 8 },
      );
      images.push(
        await session.withCanvasFrame(
          applyMotionFrame(program, plan),
          project.assets,
          (canvas) => canvas.toDataURL("image/png"),
          { scale: 1 / 3, motionFrame: plan },
        ),
      );
    }
    stats = session.stats();
  } finally {
    await session.dispose();
  }
  let video: string | null = null;
  let frameCount: number | null = null;
  if (!webgl) {
    const result = await exportMotionVideo(project, {
      compositionId: project.pages[0]!.id,
      scale: 1 / 3,
      frameRate: project.pages[0]!.motion!.frameRate,
      audio: false,
      container: "mp4",
      maxGpuBytes: 128 * 1024 * 1024,
      videoBitrate: 8_000_000,
    });
    if (!result.blob) throw Error("No encoded Cornell video");
    frameCount = result.frameCount;
    video = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(Error("Invalid video result"));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(result.blob!);
    });
  }
  if (!stats) throw Error("Missing native Cornell statistics");
  return { images, stats, video, frameCount, unchanged: JSON.stringify(project) === original };
}
