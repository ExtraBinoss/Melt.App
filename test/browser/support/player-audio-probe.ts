import type { Page } from "@playwright/test";
declare global {
  interface Window {
    __playerAudio?: {
      contexts: AudioContext[];
      gains: GainNode[];
      analysers: AnalyserNode[];
      starts: number;
    };
  }
}
/** Native output graph witness; PCM inspection never touches GPU pixels. */
export async function installPlayerAudioProbe(page: Page) {
  await page.addInitScript(() => {
    const probe = {
      contexts: [] as AudioContext[],
      gains: [] as GainNode[],
      analysers: [] as AnalyserNode[],
      starts: 0,
    };
    window.__playerAudio = probe;
    const createGain = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function () {
      const gain = createGain.call(this),
        connect = gain.connect.bind(gain);
      if (!probe.contexts.includes(this)) probe.contexts.push(this);
      probe.gains.push(gain);
      Object.defineProperty(gain, "connect", {
        value: (destination: AudioNode) => {
          if (destination !== this.destination) return connect(destination);
          const analyser = this.createAnalyser();
          analyser.fftSize = 2048;
          probe.analysers.push(analyser);
          connect(analyser);
          return analyser.connect(destination);
        },
      });
      return gain;
    };
    const createSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = createSource.call(this),
        start = source.start.bind(source);
      source.start = (...args: Parameters<AudioBufferSourceNode["start"]>) => {
        probe.starts++;
        start(...args);
      };
      return source;
    };
  });
}
export async function playerAudioEnergy(page: Page) {
  return page.evaluate(() => {
    const probe = window.__playerAudio!;
    return {
      starts: probe.starts,
      gains: probe.gains.map((gain) => gain.gain.value),
      states: probe.contexts.map((context) => context.state),
      rms: Math.max(
        0,
        ...probe.analysers.map((node) => {
          const pcm = new Float32Array(node.fftSize);
          node.getFloatTimeDomainData(pcm);
          return Math.sqrt(pcm.reduce((sum, v) => sum + v * v, 0) / pcm.length);
        }),
      ),
    };
  });
}
