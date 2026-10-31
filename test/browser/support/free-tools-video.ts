import {
  AudioBufferSource,
  AudioSampleSink,
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  Output,
  VideoSampleSink,
  WebMOutputFormat,
} from "mediabunny";
export async function createToolVideo() {
  const target = new BufferTarget(),
    output = new Output({ target, format: new WebMOutputFormat() });
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 120;
  const context = canvas.getContext("2d")!;
  const video = new CanvasSource(canvas, { codec: "vp8", bitrate: 200000 });
  const audio = new AudioBufferSource({ codec: "opus", bitrate: 64000 });
  output.addVideoTrack(video);
  output.addAudioTrack(audio);
  let done = false;
  try {
    await output.start();
    const sound = new AudioBuffer({ length: 96000, numberOfChannels: 1, sampleRate: 48000 });
    const samples = sound.getChannelData(0);
    for (let i = 0; i < samples.length; i++)
      samples[i] = Math.sin((i * 440 * Math.PI * 2) / 48000) * 0.15;
    const audioWork = audio.add(sound).then(() => audio.close());
    for (let i = 0; i < 30; i++) {
      const gradient = context.createLinearGradient(0, 0, 160, 120);
      gradient.addColorStop(0, `hsl(${i * 12},80%,30%)`);
      gradient.addColorStop(1, `hsl(${i * 12 + 70},80%,80%)`);
      context.fillStyle = gradient;
      context.fillRect(0, 0, 160, 120);
      context.fillStyle = "#fff";
      context.fillRect((i * 7) % 120, 40, 35, 35);
      await video.add(i / 15, 1 / 15);
    }
    video.close();
    await audioWork;
    await output.finalize();
    done = true;
    return [...new Uint8Array(target.buffer!)];
  } finally {
    if (!done) await output.cancel();
  }
}
export async function inspectToolVideo(bytes: number[]) {
  const input = new Input({
    source: new BlobSource(new Blob([new Uint8Array(bytes)], { type: "video/webm" })),
    formats: ALL_FORMATS,
  });
  try {
    const video = await input.getPrimaryVideoTrack(),
      audio = await input.getPrimaryAudioTrack();
    if (!video) throw new Error("Missing video output");
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 120;
    const context = canvas.getContext("2d")!;
    const timestamps: number[] = [],
      signatures: number[] = [];
    for await (const sample of new VideoSampleSink(video).samples()) {
      try {
        timestamps.push(sample.timestamp);
        sample.draw(context, 0, 0);
        const pixels = context.getImageData(0, 0, 160, 120).data;
        let sum = 0;
        for (let i = 0; i < pixels.length; i += 16)
          sum += pixels[i]! + pixels[i + 1]! * 2 + pixels[i + 2]! * 3;
        signatures.push(sum);
      } finally {
        sample.close();
      }
    }
    let energy = 0,
      frames = 0;
    if (audio)
      for await (const sample of new AudioSampleSink(audio).samples()) {
        try {
          const data = new Float32Array(sample.numberOfFrames);
          sample.copyTo(data, { planeIndex: 0, format: "f32-planar" });
          for (const value of data) energy += value ** 2;
          frames += data.length;
        } finally {
          sample.close();
        }
      }
    return {
      width: await video.getDisplayWidth(),
      height: await video.getDisplayHeight(),
      duration: await input.computeDuration(),
      audio: !!audio,
      rms: Math.sqrt(energy / Math.max(1, frames)),
      timestamps,
      uniqueFrames: new Set(signatures).size,
    };
  } finally {
    input.dispose();
  }
}
