import { usesVideoSources } from "../../renderer/video-backend";
import { selectionFrameScope } from "./selection";
import {
  resolveOutputFraming,
  applyMotionFrame,
  compileMotion,
  evaluateMotion,
  type Project,
} from "@musart/core";
import { AudioSample, AudioSampleSource, CanvasSource, Output } from "mediabunny";
import { assertRenderSize } from "../../compositing/types";
import { createRenderSession } from "../standalone";
import { createMotionAudioMixer } from "./audio/mixer";
import { assertMotionAlphaMode, chooseMotionEncoding } from "./encoding";
import type { MotionVideoExportOptions, MotionVideoExportResult } from "./model";
import { createMotionOutputTarget } from "./target";
import { compositionVideoTiming, motionExportFrame } from "./timing";
import { motionEncodedFrame, motionEncodedTiming } from "./container-time";
import { createEncodedSizeTracker } from "../encoded-size";

/** Headless browser export: one frozen program, one retained Three session, native encoding. */
export async function exportMotionVideo(
  project: Project,
  options: MotionVideoExportOptions,
): Promise<MotionVideoExportResult> {
  options.signal?.throwIfAborted();
  assertMotionAlphaMode(options.alpha ?? "discard");
  const assets = structuredClone(project.assets);
  const program = compileMotion({ ...project, assets }, { compositionId: options.compositionId });
  const timing = compositionVideoTiming(program, options);
  const selection = selectionFrameScope(
    program.composition,
    options.selection,
    options.centerSelection,
  );
  const staticPlan =
    program.mode === "static" ? evaluateMotion(program, { value: 0, rate: 1 }) : null;
  const staticFrame = staticPlan ? selection.frame(applyMotionFrame(program, staticPlan)) : null;
  const scale = options.scale ?? 1;
  const outputFrame = resolveOutputFraming(selection.page, options.framing, scale);
  assertRenderSize(selection.page, outputFrame.scale);
  const { width, height } = outputFrame;
  const mixer =
    options.audio === false || program.mode === "static"
      ? {
          hasAudio: false,
          sampleRate: 48000,
          channels: 2 as const,
          blockFrames: 4096,
          samples: 0,
          readBlock: async () => new Float32Array(0),
          dispose: async () => {},
        }
      : await createMotionAudioMixer(
          options.selection?.length
            ? {
                ...program,
                audio: [],
                layers: program.layers.filter((layer) =>
                  selection.page.layers.some((item) => item.id === layer.id),
                ),
              }
            : program,
          assets,
          options.mediaResolver,
          {
            ...options.audio,
            signal: options.signal,
          },
        );
  let session: ReturnType<typeof createRenderSession> | undefined;
  let target: ReturnType<typeof createMotionOutputTarget> | undefined;
  let output: Output | undefined,
    video: CanvasSource | undefined,
    audio: AudioSampleSource | undefined;
  let cancellation: Promise<void> | undefined;
  let finalized = false,
    failed = false,
    failure: unknown,
    result: MotionVideoExportResult | undefined;
  const cancelOutput = () =>
    (cancellation ??= Promise.resolve().then(async () => {
      const results = await Promise.allSettled([
        Promise.resolve().then(() => target?.abort(options.signal?.reason ?? failure)),
        Promise.resolve().then(() => output?.cancel()),
      ]);
      const errors = results.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      if (errors.length) throw new AggregateError(errors, "Motion output cancellation failed.");
    }));
  const onAbort = () => {
    void cancelOutput().catch(() => {});
  };
  try {
    const encoding = await chooseMotionEncoding({
      container: options.container ?? "auto",
      alpha: options.alpha ?? "discard",
      width,
      height,
      frameRate: timing.frameRate.numerator / timing.frameRate.denominator,
      videoBitrate: options.videoBitrate,
      audioBitrate: options.audioBitrate,
      audio: mixer.hasAudio ? mixer : null,
      signal: options.signal,
    });
    const encodedTiming = motionEncodedTiming(timing, encoding.mimeType);
    const size = createEncodedSizeTracker(
      timing.duration.value / timing.duration.rate,
      mixer.hasAudio,
    );
    options.signal?.throwIfAborted();
    target = createMotionOutputTarget({
      maxBytes: options.maxOutputBytes,
      output: options.output,
      signal: options.signal,
    });
    output = new Output({ target: target.target, format: encoding.format });
    session = createRenderSession({
      forceWebGL: options.forceWebGL,
      videoSources: usesVideoSources(program.composition),
      maxBytes: options.maxGpuBytes,
      fontResolver: options.fontResolver,
      mediaResolver: options.mediaResolver,
      mediaMode: "exact",
      signal: options.signal,
    });
    if (mixer.hasAudio)
      audio = new AudioSampleSource({
        codec: encoding.audioCodec,
        quality: encoding.audioQuality,
        onEncodedPacket: size.audio,
      });
    options.signal?.addEventListener("abort", onAbort, { once: true });
    let index = 0,
      cursor = 0,
      lastVideoTimestamp = 0;
    let videoClosed = false,
      audioClosed = !audio;
    while (index < timing.count || (audio && cursor < mixer.samples)) {
      await options.beforeFrame?.();
      options.signal?.throwIfAborted();
      // Keep at most one future video timestamp ahead of the audio cursor. Encoder/writer
      // promises are awaited individually, including at very low/fractional video FPS.
      if (
        index < timing.count &&
        (!audio || cursor === mixer.samples || cursor / mixer.sampleRate >= lastVideoTimestamp)
      ) {
        const frame = motionExportFrame(timing, index);
        const encoded = motionEncodedFrame(timing, index, encodedTiming.resolution);
        const plan = staticPlan ?? evaluateMotion(program, frame.time);
        await session.withCanvasFrame(
          staticFrame ?? selection.frame(applyMotionFrame(program, plan)),
          assets,
          async (canvas) => {
            options.signal?.throwIfAborted();
            if (!video) {
              video = new CanvasSource(canvas, {
                codec: encoding.videoCodec,
                quality: encoding.quality,
                alpha: options.alpha ?? "discard",
                keyFrameInterval: 2,
                onEncodedPacket: size.video,
              });
              output!.addVideoTrack(video);
              if (audio) output!.addAudioTrack(audio);
              // Do not supply frameRate metadata: it would resnap a shortened final sample.
              await output!.start();
            }
            await video.add(encoded.timestamp, encoded.seconds, {
              keyFrame:
                index === 0 || Math.floor(frame.timestamp / 2) > Math.floor(lastVideoTimestamp / 2),
            });
          },
          {
            scale,
            framing: options.framing,
            vectorAntialias: true,
            mediaSequential: true,
            motionFrame: plan,
            mediaMode: "exact",
            mediaResolver: options.mediaResolver,
            signal: options.signal,
          },
        );
        lastVideoTimestamp = frame.timestamp;
        index++;
        if (index === timing.count) {
          video!.close();
          videoClosed = true;
        }
      } else if (audio && cursor < mixer.samples) {
        const count = Math.min(mixer.blockFrames, mixer.samples - cursor);
        const pcm = await mixer.readBlock(cursor, count);
        options.signal?.throwIfAborted();
        const sample = new AudioSample({
          data: pcm,
          format: "f32-planar",
          numberOfChannels: mixer.channels,
          sampleRate: mixer.sampleRate,
          timestamp: cursor / mixer.sampleRate,
        });
        try {
          await audio.add(sample);
        } finally {
          sample.close();
        }
        cursor += count;
        if (cursor === mixer.samples) {
          audio.close();
          audioClosed = true;
        }
      }
      const completed =
        (index / timing.count + (audio ? cursor / mixer.samples : index / timing.count)) / 2;
      const estimate = size.estimate();
      if (estimate !== null) options.onSizeEstimate?.(estimate);
      options.onProgress?.({
        completedFrames: index,
        totalFrames: timing.count,
        fraction: completed * 0.98,
      });
    }
    options.signal?.throwIfAborted();
    if (!videoClosed) video?.close();
    if (!audioClosed) audio?.close();
    await output.finalize();
    finalized = true;
    options.signal?.throwIfAborted();
    const blob = target.blob(encoding.mimeType);
    result = {
      blob,
      mimeType: encoding.mimeType,
      width,
      height,
      frameRate: timing.frameRate,
      frameCount: timing.count,
      duration: timing.duration,
      encodedDuration: encodedTiming.duration,
      timestampResolution: encodedTiming.resolution,
      bytes: target.bytes(),
      audio: mixer.hasAudio
        ? { sampleRate: mixer.sampleRate, channels: mixer.channels, samples: mixer.samples }
        : null,
    };
  } catch (error) {
    failed = true;
    failure = error;
  }
  options.signal?.removeEventListener("abort", onAbort);
  const errors: unknown[] = [];
  for (const dispose of [
    () => (finalized ? undefined : cancelOutput()),
    () => session?.dispose(),
    () => mixer.dispose(),
    () => target?.dispose(failure),
  ]) {
    try {
      await dispose();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(
      failed ? [failure, ...errors] : errors,
      "Motion export cleanup failed.",
    );
  if (failed) throw failure;
  options.onProgress?.({ completedFrames: timing.count, totalFrames: timing.count, fraction: 1 });
  return result!;
}
