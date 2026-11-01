import {
  compileMotion,
  evaluateMotion,
  applyMotionFrame,
  type Project,
  type MotionFrameRate,
} from "../../../packages/core/src/index";
import { createRenderSession, exportMotionVideo } from "../../../packages/render/src/index";

/** Thin native harness: do not keep the complete editor and multiple export contexts alive. */
export async function renderCornell(
  project: Project,
  webgl: boolean,
  frameRate: MotionFrameRate = project.pages[0]!.motion!.frameRate,
) {
  const original = JSON.stringify(project);
  const program = compileMotion(project, { compositionId: project.pages[0]!.id });
  const session = createRenderSession({ forceWebGL: webgl, maxBytes: 128 * 1024 * 1024 });
  const images: string[] = [];
  const samples = [];
  let stats;
  try {
    const nativeRate = project.pages[0]!.motion!.frameRate;
    // Native loop continuity and encoded endpoint fidelity use their own sample clocks.
    for (const time of [
      0,
      4,
      8,
      8 - nativeRate.denominator / nativeRate.numerator,
      8 - frameRate.denominator / frameRate.numerator,
    ]) {
      const plan = evaluateMotion(
        program,
        { value: Math.round(time * 60000), rate: 60000 },
        { terminalPreview: time === 8 },
      );
      const composition = applyMotionFrame(program, plan);
      images.push(
        await session.withCanvasFrame(
          composition,
          project.assets,
          (canvas) => canvas.toDataURL("image/png"),
          { scale: 1 / 3, motionFrame: plan, mediaMode: "exact" },
        ),
      );
      samples.push({
        time,
        yaw: composition.spatial!.camera.yaw,
        stationaryObjects:
          JSON.stringify(composition.layers) === JSON.stringify(project.pages[0]!.layers),
        stationaryLights:
          JSON.stringify(composition.spatial!.lights) ===
          JSON.stringify(project.pages[0]!.spatial!.lights),
        captures: session.stats()?.spatial?.reflections?.captures ?? 0,
      });
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
      frameRate,
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
  return {
    images,
    samples,
    stats,
    video,
    frameCount,
    unchanged: JSON.stringify(project) === original,
  };
}
