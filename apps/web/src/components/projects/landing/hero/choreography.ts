/** Sparse reference beats, in milliseconds from the shared mascot/title epoch. */
export const heroTiming = {
  grow: 600,
  shrinkAt: 800,
  finish: 1450,
  turnAt: 1100,
  blink: 1110,
  textAt: 350,
  textSpread: 750,
  glyph: 450,
  textFinish: 1550,
} as const;
const readyEvent = "melt:hero-ready";
const ownerOf = (host: HTMLElement) =>
  host.closest<HTMLElement>(".landing-title-block,.landing-intro") ?? host;

export function signalHeroReady(host: HTMLElement): number {
  const owner = ownerOf(host);
  const previous = owner.dataset.heroEpoch;
  if (previous !== undefined) return Number(previous);
  const time = performance.now();
  owner.dataset.heroEpoch = String(time);
  owner.dispatchEvent(new Event(readyEvent));
  return time;
}
export function onHeroReady(host: HTMLElement, start: (epoch: number) => void) {
  const owner = ownerOf(host);
  const ready = () => start(Number(owner.dataset.heroEpoch));
  owner.addEventListener(readyEvent, ready);
  if (owner.dataset.heroEpoch !== undefined) ready();
  return () => owner.removeEventListener(readyEvent, ready);
}
/** Continuous size envelope: fast smooth growth, a rounded hold, then accelerating shrink. */
export function mascotScale(time: number): number {
  if (time <= 0 || time >= heroTiming.finish) return 0;
  if (time < heroTiming.grow) return 1 - (1 - time / heroTiming.grow) ** 5;
  if (time < heroTiming.shrinkAt) return 1;
  const exit = (time - heroTiming.shrinkAt) / (heroTiming.finish - heroTiming.shrinkAt);
  return 1 - exit * exit;
}

/** The reference arrives looking upward, settles, then turns over the sphere on departure. */
export function mascotGaze(time: number) {
  const entry = Math.max(0, Math.min(1, time / 300));
  const settle = entry * entry * (3 - 2 * entry);
  const exit = Math.max(
    0,
    Math.min(1, (time - heroTiming.turnAt) / (heroTiming.finish - heroTiming.turnAt)),
  );
  return {
    yaw: 28.49 * settle,
    pitch: -45 + (28.62 + 45) * settle - 360 * exit * exit,
    mix: 1,
    spin: 0,
    wander: 0,
  };
}
